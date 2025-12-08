-- Migration: Add address and coordinate fields to contacts table
-- This enables location-based search for companies

-- Add address fields
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Add coordinate fields for location search
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Create index for efficient location queries
CREATE INDEX IF NOT EXISTS idx_contacts_coordinates 
  ON contacts(latitude, longitude) 
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create index for postal code lookups
CREATE INDEX IF NOT EXISTS idx_contacts_postal_code 
  ON contacts(postal_code) 
  WHERE postal_code IS NOT NULL;

COMMENT ON COLUMN contacts.city IS 'City name for the company location';
COMMENT ON COLUMN contacts.street IS 'Street address for the company';
COMMENT ON COLUMN contacts.postal_code IS 'Swiss postal code (PLZ)';
COMMENT ON COLUMN contacts.latitude IS 'Latitude coordinate for location search';
COMMENT ON COLUMN contacts.longitude IS 'Longitude coordinate for location search';
