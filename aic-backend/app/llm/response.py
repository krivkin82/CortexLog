"""LLM response entrypoint — direct completion without contract harness."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List

from app.llm.service import chat_completion
from app.storage.chat import list_chat_messages

# Re-export for journal reflect and any legacy imports
__all__ = ["generate_response", "SAFETY_BLOCK", "_build_system_prompt"]

SAFETY_BLOCK = """
Role: Be a thoughtful, grounded AI journal companion and advisor.

Guidelines:
- Preserve the user's agency, dignity, and ability to make their own choices.
- Avoid pretending to be a licensed professional or claiming certainty where uncertainty exists.
- Distinguish between observed facts, interpretations, and speculation.
- In situations involving serious danger or high-risk harm, encourage immediate real-world support.
""".strip()


def _agent_log(run_id: str, hypothesis_id: str, location: str, message: str, data: dict[str, Any]) -> None:
    try:
        path = Path(__file__).resolve().parents[3] / "debug-eff0ce.log"
        payload = {
            "sessionId": "eff0ce",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=True) + "\n")
    except Exception:
        pass


def _mode_prompt(mode: str) -> str:
    m = (mode or "").strip().lower()
    if m == "journal":
        return (
            "You are CortexLog, an AI journal companion responding to the user's journal entry.\n"
            "Respond as an outside reader, not as the user. Do not continue the entry in first person. "
            "Do not write as if you experienced the user's day, feelings, memories, or choices.\n"
            "Keep the response grounded, proportionate, and conversational. Avoid grandiose praise, "
            "diagnosis, inflated interpretations, or dramatic reframing unless the user clearly asks for that.\n"
            "If useful, reflect back one or two concrete observations from the entry and offer a modest next thought."
        )
    if m == "crisis":
        return (
            f"{SAFETY_BLOCK}\n\n"
            "Be calm, supportive, and safety-oriented. Encourage immediate real-world support "
            "when there is serious risk."
        )
    return ""


def _build_system_prompt(mode: str) -> str:
    parts = []
    mode_prompt = _mode_prompt(mode)
    if mode_prompt:
        parts.append(mode_prompt)
    return "\n\n".join(parts)


def _retrieved_context_message(retrieved_context: List[str] | None) -> str:
    if not retrieved_context:
        return ""
    context_block = "\n\n".join(retrieved_context[:5]).strip()
    if not context_block:
        return ""
    return f"Earlier journal/context excerpts:\n\n{context_block}"


def _session_messages(session_id: str | None, limit: int = 80) -> List[dict[str, str]]:
    if not session_id:
        return []
    history = list_chat_messages(session_id=session_id)
    out: List[dict[str, str]] = []
    for m in history[-limit:]:
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            out.append({"role": role, "content": content})
    return out


def _trim_messages(messages: List[dict[str, Any]], max_chars: int = 24000, max_messages: int = 48) -> List[dict[str, Any]]:
    if not messages:
        return []
    tail = messages[-max_messages:]
    total = 0
    kept: List[dict[str, Any]] = []
    for msg in reversed(tail):
        content = str(msg.get("content") or "")
        size = len(content)
        if kept and total + size > max_chars:
            break
        kept.append(msg)
        total += size
    return list(reversed(kept))


def generate_response(
    user_message: str,
    mode: str,
    retrieved_context: List[str] | None = None,
    session_id: str | None = None,
) -> Dict[str, Any]:
    system = _build_system_prompt(mode)
    history = _session_messages(session_id)

    messages: List[dict[str, Any]] = []
    if system:
        messages.append({"role": "system", "content": system})
    context_msg = _retrieved_context_message(retrieved_context)
    if context_msg:
        messages.append({"role": "user", "content": context_msg})
    messages.extend(_trim_messages(history))

    current = (user_message or "").strip()
    if current:
        last = messages[-1] if messages else None
        duplicate_last_user = (
            bool(last)
            and last.get("role") == "user"
            and (last.get("content") or "").strip() == current
        )
        if not duplicate_last_user:
            messages.append({"role": "user", "content": current})

    # #region agent log
    assistant_history = [m for m in history if m.get("role") == "assistant"]
    marker_terms = [
        "magnificent",
        "profound",
        "architecture map",
        "perfect portrait",
        "deep satisfaction",
        "integrated contentment",
    ]
    marker_counts = {
        term: sum(1 for m in assistant_history if term in (m.get("content") or "").lower())
        for term in marker_terms
    }
    _agent_log(
        "pre-fix",
        "H1,H4,H5",
        "app/llm/response.py:generate_response",
        "assembled reflection prompt metadata",
        {
            "mode": mode,
            "session_id": session_id,
            "system_present": bool(system),
            "context_present": bool(context_msg),
            "history_count": len(history),
            "assistant_history_count": len(assistant_history),
            "message_count": len(messages),
            "roles": [m.get("role") for m in messages],
            "message_lengths": [len(str(m.get("content") or "")) for m in messages],
            "duplicate_last_user": duplicate_last_user if current else False,
            "assistant_history_style_markers": marker_counts,
        },
    )
    # #endregion

    text = chat_completion(messages) or ""
    # #region agent log
    lower_text = text.lower()
    _agent_log(
        "pre-fix-2",
        "H6,H7,H8,H9",
        "app/llm/response.py:generate_response:output",
        "model output style metadata",
        {
            "mode": mode,
            "session_id": session_id,
            "output_len": len(text),
            "starts_with_i": lower_text.lstrip().startswith("i "),
            "first_person_count": sum(
                lower_text.count(term)
                for term in [" i ", " i'm", " i've", " my ", " me ", " we ", " our "]
            ),
            "second_person_count": sum(
                lower_text.count(term)
                for term in [" you ", " your ", " you're", " you've", " yourself"]
            ),
            "journal_role_words": {
                "journal": lower_text.count("journal"),
                "entry": lower_text.count("entry"),
                "reflection": lower_text.count("reflection"),
            },
        },
    )
    # #endregion
    return {"text": text}
