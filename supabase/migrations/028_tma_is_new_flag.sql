-- Add is_new flag to TMA candidates
-- This replaces the notes_count based logic for determining "NEW" status

-- Step 1: Add the is_new column (default false)
ALTER TABLE tma_candidates
ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT false;

-- Step 2: Set is_new = true for all TMAs that have notes from Arbios
-- (Arbios Shtanaj: 4fd451d9-d018-4078-8ce7-490734724857)
-- These are legacy imported candidates that should show as "NEW"
UPDATE tma_candidates
SET is_new = true
WHERE id IN (
  SELECT DISTINCT tma_id 
  FROM tma_notes 
  WHERE author_id = '4fd451d9-d018-4078-8ce7-490734724857'
);

-- Step 3: Also set is_new = true for TMAs with NO notes at all and no status
-- (they are genuinely new)
UPDATE tma_candidates
SET is_new = true
WHERE id NOT IN (SELECT DISTINCT tma_id FROM tma_notes)
  AND (status_tags IS NULL OR status_tags = '{}');

-- Log what was done
DO $$
DECLARE
  new_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO new_count
  FROM tma_candidates
  WHERE is_new = true;
  RAISE NOTICE 'Total TMA candidates marked as NEW: %', new_count;
END $$;
