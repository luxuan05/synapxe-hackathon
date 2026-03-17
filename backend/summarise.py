from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from together import Together
from dotenv import load_dotenv
import os

load_dotenv()

router = APIRouter()

client = Together(api_key=os.getenv("TOGETHER_API_KEY"))


# --- Request Models ---

class DailyLog(BaseModel):
    date: str
    medication_taken: bool
    mood: str  # e.g. "good", "bad", "okay"
    missed_doses: int
    questions_asked: Optional[str] = None
    notes: Optional[str] = None


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class SummariseRequest(BaseModel):
    patient_name: str
    patient_id: int
    logs: List[DailyLog]
    chat_history: Optional[List[ChatMessage]] = None


# --- Response Model ---

class SummariseResponse(BaseModel):
    patient_name: str
    patient_id: int
    summary: str


# --- Prompt Builder ---

def build_summary_prompt(patient_name: str, logs: List[DailyLog], chat_history: Optional[List[ChatMessage]] = None) -> str:
    log_text = ""
    for log in logs:
        log_text += (
            f"- Date: {log.date} | "
            f"Medication Taken: {'Yes' if log.medication_taken else 'No'} | "
            f"Missed Doses: {log.missed_doses} | "
            f"Mood: {log.mood}"
        )
        if log.questions_asked:
            log_text += f" | Patient Questions: {log.questions_asked}"
        if log.notes:
            log_text += f" | Notes: {log.notes}"
        log_text += "\n"

    chat_section = ""
    if chat_history:
        # Extract only meaningful patient-reported symptoms/concerns (skip error messages)
        patient_messages = [
            msg.content for msg in chat_history
            if msg.role == "user"
        ]
        # Extract meaningful assistant responses (skip generic error/timeout replies)
        error_phrases = [
            "taking longer than expected",
            "having trouble responding",
            "please try again",
        ]
        assistant_messages = [
            msg.content for msg in chat_history
            if msg.role == "assistant"
            and not any(phrase in msg.content.lower() for phrase in error_phrases)
        ]

        if patient_messages:
            symptoms_reported = "\n".join(f"  - {m}" for m in patient_messages)
            chat_section += f"\nSymptoms/concerns reported by patient via chatbot:\n{symptoms_reported}\n"

        if assistant_messages:
            advice_given = "\n".join(f"  - {m}" for m in assistant_messages)
            chat_section += f"\nAdvice provided by chatbot assistant:\n{advice_given}\n"

    prompt = f"""You are a medical assistant helping a doctor prepare for an upcoming patient appointment.

Patient Name: {patient_name}

DAILY CHECK-IN LOGS:
{log_text}
{chat_section}

Write a concise pre-appointment clinical summary for the doctor. 

Rules:
- Write in clear prose paragraphs, NOT as a raw log or transcript
- Synthesise patterns and trends, do not list individual messages
- Highlight the most clinically relevant points only
- Keep the total summary under 150 words
- Structure it as: (1) Medication adherence, (2) Symptoms & concerns, (3) Recommendation

Do not reproduce conversation logs verbatim. Do not make diagnoses."""

    return prompt


# --- Endpoint ---

@router.post("/summarise", response_model=SummariseResponse)
async def summarise_patient(request: SummariseRequest):
    if not request.logs:
        raise HTTPException(status_code=400, detail="No logs provided.")

    prompt = build_summary_prompt(request.patient_name, request.logs, request.chat_history)

    try:
        response = client.chat.completions.create(
            model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful medical assistant that writes concise pre-appointment summaries for doctors. Always synthesise information into clear prose — never reproduce raw logs or transcripts."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
        )
        summary_text = response.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Together AI error: {str(e)}")

    return SummariseResponse(
        patient_name=request.patient_name,
        patient_id=request.patient_id,
        summary=summary_text
    )