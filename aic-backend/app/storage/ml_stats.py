import math
import re
from typing import Dict, Iterable, List, Tuple

from app.storage.database import get_connection


TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9']+")


def tokenize(text: str) -> List[str]:
    return [token.lower() for token in TOKEN_PATTERN.findall(text)]


def get_word_stats(words: Iterable[str]) -> Dict[str, Tuple[int, int]]:
    conn = get_connection()
    cursor = conn.cursor()
    stats: Dict[str, Tuple[int, int]] = {}
    for word in set(words):
        cursor.execute(
            "SELECT pos_count, neg_count FROM word_stats WHERE word = ?",
            (word,),
        )
        row = cursor.fetchone()
        stats[word] = (row["pos_count"], row["neg_count"]) if row else (0, 0)
    conn.close()
    return stats


def update_word_stats(words: Iterable[str], label: str) -> None:
    pos_delta = 1 if label == "positive" else 0
    neg_delta = 1 if label == "negative" else 0
    conn = get_connection()
    cursor = conn.cursor()
    for word in set(words):
        cursor.execute(
            """
            INSERT INTO word_stats (word, pos_count, neg_count)
            VALUES (?, ?, ?)
            ON CONFLICT(word) DO UPDATE SET
              pos_count = pos_count + ?,
              neg_count = neg_count + ?
            """,
            (word, pos_delta, neg_delta, pos_delta, neg_delta),
        )
    conn.commit()
    conn.close()


def score_text(text: str, bias: float = 0.0) -> float:
    words = tokenize(text)
    stats = get_word_stats(words)
    score = bias
    for word in words:
        pos, neg = stats.get(word, (0, 0))
        score += _log_ratio(pos, neg)
    return score


def _log_ratio(pos: int, neg: int) -> float:
    return math.log((pos + 1) / (neg + 1))
