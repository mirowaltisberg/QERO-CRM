-- Add gender column to contact_persons for personalized email greetings
-- Values: 'male' | 'female' | NULL (unknown)

ALTER TABLE contact_persons ADD COLUMN IF NOT EXISTS gender text;

-- Optional: Add a comment documenting the allowed values
COMMENT ON COLUMN contact_persons.gender IS 'Gender for email greeting: male, female, or NULL (unknown)';
