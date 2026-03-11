from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from database import Base
from pydantic import BaseModel

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # doctor or patient
    full_name = Column(String, nullable=False)
    patient_date_of_birth = Column(String)
    patient_phone = Column(String)
    patient_address = Column(String)
    patient_emergency_contact = Column(String)
    patient_medical_conditions = Column(Text)  # JSON array string
    patient_medication_list = Column(Text)
    doctor_hospital = Column(String)
    doctor_department = Column(String)
    doctor_phone = Column(String)
    doctor_license = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    visit_time = Column(DateTime(timezone=True), nullable=False)
    venue = Column(String, nullable=False, default="City Health Clinic, Room 204")
    status = Column(String, nullable=False, default="scheduled")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AppointmentNote(Base):
    __tablename__ = "appointment_notes"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False, unique=True)
    symptoms = Column(Text)
    diagnosis = Column(Text)
    treatment_plan = Column(Text)
    medications = Column(Text)  # JSON string for simple storage
    follow_up_instructions = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class AISummary(Base):
    __tablename__ = "ai_summaries"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False, unique=True)
    summary_text = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="generated")  # generated/approved/published
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Medication(Base):
    __tablename__ = "medications"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    dosage = Column(String, nullable=False)
    schedule_time = Column(String, nullable=False)  # e.g. "08:00 AM"
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DailyLog(Base):
    __tablename__ = "daily_logs"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question = Column(String, nullable=False)
    answer_yes = Column(Boolean, nullable=False)
    logged_at = Column(DateTime(timezone=True), server_default=func.now())

# database table
class DoctorNote(Base):
    __tablename__ = "doctor_notes"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer)
    note = Column(Text)
    language = Column(String)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String, nullable=False)  # user or assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PreAppointmentSummary(Base):
    __tablename__ = "pre_appointment_summaries"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True, index=True)
    summary_text = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="generated")  # generated/reviewed/sent
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

#Request schema
class DoctorNoteCreate(BaseModel):
    note: str