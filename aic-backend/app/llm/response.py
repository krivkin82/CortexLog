"""LLM response entrypoint — direct completion without contract harness."""

from __future__ import annotations

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


def _mode_prompt(mode: str) -> str:
    m = (mode or "").strip().lower()
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

    text = chat_completion(messages) or ""
    return {"text": text}
