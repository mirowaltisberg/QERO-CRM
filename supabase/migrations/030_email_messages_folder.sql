-- ================================================
-- Add folder column to email_messages (conversation-based folders)
-- ================================================

-- Each message needs its own folder (inbox/sent/drafts/archive/trash)
ALTER TABLE email_messages
ADD COLUMN IF NOT EXISTS folder TEXT;

-- Ensure internet_message_id exists (older migrations might not be applied everywhere)
ALTER TABLE email_messages
ADD COLUMN IF NOT EXISTS internet_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_email_messages_internet_message_id
  ON email_messages(internet_message_id)
  WHERE internet_message_id IS NOT NULL;

-- Best-effort backfill from thread folder for existing rows
-- (Not perfect for conversation view, but avoids NULLs until messages are re-synced/hydrated)
UPDATE email_messages m
SET folder = t.folder
FROM email_threads t
WHERE t.id = m.thread_id
  AND m.folder IS NULL
  AND t.folder IS NOT NULL;

-- Indexes to support filtering threads by message folder
CREATE INDEX IF NOT EXISTS idx_email_messages_thread_folder
  ON email_messages(thread_id, folder);

CREATE INDEX IF NOT EXISTS idx_email_messages_folder
  ON email_messages(folder);


