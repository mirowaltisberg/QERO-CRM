-- Migration: Create contact_call_logs table for tracking call activity
-- This tracks when a contact was called, by whom, to show "last called" info

-- Create the table
CREATE TABLE IF NOT EXISTS contact_call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  called_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_contact_call_logs_contact_id ON contact_call_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_call_logs_called_at ON contact_call_logs(contact_id, called_at DESC);

-- Comments
COMMENT ON TABLE contact_call_logs IS 'Tracks when contacts were called and by whom';
COMMENT ON COLUMN contact_call_logs.contact_id IS 'The contact that was called';
COMMENT ON COLUMN contact_call_logs.user_id IS 'The user who made the call';
COMMENT ON COLUMN contact_call_logs.called_at IS 'When the call was made';

-- Enable RLS
ALTER TABLE contact_call_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Team members can view call logs for their team's contacts
CREATE POLICY "Team members can view call logs" ON contact_call_logs
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM contacts c 
    WHERE c.id = contact_call_logs.contact_id 
    AND c.team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  )
);

-- Authenticated users can insert call logs for their team's contacts
CREATE POLICY "Authenticated users can insert call logs" ON contact_call_logs
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM contacts c 
    WHERE c.id = contact_call_logs.contact_id 
    AND c.team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  )
);

-- Users can delete their own call logs (optional, for cleanup)
CREATE POLICY "Users can delete own call logs" ON contact_call_logs
FOR DELETE USING (user_id = auth.uid());

