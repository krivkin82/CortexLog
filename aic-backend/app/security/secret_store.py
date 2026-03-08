import json
from pathlib import Path
from typing import Optional

from app.security.encryption import (
    decrypt_text,
    decrypt_with_derived_key,
    encrypt_text,
    encrypt_with_derived_key,
)

SECRETS_PATH = Path(__file__).resolve().parents[2] / "data" / "secrets.json"


def _load_secrets() -> dict:
    if not SECRETS_PATH.exists():
        return {}
    return json.loads(SECRETS_PATH.read_text(encoding="utf-8"))


def _save_secrets(data: dict) -> None:
    SECRETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SECRETS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def store_secret(key: str, value: str, passphrase: str) -> None:
    secrets = _load_secrets()
    encrypted = encrypt_text(value, passphrase=passphrase, salt=key)
    secrets[key] = encrypted
    _save_secrets(secrets)


def get_secret(key: str, passphrase: str) -> Optional[str]:
    secrets = _load_secrets()
    encrypted = secrets.get(key)
    if not encrypted:
        return None
    return decrypt_text(encrypted, passphrase=passphrase, salt=key)


def store_secret_with_key(key: str, value: str, derived_key_b64: str) -> None:
    """Store secret using client-provided Fernet key."""
    secrets_data = _load_secrets()
    encrypted = encrypt_with_derived_key(value, derived_key_b64)
    secrets_data[key] = encrypted
    _save_secrets(secrets_data)


def get_secret_with_key(key: str, derived_key_b64: str) -> Optional[str]:
    """Retrieve and decrypt secret using client-provided Fernet key."""
    secrets_data = _load_secrets()
    encrypted = secrets_data.get(key)
    if not encrypted:
        return None
    return decrypt_with_derived_key(encrypted, derived_key_b64)
