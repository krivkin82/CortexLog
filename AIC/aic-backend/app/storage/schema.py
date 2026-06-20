SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_ref TEXT,
        path_or_id TEXT,
        content_hash TEXT,
        raw_meta TEXT,
        created_at TEXT,
        ingestion_status TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        type TEXT,
        label TEXT,
        created_at TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        from_entity_id TEXT,
        to_entity_id TEXT,
        relation_type TEXT,
        created_at TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS provenance (
        id TEXT PRIMARY KEY,
        target_type TEXT,
        target_id TEXT,
        source_item_id TEXT,
        extracted_at TEXT,
        classification TEXT,
        confidence TEXT,
        extracted_by TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        content TEXT,
        structured_fields TEXT,
        created_at TEXT,
        user_id TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        role TEXT,
        content TEXT,
        mode TEXT,
        created_at TEXT,
        session_id TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS proposed_insights (
        id TEXT PRIMARY KEY,
        insight_type TEXT,
        content TEXT,
        supporting_sources TEXT,
        status TEXT,
        created_at TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        item_id TEXT,
        chunk_index INTEGER,
        content TEXT,
        created_at TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        item_id TEXT,
        chunk_id TEXT,
        embedding TEXT,
        created_at TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        entity_id TEXT,
        conflicting_entity_id TEXT,
        reason TEXT,
        status TEXT,
        created_at TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS insight_feedback (
        id TEXT PRIMARY KEY,
        insight_id TEXT,
        source_item_id TEXT,
        label TEXT,
        reason TEXT,
        created_at TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS word_stats (
        word TEXT PRIMARY KEY,
        pos_count INTEGER,
        neg_count INTEGER
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at TEXT
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS item_categories (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        confidence REAL,
        created_at TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS llm_analysis_runs (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        model TEXT,
        status TEXT,
        created_at TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id)
    );
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_item_categories_item ON item_categories (item_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_llm_analysis_item ON llm_analysis_runs (item_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_items_source_type ON items (source_type);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities (type);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_relations_from ON relations (from_entity_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_relations_to ON relations (to_entity_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_provenance_target ON provenance (target_type, target_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_embeddings_item ON embeddings (item_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_chunks_item ON chunks (item_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts (status);
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_feedback_insight ON insight_feedback (insight_id);
    """,
]

# Migrations: run after schema. Ignore OperationalError if column already exists.
MIGRATION_STATEMENTS = [
    "ALTER TABLE entities ADD COLUMN source TEXT",
    "ALTER TABLE items ADD COLUMN primary_category TEXT",
    "ALTER TABLE journal_entries ADD COLUMN reflection TEXT",
]
