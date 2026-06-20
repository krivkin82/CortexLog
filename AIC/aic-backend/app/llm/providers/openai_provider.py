"""OpenAI chat completions."""

from __future__ import annotations

from typing import Any, List

from openai import OpenAI


class OpenAIProvider:
    id = "openai"
    label = "OpenAI"
    implemented = True

    def __init__(self, api_key: str) -> None:
        self._client = OpenAI(api_key=api_key)

    def chat(
        self,
        messages: List[dict[str, Any]],
        *,
        model: str | None,
        json_mode: bool = False,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        m = model or "gpt-4o-mini"
        kwargs: dict[str, Any] = {"model": m, "messages": messages}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        else:
            kwargs["temperature"] = temperature
        kwargs["max_tokens"] = max_tokens
        resp = self._client.chat.completions.create(**kwargs)
        choice = resp.choices[0].message
        return (choice.content or "").strip()
