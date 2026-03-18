"""
chatbot.py
----------
Health companion chatbot.

Instead of relying on the tool-calling API (which Llama 3.3 handles
inconsistently for conversational prompts), patient context is fetched
directly in Python and injected into the system prompt before each call.
This gives the same personalised result reliably.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv
from together import Together

load_dotenv()

client = Together(api_key=os.getenv("TOGETHER_API_KEY"))

MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo"

BASE_SYSTEM_PROMPT = """You are a caring and empathetic AI health companion for elderly Singaporean patients
managing chronic conditions like Type 2 Diabetes.

Speak simply and warmly. Avoid medical jargon.
If the patient mentions serious symptoms (chest pain, difficulty breathing, severe dizziness),
advise them to contact their doctor or call 995 immediately.
Always reply in the same language the patient uses (English, Mandarin, or Malay).
Keep responses brief — 2-3 sentences maximum.
Never invent medication names or medical facts."""

# In-memory session store
_patient_sessions: dict[str, list[dict]] = {}


def _get_history(patient_id: str) -> list[dict]:
    if patient_id not in _patient_sessions:
        _patient_sessions[patient_id] = []
    return _patient_sessions[patient_id]


def _fetch_patient_context(patient_id: int, db) -> str:
    """Fetch patient data from DB and return as a plain text context block."""
    from agent_tools import (
        _get_patient_profile,
        _get_patient_medications,
        _get_recent_daily_logs,
    )

    lines = []

    try:
        profile = _get_patient_profile(patient_id, db)
        if "error" not in profile:
            lines.append(f"Patient name: {profile.get('full_name', 'Unknown')}")
            lines.append(f"Medical conditions: {', '.join(profile.get('medical_conditions', [])) or 'None recorded'}")
            lines.append(f"Medication list: {profile.get('medication_list', 'None recorded')}")
    except Exception as e:
        print(f"Warning: Could not fetch profile: {e}")

    try:
        meds = _get_patient_medications(patient_id, db)
        if "medications" in meds and meds["medications"]:
            med_lines = []
            for m in meds["medications"]:
                taken = "taken" if m["taken_today"] else "NOT taken"
                med_lines.append(f"  - {m['name']} {m['dosage']} at {m['schedule_time']} ({taken})")
            lines.append("Today's medications:\n" + "\n".join(med_lines))
    except Exception as e:
        print(f"Warning: Could not fetch medications: {e}")

    try:
        logs = _get_recent_daily_logs(patient_id, db, limit=3)
        if logs.get("logs"):
            log_lines = []
            for log in logs["logs"]:
                log_lines.append(
                    f"  - {log['date']}: meds {'taken' if log['meds_taken'] else 'NOT taken'}, mood: {log['mood']}"
                )
            lines.append("Recent check-ins:\n" + "\n".join(log_lines))
    except Exception as e:
        print(f"Warning: Could not fetch daily logs: {e}")

    if not lines:
        return ""
    return "\n\nPatient context:\n" + "\n".join(lines)


def chat(patient_id: str, user_message: str, db=None) -> str:
    pid = patient_id.strip()
    if pid.startswith("patient_"):
        pid = pid[8:]

    history = _get_history(pid)

    context = ""
    if db is not None and pid.isdigit():
        context = _fetch_patient_context(int(pid), db)
        print(f"Injected context for patient {pid}: {context[:200]}")

    system_prompt = BASE_SYSTEM_PROMPT + context

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-6:])
    messages.append({"role": "user", "content": user_message})

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            max_tokens=200,
            temperature=0.3,
        )
        response_text = response.choices[0].message.content.strip()
        print(f"Chatbot response: {response_text[:150]}")

    except Exception as e:
        print(f"Chatbot error: {e}")
        response_text = (
            "I'm sorry, I'm having trouble responding right now. "
            "Please try again in a moment, or contact your healthcare provider if this is urgent."
        )

    history.append({"role": "user", "content": user_message})
    history.append({"role": "assistant", "content": response_text})

    if len(history) > 20:
        _patient_sessions[pid] = history[-20:]

    return response_text


def clear_session(patient_id: str) -> None:
    pid = patient_id.strip()
    if pid.startswith("patient_"):
        pid = pid[8:]
    _patient_sessions.pop(pid, None)
