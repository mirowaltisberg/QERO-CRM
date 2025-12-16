-- ================================================
-- MIGRATE ALL LEGACY NOTES TO NEW SYSTEM
-- Run this to convert old single-field notes to multi-author notes
-- ================================================

-- Step 1: Get the first available user (or use a specific default user)
-- This will be the author for all migrated legacy notes
DO $$
DECLARE
  default_author_id UUID;
BEGIN
  -- Get the first user from profiles table
  SELECT id INTO default_author_id 
  FROM profiles 
  ORDER BY created_at ASC 
  LIMIT 1;

  IF default_author_id IS NULL THEN
    RAISE EXCEPTION 'No users found in profiles table. Cannot migrate notes without an author.';
  END IF;

  RAISE NOTICE 'Using author ID: %', default_author_id;

  -- Step 2: Migrate contact legacy notes
  INSERT INTO contact_notes (contact_id, author_id, content, created_at, updated_at)
  SELECT 
    c.id,
    default_author_id,
    c.notes,
    COALESCE(c.created_at, NOW()),
    COALESCE(c.created_at, NOW())
  FROM contacts c
  WHERE c.notes IS NOT NULL
    AND trim(c.notes) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM contact_notes cn
      WHERE cn.contact_id = c.id
        AND cn.content = c.notes
    );

  RAISE NOTICE 'Migrated % contact legacy notes', (
    SELECT COUNT(*) FROM contacts 
    WHERE notes IS NOT NULL AND trim(notes) <> ''
  );

  -- Step 3: Clear legacy notes field from contacts
  UPDATE contacts 
  SET notes = NULL 
  WHERE notes IS NOT NULL 
    AND trim(notes) <> '';

  -- Step 4: Migrate TMA candidate legacy notes
  INSERT INTO tma_notes (tma_id, author_id, content, created_at, updated_at)
  SELECT 
    t.id,
    default_author_id,
    t.notes,
    COALESCE(t.created_at, NOW()),
    COALESCE(t.created_at, NOW())
  FROM tma_candidates t
  WHERE t.notes IS NOT NULL
    AND trim(t.notes) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM tma_notes tn
      WHERE tn.tma_id = t.id
        AND tn.content = t.notes
    );

  RAISE NOTICE 'Migrated % TMA candidate legacy notes', (
    SELECT COUNT(*) FROM tma_candidates 
    WHERE notes IS NOT NULL AND trim(notes) <> ''
  );

  -- Step 5: Clear legacy notes field from tma_candidates
  UPDATE tma_candidates 
  SET notes = NULL 
  WHERE notes IS NOT NULL 
    AND trim(notes) <> '';

  RAISE NOTICE 'Migration complete!';
END $$;

-- Verification queries (run these to check results):
-- SELECT COUNT(*) FROM contact_notes;
-- SELECT COUNT(*) FROM tma_notes;
-- SELECT COUNT(*) FROM contacts WHERE notes IS NOT NULL;
-- SELECT COUNT(*) FROM tma_candidates WHERE notes IS NOT NULL;
