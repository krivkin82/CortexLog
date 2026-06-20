"""Copy legacy data files into the canonical DATA_DIR (one-time per missing file)."""

from __future__ import annotations

import shutil
from pathlib import Path

from app.core.config import (
    DATA_DIR,
    DEFAULT_PROFILE_ID,
    get_active_profile_id,
    get_legacy_flat_data_dir,
)

_MIGRATE_FILES = (
    ".cortexlog_machine",
    "secrets.json",
    "aic.db",
    "auth.json",
    "api_token",
)


def _repo_dev_data_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "data"


def _legacy_migration_sources() -> list[Path]:
    """Directories to copy from when bootstrapping the private profile."""
    sources: list[Path] = []
    flat = get_legacy_flat_data_dir()
    if flat.resolve() != DATA_DIR.resolve() and flat.is_dir():
        sources.append(flat)
    repo = _repo_dev_data_dir()
    if repo.resolve() != DATA_DIR.resolve() and repo.is_dir():
        sources.append(repo)
    return sources


def migrate_legacy_data_files() -> None:
    """If canonical DATA_DIR is missing files, copy from legacy locations.

    Only the private profile receives migration from the old flat data folder.
    Demo and other profiles start clean.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if get_active_profile_id() != DEFAULT_PROFILE_ID:
        return
    else:
        legacy_dirs = _legacy_migration_sources()

    for name in _MIGRATE_FILES:
        dest = DATA_DIR / name
        if dest.exists():
            continue
        for legacy in legacy_dirs:
            src = legacy / name
            if src.is_file() and src.stat().st_size > 0:
                shutil.copy2(src, dest)
                break
