"""Local Ollama chat."""

from __future__ import annotations

from typing import Any, List

from app.llm import ollama_client


class OllamaProvider:
    id = "ollama"
    label = "Ollama (local)"
    implemented = True

    def chat(
        self,
        messages: List[dict[str, Any]],
        *,
        model: str | None,
        format: str | None = None,
        temperature: float | None = None,
        num_predict: int | None = None,
    ) -> str:
        return ollama_client.chat(
            messages,
            model=model,
            format=format,
            temperature=temperature,
            num_predict=num_predict,
        )
