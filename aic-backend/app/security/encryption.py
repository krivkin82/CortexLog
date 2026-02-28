import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet


def _derive_key(passphrase: str, salt: str) -> bytes:
    key = hashlib.pbkdf2_hmac(
        "sha256", passphrase.encode("utf-8"), salt.encode("utf-8"), 100_000
    )
    return base64.urlsafe_b64encode(key)


def encrypt_text(plain_text: str, passphrase: str, salt: str) -> str:
    fernet = Fernet(_derive_key(passphrase, salt))
    token = fernet.encrypt(plain_text.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_text(cipher_text: str, passphrase: str, salt: str) -> Optional[str]:
    fernet = Fernet(_derive_key(passphrase, salt))
    try:
        plain = fernet.decrypt(cipher_text.encode("utf-8"))
    except Exception:
        return None
    return plain.decode("utf-8")
