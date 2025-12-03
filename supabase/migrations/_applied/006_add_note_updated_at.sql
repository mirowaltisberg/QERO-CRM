-- ================================================
-- Add updated_at tracking for notes
-- ================================================

ALTER TABLE contact_notes
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE tma_notes
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE contact_notes SET updated_at = COALESCE(updated_at, created_at);
UPDATE tma_notes SET updated_at = COALESCE(updated_at, created_at);

CREATE OR REPLACE FUNCTION set_updated_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_notes_set_updated_at ON contact_notes;
CREATE TRIGGER contact_notes_set_updated_at
BEFORE UPDATE ON contact_notes
FOR EACH ROW
EXECUTE FUNCTION set_updated_timestamp();

DROP TRIGGER IF EXISTS tma_notes_set_updated_at ON tma_notes;
CREATE TRIGGER tma_notes_set_updated_at
BEFORE UPDATE ON tma_notes
FOR EACH ROW
EXECUTE FUNCTION set_updated_timestamp();

