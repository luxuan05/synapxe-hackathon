from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from together import Together
from dotenv import load_dotenv
import os

load_dotenv()

router = APIRouter()
client = Together(api_key=os.getenv("TOGETHER_API_KEY"))


class LaymanRequest(BaseModel):
    patient_name: str
    doctor_name: str
    consultation_notes: str


class LaymanResponse(BaseModel):
    patient_name: str
    summary: str


def build_layman_prompt(patient_name: str, doctor_name: str, consultation_notes: str) -> str:
    return f"""
You are a healthcare assistant rewriting doctor's notes for a patient.

Patient name: {patient_name}
Doctor name: {doctor_name}

Doctor's notes:
{consultation_notes}

Your task:
Rewrite the doctor's notes into a short, warm, patient-friendly explanation in very simple English.

Rules:
- Write as if you are speaking directly to the patient.
- Use everyday words only.
- Do NOT copy the doctor's wording.
- Do NOT use phrases like:
  "consultation notes indicate"
  "treatment plan"
  "medications"
  "follow-up"
- Explain the condition simply.
- Explain clearly what the patient should do at home.
- Explain what the medicine is for in simple words.
- Mention when the patient should come back.
- Keep it natural, short, and easy to read.
- Do not add new medical facts.
- Do not sound robotic or overly formal.

Desired style example:
Hello Johnny,

You have hurt your ankle, which means the muscles or tissues around it were stretched.
To help it heal, try to rest it, put ice on it, and keep it raised when you can.
A bandage can also help support your ankle.
Take paracetamol if you need help with pain.
Please come back next week so the doctor can check how your ankle is healing.

Now rewrite the doctor's notes in that style.
"""
    

@router.post("/layman", response_model=LaymanResponse)
async def generate_layman_summary(request: LaymanRequest):
    if not request.consultation_notes.strip():
        raise HTTPException(status_code=400, detail="Consultation notes are required.")

    prompt = build_layman_prompt(
        request.patient_name,
        request.doctor_name,
        request.consultation_notes
    )

    try:
        response = client.chat.completions.create(
            model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
            messages=[
                {
                    "role": "system",
                    "content": "You explain doctor's notes in plain English for patients. You never use clinical or robotic wording."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1,
        )

        summary_text = response.choices[0].message.content.strip()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Together AI error: {str(e)}")

    return LaymanResponse(
        patient_name=request.patient_name,
        summary=summary_text
    )