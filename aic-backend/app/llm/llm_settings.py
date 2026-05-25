"""Defaults and helpers for CortexLog LLM settings (`cortexlog_llm`)."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional

from app.core.config import settings
from app.storage.settings import get_setting, set_setting

SETTINGS_KEY = "cortexlog_llm"

# Secret keys per provider (encrypted with machine passphrase)
SECRET_KEY_OPENAI = "llm_api_key_openai"
SECRET_KEY_ANTHROPIC = "llm_api_key_anthropic"
SECRET_KEY_GEMINI = "llm_api_key_gemini"

# Legacy OpenAI secret key from earlier MVP
LEGACY_SECRET_OPENAI = "openai_api_key"

DEFAULT_LLM_SETTINGS: Dict[str, Any] = {
    "model_source": "local",
    "cloud_provider": "openai",
    "cloud_model": "gpt-4o-mini",
    "local_provider": "ollama",
    "local_model": None,
    # Chat completion defaults (journal/exploration harness). Analysis/test paths may omit or override.
    "openai_temperature": 0.7,
    "openai_max_tokens": 4096,
    "local_temperature": 0.7,
    "local_num_predict": 4096,
}


def default_llm_settings() -> Dict[str, Any]:
    return deepcopy(DEFAULT_LLM_SETTINGS)


def get_llm_settings_dict() -> Dict[str, Any]:
    row = get_setting(SETTINGS_KEY)
    base = default_llm_settings()
    if row and isinstance(row.get("value"), dict):
        base.update({k: v for k, v in row["value"].items() if k in base})
    return base


def save_llm_settings_dict(data: Dict[str, Any]) -> None:
    merged = default_llm_settings()
    merged.update({k: data[k] for k in merged if k in data})
    set_setting(SETTINGS_KEY, merged)


def effective_ollama_model(llm: Dict[str, Any]) -> str:
    m = llm.get("local_model")
    if isinstance(m, str) and m.strip():
        return m.strip()
    return settings.ollama_model


def _coerce_float(val: Any, default: float) -> float:
    try:
        if val is None:
            return default
        return float(val)
    except (TypeError, ValueError):
        return default


def _coerce_int(val: Any, default: int) -> int:
    try:
        if val is None:
            return default
        return int(val)
    except (TypeError, ValueError):
        return default


def openai_chat_inference(llm: Dict[str, Any]) -> tuple[float, int]:
    """Temperature and max output tokens for OpenAI chat (non-reasoning chat models)."""
    t = _coerce_float(llm.get("openai_temperature"), 0.7)
    mt = _coerce_int(llm.get("openai_max_tokens"), 4096)
    mt = max(256, min(mt, 32768))
    return t, mt


def local_chat_inference(llm: Dict[str, Any]) -> tuple[float, int]:
    """Temperature and num_predict for Ollama chat."""
    t = _coerce_float(llm.get("local_temperature"), 0.7)
    npred = _coerce_int(llm.get("local_num_predict"), 4096)
    npred = max(128, min(npred, 32768))
    return t, npred
