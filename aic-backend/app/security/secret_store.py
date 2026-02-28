import json
from pathlib import Path
from typing import Optional

from app.security.encryption import decrypt_text, encrypt_text

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
