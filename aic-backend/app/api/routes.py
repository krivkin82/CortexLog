from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.ingestion.local_files import ingest_local_paths, ingest_local_paths_streaming
from app.ingestion.gmail import ingest_gmail_messages
from app.ingestion.facebook_export import ingest_facebook_export
from app.ingestion.youtube_export import ingest_youtube_export
from app.llm.policy import detect_distress, normalize_mode
from app.llm.response import generate_response
from app.retrieval.search import retrieve
from app.storage.chat import create_chat_message, delete_chat_message, list_chat_messages
from app.storage.journal import (
    create_journal_entry,
    delete_journal_entry,
    get_journal_entry,
    list_journal_entries,
    update_journal_reflection,
    clear_journal_reflection,
)
from app.storage.items import create_item
from app.storage.items import get_item
from app.storage.proposed_insights import (
    get_proposed_insight,
    list_proposed_insights,
    list_filtered_insights,
    update_proposed_insight_status,
)
from app.storage.feedback import add_feedback
from app.storage.ml_stats import update_word_stats, tokenize
from app.storage.entities import (
    create_entity,
    delete_entity,
    list_entities,
    merge_entities,
    update_entity_label,
    cleanup_garbage_entities,
)
from app.storage.categories import list_categories
from app.storage.chunks import get_chunks_for_item
from app.storage.llm_analysis import list_items_needing_analysis, list_items_with_chunks
from app.storage.conflicts import list_conflicts, update_conflict_status
from app.storage.export import export_all
from app.storage.admin import wipe_all_data
from app.security.secret_store import (
    get_secret,
    get_secret_with_key,
    store_secret,
    store_secret_with_key,
)
from app.security.auth_data import (
    get_salt,
    set_password_hash,
    verify_password_hash,
)
from app.storage.settings import get_setting, set_setting
from app.storage.provenance import create_provenance, list_provenance_for_entity
from app.storage.relations import delete_relation, list_relations

router = APIRouter()


@router.get("/health")
def health_check() -> dict:
    return {"status": "ok"}


# --- Auth: salt and password verification ---

@router.get("/auth/salt")
def auth_salt() -> dict:
    return {"salt": get_salt()}


class SetPasswordRequest(BaseModel):
    password_hash: str


class VerifyPasswordRequest(BaseModel):
    password_hash: str


@router.post("/auth/set-password")
def auth_set_password(request: SetPasswordRequest) -> dict:
    set_password_hash(request.password_hash)
    return {"ok": True}


@router.post("/auth/verify")
def auth_verify(request: VerifyPasswordRequest) -> dict:
    ok = verify_password_hash(request.password_hash)
    return {"ok": ok}


@router.get("/health/llm")
def health_check_llm() -> dict:
    """Check if Ollama is reachable and the configured model works (same path as analysis)."""
    try:
        from app.llm.ollama_client import chat
        from app.core.config import settings
        chat(
            [{"role": "user", "content": "Reply with exactly: ok"}],
            model=settings.ollama_model,
        )
        return {"status": "ok"}
    except Exception as e:
        return {"status": "offline", "error": str(e)}


class LocalIngestRequest(BaseModel):
    paths: list[str]


@router.post("/ingest/local")
def ingest_local(request: LocalIngestRequest) -> dict:
    results = ingest_local_paths(request.paths)
    return {"results": [result.__dict__ for result in results]}


@router.post("/ingest/local/stream")
def ingest_local_stream(request: LocalIngestRequest):
    import json

    def generate():
        for event in ingest_local_paths_streaming(request.paths):
            yield json.dumps(event) + "\n"

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
    )


class GmailIngestRequest(BaseModel):
    access_token: str
    user_id: str = "me"
    include_body: bool = False
    max_results: int = 50


@router.post("/ingest/gmail")
def ingest_gmail(request: GmailIngestRequest) -> dict:
    results = ingest_gmail_messages(
        access_token=request.access_token,
        user_id=request.user_id,
        include_body=request.include_body,
        max_results=request.max_results,
    )
    return {"results": results}


