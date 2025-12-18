-- ================================================
-- Deleted Contacts Archive + Cleanup Audit Log
-- ================================================
-- Stores snapshots of deleted companies (contacts) for auditing and potential restore
-- Also tracks cleanup operations (encoding fixes, duplicate merges)

-- ================================================
-- DELETED CONTACTS ARCHIVE TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS deleted_contacts_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Original contact data
  original_contact_id UUID NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  
  -- Deletion metadata
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('dedupe_merge', 'manual_delete', 'bulk_delete')),
  run_id UUID, -- Groups deletions from a single cleanup run
  
  -- Primary contact ID if this was merged into another
  merged_into_contact_id UUID,
  
  -- Full snapshot of the deleted contact (JSON)
  contact_snapshot JSONB NOT NULL,
  
  -- Related data snapshots (JSON arrays)
  contact_persons_snapshot JSONB DEFAULT '[]'::JSONB,
  contact_notes_snapshot JSONB DEFAULT '[]'::JSONB,
  vacancies_snapshot JSONB DEFAULT '[]'::JSONB,
  user_contact_settings_snapshot JSONB DEFAULT '[]'::JSONB,
  list_members_snapshot JSONB DEFAULT '[]'::JSONB,
  email_drafts_snapshot JSONB DEFAULT '[]'::JSONB,
  email_threads_snapshot JSONB DEFAULT '[]'::JSONB,
  whatsapp_conversations_snapshot JSONB DEFAULT '[]'::JSONB,
  call_logs_snapshot JSONB DEFAULT '[]'::JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deleted_contacts_team ON deleted_contacts_archive(team_id);
CREATE INDEX IF NOT EXISTS idx_deleted_contacts_deleted_at ON deleted_contacts_archive(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_contacts_deleted_by ON deleted_contacts_archive(deleted_by);
CREATE INDEX IF NOT EXISTS idx_deleted_contacts_run_id ON deleted_contacts_archive(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deleted_contacts_reason ON deleted_contacts_archive(reason);

-- ================================================
-- CLEANUP RUNS AUDIT LOG
-- ================================================
CREATE TABLE IF NOT EXISTS contact_cleanup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Run metadata
  type TEXT NOT NULL CHECK (type IN ('encoding_fix', 'dedupe_merge')),
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  executed_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Results summary (JSON)
  summary JSONB NOT NULL,
  
  -- For encoding fixes: count of records updated per table
  -- For dedupe merges: count of groups merged, contacts deleted
  
  -- Status
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'partial'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cleanup_runs_team ON contact_cleanup_runs(team_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_runs_type ON contact_cleanup_runs(type);
CREATE INDEX IF NOT EXISTS idx_cleanup_runs_executed_at ON contact_cleanup_runs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cleanup_runs_executed_by ON contact_cleanup_runs(executed_by);

-- ================================================
-- RLS POLICIES
-- ================================================
ALTER TABLE deleted_contacts_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_cleanup_runs ENABLE ROW LEVEL SECURITY;

-- Only allow authenticated users in the same team to view archived contacts
CREATE POLICY "Team members can view deleted contacts archive"
  ON deleted_contacts_archive FOR SELECT
  USING (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

-- Inserts/updates are done via service role (admin client), so no INSERT/UPDATE policies needed

-- Cleanup runs: team members can view
CREATE POLICY "Team members can view cleanup runs"
  ON contact_cleanup_runs FOR SELECT
  USING (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

-- ================================================
-- COMMENTS
-- ================================================
COMMENT ON TABLE deleted_contacts_archive IS 'Archive of deleted company contacts with full snapshots for auditing and potential restore';
COMMENT ON COLUMN deleted_contacts_archive.contact_snapshot IS 'Full JSON snapshot of the contacts table row at time of deletion';
COMMENT ON COLUMN deleted_contacts_archive.contact_persons_snapshot IS 'Array of contact_persons rows associated with this contact';
COMMENT ON COLUMN deleted_contacts_archive.run_id IS 'Groups deletions from a single cleanup operation for batch restore';

COMMENT ON TABLE contact_cleanup_runs IS 'Audit log of data cleanup operations (encoding fixes, duplicate merges)';
COMMENT ON COLUMN contact_cleanup_runs.summary IS 'JSON summary of changes made (tables affected, row counts, etc.)';
