-- ================================================
-- TMA Candidate Deduplication Helpers
-- Adds normalized email + composite dedupe key columns
-- plus unique indexes to prevent future duplicates.
-- ================================================

ALTER TABLE tma_candidates
ADD COLUMN IF NOT EXISTS normalized_email TEXT GENERATED ALWAYS AS (
  CASE
    WHEN email IS NULL OR length(btrim(email)) = 0 THEN NULL
    ELSE lower(btrim(email))
  END
) STORED;

ALTER TABLE tma_candidates
ADD COLUMN IF NOT EXISTS dedupe_key TEXT GENERATED ALWAYS AS (
  CASE
    WHEN first_name IS NULL OR last_name IS NULL THEN NULL
    WHEN COALESCE(
      NULLIF(regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g'), ''),
      NULLIF(upper(regexp_replace(COALESCE(postal_code, ''), '\\s+', '', 'g')), '')
    ) IS NULL THEN NULL
    ELSE lower(btrim(first_name)) || '|' || lower(btrim(last_name)) || '|' ||
      COALESCE(
        NULLIF(regexp_replace(COALESCE(phone, ''), '[^0-9]+', '', 'g'), ''),
        NULLIF(upper(regexp_replace(COALESCE(postal_code, ''), '\\s+', '', 'g')), '')
      )
  END
) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS tma_candidates_normalized_email_key
  ON tma_candidates (normalized_email)
  WHERE normalized_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tma_candidates_dedupe_key
  ON tma_candidates (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

