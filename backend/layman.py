"""
layman.py
---------
Agentic patient-friendly summary generator.

The agent fetches the patient's profile and conditions before
rewriting the doctor's notes. This allows it to tailor language
to the patient's literacy, language preference, and known conditions.
"""
from __future__ import annotations

import os

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

SYSTEM_PROMPT = """You are a healthcare assistant that rewrites doctor's notes into 
simple, warm, patient-friendly language.

You have access to tools to look up the patient's profile and medical conditions.
Use these tools to personalise the explanation — for example, if the patient has 
diabetes, you can briefly acknowledge that context when explaining new instructions.

Rules for the rewrite:
- Write as if speaking directly to the patient.
- Use everyday words only — no medical jargon.
- Do NOT copy the doctor's wording.
- Do NOT use phrases like: "consultation notes indicate", "treatment plan", "medications", "follow-up".
- Explain the condition simply.
- Explain clearly what the patient should do at home.
- Explain what the medicine is for in simple words.
- Mention when the patient should come back.
- Keep it natural, short (under 120 words), and easy to read.
- Do not add new medical facts.
- Do not sound robotic or overly formal.

Example style:
You have hurt your ankle, which means the muscles around it were stretched.
To help it heal, rest it, put ice on it, and keep it raised when you can.
Take paracetamol if you need help with pain.
Please come back next week so the doctor can check how it is healing."""


# ── Request / Response models ──────────────────────────────────────────────────

class LaymanRequest(BaseModel):
    patient_name: str
    patient_id: int
    doctor_name: str
    consultation_notes: str


class LaymanResponse(BaseModel):
    patient_name: str
    summary: str


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/layman", response_model=LaymanResponse)
async def generate_layman_summary(
    request: LaymanRequest,
    db: Session = Depends(get_db),
):
    if not request.consultation_notes.strip():
        raise HTTPException(status_code=400, detail="Consultation notes are required.")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Patient ID: {request.patient_id}\n"
                f"Patient name: {request.patient_name}\n"
                f"Doctor name: {request.doctor_name}\n\n"
                f"First, use your tools to fetch the patient's profile and conditions "
                f"so you can personalise the explanation.\n\n"
                f"Then rewrite these doctor's notes in simple, warm patient-friendly language:\n\n"
                f"{request.consultation_notes}"
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
            max_steps=4,
            temperature=0.1,
            max_tokens=400,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")

    return LaymanResponse(
        patient_name=request.patient_name,
        summary=summary_text,
    )