-- ================================================
-- TMA CLAIMED BY MIGRATION
-- Track who "owns" a TMA candidate
-- ================================================

-- Add claimed_by column to tma_candidates
ALTER TABLE tma_candidates 
ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tma_candidates_claimed_by ON tma_candidates(claimed_by);