class ExportIngestRequest(BaseModel):
    export_path: str


@router.post("/ingest/facebook_export")
def ingest_facebook(request: ExportIngestRequest) -> dict:
    results = ingest_facebook_export(request.export_path)
    return {"results": results}


@router.post("/ingest/youtube_export")
def ingest_youtube(request: ExportIngestRequest) -> dict:
    results = ingest_youtube_export(request.export_path)
    return {"results": results}


class AnalyzeIngestRequest(BaseModel):
    force: bool = False
    limit: int = 50


@router.post("/ingest/analyze")
def trigger_analyze(request: AnalyzeIngestRequest | None = None) -> dict:
    """
    Run LLM analysis on items that have chunks.
    If force=True, re-analyze all items with chunks (default: only unanalyzed).
    Raises 503 if LLM is unavailable.
    """
    from fastapi import HTTPException
    from app.ingestion.extraction_runner import extract_and_store, LLMUnavailableError

    req = request or AnalyzeIngestRequest()
    item_ids = (
        list_items_with_chunks(limit=req.limit)
        if req.force
        else list_items_needing_analysis(limit=req.limit)
    )
    processed = 0
    try:
        for item_id in item_ids:
            chunks_data = get_chunks_for_item(item_id)
            chunks = [c["content"] for c in chunks_data]
            if not chunks:
                continue
            extract_and_store(item_id, chunks)
            processed += 1
    except LLMUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"processed": processed, "total": len(item_ids)}


@router.get("/knowledge/categories")
def get_categories() -> dict:
    return {"categories": list_categories()}


class JournalEntryRequest(BaseModel):
    content: str
    structured_fields: dict | None = None
    user_id: str | None = None


@router.get("/journal")
def get_journal_entries() -> dict:
    entries = list_journal_entries()
    return {"entries": entries}


@router.post("/journal")
def add_journal_entry(request: JournalEntryRequest) -> dict:
    entry = create_journal_entry(
        content=request.content,
        structured_fields=request.structured_fields,
        user_id=request.user_id,
    )
    create_item(
        source_type="journal",
        source_ref=None,
        path_or_id=entry["id"],
        content_hash=None,
        raw_meta={"source": "journal"},
        ingestion_status="processed",
    )
    return {"entry": entry}


class JournalReflectRequest(BaseModel):
    entry_id: str | None = None


@router.post("/journal/reflect")
def journal_reflect(request: JournalReflectRequest | None = None) -> dict:
    """Get an LLM reflection on a journal entry. Uses latest entry if entry_id omitted."""
    req = request or JournalReflectRequest()
    if req.entry_id:
        entry = get_journal_entry(req.entry_id)
    else:
        entries = list_journal_entries(limit=1, order="DESC")
        entry = entries[0] if entries else None
    if not entry:
        raise HTTPException(status_code=404, detail="No journal entry found")
    entry_id = entry["id"]
    entry_content = (entry.get("content") or "").strip()
    if not entry_content:
        raise HTTPException(status_code=400, detail="Journal entry has no content")
    retrieval_result = retrieve(entry_content, limit=3)
    retrieved_context = [m["content"] for m in retrieval_result.get("matches", [])]
    from app.llm.response import _build_system_prompt
    from app.llm.ollama_client import chat

    system = _build_system_prompt("journal", retrieved_context)
    system += "\n\nReflect briefly and supportively on this journal entry only. Do not diagnose."
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Reflect on this journal entry:\n\n{entry_content}"},
    ]
    try:
        text = chat(messages)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="LLM unavailable. Is Ollama running?",
        )
    reflection_text = text or ""
    update_journal_reflection(entry_id, reflection_text)
    return {"text": reflection_text, "entry_id": entry_id}


@router.delete("/journal/{entry_id}/reflection")
def remove_journal_reflection(entry_id: str) -> dict:
    if get_journal_entry(entry_id) is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    clear_journal_reflection(entry_id)
    return {"ok": True}


@router.delete("/journal/{entry_id}")
def remove_journal_entry_route(entry_id: str) -> dict:
    if not delete_journal_entry(entry_id):
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return {"ok": True}


