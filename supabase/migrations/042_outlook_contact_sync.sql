-- ================================================
-- Outlook Contact Sync: Microsoft Graph Integration
-- ================================================
-- This migration adds columns to support incremental sync of contacts
-- from Outlook via Microsoft Graph, and tracking of contact sources.

-- ================================================
-- 1. Add sync state columns to email_accounts
-- ================================================
ALTER TABLE email_accounts
ADD COLUMN IF NOT EXISTS contacts_delta_token TEXT NULL,
ADD COLUMN IF NOT EXISTS contacts_last_sync_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS contacts_sync_error TEXT NULL;

COMMENT ON COLUMN email_accounts.contacts_delta_token IS 'Delta token for incremental Graph /contacts sync';
COMMENT ON COLUMN email_accounts.contacts_last_sync_at IS 'Last successful contacts sync timestamp';
COMMENT ON COLUMN email_accounts.contacts_sync_error IS 'Last contacts sync error message if any';

-- ================================================
-- 2. Add source tracking columns to contacts
-- ================================================
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS source TEXT NULL,
ADD COLUMN IF NOT EXISTS source_account_id UUID NULL REFERENCES email_accounts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_graph_contact_id TEXT NULL;

COMMENT ON COLUMN contacts.source IS 'Import source: "outlook", "csv", or null (manual)';
COMMENT ON COLUMN contacts.source_account_id IS 'FK to email_accounts for Outlook-imported contacts';
COMMENT ON COLUMN contacts.source_graph_contact_id IS 'Microsoft Graph contact ID for deduplication';

-- ================================================
-- 3. Add normalized fields for fast dedupe lookups
-- ================================================
-- Normalized phone: digits only (no +, spaces, dashes)
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS normalized_phone_digits TEXT GENERATED ALWAYS AS (
  CASE
    WHEN phone IS NULL OR length(btrim(phone)) = 0 THEN NULL
    ELSE regexp_replace(phone, '[^0-9]', '', 'g')
  END
) STORED;

-- Normalized name: lowercase trimmed company_name
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS normalized_name TEXT GENERATED ALWAYS AS (
  CASE
    WHEN company_name IS NULL OR length(btrim(company_name)) = 0 THEN NULL
    ELSE lower(btrim(company_name))
  END
) STORED;

-- Email domain: lowercase substring after @
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS email_domain TEXT GENERATED ALWAYS AS (
  CASE
    WHEN email IS NULL OR email NOT LIKE '%@%' THEN NULL
    ELSE lower(split_part(email, '@', 2))
  END
) STORED;

COMMENT ON COLUMN contacts.normalized_phone_digits IS 'Digits-only phone for dedup matching';
COMMENT ON COLUMN contacts.normalized_name IS 'Lowercase trimmed company name for dedup matching';
COMMENT ON COLUMN contacts.email_domain IS 'Email domain for dedup matching';

-- ================================================
-- 4. Add indexes for fast dedupe lookups
-- ================================================
CREATE INDEX IF NOT EXISTS idx_contacts_normalized_phone ON contacts(team_id, normalized_phone_digits)
  WHERE normalized_phone_digits IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_normalized_name ON contacts(team_id, normalized_name)
  WHERE normalized_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_email_domain ON contacts(team_id, email_domain)
  WHERE email_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_source_graph_id ON contacts(source_graph_contact_id)
  WHERE source_graph_contact_id IS NOT NULL;

-- ================================================
-- 5. Index on email_accounts for contacts sync lookup
-- ================================================
CREATE INDEX IF NOT EXISTS idx_email_accounts_contacts_sync ON email_accounts(contacts_last_sync_at)
  WHERE contacts_delta_token IS NOT NULL;

