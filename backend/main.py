from datetime import datetime, timedelta, timezone
import json
import os

import bcrypt
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from summarise import router as summarise_router
from layman import router as layman_router

from database import Base, engine, get_db
import models

from langdetect import detect
try:
    from chatbot import chat
except Exception:
    chat = None

app = FastAPI()
app.include_router(summarise_router)
app.include_router(layman_router)
# Create tables
Base.metadata.create_all(bind=engine)


security = HTTPBearer(auto_error=False)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24

raw_origins = os.getenv("WEB_APP_ORIGIN", "http://localhost:5173")
allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Dev convenience: allow localhost/127.0.0.1 on any Vite port.
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.on_event("startup")
def create_tables():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        existing_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()}
        doctor_cols = {
            "patient_date_of_birth": "TEXT",
            "patient_phone": "TEXT",
            "patient_address": "TEXT",
            "patient_emergency_contact": "TEXT",
            "patient_medical_conditions": "TEXT",
            "patient_medication_list": "TEXT",
            "doctor_hospital": "TEXT",
            "doctor_department": "TEXT",
            "doctor_phone": "TEXT",
            "doctor_license": "TEXT",
        }
        for col, ddl in doctor_cols.items():
            if col not in existing_cols:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {ddl}"))

        appt_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(appointments)")).fetchall()}
        if "venue" not in appt_cols:
            conn.execute(
                text("ALTER TABLE appointments ADD COLUMN venue TEXT NOT NULL DEFAULT 'City Health Clinic, Room 204'")
            )

        # Defensive cleanup: some manual migrations can accidentally persist
        # literal CURRENT_TIMESTAMP strings instead of concrete datetime values.
        # SQLAlchemy then fails while parsing datetime fields.
        conn.execute(text("UPDATE users SET created_at = datetime('now') WHERE created_at LIKE 'CURRENT_TIMESTAMP%'"))
        conn.execute(
            text("UPDATE appointments SET created_at = datetime('now') WHERE created_at LIKE 'CURRENT_TIMESTAMP%'")
        )
        conn.execute(
            text("UPDATE appointment_notes SET created_at = datetime('now') WHERE created_at LIKE 'CURRENT_TIMESTAMP%'")
        )
        conn.execute(
            text("UPDATE appointment_notes SET updated_at = datetime('now') WHERE updated_at LIKE 'CURRENT_TIMESTAMP%'")
        )
        conn.execute(
            text("UPDATE ai_summaries SET created_at = datetime('now') WHERE created_at LIKE 'CURRENT_TIMESTAMP%'")
        )
        conn.execute(text("UPDATE appointments SET visit_time = REPLACE(visit_time, '-T', 'T') WHERE visit_time LIKE '%-T%'"))
        conn.execute(
            text("UPDATE chat_messages SET created_at = datetime('now') WHERE created_at LIKE 'CURRENT_TIMESTAMP%'")
        )
        conn.execute(
            text(
                "UPDATE pre_appointment_summaries SET generated_at = datetime('now') "
                "WHERE generated_at LIKE 'CURRENT_TIMESTAMP%'"
            )
        )


@app.get("/")
def root():
    return {"message": "Backend running"}


@app.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    # Prototype: "username" maps to user email.
    user = db.query(models.User).filter(models.User.email == payload.username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not bcrypt.checkpw(payload.password.encode("utf-8"), user.password_hash.encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_access_token(user.id, user.role, user.email)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.full_name,
            "email": user.email,
            "role": user.role,
        },
    }


@app.post("/auth/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    role = payload.role.lower().strip()
    if role not in {"doctor", "patient"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be doctor or patient")

    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )

    existing = db.query(models.User).filter(models.User.email == payload.username).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    hashed = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = models.User(
        email=payload.username,
        password_hash=hashed,
        role=role,
        full_name=payload.full_name,
    )
    db.add(user)
    try:
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if "database is locked" in str(exc).lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database is busy/locked. Close DB Browser or other writers and try again.",
            )
        raise
    db.refresh(user)

    if user.role == "patient":
        assigned_doctor = (
            db.query(models.User)
            .filter(models.User.role == "doctor")
            .order_by(models.User.id.asc())
            .first()
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
        "user": {
            "id": user.id,
            "name": user.full_name,
            "email": user.email,
            "role": user.role,
        },
    }


@app.get("/auth/me")
def me(user: models.User = Depends(get_current_user)):
    return {
        "id": user.id,
        "name": user.full_name,
        "email": user.email,
        "role": user.role,
    }


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


