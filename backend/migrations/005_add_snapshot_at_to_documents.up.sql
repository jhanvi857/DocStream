ALTER TABLE documents ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ;
UPDATE documents SET snapshot_at = created_at WHERE snapshot_at IS NULL;
ALTER TABLE documents ALTER COLUMN snapshot_at SET NOT NULL;
ALTER TABLE documents ALTER COLUMN snapshot_at SET DEFAULT NOW();
