-- ================================================
-- Email Integration Tables (Outlook via Microsoft Graph)
-- ================================================

-- Email accounts: stores OAuth tokens per user
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'outlook',
  mailbox TEXT NOT NULL,                       -- e.g. user@qero.ch
  access_token TEXT,                           -- encrypted at rest
  refresh_token TEXT,                          -- encrypted at rest
  token_expires_at TIMESTAMPTZ,
  delta_token TEXT,                            -- for Graph delta sync
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_email_accounts_user ON email_accounts(user_id);

-- Email threads: grouped conversations
CREATE TABLE email_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  graph_conversation_id TEXT NOT NULL,         -- Microsoft Graph conversationId
  subject TEXT,
  snippet TEXT,                                -- preview text
  folder TEXT DEFAULT 'inbox',                 -- inbox, sent, drafts, archive, trash
  participants TEXT[],                         -- email addresses involved
  is_read BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  has_attachments BOOLEAN DEFAULT FALSE,
  last_message_at TIMESTAMPTZ,
  -- CRM linkage (optional)
  linked_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  linked_tma_id UUID REFERENCES tma_candidates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, graph_conversation_id)
);

CREATE INDEX idx_email_threads_account ON email_threads(account_id);
CREATE INDEX idx_email_threads_folder ON email_threads(folder);
CREATE INDEX idx_email_threads_last_message ON email_threads(last_message_at DESC);
CREATE INDEX idx_email_threads_linked_contact ON email_threads(linked_contact_id) WHERE linked_contact_id IS NOT NULL;
CREATE INDEX idx_email_threads_linked_tma ON email_threads(linked_tma_id) WHERE linked_tma_id IS NOT NULL;

-- Email messages: individual emails within threads
CREATE TABLE email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  graph_message_id TEXT NOT NULL,              -- Microsoft Graph message id
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  recipients TEXT[] NOT NULL,                  -- to addresses
  cc TEXT[],
  bcc TEXT[],
  subject TEXT,
  body_preview TEXT,                           -- first ~200 chars
  body_html TEXT,                              -- full HTML body
  body_text TEXT,                              -- plain text fallback
  is_read BOOLEAN DEFAULT FALSE,
  is_draft BOOLEAN DEFAULT FALSE,
  has_attachments BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(thread_id, graph_message_id)
);

CREATE INDEX idx_email_messages_thread ON email_messages(thread_id);
CREATE INDEX idx_email_messages_sent ON email_messages(sent_at DESC);
CREATE INDEX idx_email_messages_sender ON email_messages(sender_email);

-- Email attachments metadata (files stored in Supabase Storage or fetched on demand)
CREATE TABLE email_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  graph_attachment_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  storage_path TEXT,                           -- if downloaded to Supabase Storage
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_attachments_message ON email_attachments(message_id);

-- RLS policies
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;

-- Users can only access their own email accounts
CREATE POLICY "Users can view own email accounts" ON email_accounts
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own email accounts" ON email_accounts
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own email accounts" ON email_accounts
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own email accounts" ON email_accounts
  FOR DELETE USING (user_id = auth.uid());

-- Threads: users can access threads from their accounts
CREATE POLICY "Users can view own email threads" ON email_threads
  FOR SELECT USING (
    account_id IN (SELECT id FROM email_accounts WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can insert own email threads" ON email_threads
  FOR INSERT WITH CHECK (
    account_id IN (SELECT id FROM email_accounts WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can update own email threads" ON email_threads
  FOR UPDATE USING (
    account_id IN (SELECT id FROM email_accounts WHERE user_id = auth.uid())
  );
CREATE POLICY "Users can delete own email threads" ON email_threads
  FOR DELETE USING (
    account_id IN (SELECT id FROM email_accounts WHERE user_id = auth.uid())
  );

-- Messages: users can access messages from their threads
CREATE POLICY "Users can view own email messages" ON email_messages
  FOR SELECT USING (
    thread_id IN (
      SELECT t.id FROM email_threads t
      JOIN email_accounts a ON t.account_id = a.id
      WHERE a.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own email messages" ON email_messages
  FOR INSERT WITH CHECK (
    thread_id IN (
      SELECT t.id FROM email_threads t
      JOIN email_accounts a ON t.account_id = a.id
      WHERE a.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update own email messages" ON email_messages
  FOR UPDATE USING (
    thread_id IN (
      SELECT t.id FROM email_threads t
      JOIN email_accounts a ON t.account_id = a.id
      WHERE a.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete own email messages" ON email_messages
  FOR DELETE USING (
    thread_id IN (
      SELECT t.id FROM email_threads t
      JOIN email_accounts a ON t.account_id = a.id
      WHERE a.user_id = auth.uid()
    )
  );

-- Attachments: users can access attachments from their messages
CREATE POLICY "Users can view own email attachments" ON email_attachments
  FOR SELECT USING (
    message_id IN (
      SELECT m.id FROM email_messages m
      JOIN email_threads t ON m.thread_id = t.id
      JOIN email_accounts a ON t.account_id = a.id
      WHERE a.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own email attachments" ON email_attachments
  FOR INSERT WITH CHECK (
    message_id IN (
      SELECT m.id FROM email_messages m
      JOIN email_threads t ON m.thread_id = t.id
      JOIN email_accounts a ON t.account_id = a.id
      WHERE a.user_id = auth.uid()
    )
  );

