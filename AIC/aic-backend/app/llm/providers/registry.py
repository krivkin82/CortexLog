"""Provider registry metadata for API and UI."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class ProviderMeta:
    id: str
    label: str
    implemented: bool


def list_provider_metadata() -> List[dict]:
    return [
        {"id": "openai", "label": "OpenAI", "implemented": True},
        {"id": "anthropic", "label": "Anthropic", "implemented": False},
        {"id": "gemini", "label": "Google Gemini", "implemented": False},
        {"id": "ollama", "label": "Ollama (local)", "implemented": True},
    ]
