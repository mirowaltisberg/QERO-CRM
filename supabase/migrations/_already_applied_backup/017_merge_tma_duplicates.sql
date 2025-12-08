-- ================================================
-- Merge TMA Duplicates: Copy phone from new records to legacy records
-- Then delete the duplicates (keeping the ones with tma_notes)
-- ================================================

-- Step 1: Update phone numbers on records that have tma_notes
-- from their duplicate records that have phone numbers
WITH duplicates AS (
  SELECT 
    t1.id AS keeper_id,
    t2.id AS duplicate_id,
    t2.phone AS new_phone
  FROM tma_candidates t1
  JOIN tma_candidates t2 
    ON lower(trim(t1.first_name)) = lower(trim(t2.first_name))
    AND lower(trim(t1.last_name)) = lower(trim(t2.last_name))
    AND t1.id < t2.id  -- Ensure we only get each pair once
  WHERE EXISTS (SELECT 1 FROM tma_notes WHERE tma_id = t1.id)  -- keeper has notes
    AND t2.phone IS NOT NULL  -- duplicate has phone
    AND (t1.phone IS NULL OR t1.phone = '')  -- keeper doesn't have phone
)
UPDATE tma_candidates
SET phone = d.new_phone
FROM duplicates d
WHERE tma_candidates.id = d.keeper_id;

-- Step 2: Also copy phone the other direction (if the one with notes doesn't exist but newer one does)
-- This handles cases where the "newer" record might be the one with notes
WITH duplicates AS (
  SELECT 
    t2.id AS keeper_id,
    t1.id AS duplicate_id,
    t1.phone AS new_phone
  FROM tma_candidates t1
  JOIN tma_candidates t2 
    ON lower(trim(t1.first_name)) = lower(trim(t2.first_name))
    AND lower(trim(t1.last_name)) = lower(trim(t2.last_name))
    AND t1.id < t2.id
  WHERE EXISTS (SELECT 1 FROM tma_notes WHERE tma_id = t2.id)  -- keeper (t2) has notes
    AND t1.phone IS NOT NULL  -- duplicate (t1) has phone
    AND (t2.phone IS NULL OR t2.phone = '')  -- keeper doesn't have phone
)
UPDATE tma_candidates
SET phone = d.new_phone
FROM duplicates d
WHERE tma_candidates.id = d.keeper_id;

-- Step 3: Reassign any tma_notes from duplicates to keepers (just in case)
WITH duplicates AS (
  SELECT 
    t1.id AS keeper_id,
    t2.id AS duplicate_id
  FROM tma_candidates t1
  JOIN tma_candidates t2 
    ON lower(trim(t1.first_name)) = lower(trim(t2.first_name))
    AND lower(trim(t1.last_name)) = lower(trim(t2.last_name))
    AND t1.id < t2.id
  WHERE EXISTS (SELECT 1 FROM tma_notes WHERE tma_id = t1.id)
)
UPDATE tma_notes
SET tma_id = d.keeper_id
FROM duplicates d
WHERE tma_notes.tma_id = d.duplicate_id;

-- Step 4: Delete duplicate records (the ones without notes, or the "newer" ones)
WITH duplicates AS (
  SELECT 
    t2.id AS duplicate_id
  FROM tma_candidates t1
  JOIN tma_candidates t2 
    ON lower(trim(t1.first_name)) = lower(trim(t2.first_name))
    AND lower(trim(t1.last_name)) = lower(trim(t2.last_name))
    AND t1.id < t2.id
  WHERE EXISTS (SELECT 1 FROM tma_notes WHERE tma_id = t1.id)  -- t1 has notes, so t2 is the duplicate
)
DELETE FROM tma_candidates
WHERE id IN (SELECT duplicate_id FROM duplicates);

-- Step 5: Delete remaining duplicates where the "newer" one has notes
-- (keep the one with notes, delete the older one without)
WITH duplicates AS (
  SELECT 
    t1.id AS duplicate_id
  FROM tma_candidates t1
  JOIN tma_candidates t2 
    ON lower(trim(t1.first_name)) = lower(trim(t2.first_name))
    AND lower(trim(t1.last_name)) = lower(trim(t2.last_name))
    AND t1.id < t2.id
  WHERE EXISTS (SELECT 1 FROM tma_notes WHERE tma_id = t2.id)  -- t2 has notes, so t1 is the duplicate
    AND NOT EXISTS (SELECT 1 FROM tma_notes WHERE tma_id = t1.id)  -- t1 has no notes
)
DELETE FROM tma_candidates
WHERE id IN (SELECT duplicate_id FROM duplicates);
