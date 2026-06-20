import math
from datetime import datetime, timezone
from typing import Any, Dict, List

from app.llm.embedding import embed_text
from app.llm.policy import is_prompt_injection
from app.storage.embeddings import list_embeddings_with_chunks
from app.storage.provenance import list_entities_for_item
from app.storage.relations import list_relations_for_entity


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b:
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a)) or 1.0
    norm_b = math.sqrt(sum(b * b for b in vec_b)) or 1.0
    return dot / (norm_a * norm_b)


def recency_boost(iso_ts: str | None) -> float:
    if not iso_ts:
        return 0.0
    try:
        timestamp = datetime.fromisoformat(iso_ts)
    except ValueError:
        return 0.0
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    days = (datetime.now(timezone.utc) - timestamp).days
    return 1.0 / (1.0 + max(days, 0))


def retrieve(query: str, limit: int = 5) -> Dict[str, Any]:
    query_embedding = embed_text(query)
    records = list_embeddings_with_chunks()
    scored: List[Dict[str, Any]] = []
    for record in records:
        if is_prompt_injection(record["chunk_content"]):
            continue
        similarity = cosine_similarity(query_embedding, record["embedding"])
        score = similarity + 0.1 * recency_boost(record.get("item_created_at"))
        scored.append(
            {
                "item_id": record["item_id"],
                "chunk_id": record["chunk_id"],
                "content": record["chunk_content"],
                "score": score,
            }
        )

    scored.sort(key=lambda item: item["score"], reverse=True)
    top_items = scored[:limit]

    related_entities = set()
    relations: List[Dict[str, Any]] = []
    for item in top_items:
        entities = list_entities_for_item(item["item_id"])
        for entity_id in entities:
            related_entities.add(entity_id)
            relations.extend(list_relations_for_entity(entity_id))

    return {
        "matches": top_items,
        "related_entities": list(related_entities),
        "relations": relations,
    }
