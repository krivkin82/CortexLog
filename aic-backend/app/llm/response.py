from typing import Any, Dict, List

from app.llm.ollama_client import chat
from app.storage.chat import list_chat_messages

SAFETY_BLOCK = """You are a supportive companion. Do not diagnose, moralize, or give medical/legal advice. Preserve the user's agency and dignity. If someone seems in distress, encourage grounding and professional support without debating."""

MODE_PROMPTS = {
    "journal": "Respond reflectively and supportively. Invite the user to say more about how they felt. You may reference relevant notes from their knowledge base when provided.",
    "coach": "Use a motivational interviewing style. Offer one small, achievable next step. Keep it brief and actionable.",
    "exploration": "Respond as a curious companion. Explore ideas without pushing. Do not use the user's personal data unless they ask.",
    "crisis": "Stay calm and grounding. Do not debate or minimize. Encourage one small grounding action. Gently suggest reaching out to a trusted person or professional if appropriate. Do not make promises about outcomes.",
    "advisor_workplace": "Respond as a workplace mentor. One who has experience in countless workplace situations, a deep understanding of the human psychology, organizational psychology, group communication, group dynamics, anthropology, technology, HR, and other such disciplines as enable you to give expert advice on tricky, sometimes ambiguous situations that arise in the modern workplace.",
}


def _build_system_prompt(mode: str, retrieved_context: List[str] | None) -> str:
    mode_text = MODE_PROMPTS.get(mode, MODE_PROMPTS["journal"])
    parts = [SAFETY_BLOCK, mode_text]
    if retrieved_context:
        context_block = "\n\n".join(retrieved_context[:5])
        parts.append(f"Relevant context from the user's notes (use only to support your reply):\n{context_block}")
    return "\n\n".join(parts)


def _build_chat_messages(
    user_message: str,
    mode: str,
    retrieved_context: List[str] | None,
    session_id: str | None,
) -> list[dict]:
    system = _build_system_prompt(mode, retrieved_context)
    messages = [{"role": "system", "content": system}]

    if session_id:
        history = list_chat_messages(session_id=session_id)
        for m in history:
            role = m.get("role")
            content = m.get("content") or ""
            if role in ("user", "assistant", "system"):
                messages.append({"role": role, "content": content})
        return messages

    messages.append({"role": "user", "content": user_message})
    return messages


def generate_response(
    user_message: str,
    mode: str,
    retrieved_context: List[str] | None = None,
    session_id: str | None = None,
) -> Dict[str, Any]:
    """
    Generate an LLM response via Ollama. Uses session history when session_id is set.
    Raises on Ollama connection/model errors so the route can return 503.
    """
    messages = _build_chat_messages(user_message, mode, retrieved_context, session_id)
    response_text = chat(messages)
    return {"text": response_text or ""}