class ChatRequest(BaseModel):
    content: str
    mode: str = "journal"
    session_id: str | None = None


@router.get("/chat")
def get_chat_messages(session_id: str | None = None) -> dict:
    return {"messages": list_chat_messages(session_id=session_id)}


@router.delete("/chat/{message_id}")
def remove_chat_message_route(message_id: str) -> dict:
    if not delete_chat_message(message_id):
        raise HTTPException(status_code=404, detail="Chat message not found")
    return {"ok": True}


@router.post("/chat")
def post_chat_message(request: ChatRequest) -> dict:
    mode = normalize_mode(request.mode)
    if detect_distress(request.content):
        mode = "crisis"

    user_message = create_chat_message(
        role="user",
        content=request.content,
        mode=mode,
        session_id=request.session_id,
    )

    retrieval_result = {}
    citations = []
    if mode != "exploration":
        retrieval_result = retrieve(request.content, limit=5)
        for match in retrieval_result.get("matches", []):
            item = get_item(match["item_id"])
            label = item.get("path_or_id") if item else match["item_id"]
            citations.append(
                {
                    "item_id": match["item_id"],
                    "label": label,
                    "type": "summarized",
                }
            )

    try:
        response_payload = generate_response(
            request.content,
            mode,
            retrieved_context=[match["content"] for match in retrieval_result.get("matches", [])],
            session_id=request.session_id,
        )
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="LLM unavailable. Is Ollama running?",
        )
    response_text = response_payload["text"]
    assistant_message = create_chat_message(
        role="assistant",
        content=response_text,
        mode=mode,
        session_id=request.session_id,
    )
    return {
        "messages": [user_message, assistant_message],
        "mode": mode,
        "citations": citations,
    }


class RetrievalRequest(BaseModel):
    query: str
    limit: int = 5


@router.post("/retrieve")
def retrieve_context(request: RetrievalRequest) -> dict:
    return retrieve(request.query, request.limit)


class ProposedInsightsUpdateRequest(BaseModel):
    insight_id: str
    status: str
    reason: str | None = None


@router.get("/proposed_insights")
def get_proposed_insights(status: str | None = None) -> dict:
    return {"insights": list_proposed_insights(status=status)}

@router.get("/proposed_insights/filtered")
def get_filtered_insights() -> dict:
    return {"insights": list_filtered_insights()}


@router.post("/proposed_insights/update")
def update_proposed_insights(request: ProposedInsightsUpdateRequest) -> dict:
    update_proposed_insight_status(request.insight_id, request.status)
    insight = get_proposed_insight(request.insight_id)
    if insight:
        if request.status == "accepted":
            entity_id = create_entity("insight", insight["content"])
            for source in insight.get("supporting_sources", []):
                source_item_id = source.get("item_id")
                if source_item_id:
                    create_provenance(
                        target_type="entity",
                        target_id=entity_id,
                        source_item_id=source_item_id,
                        classification="hypothesis",
                        confidence="low",
                        extracted_by="proposed_insight_accept",
                    )
        if request.status in {"accepted", "later"}:
            update_word_stats(tokenize(insight["content"]), label="positive")
        if request.status == "irrelevant":
            update_word_stats(tokenize(insight["content"]), label="negative")
            source_item_id = None
            sources = insight.get("supporting_sources", [])
            if sources:
                source_item_id = sources[0].get("item_id")
            add_feedback(
                insight_id=request.insight_id,
                source_item_id=source_item_id,
                label="irrelevant",
                reason=request.reason or "manual",
            )
    return {"ok": True}


class ProposedInsightsRestoreRequest(BaseModel):
    insight_id: str


@router.post("/proposed_insights/restore")
def restore_proposed_insight(request: ProposedInsightsRestoreRequest) -> dict:
    update_proposed_insight_status(request.insight_id, "pending")
    return {"ok": True}


class EntityUpdateRequest(BaseModel):
    entity_id: str
    label: str


class EntityMergeRequest(BaseModel):
    source_id: str
    target_id: str


