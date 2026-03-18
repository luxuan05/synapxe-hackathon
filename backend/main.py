from datetime import datetime, timedelta, timezone
import json
import os
import re

import bcrypt
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from together import Together
from dotenv import load_dotenv

from summarise import router as summarise_router
from layman import router as layman_router
from patient_logic import (
    DailyLogRequest,
    MedicationResponse,
    MedicationTakenRequest,
    ensure_scheduler_started,
    get_overdue_medications,
    is_missed,
    schedule_realert,
    cancel_realert,
    parse_schedule_time,
)
from agent_tools import TOOL_DEFINITIONS, run_agentic_loop

from database import Base, engine, get_db
import models

from langdetect import detect

try:
    from chatbot import chat
except Exception:
    chat = None

load_dotenv()

app = FastAPI()
app.include_router(summarise_router)
app.include_router(layman_router)

security = HTTPBearer(auto_error=False)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24

raw_origins = os.getenv("WEB_APP_ORIGIN", "http://localhost:5173")
allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

together_client = Together(api_key=os.getenv("TOGETHER_API_KEY"))
AGENT_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo"


# ── Pydantic models ────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "doctor"


class DoctorProfileRequest(BaseModel):
    hospital: str
    department: str
    phone: str
    license_number: str


class AppointmentNoteRequest(BaseModel):
    patient_id: int
    symptoms: str
    diagnosis: str
    treatment_plan: str
    medications: str
    follow_up_instructions: str


class PatientProfileRequest(BaseModel):
    date_of_birth: str
    phone: str
    address: str
    emergency_contact: str
    medical_conditions: list[str]
    medication_list: str


class SummaryUpdateRequest(BaseModel):
    summary_text: str
    status: str | None = None


class GeneratePreSummaryRequest(BaseModel):
    patient_id: int


class MedicationUpsertRequest(BaseModel):
    name: str
    dosage: str | None = None
    schedule_time: str


class ChatRequest(BaseModel):
    patient_id: str
    message: str


class MedSuggestRequest(BaseModel):
    diagnosis: str
    patient_id: int | None = None  # optional — agent uses it to fetch context


class TranslateSummaryRequest(BaseModel):
    text: str
    target_language: str  # "zh", "ms", "ta"


# ── Helpers ────────────────────────────────────────────────────────────────────

def sync_appointment_statuses(db: Session):
    now = datetime.now(timezone.utc)
    due = (
        db.query(models.Appointment)
        .filter(models.Appointment.visit_time < now, models.Appointment.status != "completed")
        .all()
    )
    if not due:
        return
    for appointment in due:
        appointment.status = "completed"
    db.commit()


def create_access_token(user_id: int, role: str, email: str):
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    payload = {"sub": str(user_id), "role": role, "email": email, "exp": exp}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def normalize_schedule_time(value: str) -> str:
    try:
        parsed = parse_schedule_time(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid schedule time. Use HH:MM (24h) or h:mm AM/PM.",
        )
    return parsed.strftime("%H:%M")


def sync_user_medication_list(db: Session, patient_id: int):
    meds = (
        db.query(models.Medication)
        .filter(models.Medication.patient_id == patient_id)
        .order_by(models.Medication.name.asc())
        .all()
    )
    names = sorted({(med.name or "").strip() for med in meds if (med.name or "").strip()})
    user = db.query(models.User).filter(models.User.id == patient_id).first()
    if user:
        user.patient_medication_list = ", ".join(names)


