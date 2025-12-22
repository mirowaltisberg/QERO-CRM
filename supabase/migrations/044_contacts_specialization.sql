-- Migration: Add specialization column to contacts for Holz/Dach categorization
-- This allows tagging contacts imported from specific Outlook folders (e.g., Holzbau, Dachdecker)

-- Add specialization column to contacts table
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS specialization TEXT NULL;

-- Add comment describing the field
COMMENT ON COLUMN contacts.specialization IS 'Industry specialization (e.g., holzbau, dachdecker) - derived from Outlook folder during import';

-- Add index for filtering by specialization
CREATE INDEX IF NOT EXISTS idx_contacts_specialization ON contacts(specialization) WHERE specialization IS NOT NULL;

-- Also add to tma_candidates for matching purposes
ALTER TABLE tma_candidates
ADD COLUMN IF NOT EXISTS specialization TEXT NULL;

COMMENT ON COLUMN tma_candidates.specialization IS 'Industry specialization for matching with company contacts';

CREATE INDEX IF NOT EXISTS idx_tma_candidates_specialization ON tma_candidates(specialization) WHERE specialization IS NOT NULL;

