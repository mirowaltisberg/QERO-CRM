-- Migrate Legacy Notes to Proper Notes System for Elektro Team
-- This converts the old legacy notes (stored in tma_candidates.notes) 
-- into proper tma_notes entries authored by Arbios Shtanaj

-- Arbios Shtanaj user ID: 4fd451d9-d018-4078-8ce7-490734724857
-- Elektro team ID: 00000000-0000-0000-0000-000000000010

-- Step 1: Convert legacy notes (tma_candidates.notes) to tma_notes table
-- Only for Elektro team candidates that have legacy notes filled in
INSERT INTO tma_notes (tma_id, author_id, content, created_at, updated_at)
SELECT 
  id AS tma_id,
  '4fd451d9-d018-4078-8ce7-490734724857' AS author_id,
  notes AS content,
  COALESCE(created_at, NOW()) AS created_at,
  NOW() AS updated_at
FROM tma_candidates
WHERE team_id = '00000000-0000-0000-0000-000000000010'
  AND notes IS NOT NULL 
  AND notes != ''
  AND notes != 'null';

-- Step 2: Clear the legacy notes field after migration
-- (so they don't show as "Legacy notes" anymore)
UPDATE tma_candidates
SET notes = NULL
WHERE team_id = '00000000-0000-0000-0000-000000000010'
  AND notes IS NOT NULL;

-- Step 3: Also update any existing tma_notes for Elektro candidates to be by Arbios
UPDATE tma_notes
SET author_id = '4fd451d9-d018-4078-8ce7-490734724857'
WHERE tma_id IN (
  SELECT id FROM tma_candidates 
  WHERE team_id = '00000000-0000-0000-0000-000000000010'
);

-- Log what was done
DO $$
DECLARE
  notes_created INTEGER;
  notes_updated INTEGER;
BEGIN
  SELECT COUNT(*) INTO notes_created
  FROM tma_notes
  WHERE author_id = '4fd451d9-d018-4078-8ce7-490734724857'
    AND tma_id IN (
      SELECT id FROM tma_candidates 
      WHERE team_id = '00000000-0000-0000-0000-000000000010'
    );
  RAISE NOTICE 'Total notes now owned by Arbios for Elektro team: %', notes_created;
END $$;
