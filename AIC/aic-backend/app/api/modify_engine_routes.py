"""Modify Engine / Cursor CLI readiness and settings."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.llm.modify_reasoning import modify_reasoning_chat
from app.llm.service import LLMUnavailableError
from app.storage.settings import get_setting, set_setting

router = APIRouter()

ENGINE_SETTINGS_KEY = "cortexlog_modify_engine"


def _default_engine_settings() -> Dict[str, Any]:
    return {
        "engine": "cursor_cli",
        "cli_path": "agent",
        "source_folder": "",
        "model": "auto",
        "mode": "agent",
        "output_format": "json",
        "advanced_args": [],
    }


def get_engine_settings() -> Dict[str, Any]:
    row = get_setting(ENGINE_SETTINGS_KEY)
    base = _default_engine_settings()
    if row and isinstance(row.get("value"), dict):
        base.update({k: v for k, v in row["value"].items() if k in base})
    return base


def _which_cli(cli_path: str) -> Tuple[bool, str]:
    p = (cli_path or "agent").strip() or "agent"
    resolved = shutil.which(p)
    if resolved:
        return True, resolved
    if Path(p).exists():
        return True, str(Path(p).resolve())
    return False, p


def _run(cmd: List[str], *, cwd: Optional[str] = None, timeout: int = 25) -> Tuple[int, str, str]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        return proc.returncode, proc.stdout or "", proc.stderr or ""
    except FileNotFoundError:
        return 127, "", "executable not found"
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"


def _git_ok(folder: str) -> Tuple[bool, bool]:
    """Returns (git_installed, is_git_repo)."""
    code, _, _ = _run(["git", "--version"], timeout=5)
    if code != 0:
        return False, False
    if not folder or not Path(folder).is_dir():
        return True, False
    code2, out, _ = _run(["git", "-C", folder, "rev-parse", "--is-inside-work-tree"], timeout=10)
    ok = code2 == 0 and "true" in (out or "").lower()
    return True, ok


class ModifyEngineSettingsRequest(BaseModel):
    cli_path: Optional[str] = None
    source_folder: Optional[str] = None
    model: Optional[str] = None
    mode: Optional[str] = None
    output_format: Optional[str] = None
    advanced_args: Optional[List[str]] = None


@router.get("/modify/engine/settings")
def modify_engine_settings_get() -> dict:
    return {"settings": get_engine_settings()}


@router.get("/modify/engine/status")
def modify_engine_status() -> dict:
    cfg = get_engine_settings()
    cli_path = str(cfg.get("cli_path") or "agent")
    detected, resolved = _which_cli(cli_path)
    folder = str(cfg.get("source_folder") or "").strip()
    folder_exists = bool(folder and Path(folder).is_dir())
    git_installed, is_git_repo = _git_ok(folder if folder_exists else "")

    auth_status = "unknown"
    auth_detail = ""
    if detected:
        code, out, err = _run([resolved, "status"], cwd=folder if folder_exists else None)
        combined = (out + "\n" + err).lower()
        if code == 0:
            if "not logged" in combined or "login" in combined and "not" in combined:
                auth_status = "not_signed_in"
            else:
                auth_status = "signed_in"
        else:
            auth_status = "error"
            auth_detail = (err or out or "status failed")[:500]

    ready = bool(
        detected
        and folder_exists
        and git_installed
        and is_git_repo
        and auth_status == "signed_in"
    )
    message = "Modify Engine is ready." if ready else "Modify Engine needs setup."
    return {
        "cli_detected": detected,
        "cli_path": resolved if detected else cli_path,
        "auth_status": auth_status,
        "auth_detail": auth_detail,
        "source_folder": folder,
        "source_folder_exists": folder_exists,
        "git_available": git_installed,
        "is_git_repo": is_git_repo,
        "ready": ready,
        "message": message,
    }


@router.post("/modify/engine/settings")
def modify_engine_settings_post(request: ModifyEngineSettingsRequest) -> dict:
    cfg = get_engine_settings()
    if request.cli_path is not None:
        cfg["cli_path"] = request.cli_path.strip() or "agent"
    if request.source_folder is not None:
        cfg["source_folder"] = request.source_folder.strip()
    if request.model is not None:
        cfg["model"] = request.model.strip() or "auto"
    if request.mode is not None:
        cfg["mode"] = request.mode.strip() or "agent"
    if request.output_format is not None:
        cfg["output_format"] = request.output_format.strip() or "json"
    if request.advanced_args is not None:
        cfg["advanced_args"] = list(request.advanced_args)
    set_setting(ENGINE_SETTINGS_KEY, cfg)
    return {"ok": True, "settings": get_engine_settings()}


class ModifyReasoningRequest(BaseModel):
    prompt: str = "Say hello in one short sentence."


@router.post("/modify/reasoning/sample")
def modify_reasoning_sample(request: ModifyReasoningRequest | None = None) -> dict:
    """Contract check: Modify reasoning uses the same LLM service as Journal/Explore."""
    req = request or ModifyReasoningRequest()
    try:
        text = modify_reasoning_chat([{"role": "user", "content": req.prompt}])
        return {"ok": True, "text": text}
    except LLMUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.post("/modify/engine/test")
def modify_engine_test() -> dict:
    """Read-only smoke test: CLI exists, version prints, optional status."""
    cfg = get_engine_settings()
    cli_path = str(cfg.get("cli_path") or "agent")
    detected, resolved = _which_cli(cli_path)
    if not detected:
        raise HTTPException(status_code=400, detail="Cursor CLI not found. Install Cursor CLI or set path.")
    code, out, err = _run([resolved, "--version"], timeout=15)
    if code != 0:
        raise HTTPException(status_code=400, detail=(err or out or "CLI version check failed")[:500])
    folder = str(cfg.get("source_folder") or "").strip()
    folder_exists = bool(folder and Path(folder).is_dir())
    git_installed, is_git_repo = _git_ok(folder if folder_exists else "")
    st = modify_engine_status()
    return {
        "ok": True,
        "cli_version_output": (out or "").strip()[:2000],
        "source_folder_exists": folder_exists,
        "git_installed": git_installed,
        "is_git_repo": is_git_repo,
        "engine_status": st,
    }
