import shutil
from pathlib import Path

from app.storage.database import DEFAULT_DB_PATH


def wipe_all_data() -> None:
    db_path = Path(DEFAULT_DB_PATH)
    data_dir = db_path.parent
    if db_path.exists():
        db_path.unlink()
    if data_dir.exists():
        for child in data_dir.iterdir():
            if child.is_file():
                child.unlink()
            elif child.is_dir():
                shutil.rmtree(child)
