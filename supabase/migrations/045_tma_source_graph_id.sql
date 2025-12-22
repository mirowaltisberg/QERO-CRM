-- Add source_graph_contact_id to tma_candidates for tracking Outlook-imported candidates
ALTER TABLE tma_candidates
ADD COLUMN IF NOT EXISTS source_graph_contact_id TEXT NULL;

-- Index for faster lookup when checking for duplicates during Outlook sync
CREATE INDEX IF NOT EXISTS idx_tma_candidates_source_graph ON tma_candidates (source_graph_contact_id)
WHERE source_graph_contact_id IS NOT NULL;

