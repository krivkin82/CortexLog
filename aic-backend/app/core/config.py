import os
import re
import sys
from pathlib import Path

from pydantic_settings import BaseSettings

DEFAULT_PROFILE_ID = "private"

_PROFILE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def sanitize_profile_id(raw: str | None) -> str:
    """Conservative slug for profile directory names."""
    if not raw:
        return DEFAULT_PROFILE_ID
    s = str(raw).strip().lower().replace(" ", "_")
    s = re.sub(r"[^a-z0-9_-]", "", s)
    s = re.sub(r"_+", "_", s).strip("_")
    if not s or not _PROFILE_ID_RE.match(s):
        return DEFAULT_PROFILE_ID
    return s


def _stable_windows_roaming_base() -> Path:
    """Real Roaming profile path — never PyInstaller/portable Temp APPDATA."""
    raw = (os.environ.get("APPDATA") or "").strip()
    fallback_roam = Path.home() / "AppData" / "Roaming"
    if raw:
        resolved = Path(raw).resolve().as_posix().lower().replace("\\", "/")
        under_local_temp = "/appdata/local/temp/" in resolved or resolved.endswith("/appdata/local/temp")
        roaming = fallback_roam if under_local_temp else Path(raw).resolve()
    else:
        roaming = fallback_roam
    return roaming


def get_cortexlog_app_root() -> Path:
    """%APPDATA%/CortexLog (or platform equivalent)."""
    if sys.platform == "win32":
        return _stable_windows_roaming_base() / "CortexLog"
    if getattr(sys, "frozen", False):
        xdg = (os.environ.get("XDG_DATA_HOME") or "").strip()
        if xdg:
            return Path(xdg) / "CortexLog"
        return Path.home() / ".local" / "share" / "CortexLog"
    return Path(__file__).resolve().parents[2].parent / "CortexLog"


def get_legacy_flat_data_dir() -> Path:
    """Pre-profile canonical data folder (migration source for private profile)."""
    if sys.platform == "win32":
        return _stable_windows_roaming_base() / "CortexLog" / "data"
    if getattr(sys, "frozen", False):
        xdg = (os.environ.get("XDG_DATA_HOME") or "").strip()
        if xdg:
            return Path(xdg) / "CortexLog" / "data"
        return Path.home() / ".local" / "share" / "CortexLog" / "data"
    return Path(__file__).resolve().parents[2] / "data"


def get_active_profile_id() -> str:
    return sanitize_profile_id(os.environ.get("AIC_PROFILE_ID"))


def profile_data_dir(profile_id: str | None = None) -> Path:
    pid = sanitize_profile_id(profile_id or get_active_profile_id())
    return get_cortexlog_app_root() / "profiles" / pid / "data"


def _resolve_data_dir() -> Path:
    """Profile-scoped data directory when AIC_PROFILE_ID is set (Electron workflow).

    Without AIC_PROFILE_ID, use legacy flat data dir for manual dev / backward compatibility.
  """
    profile_env = (os.environ.get("AIC_PROFILE_ID") or "").strip()
    if profile_env:
        return profile_data_dir(profile_env)
    if sys.platform == "win32":
        return get_legacy_flat_data_dir()
    if getattr(sys, "frozen", False):
        return get_legacy_flat_data_dir()
    return Path(__file__).resolve().parents[2] / "data"


DATA_DIR = _resolve_data_dir()
ACTIVE_PROFILE_ID = get_active_profile_id() if (os.environ.get("AIC_PROFILE_ID") or "").strip() else None


class Settings(BaseSettings):
    app_name: str = "AIC Backend"
    api_prefix: str = ""
    host: str = "127.0.0.1"
    port: int = 8000
    log_level: str = "info"
    ollama_model: str = "gpt-oss:20b"  # Override with AIC_OLLAMA_MODEL env var
    ollama_base_url: str = "http://localhost:11434"

    model_config = {"env_prefix": "AIC_"}


settings = Settings()

# NOTE (debugging): If you're investigating a bug, start with `.cursor/debug-reference.md`
# and check `.cursor/debug-journal.md` for prior incidents/fixes.
