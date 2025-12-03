-- ================================================
-- Update email_attachments for inline image support
-- ================================================

-- Add content_id for inline attachments (cid:xxx references)
ALTER TABLE email_attachments ADD COLUMN IF NOT EXISTS content_id TEXT;

-- Add is_inline flag to identify inline vs regular attachments  
ALTER TABLE email_attachments ADD COLUMN IF NOT EXISTS is_inline BOOLEAN DEFAULT FALSE;

-- Create index for faster content_id lookups
CREATE INDEX IF NOT EXISTS idx_email_attachments_content_id 
  ON email_attachments(content_id) 
  WHERE content_id IS NOT NULL;

-- Note: For Supabase Storage bucket, run in dashboard:
-- 1. Go to Storage > Create new bucket
-- 2. Name: "email-attachments" 
-- 3. Public: NO (private bucket, will use signed URLs or API proxy)
-- 4. File size limit: 25MB
-- 5. Allowed MIME types: Leave empty for all, or restrict to common types
