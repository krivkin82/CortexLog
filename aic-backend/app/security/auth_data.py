"""Auth data storage: salt for key derivation and password verification hash."""

import json
import secrets
from pathlib import Path

from app.security.api_auth import DATA_DIR

AUTH_JSON_PATH = DATA_DIR / "auth.json"
SALT_BYTES = 16


def _load_auth() -> dict:
    if not AUTH_JSON_PATH.exists():
        return {}
    return json.loads(AUTH_JSON_PATH.read_text(encoding="utf-8"))


def _save_auth(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    AUTH_JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_salt() -> str:
    """Return the salt for key derivation; create if missing."""
    data = _load_auth()
    if "salt" in data:
        return data["salt"]
    salt = secrets.token_urlsafe(SALT_BYTES)
    data["salt"] = salt
    _save_auth(data)
    return salt


def set_password_hash(password_hash: str) -> None:
    """Store the password verification hash."""
    data = _load_auth()
    data["password_verification_hash"] = password_hash
    _save_auth(data)


def verify_password_hash(password_hash: str) -> bool:
    """Check if the given hash matches the stored one."""
    data = _load_auth()
    stored = data.get("password_verification_hash")
    if not stored:
        return False
    return secrets.compare_digest(password_hash, stored)