def seed_medications_from_profile_list(db: Session, patient_id: int, medication_list: str):
    names = [item.strip() for item in medication_list.split(",") if item.strip()]
    if not names:
        return
    existing = (
        db.query(models.Medication)
        .filter(models.Medication.patient_id == patient_id)
        .all()
    )
    existing_names = {(med.name or "").strip().lower() for med in existing}
    for name in names:
        if name.lower() in existing_names:
            continue
        db.add(
            models.Medication(
                patient_id=patient_id,
                name=name,
                dosage="",
                schedule_time="08:00",
                taken=False,
            )
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def generate_patient_friendly_summary(
    patient_name: str,
    doctor_name: str,
    symptoms: str,
    diagnosis: str,
    treatment_plan: str,
    medications: str,
    follow_up_instructions: str,
    db: Session | None = None,
    patient_id: int | None = None,
) -> str:
    """
    Agentic version: if patient_id + db are provided, the agent fetches
    the patient's full profile and conditions before writing the summary,
    enabling a more personalised explanation.
    """
    base_notes = (
        f"Symptoms: {symptoms}\n"
        f"Diagnosis: {diagnosis}\n"
        f"Treatment: {treatment_plan}\n"
        f"Medicine: {medications}\n"
        f"Next step: {follow_up_instructions}"
    )

    system_prompt = """You are a healthcare assistant rewriting doctor's appointment notes 
into a short patient-friendly explanation in very simple English.

You have tools to look up the patient's profile and conditions. Use get_patient_profile 
to personalise your explanation if a patient_id is available.

Rules:
- Use short, simple, everyday English.
- Write directly to the patient.
- Be warm and easy to understand.
- Do NOT use robotic medical phrases like "consultation notes indicate", "treatment plan", 
  "medications", or "follow-up".
- Do NOT just copy the doctor's wording.
- Explain what the patient should do clearly.
- Explain what the medicine is for in simple words.
- Do not invent extra medical facts.
- Do not include a greeting like "Hello".
- Return only the summary body text, under 120 words."""

    user_content = (
        f"Patient name: {patient_name}\n"
        f"Doctor name: {doctor_name}\n"
        + (f"Patient ID: {patient_id}\n" if patient_id else "")
        + f"\nDoctor's notes:\n{base_notes}\n\n"
        + (
            "Use get_patient_profile to fetch the patient's conditions, then write the summary."
            if patient_id and db
            else "Write the patient-friendly summary."
        )
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    if patient_id and db:
        return run_agentic_loop(
            client=together_client,
            model=AGENT_MODEL,
            messages=messages,
            db=db,
            tools=TOOL_DEFINITIONS,
            max_steps=4,
            temperature=0.1,
            max_tokens=300,
        )
    else:
        # Fallback: no DB, single-shot
        resp = together_client.chat.completions.create(
            model=AGENT_MODEL,
            messages=messages,
            temperature=0.1,
            max_tokens=300,
        )
        return resp.choices[0].message.content.strip()


# ── Startup ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def create_tables():
    Base.metadata.create_all(bind=engine)
    ensure_scheduler_started()

    with engine.begin() as conn:
        inspector = inspect(conn)
        tables = set(inspector.get_table_names())

        if "users" in tables:
            existing_cols = {col["name"] for col in inspector.get_columns("users")}
            user_cols = {
                "patient_date_of_birth": "VARCHAR(50) NULL",
                "patient_phone": "VARCHAR(50) NULL",
                "patient_address": "TEXT NULL",
                "patient_emergency_contact": "VARCHAR(255) NULL",
                "patient_medical_conditions": "TEXT NULL",
                "patient_medication_list": "TEXT NULL",
                "doctor_hospital": "TEXT NULL",
                "doctor_department": "TEXT NULL",
                "doctor_phone": "VARCHAR(50) NULL",
                "doctor_license": "VARCHAR(100) NULL",
            }
            for col, ddl in user_cols.items():
                if col not in existing_cols:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {ddl}"))

        if "appointments" in tables:
            appt_cols = {col["name"] for col in inspector.get_columns("appointments")}
            if "venue" not in appt_cols:
                conn.execute(
                    text(
                        "ALTER TABLE appointments "
                        "ADD COLUMN venue VARCHAR(255) NOT NULL DEFAULT 'City Health Clinic, Room 204'"
                    )
                )

        if "medications" in tables:
            med_cols = {col["name"] for col in inspector.get_columns("medications")}
            if "taken" not in med_cols:
                conn.execute(text("ALTER TABLE medications ADD COLUMN taken BOOLEAN NOT NULL DEFAULT FALSE"))

        if "daily_logs" in tables:
            daily_log_cols = {col["name"] for col in inspector.get_columns("daily_logs")}
            if "log_date" not in daily_log_cols:
                conn.execute(text("ALTER TABLE daily_logs ADD COLUMN log_date VARCHAR(20) NULL"))
            if "meds_taken" not in daily_log_cols:
                conn.execute(text("ALTER TABLE daily_logs ADD COLUMN meds_taken BOOLEAN NULL"))
            if "mood" not in daily_log_cols:
                conn.execute(text("ALTER TABLE daily_logs ADD COLUMN mood VARCHAR(100) NULL"))
            if "questions" not in daily_log_cols:
                conn.execute(text("ALTER TABLE daily_logs ADD COLUMN questions TEXT NULL"))


# ── Auth ───────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Backend running"}


@app.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not bcrypt.checkpw(payload.password.encode("utf-8"), user.password_hash.encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    access_token = create_access_token(user.id, user.role, user.email)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.full_name, "email": user.email, "role": user.role},
    }


@app.post("/auth/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    role = payload.role.lower().strip()
    if role not in {"doctor", "patient"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be doctor or patient")
    if len(payload.password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
    existing = db.query(models.User).filter(models.User.email == payload.username).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    hashed = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = models.User(email=payload.username, password_hash=hashed, role=role, full_name=payload.full_name)
    db.add(user)
    try:
        db.commit()
    except OperationalError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database error: {str(exc)}")
    db.refresh(user)

    if user.role == "patient":
        assigned_doctor = (
            db.query(models.User).filter(models.User.role == "doctor").order_by(models.User.id.asc()).first()
        )
        if assigned_doctor:
            appointment = models.Appointment(
                patient_id=user.id,
                doctor_id=assigned_doctor.id,
                visit_time=datetime.now(timezone.utc) + timedelta(days=3),
                venue="City Health Clinic, Room 204",
                status="scheduled",
            )
            db.add(appointment)
            db.commit()

    access_token = create_access_token(user.id, user.role, user.email)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.full_name, "email": user.email, "role": user.role},
    }


@app.get("/auth/me")
def me(user: models.User = Depends(get_current_user)):
    return {"id": user.id, "name": user.full_name, "email": user.email, "role": user.role}


@app.post("/auth/logout")
def logout():
    return {"message": "Logged out"}


@app.post("/auth/seed-doctor")
def seed_doctor(db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == "doctor@example.com").first()
    if existing:
        return {"message": "Doctor already exists", "email": existing.email}
    hashed = bcrypt.hashpw("password123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = models.User(email="doctor@example.com", password_hash=hashed, role="doctor", full_name="Dr. Sarah Ahmed")
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Seed doctor created", "email": user.email, "password": "password123"}


# ── Doctor endpoints ───────────────────────────────────────────────────────────

@app.get("/doctor/profile")
def get_doctor_profile(user: models.User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")
    return {
        "hospital": user.doctor_hospital or "",
        "department": user.doctor_department or "",
        "phone": user.doctor_phone or "",
        "license_number": user.doctor_license or "",
    }


@app.put("/doctor/profile")
def update_doctor_profile(
    payload: DoctorProfileRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")
    user.doctor_hospital = payload.hospital.strip()
    user.doctor_department = payload.department.strip()
    user.doctor_phone = payload.phone.strip()
    user.doctor_license = payload.license_number.strip()
    db.commit()
    return {"message": "Doctor profile updated"}


@app.get("/doctor/patients")
def doctor_patients(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")
    sync_appointment_statuses(db)
    doctor_appointments = (
        db.query(models.Appointment)
        .filter(models.Appointment.doctor_id == user.id)
        .order_by(models.Appointment.visit_time.desc())
        .all()
    )
    latest_by_patient: dict[int, models.Appointment] = {}
    for appt in doctor_appointments:
        if appt.patient_id not in latest_by_patient:
            latest_by_patient[appt.patient_id] = appt
    response = []
    for patient_id, appt in latest_by_patient.items():
        patient = db.query(models.User).filter(models.User.id == patient_id).first()
        if not patient:
            continue
        response.append(
            {
                "id": patient.id,
                "name": patient.full_name,
                "email": patient.email,
                "appointment_time": appt.visit_time.isoformat(),
                "venue": appt.venue,
                "status": appt.status,
            }
        )
    return response


@app.get("/doctor/history")
def doctor_history(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")
    sync_appointment_statuses(db)
    appointments = (
        db.query(models.Appointment)
        .filter(models.Appointment.doctor_id == user.id)
        .order_by(models.Appointment.visit_time.desc())
        .all()
    )
    response = []
    for appt in appointments:
        patient = db.query(models.User).filter(models.User.id == appt.patient_id).first()
        note = db.query(models.AppointmentNote).filter(models.AppointmentNote.appointment_id == appt.id).first()
        summary = db.query(models.AISummary).filter(models.AISummary.appointment_id == appt.id).first()
        medications = []
        if note and note.medications:
            medications = [item.strip() for item in note.medications.split(",") if item.strip()]
        response.append(
            {
                "id": appt.id,
                "date": appt.visit_time.isoformat(),
                "patient": patient.full_name if patient else "Unknown Patient",
                "diagnosis": note.diagnosis if note and note.diagnosis else "No diagnosis yet",
                "medications": medications,
                "summary_sent": bool(summary and summary.status in {"approved", "published"}),
                "summary_text": summary.summary_text if summary else "",
                "summary_status": summary.status if summary else "none",
                "status": appt.status,
            }
        )
    return response


@app.get("/doctor/appointments/{appointment_id}")
def doctor_appointment_detail(
    appointment_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")
    appointment = (
        db.query(models.Appointment)
        .filter(models.Appointment.id == appointment_id, models.Appointment.doctor_id == user.id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    patient = db.query(models.User).filter(models.User.id == appointment.patient_id).first()
    note = db.query(models.AppointmentNote).filter(models.AppointmentNote.appointment_id == appointment.id).first()
    summary = db.query(models.AISummary).filter(models.AISummary.appointment_id == appointment.id).first()
    return {
        "id": appointment.id,
        "date": appointment.visit_time.isoformat(),
        "patient": patient.full_name if patient else "Unknown Patient",
        "diagnosis": note.diagnosis if note and note.diagnosis else "",
        "symptoms": note.symptoms if note and note.symptoms else "",
        "treatment_plan": note.treatment_plan if note and note.treatment_plan else "",
        "medications": note.medications if note and note.medications else "",
        "follow_up_instructions": note.follow_up_instructions if note and note.follow_up_instructions else "",
        "summary_text": summary.summary_text if summary else "",
        "summary_status": summary.status if summary else "none",
    }


@app.put("/doctor/appointments/{appointment_id}/summary")
def doctor_update_summary(
    appointment_id: int,
    payload: SummaryUpdateRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")
    appointment = (
        db.query(models.Appointment)
        .filter(models.Appointment.id == appointment_id, models.Appointment.doctor_id == user.id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    summary = db.query(models.AISummary).filter(models.AISummary.appointment_id == appointment.id).first()
    if not summary:
        summary = models.AISummary(appointment_id=appointment.id, summary_text="", status="generated")
        db.add(summary)
    summary.summary_text = payload.summary_text.strip()
    if payload.status:
        summary.status = payload.status.strip()
    db.commit()
    return {"message": "Summary updated", "summary_text": summary.summary_text, "summary_status": summary.status}


@app.post("/doctor/appointments/{appointment_id}/send")
def doctor_send_summary(
    appointment_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")
    appointment = (
        db.query(models.Appointment)
        .filter(models.Appointment.id == appointment_id, models.Appointment.doctor_id == user.id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    summary = db.query(models.AISummary).filter(models.AISummary.appointment_id == appointment.id).first()
    if not summary:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No summary found to send")
    if not summary.summary_text.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Summary text is empty")
    summary.status = "published"
    db.commit()
    return {"message": "Summary sent", "summary_status": summary.status}


@app.get("/doctor/pre-appointment-summaries")
def doctor_pre_appointment_summaries(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")
    records = (
        db.query(models.PreAppointmentSummary)
        .filter(models.PreAppointmentSummary.doctor_id == user.id)
        .order_by(models.PreAppointmentSummary.generated_at.desc())
        .all()
    )
    payload = []
    for record in records:
        patient = db.query(models.User).filter(models.User.id == record.patient_id).first()
        appointment = (
            db.query(models.Appointment).filter(models.Appointment.id == record.appointment_id).first()
            if record.appointment_id
            else None
        )
        payload.append(
            {
                "id": record.id,
                "patient_id": record.patient_id,
                "patient_name": patient.full_name if patient else "Unknown Patient",
                "appointment_id": record.appointment_id,
                "appointment_time": appointment.visit_time.isoformat() if appointment else "",
                "status": record.status,
                "summary_text": record.summary_text,
                "generated_at": record.generated_at.isoformat() if record.generated_at else "",
            }
        )
    return payload


@app.post("/doctor/pre-appointment-summaries/generate")
def doctor_generate_pre_appointment_summary(
    payload: GeneratePreSummaryRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    AGENTIC: The agent autonomously fetches daily logs, chat history,
    medications, and patient profile via tools before writing the summary.
    No manual data assembly needed.
    """
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")

    patient = db.query(models.User).filter(
        models.User.id == payload.patient_id, models.User.role == "patient"
    ).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    latest_appointment = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.patient_id == patient.id,
            models.Appointment.doctor_id == user.id,
        )
        .order_by(models.Appointment.visit_time.asc())
        .first()
    )

    system_prompt = """You are a medical assistant preparing a pre-appointment briefing for a doctor.

Use your tools to gather complete context about the patient:
1. Call get_patient_profile to understand their conditions
2. Call get_recent_daily_logs to assess medication adherence and mood
3. Call get_recent_chat_history to identify symptoms or concerns raised
4. Call get_patient_medications to see their current medication schedule

Then write a concise pre-appointment clinical summary.

Rules:
- Write in clear prose paragraphs, NOT bullet lists or raw transcripts
- Synthesise patterns and trends — never list individual messages verbatim
- Highlight only the most clinically relevant points
- Keep the total summary under 150 words
- Structure: (1) Medication adherence, (2) Reported symptoms & concerns, (3) Recommendation
- Do not reproduce conversation logs. Do not make diagnoses."""

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                f"Please prepare a pre-appointment summary for patient ID {patient.id} "
                f"({patient.full_name}). Use all available tools to gather their data first."
            ),
        },
    ]

    try:
        summary_text = run_agentic_loop(
            client=together_client,
            model=AGENT_MODEL,
            messages=messages,
            db=db,
            tools=TOOL_DEFINITIONS,
            max_steps=7,
            temperature=0.3,
            max_tokens=512,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")

    if not summary_text:
        summary_text = f"No data available yet for {patient.full_name}."

    record = models.PreAppointmentSummary(
        patient_id=patient.id,
        doctor_id=user.id,
        appointment_id=latest_appointment.id if latest_appointment else None,
        summary_text=summary_text,
        status="generated",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "id": record.id,
        "patient_id": record.patient_id,
        "patient_name": patient.full_name,
        "appointment_id": record.appointment_id,
        "status": record.status,
        "summary_text": record.summary_text,
        "generated_at": record.generated_at.isoformat() if record.generated_at else "",
    }


@app.post("/doctor/appointment-notes")
def upsert_appointment_notes(
    payload: AppointmentNoteRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")

    patient = db.query(models.User).filter(
        models.User.id == payload.patient_id, models.User.role == "patient"
    ).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    appointment = (
        db.query(models.Appointment)
        .filter(
            models.Appointment.patient_id == patient.id,
            models.Appointment.doctor_id == user.id,
        )
        .order_by(models.Appointment.visit_time.desc())
        .first()
    )
    if not appointment:
        appointment = models.Appointment(
            patient_id=patient.id,
            doctor_id=user.id,
            visit_time=datetime.now(timezone.utc),
            venue="City Health Clinic, Room 204",
            status="in-progress",
        )
        db.add(appointment)
        db.flush()

    note = db.query(models.AppointmentNote).filter(
        models.AppointmentNote.appointment_id == appointment.id
    ).first()
    if not note:
        note = models.AppointmentNote(appointment_id=appointment.id)
        db.add(note)

    note.symptoms = payload.symptoms.strip()
    note.diagnosis = payload.diagnosis.strip()
    note.treatment_plan = payload.treatment_plan.strip()
    note.medications = payload.medications.strip()
    note.follow_up_instructions = payload.follow_up_instructions.strip()

    try:
        # Agentic: passes db + patient_id so agent can fetch patient profile
        summary_text = generate_patient_friendly_summary(
            patient_name=patient.full_name,
            doctor_name=user.full_name,
            symptoms=note.symptoms,
            diagnosis=note.diagnosis,
            treatment_plan=note.treatment_plan,
            medications=note.medications,
            follow_up_instructions=note.follow_up_instructions,
            db=db,
            patient_id=patient.id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate AI summary: {str(e)}")

    summary = db.query(models.AISummary).filter(
        models.AISummary.appointment_id == appointment.id
    ).first()
    if not summary:
        summary = models.AISummary(
            appointment_id=appointment.id,
            summary_text=summary_text,
            status="generated",
        )
        db.add(summary)
    else:
        summary.summary_text = summary_text
        summary.status = "generated"

    db.commit()
    return {
        "message": "Appointment notes saved",
        "summary_text": summary_text,
        "appointment_id": appointment.id,
    }


# ── Patient endpoints ──────────────────────────────────────────────────────────

@app.get("/patient/profile")
def get_patient_profile(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    meds = (
        db.query(models.Medication)
        .filter(models.Medication.patient_id == user.id)
        .order_by(models.Medication.name.asc())
        .all()
    )
    if meds:
        med_names = sorted({(med.name or "").strip() for med in meds if (med.name or "").strip()})
        user.patient_medication_list = ", ".join(med_names)
        db.commit()
    conditions: list[str] = []
    if user.patient_medical_conditions:
        try:
            parsed = json.loads(user.patient_medical_conditions)
            if isinstance(parsed, list):
                conditions = [str(item) for item in parsed]
        except json.JSONDecodeError:
            conditions = []
    return {
        "date_of_birth": user.patient_date_of_birth or "",
        "phone": user.patient_phone or "",
        "address": user.patient_address or "",
        "emergency_contact": user.patient_emergency_contact or "",
        "medical_conditions": conditions,
        "medication_list": user.patient_medication_list or "",
    }


@app.put("/patient/profile")
def update_patient_profile(
    payload: PatientProfileRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    user.patient_date_of_birth = payload.date_of_birth.strip()
    user.patient_phone = payload.phone.strip()
    user.patient_address = payload.address.strip()
    user.patient_emergency_contact = payload.emergency_contact.strip()
    user.patient_medical_conditions = json.dumps(payload.medical_conditions)
    user.patient_medication_list = payload.medication_list.strip()
    seed_medications_from_profile_list(db, user.id, user.patient_medication_list or "")
    sync_user_medication_list(db, user.id)
    db.commit()
    return {"message": "Patient profile updated"}


@app.get("/patient/home")
def patient_home(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    sync_appointment_statuses(db)
    appointment = (
        db.query(models.Appointment)
        .filter(models.Appointment.patient_id == user.id)
        .order_by(models.Appointment.visit_time.asc())
        .first()
    )
    if not appointment:
        return {"appointment": None}
    doctor = db.query(models.User).filter(models.User.id == appointment.doctor_id).first()
    days_left = max((appointment.visit_time.date() - datetime.now(timezone.utc).date()).days, 0)
    return {
        "appointment": {
            "id": appointment.id,
            "doctor_name": doctor.full_name if doctor else "Doctor",
            "doctor_role": "General Practitioner",
            "date_time": appointment.visit_time.isoformat(),
            "venue": appointment.venue,
            "days_left": days_left,
            "status": appointment.status,
        }
    }


@app.get("/patient/summaries")
def patient_summaries(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    appointments = (
        db.query(models.Appointment)
        .filter(models.Appointment.patient_id == user.id)
        .order_by(models.Appointment.visit_time.desc())
        .all()
    )
    response = []
    for appointment in appointments:
        summary = (
            db.query(models.AISummary)
            .filter(models.AISummary.appointment_id == appointment.id)
            .first()
        )
        if not summary or not (summary.summary_text or "").strip():
            continue
        doctor = db.query(models.User).filter(models.User.id == appointment.doctor_id).first()
        response.append(
            {
                "id": appointment.id,
                "date": appointment.visit_time.isoformat(),
                "doctor_name": doctor.full_name if doctor else "Doctor",
                "clinic": appointment.venue,
                "summary_text": summary.summary_text,
            }
        )
    return response


@app.post("/patient/daily-log")
def save_daily_log(
    payload: DailyLogRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    patient_id = int(current_user.id)
    today = datetime.now(timezone.utc).date().isoformat()
    existing = (
        db.query(models.DailyLog)
        .filter(models.DailyLog.patient_id == patient_id, models.DailyLog.log_date == today)
        .first()
    )
    if existing:
        existing.question = json.dumps(payload.questions)
        existing.answer_yes = payload.meds_taken
        existing.meds_taken = payload.meds_taken
        existing.mood = payload.mood
        existing.questions = json.dumps(payload.questions)
    else:
        log = models.DailyLog(
            patient_id=patient_id,
            question=json.dumps(payload.questions),
            answer_yes=payload.meds_taken,
            log_date=today,
            meds_taken=payload.meds_taken,
            mood=payload.mood,
            questions=json.dumps(payload.questions),
        )
        db.add(log)

    if payload.meds_taken:
        due_meds = get_overdue_medications(db, patient_id)
        for med in due_meds:
            med.taken = True
        cancel_realert(patient_id)
    else:
        schedule_realert(patient_id)

    db.commit()
    return {
        "message": "Daily log saved",
        "patient_id": patient_id,
        "log_date": today,
        "meds_taken": payload.meds_taken,
        "mood": payload.mood,
        "questions": payload.questions,
        "realert_active": not payload.meds_taken,
    }


@app.get("/patient/medications")
def get_patient_medications(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    meds = (
        db.query(models.Medication)
        .filter(models.Medication.patient_id == current_user.id)
        .order_by(models.Medication.schedule_time.asc())
        .all()
    )
    return [
        MedicationResponse(
            id=med.id,
            name=med.name,
            dosage=med.dosage,
            schedule_time=med.schedule_time,
            taken=bool(med.taken),
            missed=is_missed(med.schedule_time, bool(med.taken)),
        )
        for med in meds
    ]


@app.post("/patient/medications")
def create_patient_medication(
    payload: MedicationUpsertRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    name = payload.name.strip()
    dosage = (payload.dosage or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Medication name is required")
    med = models.Medication(
        patient_id=current_user.id,
        name=name,
        dosage=dosage,
        schedule_time=normalize_schedule_time(payload.schedule_time),
        taken=False,
    )
    db.add(med)
    sync_user_medication_list(db, current_user.id)
    db.commit()
    db.refresh(med)
    return {"id": med.id, "name": med.name, "dosage": med.dosage, "schedule_time": med.schedule_time, "taken": bool(med.taken)}


@app.put("/patient/medications/{medication_id}")
def update_patient_medication(
    medication_id: int,
    payload: MedicationUpsertRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    med = (
        db.query(models.Medication)
        .filter(models.Medication.id == medication_id, models.Medication.patient_id == current_user.id)
        .first()
    )
    if not med:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medication not found")
    name = payload.name.strip()
    dosage = (payload.dosage or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Medication name is required")
    med.name = name
    med.dosage = dosage
    med.schedule_time = normalize_schedule_time(payload.schedule_time)
    sync_user_medication_list(db, current_user.id)
    db.commit()
    return {"message": "Medication updated", "id": med.id}


@app.get("/patient/medications/status")
def get_patient_medication_status(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    meds = (
        db.query(models.Medication)
        .filter(models.Medication.patient_id == current_user.id)
        .all()
    )
    payload = []
    for med in meds:
        payload.append(
            {
                "id": med.id,
                "name": med.name,
                "schedule_time": med.schedule_time,
                "taken": bool(med.taken),
                "missed": is_missed(med.schedule_time, bool(med.taken)),
            }
        )
    return {
        "patient_id": current_user.id,
        "medications": payload,
        "overdue_count": sum(1 for m in payload if m["missed"]),
    }


@app.get("/patient/rewards")
def get_patient_rewards(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    meds = (
        db.query(models.Medication)
        .filter(models.Medication.patient_id == current_user.id)
        .all()
    )
    taken_count = sum(1 for med in meds if bool(med.taken))
    points_earned = taken_count * 5
    return {
        "patient_id": current_user.id,
        "taken_count": taken_count,
        "points_earned": points_earned,
        "base_points": 0,
        "total_points": points_earned,
    }


@app.post("/patient/medications/{medication_id}/taken")
def mark_medication_taken(
    medication_id: int,
    payload: MedicationTakenRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")
    med = (
        db.query(models.Medication)
        .filter(models.Medication.id == medication_id, models.Medication.patient_id == current_user.id)
        .first()
    )
    if not med:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medication not found")
    med.taken = payload.taken
    db.commit()
    overdue = get_overdue_medications(db, current_user.id)
    if not overdue:
        cancel_realert(current_user.id)
    return {"message": "Medication updated", "medication_id": med.id, "taken": bool(med.taken)}


# ── Doctor notes (legacy) ──────────────────────────────────────────────────────

@app.post("/doctor/notes/{patient_id}")
def add_doctor_note(patient_id: int, note: models.DoctorNoteCreate, db: Session = Depends(get_db)):
    detected_language = detect(note.note)
    new_note = models.DoctorNote(patient_id=patient_id, note=note.note, language=detected_language)
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    return {"message": "Doctor note added", "language": detected_language}


@app.get("/doctor/summary/{patient_id}")
def get_patient_summary(patient_id: int, db: Session = Depends(get_db)):
    notes = db.query(models.DoctorNote).filter(models.DoctorNote.patient_id == patient_id).all()
    return notes


# ── Chat (agentic) ─────────────────────────────────────────────────────────────

@app.post("/chat")
async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    patient_id_text = request.patient_id.strip()
    requested_patient_id: int | None = None

    if patient_id_text.isdigit():
        requested_patient_id = int(patient_id_text)
    elif patient_id_text.startswith("patient_") and patient_id_text[8:].isdigit():
        requested_patient_id = int(patient_id_text[8:])

    normalized_patient_id: int | None = None
    if requested_patient_id:
        patient = (
            db.query(models.User)
            .filter(models.User.id == requested_patient_id, models.User.role == "patient")
            .first()
        )
        if patient:
            normalized_patient_id = patient.id
            db.add(models.ChatMessage(patient_id=patient.id, role="user", content=request.message))

    if chat is None:
        if normalized_patient_id:
            db.add(
                models.ChatMessage(
                    patient_id=normalized_patient_id,
                    role="assistant",
                    content="Chat service unavailable. Configure TOGETHER_API_KEY to enable chatbot.",
                )
            )
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat service unavailable. Configure TOGETHER_API_KEY to enable chatbot.",
        )

    # Pass db so the agentic chatbot can fetch patient context via tools
    response = chat(request.patient_id, request.message, db=db)

    if normalized_patient_id:
        db.add(models.ChatMessage(patient_id=normalized_patient_id, role="assistant", content=response))
        db.commit()

    return {"response": response}


# ── Med suggestions (agentic) ──────────────────────────────────────────────────

@app.post("/doctor/med-suggestions")
async def med_suggestions(
    payload: MedSuggestRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    AGENTIC: Before suggesting medications, the agent fetches the patient's
    current medications and conditions to check for interactions and
    contraindications, then returns contextually safe suggestions.
    """
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Doctor access only")
    if not payload.diagnosis.strip():
        return []

    patient_context = (
        f" for patient ID {payload.patient_id}" if payload.patient_id else ""
    )

    system_prompt = """You are a clinical reference assistant.

You have tools to fetch the patient's current medications and medical conditions.
ALWAYS use these tools before suggesting new medications so you can:
1. Check for potential drug interactions using check_medication_interactions
2. Avoid contraindicated medications given the patient's conditions
3. Suggest safer alternatives if conflicts exist

Return ONLY a valid JSON array of 3-4 medication suggestions.
Each item must have: name, dosage, reason.
No markdown, no explanation outside the JSON array."""

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                f'Diagnosis: "{payload.diagnosis.strip()}"{patient_context}.\n'
                f"Use your tools to check the patient's current medications and conditions, "
                f"then suggest 3-4 safe medications as a JSON array."
            ),
        },
    ]

    try:
        result_text = run_agentic_loop(
            client=together_client,
            model=AGENT_MODEL,
            messages=messages,
            db=db,
            tools=TOOL_DEFINITIONS,
            max_steps=6,
            temperature=0.2,
            max_tokens=512,
        )
        match = re.search(r"\[.*\]", result_text, re.DOTALL)
        return json.loads(match.group(0)) if match else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


# ── Translate summary ──────────────────────────────────────────────────────────

@app.post("/patient/translate-summary")
async def translate_summary(
    payload: TranslateSummaryRequest,
    user: models.User = Depends(get_current_user),
):
    if user.role != "patient":
        raise HTTPException(status_code=403, detail="Patient access only")

    lang_names = {"zh": "Simplified Chinese", "ms": "Malay", "ta": "Tamil"}
    target = lang_names.get(payload.target_language)
    if not target:
        raise HTTPException(status_code=400, detail="Unsupported language")

    try:
        response = together_client.chat.completions.create(
            model=AGENT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are a medical translator. Translate the text to {target}. "
                        "Keep it simple, warm, and patient-friendly. Return only the translated text."
                    ),
                },
                {"role": "user", "content": payload.text},
            ],
            temperature=0.1,
            max_tokens=512,
        )
        return {"translated_text": response.choices[0].message.content.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation error: {str(e)}")
