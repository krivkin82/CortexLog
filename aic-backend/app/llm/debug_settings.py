"""Persisted debug logging preferences (response contract orchestrator)."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any, Dict

from app.core.config import DATA_DIR
from app.storage.settings import get_setting, set_setting

SETTINGS_KEY = "cortexlog_debug"

DEFAULT_DEBUG_SETTINGS: Dict[str, Any] = {
    "response_contract_log_enabled": True,
}


def get_debug_settings_dict() -> Dict[str, Any]:
    row = get_setting(SETTINGS_KEY)
    base = deepcopy(DEFAULT_DEBUG_SETTINGS)
    if row and isinstance(row.get("value"), dict):
        base.update({k: v for k, v in row["value"].items() if k in base})
    return base


def is_response_contract_log_enabled() -> bool:
    """True when persisted setting is on (default True) or AIC_LOG_RESPONSE_CONTRACT env forces on."""
    import os

    env = (os.environ.get("AIC_LOG_RESPONSE_CONTRACT") or "").strip().lower()
    if env in ("1", "true", "yes"):
        return True
    if env in ("0", "false", "no"):
        return False
    return bool(get_debug_settings_dict().get("response_contract_log_enabled", True))


def save_debug_settings_dict(data: Dict[str, Any]) -> None:
    merged = deepcopy(DEFAULT_DEBUG_SETTINGS)
    if "response_contract_log_enabled" in data:
        merged["response_contract_log_enabled"] = bool(data["response_contract_log_enabled"])
    set_setting(SETTINGS_KEY, merged)


def set_response_contract_log_enabled(enabled: bool) -> None:
    save_debug_settings_dict({"response_contract_log_enabled": enabled})


def ensure_debug_settings_defaults() -> None:
    """Persist default-on debug logging on first run."""
    if get_setting(SETTINGS_KEY) is None:
        save_debug_settings_dict(DEFAULT_DEBUG_SETTINGS)


def response_debug_log_path() -> str:
    """Canonical debug log path for response-generation diagnostics."""
    return str(Path(DATA_DIR) / "response_debug.log")
