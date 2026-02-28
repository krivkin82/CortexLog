import sqlite3
from pathlib import Path
from typing import Iterable

from app.storage.schema import MIGRATION_STATEMENTS, SCHEMA_STATEMENTS

DEFAULT_DB_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "aic.db"
)


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or DEFAULT_DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def apply_schema(conn: sqlite3.Connection, statements: Iterable[str]) -> None:
    cursor = conn.cursor()
    for statement in statements:
        cursor.execute(statement)
    conn.commit()


def init_db(db_path: Path | None = None) -> None:
    conn = get_connection(db_path)
    apply_schema(conn, SCHEMA_STATEMENTS)
    cursor = conn.cursor()
    for statement in MIGRATION_STATEMENTS:
        try:
            cursor.execute(statement)
        except sqlite3.OperationalError as e:
            if "duplicate column name" not in str(e).lower():
                raise
    conn.commit()
    conn.close()
