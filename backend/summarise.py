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


class SummariseRequest(BaseModel):
    patient_name: str
    patient_id: int
    logs: List[DailyLog]


# --- Response Model ---

class SummariseResponse(BaseModel):
    patient_name: str
    patient_id: int
    summary: str


# --- Prompt Builder ---

def build_summary_prompt(patient_name: str, logs: List[DailyLog]) -> str:
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

    prompt = f"""You are a medical assistant helping a doctor review a patient's recent health data.

Patient Name: {patient_name}

Below are the patient's daily check-in logs:
{log_text}

Please produce a structured clinical summary for the doctor. Include:
1. Medication Adherence - how consistently the patient took their medication
2. Mood Trends - general emotional pattern over the period
3. Missed Doses - frequency and potential concern level
4. Patient Concerns - any questions or issues the patient raised
5. Recommendation - a brief suggestion for the doctor to consider

Be concise, clinical, and factual. Do not make diagnoses."""

    return prompt


# --- Endpoint ---

@router.post("/summarise", response_model=SummariseResponse)
async def summarise_patient(request: SummariseRequest):
    if not request.logs:
        raise HTTPException(status_code=400, detail="No logs provided.")

    prompt = build_summary_prompt(request.patient_name, request.logs)

    try:
        response = client.chat.completions.create(
            model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful medical assistant that summarises patient data for doctors."
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