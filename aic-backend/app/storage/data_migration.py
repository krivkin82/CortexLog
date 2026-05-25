"""Copy legacy data files into the canonical DATA_DIR (one-time per missing file)."""

from __future__ import annotations

import shutil
from pathlib import Path

from app.core.config import DATA_DIR

_MIGRATE_FILES = (
    ".cortexlog_machine",
    "secrets.json",
    "aic.db",
    "auth.json",
    "api_token",
)


def _repo_dev_data_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "data"


def migrate_legacy_data_files() -> None:
    """If canonical DATA_DIR is missing files, copy from repo dev data folder."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    legacy_dirs = [_repo_dev_data_dir()]

    for name in _MIGRATE_FILES:
        dest = DATA_DIR / name
        if dest.exists():
            continue
        for legacy in legacy_dirs:
            src = legacy / name
            if src.is_file() and src.stat().st_size > 0:
                shutil.copy2(src, dest)
                break
