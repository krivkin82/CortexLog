import hashlib
from pathlib import Path


def hash_file(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def hash_text(text: str) -> str:
    sha = hashlib.sha256()
    sha.update(text.encode("utf-8", errors="ignore"))
    return sha.hexdigest()
