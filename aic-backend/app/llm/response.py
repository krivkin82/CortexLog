"""LLM response entrypoint — delegates to response contract orchestrator."""

from __future__ import annotations

from typing import Any, Dict, List

from app.llm.response_contract import SAFETY_BLOCK, orchestrate_response

# Re-export for journal reflect and any legacy imports
__all__ = ["generate_response", "SAFETY_BLOCK", "_build_system_prompt"]


def _build_system_prompt(mode: str, retrieved_context: List[str] | None) -> str:
    """Legacy helper: minimal system prompt for routes that still call chat_completion directly."""
    parts = [SAFETY_BLOCK]
    if retrieved_context:
        context_block = "\n\n".join(retrieved_context[:5])
        parts.append(
            f"Relevant context from the user's notes (use only to support your reply):\n{context_block}"
        )
    return "\n\n".join(parts)


def generate_response(
    user_message: str,
    mode: str,
    retrieved_context: List[str] | None = None,
    session_id: str | None = None,
) -> Dict[str, Any]:
    """
    Generate an LLM response via response contract orchestration.
    `mode` is a weak compatibility hint only (journal, coach, exploration, crisis, advisor_workplace).
    Raises LLMUnavailableError so routes can return 503.
    """
    result = orchestrate_response(
        user_message=user_message,
        mode_hint=mode,
        retrieved_context=retrieved_context,
        session_id=session_id,
    )
    # API surfaces only text by default; debug logged when Settings → Debug log is on (default on)
    return {"text": result["text"]}
