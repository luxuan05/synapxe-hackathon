from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from together import Together
from dotenv import load_dotenv
import os

load_dotenv()

router = APIRouter()

client = Together(api_key=os.getenv("TOGETHER_API_KEY"))


# --- Request & Response Models ---

class LaymanRequest(BaseModel):
    patient_name: str
    clinical_notes: str
    language: str = "English"  # supports Mandarin, Malay, Tamil etc.


class LaymanResponse(BaseModel):
    patient_name: str
    simplified_notes: str
    language: str


# --- Prompt Builder ---

def build_layman_prompt(patient_name: str, clinical_notes: str, language: str) -> str:
    language_instruction = (
        f"Reply in {language}."
        if language.lower() != "english"
        else "Reply in simple, clear English."
    )

    prompt = f"""You are a friendly medical assistant helping elderly patients understand their doctor's notes.

Patient Name: {patient_name}

The doctor wrote the following clinical notes:
\"\"\"{clinical_notes}\"\"\"

Your task:
- Convert these notes into simple, plain language that an elderly patient with no medical background can easily understand.
- Avoid all medical jargon. If you must use a medical term, explain it in brackets.
- Use short sentences. Be warm, calm, and reassuring in tone.
- Do NOT add any medical advice or diagnoses beyond what the doctor wrote.
- {language_instruction}"""

    return prompt


# --- Endpoint ---

@router.post("/layman", response_model=LaymanResponse)
async def simplify_notes(request: LaymanRequest):
    if not request.clinical_notes.strip():
        raise HTTPException(status_code=400, detail="No clinical notes provided.")

    prompt = build_layman_prompt(
        request.patient_name,
        request.clinical_notes,
        request.language
    )

    try:
        response = client.chat.completions.create(
            model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
            messages=[
                {
                    "role": "system",
                    "content": "You are a warm, friendly assistant that explains medical information to elderly patients in simple language."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.5,
        )
        simplified = response.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Together AI error: {str(e)}")

    return LaymanResponse(
        patient_name=request.patient_name,
        simplified_notes=simplified,
        language=request.language
    )