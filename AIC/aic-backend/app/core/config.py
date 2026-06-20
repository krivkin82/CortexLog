import sys
from pathlib import Path

from pydantic_settings import BaseSettings


def _stable_windows_data_dir() -> Path:
    """Real Roaming profile path — never PyInstaller/portable Temp APPDATA."""
    import os

    raw = (os.environ.get("APPDATA") or "").strip()
    fallback_roam = Path.home() / "AppData" / "Roaming"
    if raw:
        resolved = Path(raw).resolve().as_posix().lower().replace("\\", "/")
        under_local_temp = "/appdata/local/temp/" in resolved or resolved.endswith("/appdata/local/temp")
        roaming = fallback_roam if under_local_temp else Path(raw).resolve()
    else:
        roaming = fallback_roam
    return roaming / "CortexLog" / "data"


def _resolve_data_dir() -> Path:
    """Persistent data directory shared by dev, packaged, and frozen backend.

    Must match Electron `getApiTokenPath`: `%APPDATA%/CortexLog/data` on Windows.
    Dev and packaged both use the same folder so settings survive mode switches.
    """
    if sys.platform == "win32":
        return _stable_windows_data_dir()
    if getattr(sys, "frozen", False):
        import os

        xdg = (os.environ.get("XDG_DATA_HOME") or "").strip()
        if xdg:
            return Path(xdg) / "CortexLog" / "data"
        return Path.home() / ".local" / "share" / "CortexLog" / "data"
    return Path(__file__).resolve().parents[2] / "data"


DATA_DIR = _resolve_data_dir()


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