@app.get("/patient/profile")
def get_patient_profile(user: models.User = Depends(get_current_user)):
    if user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access only")

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
    db.commit()
    return {"message": "Patient profile updated"}


@app.post("/auth/logout")
def logout():
    # Stateless JWT prototype: client clears token.
    return {"message": "Logged out"}


@app.post("/auth/seed-doctor")
def seed_doctor(db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == "doctor@example.com").first()
    if existing:
        return {"message": "Doctor already exists", "email": existing.email}

    hashed = bcrypt.hashpw("password123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = models.User(
        email="doctor@example.com",
        password_hash=hashed,
        role="doctor",
        full_name="Dr. Sarah Ahmed",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "message": "Seed doctor created",
        "email": user.email,
        "password": "password123",
    }


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
    if user.role != "doctor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Doctor access only")

    patient = db.query(models.User).filter(models.User.id == payload.patient_id, models.User.role == "patient").first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    latest_appointment = (
        db.query(models.Appointment)
        .filter(models.Appointment.patient_id == patient.id, models.Appointment.doctor_id == user.id)
        .order_by(models.Appointment.visit_time.asc())
        .first()
    )

    messages = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.patient_id == patient.id)
        .order_by(models.ChatMessage.created_at.desc())
        .limit(12)
        .all()
    )

    if messages:
        ordered = list(reversed(messages))
        bullets = [f"- {msg.role.capitalize()}: {msg.content.strip()}" for msg in ordered if msg.content.strip()]
        summary_text = (
            f"Pre-appointment summary for {patient.full_name}.\n"
            "Recent chatbot interactions:\n"
            + "\n".join(bullets)
        )
    else:
        summary_text = (
            f"Pre-appointment summary for {patient.full_name}.\n"
            "No chatbot conversation found yet."
        )

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

    patient = db.query(models.User).filter(models.User.id == payload.patient_id, models.User.role == "patient").first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    appointment = (
        db.query(models.Appointment)
        .filter(models.Appointment.patient_id == patient.id, models.Appointment.doctor_id == user.id)
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

    note = db.query(models.AppointmentNote).filter(models.AppointmentNote.appointment_id == appointment.id).first()
    if not note:
        note = models.AppointmentNote(appointment_id=appointment.id)
        db.add(note)

    note.symptoms = payload.symptoms
    note.diagnosis = payload.diagnosis
    note.treatment_plan = payload.treatment_plan
    note.medications = payload.medications
    note.follow_up_instructions = payload.follow_up_instructions

    summary_text = (
        f"Hello {patient.full_name}, today's consultation notes indicate {payload.diagnosis}. "
        f"Treatment plan: {payload.treatment_plan}. Medications: {payload.medications}. "
        f"Follow-up: {payload.follow_up_instructions}."
    )
    summary = db.query(models.AISummary).filter(models.AISummary.appointment_id == appointment.id).first()
    if not summary:
        summary = models.AISummary(appointment_id=appointment.id, summary_text=summary_text, status="generated")
        db.add(summary)
    else:
        summary.summary_text = summary_text
        summary.status = "generated"

    db.commit()
    return {"message": "Appointment notes saved", "summary_text": summary_text, "appointment_id": appointment.id}


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
# -----------------------------
# POST Doctor Note
# -----------------------------
@app.post("/doctor/notes/{patient_id}")
def add_doctor_note(
    patient_id: int,
    note: models.DoctorNoteCreate,
    db: Session = Depends(get_db)
):

    detected_language = detect(note.note)

    new_note = models.DoctorNote(
        patient_id=patient_id,
        note=note.note,
        language=detected_language
    )

    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    return {
        "message": "Doctor note added",
        "language": detected_language
    }


# -----------------------------
# GET Patient Summary
# -----------------------------
@app.get("/doctor/summary/{patient_id}")
def get_patient_summary(
    patient_id: int,
    db: Session = Depends(get_db)
):

    notes = db.query(models.DoctorNote).filter(
        models.DoctorNote.patient_id == patient_id
    ).all()

    return notes

# -----------------------------
# POST Chat (Sadhana)
# -----------------------------
class ChatRequest(BaseModel):
    patient_id: str
    message: str

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
                    content="Chat service unavailable. Configure OPENAI_API_KEY to enable chatbot.",
                )
            )
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat service unavailable. Configure OPENAI_API_KEY to enable chatbot.",
        )
    response = chat(request.patient_id, request.message)
    if normalized_patient_id:
        db.add(models.ChatMessage(patient_id=normalized_patient_id, role="assistant", content=response))
        db.commit()
    return {"response": response}
