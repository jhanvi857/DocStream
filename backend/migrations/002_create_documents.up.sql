CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content JSONB NOT NULL DEFAULT '[]'::jsonb,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_version INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);
