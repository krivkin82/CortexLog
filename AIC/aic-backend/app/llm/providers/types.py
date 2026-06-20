"""LLM provider typing."""

from __future__ import annotations

from typing import Any, List, Protocol


class LLMProvider(Protocol):
    """Minimal chat completion provider."""

    id: str
    label: str
    implemented: bool

    def chat(self, messages: List[dict[str, Any]], *, model: str | None) -> str:
        """Return assistant text. Raises on failure."""
