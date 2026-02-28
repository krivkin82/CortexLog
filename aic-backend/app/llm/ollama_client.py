"""Thin wrapper for Ollama API."""

from ollama import Client

from app.core.config import settings


def get_client() -> Client:
    """Return an Ollama client configured from settings."""
    return Client(host=settings.ollama_base_url)


def generate(prompt: str, model: str | None = None, system: str | None = None, format: str | None = None) -> str:
    """
    Call Ollama generate endpoint. Returns the full response text.
    Use format="json" for JSON responses.
    """
    client = get_client()
    model = model or settings.ollama_model
    response = client.generate(
        model=model,
        prompt=prompt,
        system=system or "",
        format=format or "",
    )
    return getattr(response, "response", "") or ""


def chat(messages: list[dict], model: str | None = None, format: str | None = None) -> str:
    """
    Call Ollama chat endpoint. messages format: [{"role": "user"|"assistant"|"system", "content": "..."}]
    Returns the assistant's reply content.
    """
    client = get_client()
    model = model or settings.ollama_model
    response = client.chat(model=model, messages=messages, format=format or "")
    msg = getattr(response, "message", None)
    return getattr(msg, "content", "") if msg else ""
