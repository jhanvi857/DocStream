CREATE TABLE IF NOT EXISTS ops_log (
    id UUID PRIMARY KEY,
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    op_type VARCHAR(20) NOT NULL, -- 'insert' or 'delete'
    char_id VARCHAR(255) NOT NULL,
    char TEXT NOT NULL,
    after_id VARCHAR(255) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    vector_clock JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_log_doc_id ON ops_log(doc_id);
CREATE INDEX IF NOT EXISTS idx_ops_log_doc_id_created_at ON ops_log(doc_id, created_at ASC);
