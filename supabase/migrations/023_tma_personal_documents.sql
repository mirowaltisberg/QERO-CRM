-- Add personal document URL columns for contract preparation
ALTER TABLE tma_candidates
ADD COLUMN ahv_url TEXT,
ADD COLUMN id_url TEXT,
ADD COLUMN bank_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN tma_candidates.ahv_url IS 'URL to uploaded AHV-Ausweis document';
COMMENT ON COLUMN tma_candidates.id_url IS 'URL to uploaded ID/Passport document';
COMMENT ON COLUMN tma_candidates.bank_url IS 'URL to uploaded bank card/details document';
