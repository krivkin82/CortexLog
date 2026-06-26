"""Resolve active LLM backend and run chat completions."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, List, Optional

from app.llm.llm_settings import (
    LEGACY_SECRET_OPENAI,
    SECRET_KEY_OPENAI,
    effective_ollama_model,
    get_llm_settings_dict,
    local_chat_inference,
    openai_chat_inference,
)
from app.llm.providers.ollama_provider import OllamaProvider
from app.llm.providers.openai_provider import OpenAIProvider
from app.security.machine_key import get_machine_passphrase
from app.security.secret_store import get_secret


class LLMUnavailableError(Exception):
    """Raised when the configured LLM cannot produce a response."""


def _agent_log(run_id: str, hypothesis_id: str, location: str, message: str, data: dict[str, Any]) -> None:
    try:
        path = Path(__file__).resolve().parents[3] / "debug-eff0ce.log"
        payload = {
            "sessionId": "eff0ce",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=True) + "\n")
    except Exception:
        pass


def _get_openai_key(passphrase: str) -> Optional[str]:
    k = get_secret(SECRET_KEY_OPENAI, passphrase=passphrase)
    if k:
        return k
    return get_secret(LEGACY_SECRET_OPENAI, passphrase=passphrase)


def resolve_runtime_label() -> str:
    llm = get_llm_settings_dict()
    if llm.get("model_source") == "local":
        return f"ollama:{effective_ollama_model(llm)}"
    prov = llm.get("cloud_provider") or "openai"
    model = llm.get("cloud_model") or "gpt-4o-mini"
    return f"{prov}:{model}"


def chat_completion(
    messages: List[dict[str, Any]],
    *,
    json_output: bool = False,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> str:
    """
    Route chat completion based on `cortexlog_llm` settings.
    - local -> Ollama
    - cloud + openai + key -> OpenAI
    - cloud + anthropic/gemini -> NotImplemented until providers exist
    Optional temperature/max_tokens override stored settings when set.
    """
    llm = get_llm_settings_dict()
    passphrase = get_machine_passphrase()
    source = llm.get("model_source") or "local"

    # #region agent log
    _agent_log(
        "pre-fix",
        "H3",
        "app/llm/service.py:chat_completion",
        "llm dispatch metadata",
        {
            "source": source,
            "runtime_label": resolve_runtime_label(),
            "message_count": len(messages),
            "json_output": json_output,
            "temperature_override": temperature,
            "max_tokens_override": max_tokens,
            "local_model": effective_ollama_model(llm),
            "cloud_provider": llm.get("cloud_provider"),
            "cloud_model": llm.get("cloud_model"),
            "local_inference": local_chat_inference(llm),
            "openai_inference": openai_chat_inference(llm),
        },
    )
    # #endregion

    if source == "local":
        try:
            fmt = "json" if json_output else None
            lt, npred, nctx = local_chat_inference(llm)
            return OllamaProvider().chat(
                messages,
                model=effective_ollama_model(llm),
                format=fmt,
                temperature=temperature if temperature is not None else lt,
                num_predict=max_tokens if max_tokens is not None else npred,
                num_ctx=nctx,
            )
        except Exception as e:
            raise LLMUnavailableError("Local model unavailable.") from e

    provider = (llm.get("cloud_provider") or "openai").lower()
    model = llm.get("cloud_model") or "gpt-4o-mini"

    if provider == "openai":
        key = _get_openai_key(passphrase)
        if not key:
            raise LLMUnavailableError("OpenAI API key not configured.")
        try:
            ot, omax = openai_chat_inference(llm)
            return OpenAIProvider(key).chat(
                messages,
                model=str(model),
                json_mode=json_output,
                temperature=ot if temperature is None else temperature,
                max_tokens=omax if max_tokens is None else max_tokens,
            )
        except Exception as e:
            raise LLMUnavailableError("OpenAI request failed.") from e

    if provider == "anthropic":
        raise LLMUnavailableError("Anthropic provider is not implemented yet.")
    if provider == "gemini":
        raise LLMUnavailableError("Gemini provider is not implemented yet.")

    raise LLMUnavailableError("Unknown cloud provider.")
