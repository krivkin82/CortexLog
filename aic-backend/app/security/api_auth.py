"""Local API token generation and validation for backend authentication."""

import os
import secrets
from typing import Annotated

from fastapi import Header, HTTPException, Request

from app.core.config import DATA_DIR

API_TOKEN_PATH = DATA_DIR / "api_token"

API_KEY_HEADER = "X-API-Key"
AUTH_HEADER = "Authorization"


def _ensure_token() -> str:
    """Ensure API token file exists; create and return token if not."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if API_TOKEN_PATH.exists():
        return API_TOKEN_PATH.read_text(encoding="utf-8").strip()
    token = secrets.token_urlsafe(32)
    API_TOKEN_PATH.write_text(token, encoding="utf-8")
    try:
        os.chmod(API_TOKEN_PATH, 0o600)
    except OSError:
        pass
    return token


def get_api_token() -> str:
    """Return the current API token (creates if missing)."""
    return _ensure_token()


def _extract_token(request: Request) -> str | None:
    """Extract API token from X-API-Key header or Authorization: Bearer."""
    api_key = request.headers.get(API_KEY_HEADER)
    if api_key:
        return api_key.strip()
    auth = request.headers.get(AUTH_HEADER)
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def require_api_key(
    request: Request,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Dependency that validates API token; raises 401 if missing or invalid."""
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing API key")
    expected = get_api_token()
    if not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Invalid API key")
