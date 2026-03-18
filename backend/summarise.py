"""
summarise.py
------------
Agentic pre-appointment summary generator.

Instead of receiving logs and chat history as API payload,
the agent fetches them directly from the DB using tools,
then synthesises a clinical summary for the doctor.
"""
from __future__ import annotations

import os
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from together import Together

from agent_tools import TOOL_DEFINITIONS, run_agentic_loop
from database import get_db

load_dotenv()

router = APIRouter()
client = Together(api_key=os.getenv("TOGETHER_API_KEY"))

MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo"

SYSTEM_PROMPT = """You are a medical assistant helping a doctor prepare for an upcoming patient appointment.

You have tools to fetch:
- The patient's profile and medical conditions
- Their current medications
- Recent daily check-in logs (medication adherence, mood)
- Recent chatbot conversation history (symptoms, concerns)
- Most recent appointment notes

Use ALL relevant tools to gather complete context, then write a concise pre-appointment 
clinical summary for the doctor.

Summary rules:
- Write in clear prose paragraphs, NOT as bullet lists or raw transcripts
- Synthesise patterns and trends — do not list individual messages verbatim
- Highlight only the most clinically relevant points
- Keep the total summary under 150 words
- Structure: (1) Medication adherence, (2) Reported symptoms & concerns, (3) Recommendation
- Do not reproduce conversation logs. Do not make diagnoses."""


# ── Request / Response models ──────────────────────────────────────────────────

class DailyLog(BaseModel):
    date: str
    medication_taken: bool
    mood: str
    missed_doses: int
    questions_asked: Optional[str] = None
    notes: Optional[str] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class SummariseRequest(BaseModel):
    patient_name: str
    patient_id: int
    # logs and chat_history are now optional — the agent fetches them if not provided
    logs: Optional[List[DailyLog]] = None
    chat_history: Optional[List[ChatMessage]] = None


class SummariseResponse(BaseModel):
    patient_name: str
    patient_id: int
    summary: str


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/summarise", response_model=SummariseResponse)
async def summarise_patient(
    request: SummariseRequest,
    db: Session = Depends(get_db),
):
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Please prepare a pre-appointment summary for patient ID {request.patient_id} "
                f"({request.patient_name}). Use your tools to fetch their recent logs, "
                f"chat history, medications, and profile before writing the summary."
            ),
        },
    ]

    try:
        summary_text = run_agentic_loop(
            client=client,
            model=MODEL,
            messages=messages,
            db=db,
            tools=TOOL_DEFINITIONS,
            max_steps=6,
            temperature=0.3,
            max_tokens=512,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")

    if not summary_text:
        summary_text = f"No data available yet for {request.patient_name}."

    return SummariseResponse(
        patient_name=request.patient_name,
        patient_id=request.patient_id,
        summary=summary_text,
    )