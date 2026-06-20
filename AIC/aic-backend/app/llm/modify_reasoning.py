"""Modify-mode reasoning via the shared LLM service (classification/summary later)."""

from __future__ import annotations

from typing import List

from app.llm.service import LLMUnavailableError, chat_completion


def modify_reasoning_chat(messages: List[dict]) -> str:
    """
    Run a chat completion using the user's configured LLM (cloud or local).
    Used by future Modify endpoints for classification and user-facing summaries.
    """
    return chat_completion(messages)


def modify_classify_stub(user_prompt: str) -> str:
    """Placeholder until structured classification exists."""
    system = (
        "You classify a user's request to change a local desktop app. "
        "Reply with a short plain-English goal (one sentence) and a risk level: low/medium/high."
    )
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_prompt},
    ]
    try:
        return modify_reasoning_chat(messages)
    except LLMUnavailableError as e:
        return f"LLM unavailable: {e}"
