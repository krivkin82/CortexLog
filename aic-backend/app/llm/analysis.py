"""
LLM post-ingest analysis: categorize items, extract entities and insights.
Replaces regex-based extraction with Ollama-driven analysis.
"""

import json
import logging
import re
from typing import Any

from app.core.config import settings
from app.llm.ollama_client import chat
from app.storage.categories import link_item_category, ensure_category
from app.storage.entities import create_entity, find_entity, list_entities_by_label
from app.storage.conflicts import create_conflict
from app.storage.proposed_insights import create_proposed_insight
from app.storage.provenance import create_provenance
from app.storage.llm_analysis import create_run, update_run_status
from app.ingestion.rule_filters import filter_reason
from app.storage.ml_stats import score_text
from app.storage.feedback import add_feedback

logger = logging.getLogger(__name__)

CATEGORY_OPTIONS = [
    "Legal",
    "Insurance",
    "Taxes",
    "Resumes",
    "Personal",
    "Professional",
    "School",
    "Courses",
    "Books",
    "Thoughts",
    "Games",
    "Investing",
    "Dreams",
    "Metaphysics",
    "Journal",
    "Boilerplate",
    "Other",
]

ANALYSIS_SYSTEM = """You are an analyst that extracts structured information from personal documents.
Respond ONLY with valid JSON. No markdown, no explanation. If a section has no results, use empty arrays/omit.
Categories must be from the provided list. Entities: people, projects, themes - exclude single letters, numbers, noise.
Insights: meaningful observations that help understand the person - exclude legal boilerplate, acknowledgments, form text."""

ANALYSIS_USER_TEMPLATE = """Analyze this document and return JSON with this exact structure:

{{
  "categories": [{{"name": "CategoryName", "confidence": 0.9}}],
  "entities": [{{"type": "person"|"project"|"theme", "label": "Name"}}],
  "insights": [{{"type": "short_label", "content": "excerpt from document"}}]
}}

Categories must be from: {categories}.
If the document is mostly legal boilerplate/acknowledgments/forms, add Boilerplate to categories and leave insights empty.

Document content (first 8000 chars):
---
{content}
---"""


def _extract_json(text: str) -> dict | None:
    """Extract JSON from LLM response, handling markdown code blocks."""
    text = text.strip()
    # Try raw parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try to extract from ```json ... ```
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    # Try to find {...}
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


def analyze_item(item_id: str, chunks: list[str], item_path: str | None = None) -> bool:
    """
    Run LLM analysis on an item's chunks. Persists categories, entities, and insights.
    Returns True if successful.
    """
    content = "\n\n".join(chunks)[:8000]
    if not content.strip():
        logger.warning("analyze_item: no content for item %s", item_id)
        return False

    run_id = create_run(item_id, settings.ollama_model, "started")

    try:
        user_prompt = ANALYSIS_USER_TEMPLATE.format(
            categories=", ".join(CATEGORY_OPTIONS),
            content=content,
        )
        messages = [
            {"role": "system", "content": ANALYSIS_SYSTEM},
            {"role": "user", "content": user_prompt},
        ]
        raw = chat(messages, format="json")
        data = _extract_json(raw)

        if not data:
            logger.warning("analyze_item: failed to parse JSON for item %s: %s", item_id, raw[:200])
            update_run_status(run_id, "failed")
            return False

        categories = data.get("categories") or []
        entities_data = data.get("entities") or []
        insights_data = data.get("insights") or []

        # Check if Boilerplate - skip insights
        has_boilerplate = any(
            (c.get("name") or "").lower() == "boilerplate" for c in categories
        )
        if has_boilerplate:
            insights_data = []

        # Persist categories
        primary = None
        for c in categories:
            name = (c.get("name") or "").strip()
            if not name:
                continue
            conf = float(c.get("confidence", 1.0))
            ensure_category(name)
            link_item_category(item_id, name, conf)
            if not primary and name.lower() != "boilerplate":
                primary = name

        if primary:
            _update_item_primary_category(item_id, primary)

        # Persist entities (source=llm)
        for e in entities_data:
            etype = (e.get("type") or "theme").lower()
            if etype not in ("person", "project", "theme"):
                etype = "theme"
            label = (e.get("label") or "").strip()
            if not label or len(label) < 3 or label.isnumeric():
                continue
            existing_id = find_entity(etype, label)
            entity_id = existing_id or create_entity(etype, label, source="llm")
            if not existing_id:
                for other in list_entities_by_label(label):
                    if other["id"] != entity_id and other.get("type") != etype:
                        create_conflict(
                            entity_id=entity_id,
                            conflicting_entity_id=other["id"],
                            reason="label_conflict",
                        )
            create_provenance(
                target_type="entity",
                target_id=entity_id,
                source_item_id=item_id,
                classification="interpretation",
                confidence="medium",
                extracted_by="llm",
            )

        # Persist insights (only if not boilerplate)
        for ins in insights_data:
            itype = (ins.get("type") or "observation").strip() or "observation"
            cont = (ins.get("content") or "").strip()
            if not cont:
                continue
            reason = filter_reason(cont, item_path)
            status = "irrelevant" if reason else "pending"
            if not reason:
                score = score_text(cont, bias=0.0)
                if score < 0.0:
                    status = "irrelevant"
                    reason = "ml_score"
            insight_id = create_proposed_insight(
                insight_type=itype,
                content=cont,
                supporting_sources=[{"item_id": item_id, "excerpt": cont}],
                status=status,
            )
            if status == "irrelevant":
                add_feedback(
                    insight_id=insight_id,
                    source_item_id=item_id,
                    label="irrelevant",
                    reason=reason or "rule",
                )

        update_run_status(run_id, "completed")
        return True

    except Exception as e:
        logger.exception("analyze_item failed for %s: %s", item_id, e)
        update_run_status(run_id, "failed")
        return False


def _update_item_primary_category(item_id: str, category: str) -> None:
    """Set primary_category on items table if column exists."""
    try:
        from app.storage.database import get_connection

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE items SET primary_category = ? WHERE id = ?",
            (category, item_id),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.debug("Could not set primary_category: %s", e)
