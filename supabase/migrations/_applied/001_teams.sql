

-- ================================================
-- TEAMS MIGRATION
-- Multi-team architecture by industry vertical
-- ================================================

-- Organizations (top-level, for future multi-org support)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default organization
INSERT INTO organizations (id, name) VALUES 
  ('00000000-0000-0000-0000-000000000001', 'QERO AG')
ON CONFLICT (id) DO NOTHING;

-- Teams (industry verticals)
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the 5 industry verticals
INSERT INTO teams (id, organization_id, name, color) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Elektro', '#FFD700'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Holz', '#8B4513'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Metall/Plattenleger', '#708090'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Gartenbau', '#228B22'),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'Sanitär Heizung', '#4169E1')
ON CONFLICT (id) DO NOTHING;

-- Add team_id to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Add team_id to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Add team_id to tma_candidates
ALTER TABLE tma_candidates ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Migrate existing contacts to Elektro team
UPDATE contacts SET team_id = '00000000-0000-0000-0000-000000000010' WHERE team_id IS NULL;

-- Migrate existing TMA candidates to Elektro team
UPDATE tma_candidates SET team_id = '00000000-0000-0000-0000-000000000010' WHERE team_id IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_team ON profiles(team_id);
CREATE INDEX IF NOT EXISTS idx_contacts_team ON contacts(team_id);
CREATE INDEX IF NOT EXISTS idx_tma_team ON tma_candidates(team_id);
CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(organization_id);

-- ================================================
-- RLS POLICIES (update existing or create new)
-- ================================================

-- Enable RLS on teams
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Everyone can read teams (for registration dropdown)
CREATE POLICY "Anyone can view teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Anyone can view organizations" ON organizations FOR SELECT USING (true);

-- Contacts: users can only see contacts in their team
-- First drop existing policies if any
DROP POLICY IF EXISTS "Team members can view team contacts" ON contacts;
DROP POLICY IF EXISTS "Team members can update team contacts" ON contacts;
DROP POLICY IF EXISTS "Team members can insert team contacts" ON contacts;
DROP POLICY IF EXISTS "Team members can delete team contacts" ON contacts;

-- Create new team-scoped policies
CREATE POLICY "Team members can view team contacts" ON contacts
  FOR SELECT USING (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Team members can update team contacts" ON contacts
  FOR UPDATE USING (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Team members can insert team contacts" ON contacts
  FOR INSERT WITH CHECK (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Team members can delete team contacts" ON contacts
  FOR DELETE USING (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

-- TMA candidates: same team-scoped policies
DROP POLICY IF EXISTS "Team members can view team tma" ON tma_candidates;
DROP POLICY IF EXISTS "Team members can update team tma" ON tma_candidates;
DROP POLICY IF EXISTS "Team members can insert team tma" ON tma_candidates;
DROP POLICY IF EXISTS "Team members can delete team tma" ON tma_candidates;

CREATE POLICY "Team members can view team tma" ON tma_candidates
  FOR SELECT USING (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Team members can update team tma" ON tma_candidates
  FOR UPDATE USING (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Team members can insert team tma" ON tma_candidates
  FOR INSERT WITH CHECK (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Team members can delete team tma" ON tma_candidates
  FOR DELETE USING (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