class EntityDeleteRequest(BaseModel):
    entity_id: str


class RelationDeleteRequest(BaseModel):
    relation_id: str


def _is_garbage_entity(e: dict) -> bool:
    label = (e.get("label") or "").strip()
    return len(label) < 3 or label.isnumeric()


@router.get("/knowledge/entities")
def get_entities(source: str | None = "llm") -> dict:
    """
    List entities. Default source=llm shows only LLM-derived.
    Use source=legacy for legacy, source=all for unfiltered.
    """
    filter_source = None if source == "all" else (source or "llm")
    entities = list_entities(source=filter_source)
    entities = [e for e in entities if not _is_garbage_entity(e)]
    return {"entities": entities}


@router.get("/knowledge/relations")
def get_relations() -> dict:
    return {"relations": list_relations()}


@router.post("/knowledge/entities/update")
def update_entity(request: EntityUpdateRequest) -> dict:
    update_entity_label(request.entity_id, request.label)
    return {"ok": True}


@router.post("/knowledge/entities/delete")
def remove_entity(request: EntityDeleteRequest) -> dict:
    delete_entity(request.entity_id)
    return {"ok": True}


@router.post("/knowledge/entities/merge")
def merge_entity(request: EntityMergeRequest) -> dict:
    merge_entities(request.source_id, request.target_id)
    return {"ok": True}


@router.post("/knowledge/relations/delete")
def remove_relation(request: RelationDeleteRequest) -> dict:
    delete_relation(request.relation_id)
    return {"ok": True}


@router.post("/knowledge/entities/cleanup")
def cleanup_entities() -> dict:
    """Remove garbage entities (numeric, len<3 labels) from the database."""
    deleted = cleanup_garbage_entities()
    return {"deleted": deleted}


@router.get("/knowledge/entities/{entity_id}/provenance")
def get_entity_provenance(entity_id: str) -> dict:
    return {"provenance": list_provenance_for_entity(entity_id)}


class ConflictUpdateRequest(BaseModel):
    conflict_id: str
    status: str


@router.get("/conflicts")
def get_conflicts(status: str | None = None) -> dict:
    return {"conflicts": list_conflicts(status=status)}


@router.post("/conflicts/update")
def update_conflict(request: ConflictUpdateRequest) -> dict:
    update_conflict_status(request.conflict_id, request.status)
    return {"ok": True}


@router.get("/export")
def export_data() -> dict:
    return export_all()


@router.post("/delete_all")
def delete_all_data() -> dict:
    wipe_all_data()
    return {"ok": True}


class SecretStoreRequest(BaseModel):
    key: str
    value: str
    passphrase: str


class SecretGetRequest(BaseModel):
    key: str
    passphrase: str


class SecretStoreWithKeyRequest(BaseModel):
    key: str
    value: str
    derived_key: str


class SecretGetWithKeyRequest(BaseModel):
    key: str
    derived_key: str


@router.post("/secrets/store-with-key")
def store_secret_with_key_value(request: SecretStoreWithKeyRequest) -> dict:
    store_secret_with_key(request.key, request.value, request.derived_key)
    return {"ok": True}


@router.post("/secrets/get-with-key")
def get_secret_with_key_value(request: SecretGetWithKeyRequest) -> dict:
    value = get_secret_with_key(request.key, request.derived_key)
    return {"value": value}


@router.post("/secrets/store")
def store_secret_value(request: SecretStoreRequest) -> dict:
    store_secret(request.key, request.value, request.passphrase)
    return {"ok": True}


@router.post("/secrets/get")
def get_secret_value(request: SecretGetRequest) -> dict:
    value = get_secret(request.key, request.passphrase)
    return {"value": value}


class SettingsUpdateRequest(BaseModel):
    key: str
    value: dict


@router.get("/settings/{key}")
def get_settings(key: str) -> dict:
    return {"setting": get_setting(key)}


@router.post("/settings")
def update_settings(request: SettingsUpdateRequest) -> dict:
    set_setting(request.key, request.value)
    return {"ok": True}
