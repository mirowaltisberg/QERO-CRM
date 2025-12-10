-- Migrate all TMA notes from Elektro team candidates to Arbios Shtanaj
-- This transfers authorship of legacy notes to Arbios for Team Elektro TMA candidates

-- Arbios Shtanaj user ID: 4fd451d9-d018-4078-8ce7-490734724857
-- Elektro team ID: 00000000-0000-0000-0000-000000000010

UPDATE tma_notes
SET author_id = '4fd451d9-d018-4078-8ce7-490734724857'
WHERE tma_id IN (
  SELECT id FROM tma_candidates 
  WHERE team_id = '00000000-0000-0000-0000-000000000010'
);

-- Log the number of notes migrated
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM tma_notes
  WHERE author_id = '4fd451d9-d018-4078-8ce7-490734724857'
    AND tma_id IN (
      SELECT id FROM tma_candidates 
      WHERE team_id = '00000000-0000-0000-0000-000000000010'
    );
  RAISE NOTICE 'Migrated % notes to Arbios Shtanaj', migrated_count;
END $$;
