-- ================================================
-- Multi-status tags for TMA candidates
-- ================================================

ALTER TABLE tma_candidates
ADD COLUMN IF NOT EXISTS status_tags TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE tma_candidates
SET status_tags = ARRAY[status]
WHERE status IS NOT NULL
  AND (status_tags IS NULL OR array_length(status_tags, 1) IS NULL);

ALTER TABLE tma_candidates
ALTER COLUMN status_tags SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tma_status_tags ON tma_candidates USING GIN (status_tags);

