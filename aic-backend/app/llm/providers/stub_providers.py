"""Planned providers not yet implemented."""

from __future__ import annotations

from typing import Any, List


class StubProvider:
    def __init__(self, provider_id: str, label: str) -> None:
        self.id = provider_id
        self.label = label
        self.implemented = False

    def chat(self, messages: List[dict[str, Any]], *, model: str | None) -> str:
        raise NotImplementedError(f"{self.label} is not implemented yet.")
