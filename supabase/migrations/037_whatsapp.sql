-- ================================================
-- WhatsApp Business Cloud API Integration
-- ================================================

-- WhatsApp Business Account configuration
-- Stores WABA credentials (usually just one per organization)
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Primary',
  waba_id TEXT NOT NULL,                     -- WhatsApp Business Account ID
  phone_number_id TEXT NOT NULL,             -- Phone Number ID from Meta
  phone_number TEXT NOT NULL,                -- Display phone number (e.g. +41...)
  is_active BOOLEAN DEFAULT TRUE,
  webhook_verify_token TEXT,                 -- For webhook verification
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(waba_id, phone_number_id)
);

-- Note: Access token should be stored in environment variables, NOT in the database

-- WhatsApp conversations: one per phone number + linked entity
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL,                       -- WhatsApp ID (phone number without +)
  phone_number TEXT NOT NULL,                -- Formatted phone number (e.g. +41791234567)
  profile_name TEXT,                         -- WhatsApp profile name (from webhook)
  
  -- CRM linkage (at least one should be set)
  linked_tma_id UUID REFERENCES tma_candidates(id) ON DELETE SET NULL,
  linked_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Conversation state
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_unread BOOLEAN DEFAULT TRUE,
  unread_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  
  -- 24h window tracking
  last_customer_message_at TIMESTAMPTZ,      -- For determining if we can send freeform messages
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, wa_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_conversations_account ON whatsapp_conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_tma ON whatsapp_conversations(linked_tma_id) WHERE linked_tma_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conversations_contact ON whatsapp_conversations(linked_contact_id) WHERE linked_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conversations_assigned ON whatsapp_conversations(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conversations_unread ON whatsapp_conversations(is_unread) WHERE is_unread = TRUE;
CREATE INDEX IF NOT EXISTS idx_wa_conversations_last_msg ON whatsapp_conversations(last_message_at DESC);

-- Message direction enum
DO $$ BEGIN
  CREATE TYPE whatsapp_message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Message status enum (follows WhatsApp status webhooks)
DO $$ BEGIN
  CREATE TYPE whatsapp_message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Message type enum
DO $$ BEGIN
  CREATE TYPE whatsapp_message_type AS ENUM ('text', 'template', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'contacts', 'interactive', 'reaction', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- WhatsApp messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  
  -- WhatsApp message identifiers (for idempotency)
  wamid TEXT UNIQUE,                         -- WhatsApp Message ID (from API response or webhook)
  
  direction whatsapp_message_direction NOT NULL,
  message_type whatsapp_message_type NOT NULL DEFAULT 'text',
  status whatsapp_message_status NOT NULL DEFAULT 'pending',
  
  -- Content
  body TEXT,                                 -- Text content or caption
  template_name TEXT,                        -- If sent via template
  template_params JSONB,                     -- Template parameters
  
  -- Sender info
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- For outbound: who sent it
  
  -- Timestamps
  sent_at TIMESTAMPTZ,                       -- When the message was sent
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_code TEXT,                           -- WhatsApp error code if failed
  error_message TEXT,                        -- Error details
  
  -- Raw webhook data (for debugging)
  raw_payload JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_wamid ON whatsapp_messages(wamid) WHERE wamid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_wa_messages_created ON whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_template ON whatsapp_messages(template_name) WHERE template_name IS NOT NULL;

-- WhatsApp media attachments
CREATE TABLE IF NOT EXISTS whatsapp_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES whatsapp_messages(id) ON DELETE CASCADE,
  
  -- WhatsApp media identifiers
  wa_media_id TEXT,                          -- WhatsApp media ID (for downloading)
  
  -- File info
  mime_type TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,                         -- Size in bytes
  sha256 TEXT,                               -- WhatsApp-provided hash
  
  -- Storage
  storage_path TEXT,                         -- Path in Supabase Storage bucket
  storage_url TEXT,                          -- Public or signed URL
  
  -- For documents
  caption TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_media_message ON whatsapp_media(message_id);
CREATE INDEX IF NOT EXISTS idx_wa_media_wa_id ON whatsapp_media(wa_media_id) WHERE wa_media_id IS NOT NULL;

-- WhatsApp opt-in records (for compliance when messaging customers/leads)
CREATE TABLE IF NOT EXISTS whatsapp_optins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  wa_id TEXT NOT NULL,
  
  -- Linkage
  linked_tma_id UUID REFERENCES tma_candidates(id) ON DELETE SET NULL,
  linked_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  opted_in BOOLEAN DEFAULT TRUE,
  opted_in_at TIMESTAMPTZ DEFAULT NOW(),
  opted_out_at TIMESTAMPTZ,
  consent_source TEXT,                       -- e.g. 'form', 'reply', 'manual'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wa_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_optins_phone ON whatsapp_optins(phone_number);
CREATE INDEX IF NOT EXISTS idx_wa_optins_tma ON whatsapp_optins(linked_tma_id) WHERE linked_tma_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_optins_contact ON whatsapp_optins(linked_contact_id) WHERE linked_contact_id IS NOT NULL;

-- ================================================
-- RLS Policies
-- ================================================

ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_optins ENABLE ROW LEVEL SECURITY;

-- WhatsApp accounts: all authenticated users can read (need to send messages)
CREATE POLICY "Authenticated users can view whatsapp accounts"
  ON whatsapp_accounts FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins/service role can modify accounts
-- (Service role bypasses RLS, so no explicit INSERT/UPDATE/DELETE policies needed for server operations)

-- Conversations: all authenticated users can access
CREATE POLICY "Authenticated users can view conversations"
  ON whatsapp_conversations FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert conversations"
  ON whatsapp_conversations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update conversations"
  ON whatsapp_conversations FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Messages: all authenticated users can access
CREATE POLICY "Authenticated users can view messages"
  ON whatsapp_messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert messages"
  ON whatsapp_messages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update messages"
  ON whatsapp_messages FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Media: all authenticated users can access
CREATE POLICY "Authenticated users can view media"
  ON whatsapp_media FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert media"
  ON whatsapp_media FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Opt-ins: all authenticated users can access
CREATE POLICY "Authenticated users can view optins"
  ON whatsapp_optins FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert optins"
  ON whatsapp_optins FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update optins"
  ON whatsapp_optins FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ================================================
-- Triggers for updated_at
-- ================================================

CREATE OR REPLACE FUNCTION update_whatsapp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER whatsapp_accounts_updated_at
  BEFORE UPDATE ON whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER whatsapp_conversations_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER whatsapp_messages_updated_at
  BEFORE UPDATE ON whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER whatsapp_optins_updated_at
  BEFORE UPDATE ON whatsapp_optins
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

-- ================================================
-- Helper function to update conversation on new message
-- ================================================

CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE whatsapp_conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.body, 100),
    is_unread = CASE WHEN NEW.direction = 'inbound' THEN TRUE ELSE is_unread END,
    unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
    last_customer_message_at = CASE WHEN NEW.direction = 'inbound' THEN NEW.created_at ELSE last_customer_message_at END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_after_message
  AFTER INSERT ON whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();
