"""
agent_tools.py
--------------
Shared agentic tool definitions and executor for all AI features.
Tools give the LLM structured access to DB data so it can reason
over real patient context before generating a response.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any


def _json_serial(obj):
    """JSON serializer that handles date and datetime objects."""
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

from sqlalchemy.orm import Session

import models


# ── Tool schemas (passed to Together AI) ──────────────────────────────────────

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_patient_profile",
            "description": (
                "Fetch a patient's profile including medical conditions, "
                "date of birth, and medication list."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "integer", "description": "The patient's user ID"}
                },
                "required": ["patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_patient_medications",
            "description": (
                "Fetch the current medication schedule for a patient, "
                "including name, dosage, schedule time, and whether taken today."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "integer", "description": "The patient's user ID"}
                },
                "required": ["patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_daily_logs",
            "description": (
                "Fetch the patient's recent daily check-in logs (up to 7 days). "
                "Includes medication adherence, mood, and questions asked."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "integer", "description": "The patient's user ID"},
                    "limit": {"type": "integer", "description": "Number of logs to fetch (default 7)"},
                },
                "required": ["patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_chat_history",
            "description": (
                "Fetch the patient's recent chatbot conversation history "
                "to understand symptoms or concerns they have reported."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "integer", "description": "The patient's user ID"},
                    "limit": {"type": "integer", "description": "Number of messages to fetch (default 12)"},
                },
                "required": ["patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_appointment_notes",
            "description": (
                "Fetch the most recent appointment notes for a patient, "
                "including diagnosis, symptoms, treatment plan, and medications prescribed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "integer", "description": "The patient's user ID"}
                },
                "required": ["patient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_medication_interactions",
            "description": (
                "Given a new medication name and a list of current medications, "
                "return a basic interaction flag. This uses heuristic rules only — "
                "the LLM should reason further about the result."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "new_medication": {"type": "string", "description": "Name of the new medication"},
                    "current_medications": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of patient's current medication names",
                    },
                },
                "required": ["new_medication", "current_medications"],
            },
        },
    },
]


# ── Tool executor ──────────────────────────────────────────────────────────────

def execute_tool(name: str, arguments_json: str, db: Session) -> Any:
    """Route a tool call from the LLM to the correct DB query or logic."""
    try:
        args = json.loads(arguments_json)
    except json.JSONDecodeError:
        return {"error": "Invalid arguments JSON"}

    if name == "get_patient_profile":
        return _get_patient_profile(args["patient_id"], db)

    if name == "get_patient_medications":
        return _get_patient_medications(args["patient_id"], db)

    if name == "get_recent_daily_logs":
        return _get_recent_daily_logs(args["patient_id"], db, args.get("limit", 7))

    if name == "get_recent_chat_history":
        return _get_recent_chat_history(args["patient_id"], db, args.get("limit", 12))

    if name == "get_appointment_notes":
        return _get_appointment_notes(args["patient_id"], db)

    if name == "check_medication_interactions":
        return _check_medication_interactions(
            args["new_medication"], args.get("current_medications", [])
        )

    return {"error": f"Unknown tool: {name}"}


# ── Individual tool implementations ───────────────────────────────────────────

def _get_patient_profile(patient_id: int, db: Session) -> dict:
    user = db.query(models.User).filter(
        models.User.id == patient_id, models.User.role == "patient"
    ).first()
    if not user:
        return {"error": "Patient not found"}

    conditions = []
    if user.patient_medical_conditions:
        try:
            parsed = json.loads(user.patient_medical_conditions)
            conditions = parsed if isinstance(parsed, list) else [str(parsed)]
        except Exception:
            conditions = [user.patient_medical_conditions]

    return {
        "patient_id": patient_id,
        "full_name": user.full_name,
        "date_of_birth": user.patient_date_of_birth or "Unknown",
        "medical_conditions": conditions,
        "medication_list": user.patient_medication_list or "None recorded",
        "emergency_contact": user.patient_emergency_contact or "None",
    }


def _get_patient_medications(patient_id: int, db: Session) -> dict:
    meds = (
        db.query(models.Medication)
        .filter(models.Medication.patient_id == patient_id)
        .order_by(models.Medication.schedule_time.asc())
        .all()
    )
    return {
        "patient_id": patient_id,
        "medications": [
            {
                "id": m.id,
                "name": m.name,
                "dosage": m.dosage,
                "schedule_time": m.schedule_time,
                "taken_today": bool(m.taken),
            }
            for m in meds
        ],
    }


def _get_recent_daily_logs(patient_id: int, db: Session, limit: int = 7) -> dict:
    logs = (
        db.query(models.DailyLog)
        .filter(models.DailyLog.patient_id == patient_id)
        .order_by(models.DailyLog.log_date.desc())
        .limit(limit)
        .all()
    )
    results = []
    for log in reversed(logs):
        questions = []
        if log.questions:
            try:
                questions = json.loads(log.questions)
            except Exception:
                questions = [log.questions]
        results.append(
            {
                "date": log.log_date,
                "meds_taken": bool(log.meds_taken),
                "mood": log.mood or "not recorded",
                "questions": questions,
            }
        )
    return {"patient_id": patient_id, "logs": results}


def _get_recent_chat_history(patient_id: int, db: Session, limit: int = 12) -> dict:
    error_phrases = [
        "taking longer than expected",
        "having trouble responding",
        "please try again",
    ]
    messages = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.patient_id == patient_id)
        .order_by(models.ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    ordered = list(reversed(messages))
    return {
        "patient_id": patient_id,
        "messages": [
            {"role": m.role, "content": m.content}
            for m in ordered
            if not (
                m.role == "assistant"
                and any(p in m.content.lower() for p in error_phrases)
            )
        ],
    }


def _get_appointment_notes(patient_id: int, db: Session) -> dict:
    appointment = (
        db.query(models.Appointment)
        .filter(models.Appointment.patient_id == patient_id)
        .order_by(models.Appointment.visit_time.desc())
        .first()
    )
    if not appointment:
        return {"error": "No appointments found"}

    note = (
        db.query(models.AppointmentNote)
        .filter(models.AppointmentNote.appointment_id == appointment.id)
        .first()
    )
    if not note:
        return {"appointment_id": appointment.id, "notes": "No notes recorded yet"}

    return {
        "appointment_id": appointment.id,
        "appointment_date": appointment.visit_time.isoformat() if appointment.visit_time else "",
        "symptoms": note.symptoms or "",
        "diagnosis": note.diagnosis or "",
        "treatment_plan": note.treatment_plan or "",
        "medications_prescribed": note.medications or "",
        "follow_up_instructions": note.follow_up_instructions or "",
    }


def _check_medication_interactions(new_medication: str, current_medications: list[str]) -> dict:
    """
    Lightweight heuristic interaction check.
    The LLM is expected to reason further — this just surfaces known flag pairs.
    """
    known_pairs = {
        frozenset(["warfarin", "aspirin"]): "Increased bleeding risk",
        frozenset(["metformin", "alcohol"]): "Risk of lactic acidosis",
        frozenset(["simvastatin", "amlodipine"]): "Increased myopathy risk",
        frozenset(["lisinopril", "potassium"]): "Risk of hyperkalaemia",
        frozenset(["ssri", "tramadol"]): "Risk of serotonin syndrome",
    }

    new_lower = new_medication.lower()
    current_lower = [m.lower() for m in current_medications]
    flags = []

    for pair, warning in known_pairs.items():
        pair_list = list(pair)
        if new_lower in pair_list[0] or pair_list[0] in new_lower:
            for current in current_lower:
                if pair_list[1] in current or current in pair_list[1]:
                    flags.append(warning)
        if new_lower in pair_list[1] or pair_list[1] in new_lower:
            for current in current_lower:
                if pair_list[0] in current or current in pair_list[0]:
                    flags.append(warning)

    return {
        "new_medication": new_medication,
        "current_medications": current_medications,
        "interaction_flags": flags if flags else ["No known interactions flagged"],
        "note": "Heuristic check only. LLM should apply clinical reasoning.",
    }


# ── Agentic loop helper ────────────────────────────────────────────────────────

def run_agentic_loop(
    client,
    model: str,
    messages: list[dict],
    db: Session,
    tools: list[dict] | None = None,
    max_steps: int = 6,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    force_first_tool: str | None = None,
) -> str:
    if tools is None:
        tools = TOOL_DEFINITIONS

    for step in range(max_steps):
        print(f"🤖 Agent step {step + 1}/{max_steps}")

        # Force the first tool call explicitly, then let the model decide after
        if step == 0 and force_first_tool:
            tool_choice = {"type": "function", "function": {"name": force_first_tool}}
        else:
            tool_choice = "auto"

        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=tools,
                tool_choice=tool_choice,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as e:
            print(f"❌ Together AI API error at step {step + 1}: {e}")
            raise

        msg = response.choices[0].message
        tool_calls = getattr(msg, "tool_calls", None)

        print(f"   finish_reason: {response.choices[0].finish_reason}")
        print(f"   tool_calls: {[tc.function.name for tc in tool_calls] if tool_calls else 'none'}")
        print(f"   content preview: {(msg.content or '')[:120]}")

        # Check if the model wrote tool code as plain text — strip it and return clean response
        content = (msg.content or "").strip()
        if not tool_calls and "```tool_code" in content:
            print("⚠️  Model wrote tool code as text — extracting clean response")
            # Strip out the tool_code blocks and return whatever prose is left
            import re
            clean = re.sub(r"```tool_code.*?```", "", content, flags=re.DOTALL).strip()
            if clean:
                return clean
            # Nothing left — do a plain fallback call without tools
            fallback = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return (fallback.choices[0].message.content or "").strip()

        if not tool_calls:
            print(f"✅ Agent finished at step {step + 1}")
            return content

        messages.append(
            {
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in tool_calls
                ],
            }
        )

        for tc in tool_calls:
            print(f"🔧 Executing tool: {tc.function.name}  args: {tc.function.arguments[:200]}")
            result = execute_tool(tc.function.name, tc.function.arguments, db)
            result_str = json.dumps(result, default=_json_serial)
            print(f"📦 Tool result: {result_str[:300]}")
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_str,
                }
            )

    print(f"⚠️  Agent hit max_steps ({max_steps}) without finishing")
    try:
        fallback = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return (fallback.choices[0].message.content or "").strip()
    except Exception:
        return "I was unable to complete this request. Please try again."