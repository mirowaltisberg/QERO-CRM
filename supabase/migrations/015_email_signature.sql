-- Add email signature columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS email_signature_text TEXT,
ADD COLUMN IF NOT EXISTS email_signature_html TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.email_signature_text IS 'Plain text version of email signature shown in compose textarea';
COMMENT ON COLUMN profiles.email_signature_html IS 'HTML version of email signature used when sending emails';
