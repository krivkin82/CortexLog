import math
import re
from typing import List


TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_]+")


def embed_text(text: str, dims: int = 256) -> List[float]:
    vector = [0.0] * dims
    tokens = TOKEN_PATTERN.findall(text.lower())
    for token in tokens:
        idx = hash(token) % dims
        vector[idx] += 1.0
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]
