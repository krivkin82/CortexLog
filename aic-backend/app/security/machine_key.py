"""Local-only passphrase for encrypting app secrets (e.g. OpenAI API key) without user password."""

from __future__ import annotations

import secrets

from app.core.config import DATA_DIR

_MACHINE_FILE = DATA_DIR / ".cortexlog_machine"


def get_machine_passphrase() -> str:
    """Return a stable random passphrase stored on disk (first run creates it)."""
    _MACHINE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not _MACHINE_FILE.exists():
        token = secrets.token_urlsafe(32)
        _MACHINE_FILE.write_text(token, encoding="utf-8")
    return _MACHINE_FILE.read_text(encoding="utf-8").strip()
