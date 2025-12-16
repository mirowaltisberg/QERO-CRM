-- Migration: Add photo_url field to TMA candidates for Kurzprofil
-- This stores the URL of the candidate's profile photo used in the short profile PDF

ALTER TABLE tma_candidates 
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN tma_candidates.photo_url IS 'URL to candidate profile photo stored in Supabase Storage (tma-docs bucket)';
