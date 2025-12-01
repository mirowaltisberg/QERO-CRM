-- ================================================
-- Add address fields to tma_candidates
-- ================================================

ALTER TABLE tma_candidates
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS street TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Helpful indexes for filtering by city / postal code
CREATE INDEX IF NOT EXISTS idx_tma_city ON tma_candidates(city);
CREATE INDEX IF NOT EXISTS idx_tma_postal_code ON tma_candidates(postal_code);

