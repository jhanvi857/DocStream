CREATE TABLE IF NOT EXISTS document_permissions (
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    PRIMARY KEY (doc_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_permissions_user_id ON document_permissions(user_id);
