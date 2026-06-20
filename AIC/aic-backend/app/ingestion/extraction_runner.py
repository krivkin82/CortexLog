from typing import List

from app.llm.analysis import analyze_item
from app.llm.service import LLMUnavailableError
from app.storage.items import get_item


def extract_and_store(item_id: str, chunks: List[str]) -> None:
    """
    Run LLM post-ingest analysis on chunks.
    Raises LLMUnavailableError if the configured LLM is unreachable or analysis fails.
    """
    item = get_item(item_id)
    item_path = item.get("path_or_id") if item else None
    try:
        ok = analyze_item(item_id, chunks, item_path)
    except LLMUnavailableError:
        raise
    if not ok:
        raise LLMUnavailableError(
            "LLM analysis failed. Check AI settings and ensure your provider is reachable."
        )
