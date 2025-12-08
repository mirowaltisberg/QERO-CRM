-- Migration: Personal follow-ups and status per user (FIXED - idempotent)
-- This is a fixed version of 021 that handles already-existing objects

-- ================================================
-- USER CONTACT SETTINGS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS user_contact_settings (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT NULL CHECK (
    status IS NULL OR status IN ('hot', 'working', 'follow_up')
  ),
  follow_up_at TIMESTAMPTZ,
  follow_up_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, contact_id)
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_user_contact_settings_user ON user_contact_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_contact_settings_contact ON user_contact_settings(contact_id);
CREATE INDEX IF NOT EXISTS idx_user_contact_settings_followup ON user_contact_settings(user_id, follow_up_at) 
  WHERE follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_contact_settings_status ON user_contact_settings(user_id, status) 
  WHERE status IS NOT NULL;

-- Enable RLS
ALTER TABLE user_contact_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop and recreate to ensure they're correct)
DROP POLICY IF EXISTS "Users can view own contact settings" ON user_contact_settings;
CREATE POLICY "Users can view own contact settings" ON user_contact_settings
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own contact settings" ON user_contact_settings;
CREATE POLICY "Users can insert own contact settings" ON user_contact_settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own contact settings" ON user_contact_settings;
CREATE POLICY "Users can update own contact settings" ON user_contact_settings
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own contact settings" ON user_contact_settings;
CREATE POLICY "Users can delete own contact settings" ON user_contact_settings
  FOR DELETE USING (user_id = auth.uid());

-- ================================================
-- USER TMA SETTINGS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS user_tma_settings (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tma_id UUID NOT NULL REFERENCES tma_candidates(id) ON DELETE CASCADE,
  status TEXT DEFAULT NULL CHECK (
    status IS NULL OR status IN ('A', 'B', 'C')
  ),
  follow_up_at TIMESTAMPTZ,
  follow_up_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, tma_id)
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_user_tma_settings_user ON user_tma_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tma_settings_tma ON user_tma_settings(tma_id);
CREATE INDEX IF NOT EXISTS idx_user_tma_settings_followup ON user_tma_settings(user_id, follow_up_at) 
  WHERE follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_tma_settings_status ON user_tma_settings(user_id, status) 
  WHERE status IS NOT NULL;

-- Enable RLS
ALTER TABLE user_tma_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop and recreate to ensure they're correct)
DROP POLICY IF EXISTS "Users can view own tma settings" ON user_tma_settings;
CREATE POLICY "Users can view own tma settings" ON user_tma_settings
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own tma settings" ON user_tma_settings;
CREATE POLICY "Users can insert own tma settings" ON user_tma_settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own tma settings" ON user_tma_settings;
CREATE POLICY "Users can update own tma settings" ON user_tma_settings
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own tma settings" ON user_tma_settings;
CREATE POLICY "Users can delete own tma settings" ON user_tma_settings
  FOR DELETE USING (user_id = auth.uid());

-- Comments
COMMENT ON TABLE user_contact_settings IS 'Personal follow-up and status settings per user per contact';
COMMENT ON TABLE user_tma_settings IS 'Personal follow-up and status settings per user per TMA candidate';
