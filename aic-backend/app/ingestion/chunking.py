from typing import List


def chunk_text(text: str, max_chars: int = 1000, overlap: int = 100) -> List[str]:
    if max_chars <= 0:
        return [text]
    chunks: List[str] = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + max_chars, length)
        chunks.append(text[start:end])
        if end == length:
            break
        start = max(0, end - overlap)
    return [chunk.strip() for chunk in chunks if chunk.strip()]
