-- ================================================
-- CHECK STATUS OF LEGACY NOTES (Run this BEFORE migration)
-- This will show you how many notes need to be migrated
-- ================================================

-- Count contacts with legacy notes
SELECT 
  'Contacts with legacy notes' AS description,
  COUNT(*) AS count
FROM contacts 
WHERE notes IS NOT NULL 
  AND trim(notes) <> '';

-- Count TMA candidates with legacy notes
SELECT 
  'TMA candidates with legacy notes' AS description,
  COUNT(*) AS count
FROM tma_candidates 
WHERE notes IS NOT NULL 
  AND trim(notes) <> '';

-- Sample of contact legacy notes (first 5)
SELECT 
  'Sample contact legacy notes' AS description,
  company_name,
  left(notes, 100) AS note_preview
FROM contacts 
WHERE notes IS NOT NULL 
  AND trim(notes) <> ''
LIMIT 5;

-- Sample of TMA legacy notes (first 5)
SELECT 
  'Sample TMA legacy notes' AS description,
  first_name || ' ' || last_name AS name,
  left(notes, 100) AS note_preview
FROM tma_candidates 
WHERE notes IS NOT NULL 
  AND trim(notes) <> ''
LIMIT 5;

-- Count existing notes in new system
SELECT 
  'Existing contact_notes (new system)' AS description,
  COUNT(*) AS count
FROM contact_notes;

SELECT 
  'Existing tma_notes (new system)' AS description,
  COUNT(*) AS count
FROM tma_notes;

-- Check for default user
SELECT 
  'Default author for migration' AS description,
  id,
  full_name,
  email
FROM profiles 
ORDER BY created_at ASC 
LIMIT 1;
