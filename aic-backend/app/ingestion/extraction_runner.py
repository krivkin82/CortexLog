from typing import List

from app.llm.analysis import analyze_item
from app.storage.items import get_item


class LLMUnavailableError(Exception):
    """Raised when LLM (Ollama) is unreachable or analysis fails."""


def extract_and_store(item_id: str, chunks: List[str]) -> None:
    """
    Run LLM post-ingest analysis on chunks.
    Raises LLMUnavailableError if Ollama is offline or analysis fails.
    """
    item = get_item(item_id)
    item_path = item.get("path_or_id") if item else None
    if not analyze_item(item_id, chunks, item_path):
        raise LLMUnavailableError(
            "LLM analysis failed. Ensure Ollama is running (ollama serve) and the model is available."
        )
