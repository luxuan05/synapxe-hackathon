"""
patient_logic.py
----------------
Non-AI patient business logic: scheduling, medication checks, Pydantic models.
No changes needed for agentic upgrade — this file is pure domain logic.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import List

from apscheduler.schedulers.background import BackgroundScheduler
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models

scheduler = BackgroundScheduler()
_scheduler_started = False


def ensure_scheduler_started():
    global _scheduler_started
    if not _scheduler_started:
        scheduler.start()
        _scheduler_started = True


def parse_schedule_time(value: str):
    value = value.strip()
    for fmt in ("%H:%M", "%I:%M %p"):
        try:
            return datetime.strptime(value, fmt).time()
        except ValueError:
            continue
    raise ValueError(f"Invalid time format: {value}")


def is_missed(schedule_time: str, taken: bool) -> bool:
    if taken:
        return False
    now = datetime.now().time()
    scheduled = parse_schedule_time(schedule_time)
    return now > scheduled


def get_job_id(patient_id: int) -> str:
    return f"patient-reminder-{patient_id}"


def get_overdue_medications(db: Session, patient_id: int) -> List[models.Medication]:
    meds = (
        db.query(models.Medication)
        .filter(models.Medication.patient_id == patient_id)
        .all()
    )
    return [m for m in meds if is_missed(m.schedule_time, bool(m.taken))]


def reminder_job(patient_id: int):
    from database import SessionLocal

    db = SessionLocal()
    try:
        overdue = get_overdue_medications(db, patient_id)
        if not overdue:
            job = scheduler.get_job(get_job_id(patient_id))
            if job:
                scheduler.remove_job(get_job_id(patient_id))
            print(f"[Reminder stopped] Patient {patient_id} has no overdue meds.")
            return
        med_names = ", ".join(m.name for m in overdue)
        print(f"[30-min Re-alert] Patient {patient_id} still has overdue meds: {med_names}")
    finally:
        db.close()


def schedule_realert(patient_id: int):
    ensure_scheduler_started()
    job_id = get_job_id(patient_id)
    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)
    scheduler.add_job(
        reminder_job,
        "interval",
        minutes=30,
        next_run_time=datetime.now() + timedelta(minutes=30),
        args=[patient_id],
        id=job_id,
        replace_existing=True,
    )


def cancel_realert(patient_id: int):
    ensure_scheduler_started()
    job = scheduler.get_job(get_job_id(patient_id))
    if job:
        scheduler.remove_job(get_job_id(patient_id))


class DailyLogRequest(BaseModel):
    meds_taken: bool
    mood: str | None = None
    questions: list[str] = Field(default_factory=list)


class MedicationResponse(BaseModel):
    id: int
    name: str
    dosage: str
    schedule_time: str
    taken: bool
    missed: bool


class MedicationTakenRequest(BaseModel):
    taken: bool = True