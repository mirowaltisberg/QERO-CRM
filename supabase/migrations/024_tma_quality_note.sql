-- Add quality note field to explain A/B/C rating
ALTER TABLE tma_candidates
ADD COLUMN quality_note TEXT;

COMMENT ON COLUMN tma_candidates.quality_note IS 'Short note explaining why the candidate received their quality rating (A/B/C)';
