-- ================================================
-- Backfill legacy notes into new tables
-- ================================================

INSERT INTO contact_notes (contact_id, author_id, content, created_at, updated_at)
SELECT 
  c.id,
  '6e6b8ed8-db3c-4822-abe4-030f1b636413'::UUID,
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

UPDATE contacts SET notes = NULL WHERE notes IS NOT NULL;

INSERT INTO tma_notes (tma_id, author_id, content, created_at, updated_at)
SELECT 
  t.id,
  '6e6b8ed8-db3c-4822-abe4-030f1b636413'::UUID,
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

UPDATE tma_candidates SET notes = NULL WHERE notes IS NOT NULL;

