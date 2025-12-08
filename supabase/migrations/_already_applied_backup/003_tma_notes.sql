-- ================================================
-- TMA NOTES MIGRATION
-- Multi-author notes with attribution for TMA candidates
-- ================================================

-- TMA notes table
CREATE TABLE IF NOT EXISTS tma_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tma_id UUID NOT NULL REFERENCES tma_candidates(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tma_notes_tma ON tma_notes(tma_id);
CREATE INDEX IF NOT EXISTS idx_tma_notes_author ON tma_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_tma_notes_created ON tma_notes(created_at DESC);

-- Enable RLS
ALTER TABLE tma_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Team members can view/add notes on TMA candidates they have access to
CREATE POLICY "Team members can view tma notes" ON tma_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tma_candidates t
      WHERE t.id = tma_notes.tma_id
        AND t.team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Team members can insert tma notes" ON tma_notes
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tma_candidates t
      WHERE t.id = tma_notes.tma_id
        AND t.team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Authors can update own tma notes" ON tma_notes
  FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY "Authors can delete own tma notes" ON tma_notes
  FOR DELETE USING (author_id = auth.uid());

