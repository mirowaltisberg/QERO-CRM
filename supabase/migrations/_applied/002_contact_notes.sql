-- ================================================
-- CONTACT NOTES MIGRATION
-- Multi-author notes with attribution
-- ================================================

-- Contact notes table (replaces single notes field)
CREATE TABLE IF NOT EXISTS contact_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON contact_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_author ON contact_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_created ON contact_notes(created_at DESC);

-- Enable RLS
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Team members can view/add notes on contacts they have access to
CREATE POLICY "Team members can view contact notes" ON contact_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_notes.contact_id
        AND c.team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Team members can insert contact notes" ON contact_notes
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_notes.contact_id
        AND c.team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Authors can update own notes" ON contact_notes
  FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY "Authors can delete own notes" ON contact_notes
  FOR DELETE USING (author_id = auth.uid());

-- Migrate existing notes from contacts table to contact_notes
-- This creates a note entry for each contact that has notes, attributed to a default user
-- You may want to run this manually or skip if you want fresh start
-- INSERT INTO contact_notes (contact_id, author_id, content, created_at)
-- SELECT c.id, p.id, c.notes, c.created_at
-- FROM contacts c
-- CROSS JOIN (SELECT id FROM profiles LIMIT 1) p
-- WHERE c.notes IS NOT NULL AND c.notes != '';

