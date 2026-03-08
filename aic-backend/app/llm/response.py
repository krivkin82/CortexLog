from typing import Any, Dict, List

from app.llm.ollama_client import chat
from app.storage.chat import list_chat_messages

SAFETY_BLOCK = """You are a supportive companion. Do not diagnose, moralize, or give medical/legal advice. Preserve the user's agency and dignity. If someone seems in distress, encourage grounding and professional support without debating."""

MODE_PROMPTS = {
    "journal": "Respond reflectively and supportively. Invite the user to say more about how they felt. You may reference relevant notes from their knowledge base when provided.",
    "coach": "Use a motivational interviewing style. Offer one small, achievable next step. Keep it brief and actionable.",
    "exploration": "Respond as a curious companion. Explore ideas without pushing. Do not use the user's personal data unless they ask.",
    "crisis": "Stay calm and grounding. Do not debate or minimize. Encourage one small grounding action. Gently suggest reaching out to a trusted person or professional if appropriate. Do not make promises about outcomes.",
    "advisor_workplace": """Respond as a pragmatic workplace advisor. Use this exact scaffold in every response. Keep empathy brief and subordinate to analysis.

Your response MUST include these sections in order:

1. **What's happening** – Separate facts from interpretation. Name the situation clearly.
2. **What matters most** – The core issue or constraint. What actually drives the outcome.
3. **Two options with tradeoffs** – Present two concrete paths. For each, state upside, downside, and when it makes sense.
4. **What I'd do next** – One recommended next step with a concrete time frame (e.g. within 48 hours).
5. **Talk track** – A script or phrase the user can say out loud. E.g. "You could say: ..." or "Here's a way to frame it: ..."
6. **Likelihood / reality check** – Calibrate expectations. Use language like "likely", "unlikely", "in most cases", "the odds are".

Rules:
- Do not end the response with only a question. End with a statement, recommendation, or invitation that includes substance.
- Be concrete. Avoid generic advice. Reference the user's specific situation.
- Empathy: one brief line max. Focus on analysis and options.""",
}


def _build_system_prompt(mode: str, retrieved_context: List[str] | None) -> str:
    mode_text = MODE_PROMPTS.get(mode, MODE_PROMPTS["journal"])
    parts = [SAFETY_BLOCK, mode_text]
    if retrieved_context:
        context_block = "\n\n".join(retrieved_context[:5])
        parts.append(f"Relevant context from the user's notes (use only to support your reply):\n{context_block}")
    return "\n\n".join(parts)


ADVISOR_RETRY_APPENDIX = """

Your previous response was missing required sections. You MUST include all six: (1) What's happening, (2) What matters most, (3) Two options with tradeoffs, (4) What I'd do next, (5) Talk track, (6) Likelihood/reality check. Do not end with only a question. Try again."""


def _has_required_advisor_sections(text: str) -> bool:
    """Lightweight check for advisor_workplace scaffold. Used for optional retry."""
    t = text.strip().lower().replace("\n", " ")
    if not t:
        return False
    has_what = any(m in t for m in ["what's happening", "what's going on", "what matters", "the core issue"])
    has_next = any(m in t for m in ["next step", "what i'd do", "within the next"])
    has_options = any(m in t for m in ["option 1", "option 2", "tradeoff", "upside", "downside"])
    has_script = any(m in t for m in ["you could say", "say something like", "here's a way to say"])
    paragraphs = [p.strip() for p in text.strip().split("\n\n") if p.strip()]
    ends_question_only = (
        len(paragraphs) > 0
        and paragraphs[-1].endswith("?")
        and len(paragraphs[-1].split()) < 30
    )
    return has_what and has_next and (has_options or has_script) and not ends_question_only


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
    For advisor_workplace mode, retries once if required scaffold sections are missing.
    """
    messages = _build_chat_messages(user_message, mode, retrieved_context, session_id)
    response_text = chat(messages) or ""

    if mode == "advisor_workplace" and not _has_required_advisor_sections(response_text):
        system_content = messages[0]["content"] + ADVISOR_RETRY_APPENDIX
        retry_messages = [{"role": "system", "content": system_content}, {"role": "user", "content": user_message}]
        response_text = chat(retry_messages) or response_text

    return {"text": response_text}
