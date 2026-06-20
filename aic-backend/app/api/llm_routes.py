"""Generic LLM settings, provider metadata, status, and test."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from openai import APIConnectionError, APIError, AuthenticationError, RateLimitError
from pydantic import BaseModel

from app.llm.debug_settings import (
    get_debug_settings_dict,
    response_debug_log_path,
    set_response_contract_log_enabled,
)
from app.llm.llm_settings import (
    LEGACY_SECRET_OPENAI,
    SECRET_KEY_ANTHROPIC,
    SECRET_KEY_GEMINI,
    SECRET_KEY_OPENAI,
    get_llm_settings_dict,
    local_chat_inference,
    openai_chat_inference,
    save_llm_settings_dict,
)
from app.llm.providers.registry import list_provider_metadata
from app.llm.service import LLMUnavailableError, resolve_runtime_label
from app.security.machine_key import get_machine_passphrase
from app.security.secret_store import get_secret, store_secret

router = APIRouter()


def _secret_configured(key: str) -> bool:
    passphrase = get_machine_passphrase()
    v = get_secret(key, passphrase=passphrase)
    return bool(v and str(v).strip())


@router.get("/llm/providers")
def llm_providers() -> dict:
    return {"providers": list_provider_metadata()}


@router.get("/llm/settings")
def llm_settings_get() -> dict:
    settings = get_llm_settings_dict()
    passphrase = get_machine_passphrase()
    legacy_openai = bool(get_secret(LEGACY_SECRET_OPENAI, passphrase=passphrase))
    openai_cfg = _secret_configured(SECRET_KEY_OPENAI) or legacy_openai
    return {
        "settings": settings,
        "secrets_configured": {
            "openai": openai_cfg,
            "anthropic": _secret_configured(SECRET_KEY_ANTHROPIC),
            "gemini": _secret_configured(SECRET_KEY_GEMINI),
        },
    }


class LLMSettingsUpdateRequest(BaseModel):
    model_source: Optional[str] = None
    cloud_provider: Optional[str] = None
    cloud_model: Optional[str] = None
    local_model: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None


@router.post("/llm/settings")
def llm_settings_post(request: LLMSettingsUpdateRequest) -> dict:
    current = get_llm_settings_dict()
    if request.model_source is not None:
        if request.model_source not in {"cloud", "local"}:
            raise HTTPException(status_code=400, detail="model_source must be cloud or local")
        current["model_source"] = request.model_source
    if request.cloud_provider is not None:
        current["cloud_provider"] = request.cloud_provider
    if request.cloud_model is not None:
        current["cloud_model"] = request.cloud_model.strip()
    if request.local_model is not None:
        lm = request.local_model.strip()
        current["local_model"] = lm or None
    passphrase = get_machine_passphrase()
    if request.openai_api_key is not None and request.openai_api_key.strip():
        store_secret(SECRET_KEY_OPENAI, request.openai_api_key.strip(), passphrase=passphrase)
    if request.anthropic_api_key is not None and request.anthropic_api_key.strip():
        store_secret(SECRET_KEY_ANTHROPIC, request.anthropic_api_key.strip(), passphrase=passphrase)
    if request.gemini_api_key is not None and request.gemini_api_key.strip():
        store_secret(SECRET_KEY_GEMINI, request.gemini_api_key.strip(), passphrase=passphrase)
    save_llm_settings_dict(current)
    return {"ok": True, "settings": get_llm_settings_dict()}


@router.get("/llm/status")
def llm_status() -> dict:
    """Active routing label plus reachability hints for UI."""
    llm = get_llm_settings_dict()
    ollama_ok = False
    try:
        from app.llm.ollama_client import chat as ochat
        from app.llm.llm_settings import effective_ollama_model

        ochat(
            [{"role": "user", "content": "Reply with exactly: ok"}],
            model=effective_ollama_model(llm),
        )
        ollama_ok = True
    except Exception:
        ollama_ok = False

    passphrase = get_machine_passphrase()
    openai_key = get_secret(SECRET_KEY_OPENAI, passphrase=passphrase) or get_secret(
        LEGACY_SECRET_OPENAI, passphrase=passphrase
    )
    return {
        "active_label": resolve_runtime_label(),
        "model_source": llm.get("model_source"),
        "cloud_provider": llm.get("cloud_provider"),
        "cloud_model": llm.get("cloud_model"),
        "ollama_reachable": ollama_ok,
        "openai_key_configured": bool(openai_key),
    }


class LLMTestRequest(BaseModel):
    prompt: str = "Reply with one short sentence confirming the connection."
    api_key: Optional[str] = None
    model_source: Optional[str] = None
    cloud_provider: Optional[str] = None
    cloud_model: Optional[str] = None
    local_model: Optional[str] = None


@router.post("/llm/test")
def llm_test(request: LLMTestRequest | None = None) -> dict:
    """Run a real chat completion using current or ephemeral settings."""
    req = request or LLMTestRequest()
    llm = get_llm_settings_dict()
    if req.model_source is not None:
        llm = {**llm, "model_source": req.model_source}
    if req.cloud_provider is not None:
        llm = {**llm, "cloud_provider": req.cloud_provider}
    if req.cloud_model is not None:
        llm = {**llm, "cloud_model": req.cloud_model}
    if req.local_model is not None:
        llm = {**llm, "local_model": req.local_model}

    messages = [{"role": "user", "content": req.prompt}]

    try:
        if llm.get("model_source") == "local":
            from app.llm.llm_settings import effective_ollama_model
            from app.llm.providers.ollama_provider import OllamaProvider

            lt, npred, nctx = local_chat_inference(llm)
            text = OllamaProvider().chat(
                messages,
                model=effective_ollama_model(llm),
                temperature=lt,
                num_predict=npred,
                num_ctx=nctx,
            )
            return {
                "ok": True,
                "provider": "ollama",
                "model": effective_ollama_model(llm),
                "response_text": text,
            }

        provider = (llm.get("cloud_provider") or "openai").lower()
        model = llm.get("cloud_model") or "gpt-4o-mini"
        if provider != "openai":
            raise HTTPException(
                status_code=501,
                detail=f"Provider {provider} is not implemented yet.",
            )

        passphrase = get_machine_passphrase()
        key = (req.api_key or "").strip() or get_secret(SECRET_KEY_OPENAI, passphrase=passphrase)
        if not key:
            key = get_secret(LEGACY_SECRET_OPENAI, passphrase=passphrase)
        if not key:
            raise HTTPException(status_code=400, detail="OpenAI API key required for test")

        from app.llm.providers.openai_provider import OpenAIProvider

        ot, omax = openai_chat_inference(llm)
        text = OpenAIProvider(key).chat(
            messages,
            model=str(model),
            temperature=ot,
            max_tokens=omax,
        )
        return {"ok": True, "provider": "openai", "model": model, "response_text": text}
    except HTTPException:
        raise
    except LLMUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except AuthenticationError as e:
        raise HTTPException(
            status_code=401,
            detail="OpenAI rejected this API key. Create a secret key under API keys and ensure the project is active.",
        ) from e
    except RateLimitError as e:
        err_s = str(e).lower()
        if "insufficient_quota" in err_s:
            detail = (
                "OpenAI reports insufficient quota or billing is not enabled for this organization. "
                "Add billing or credits in your OpenAI account, then retry (the key itself can still be valid)."
            )
        else:
            detail = "OpenAI rate limit reached. Wait a minute and try again."
        raise HTTPException(status_code=429, detail=detail) from e
    except APIConnectionError as e:
        raise HTTPException(
            status_code=503,
            detail="Could not reach OpenAI. Check your network, firewall, or proxy settings.",
        ) from e
    except APIError as e:
        fallback = getattr(e, "message", None) or str(e)
        raise HTTPException(status_code=503, detail=f"OpenAI API error: {fallback}") from e
    except Exception as e:
        raise HTTPException(status_code=503, detail="LLM test failed.") from e


class DebugSettingsUpdateRequest(BaseModel):
    response_contract_log_enabled: bool


@router.get("/debug/settings")
def debug_settings_get() -> dict:
    """Response debug log toggle (legacy key retained for compatibility)."""
    settings = get_debug_settings_dict()
    return {
        "settings": settings,
        "log_file": response_debug_log_path(),
    }


@router.post("/debug/settings")
def debug_settings_post(request: DebugSettingsUpdateRequest) -> dict:
    set_response_contract_log_enabled(request.response_contract_log_enabled)
    return {
        "ok": True,
        "settings": get_debug_settings_dict(),
        "log_file": response_debug_log_path(),
    }

