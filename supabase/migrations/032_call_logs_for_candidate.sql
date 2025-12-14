-- Add for_candidate_id column to contact_call_logs
-- This tracks which TMA candidate the call was made for

ALTER TABLE contact_call_logs 
ADD COLUMN IF NOT EXISTS for_candidate_id UUID REFERENCES tma_candidates(id) ON DELETE SET NULL;

-- Create index for faster lookups by candidate
CREATE INDEX IF NOT EXISTS idx_contact_call_logs_for_candidate 
ON contact_call_logs(for_candidate_id) 
WHERE for_candidate_id IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN contact_call_logs.for_candidate_id IS 'The TMA candidate this call was made for (when using candidate calling mode)';

