-- Add internet_message_id for deduplication (same ID for sent and received copies)
ALTER TABLE email_messages 
ADD COLUMN IF NOT EXISTS internet_message_id TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_messages_internet_message_id 
ON email_messages(internet_message_id) 
WHERE internet_message_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN email_messages.internet_message_id IS 'RFC 2822 Message-ID - same for sent and received copies, used for deduplication';
