-- ================================================
-- LEGACY NOTES MIGRATION SCRIPT
-- 
-- This script migrates all legacy notes from:
--   - contacts.notes → contact_notes table
--   - tma_candidates.notes → tma_notes table
--
-- INSTRUCTIONS:
-- 1. Run CHECK_LEGACY_NOTES_STATUS.sql first to see what will be migrated
-- 2. Backup your database (recommended)
-- 3. Copy and paste this entire script into Supabase SQL Editor
-- 4. Click "Run" to execute
-- 5. Verify results using the queries at the bottom
-- ================================================

BEGIN;

DO $$
DECLARE
  default_author_id UUID;
  contact_notes_count INTEGER;
  tma_notes_count INTEGER;
  contacts_migrated INTEGER;
  tma_migrated INTEGER;
BEGIN
  -- Step 1: Get the first available user (oldest account)
  -- This will be the author for all migrated legacy notes
  SELECT id INTO default_author_id 
  FROM profiles 
  ORDER BY created_at ASC 
  LIMIT 1;

  IF default_author_id IS NULL THEN
    RAISE EXCEPTION 'No users found in profiles table. Cannot migrate notes without an author.';
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'LEGACY NOTES MIGRATION STARTING';
  RAISE NOTICE 'Using author ID: %', default_author_id;
  RAISE NOTICE '========================================';

  -- Step 2: Count legacy notes before migration
  SELECT COUNT(*) INTO contact_notes_count
  FROM contacts 
  WHERE notes IS NOT NULL 
    AND trim(notes) <> '';

  SELECT COUNT(*) INTO tma_notes_count
  FROM tma_candidates 
  WHERE notes IS NOT NULL 
    AND trim(notes) <> '';

  RAISE NOTICE 'Found % contact legacy notes to migrate', contact_notes_count;
  RAISE NOTICE 'Found % TMA candidate legacy notes to migrate', tma_notes_count;

  -- Step 3: Migrate contact legacy notes
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
        AND trim(cn.content) = trim(c.notes)
    );

  GET DIAGNOSTICS contacts_migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % contact legacy notes', contacts_migrated;

  -- Step 4: Clear legacy notes field from contacts
  UPDATE contacts 
  SET notes = NULL 
  WHERE notes IS NOT NULL 
    AND trim(notes) <> '';

  RAISE NOTICE 'Cleared legacy notes from contacts table';

  -- Step 5: Migrate TMA candidate legacy notes
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
        AND trim(tn.content) = trim(t.notes)
    );

  GET DIAGNOSTICS tma_migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % TMA candidate legacy notes', tma_migrated;

  -- Step 6: Clear legacy notes field from tma_candidates
  UPDATE tma_candidates 
  SET notes = NULL 
  WHERE notes IS NOT NULL 
    AND trim(notes) <> '';

  RAISE NOTICE 'Cleared legacy notes from tma_candidates table';

  -- Step 7: Verification
  RAISE NOTICE '========================================';
  RAISE NOTICE 'MIGRATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Contact notes migrated: %', contacts_migrated;
  RAISE NOTICE '  - TMA notes migrated: %', tma_migrated;
  RAISE NOTICE '  - Total notes migrated: %', contacts_migrated + tma_migrated;
  
  -- Verify no legacy notes remain
  IF EXISTS (SELECT 1 FROM contacts WHERE notes IS NOT NULL AND trim(notes) <> '') THEN
    RAISE WARNING 'WARNING: Some contact legacy notes still exist!';
  END IF;
  
  IF EXISTS (SELECT 1 FROM tma_candidates WHERE notes IS NOT NULL AND trim(notes) <> '') THEN
    RAISE WARNING 'WARNING: Some TMA legacy notes still exist!';
  END IF;

END $$;

COMMIT;

-- ================================================
-- VERIFICATION QUERIES
-- Run these after migration to verify success:
-- ================================================

-- Should return 0 (no legacy notes remaining)
SELECT 
  'Remaining contact legacy notes' AS description,
  COUNT(*) AS count
FROM contacts 
WHERE notes IS NOT NULL 
  AND trim(notes) <> '';

-- Should return 0 (no legacy notes remaining)
SELECT 
  'Remaining TMA legacy notes' AS description,
  COUNT(*) AS count
FROM tma_candidates 
WHERE notes IS NOT NULL 
  AND trim(notes) <> '';

-- Total notes in new system
SELECT 
  'Total contact_notes (new system)' AS description,
  COUNT(*) AS count
FROM contact_notes;

SELECT 
  'Total tma_notes (new system)' AS description,
  COUNT(*) AS count
FROM tma_notes;

-- Sample of migrated notes
SELECT 
  'Sample migrated contact notes' AS description,
  cn.content,
  p.full_name AS author,
  cn.created_at
FROM contact_notes cn
LEFT JOIN profiles p ON p.id = cn.author_id
ORDER BY cn.created_at DESC
LIMIT 5;

SELECT 
  'Sample migrated TMA notes' AS description,
  tn.content,
  p.full_name AS author,
  tn.created_at
FROM tma_notes tn
LEFT JOIN profiles p ON p.id = tn.author_id
ORDER BY tn.created_at DESC
LIMIT 5;

