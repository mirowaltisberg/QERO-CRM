-- Migration: Add address edit tracking to TMA candidates
-- Track who last edited the address and when

ALTER TABLE tma_candidates
ADD COLUMN IF NOT EXISTS address_updated_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS address_updated_at TIMESTAMPTZ;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tma_address_updated_by ON tma_candidates(address_updated_by) WHERE address_updated_by IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN tma_candidates.address_updated_by IS 'User ID who last edited the address (city/postal_code/street)';
COMMENT ON COLUMN tma_candidates.address_updated_at IS 'Timestamp when the address was last edited';
