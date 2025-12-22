-- Migration: User Invitation System
-- Adds support for admin-created magic link invitations
-- Invited users must set password and enable 2FA on first login

-- Add onboarding flags to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS must_setup_2fa BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- Create invitations table to track pending invitations
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  invited_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

-- Index for looking up invitations by email
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email) WHERE status = 'pending';

-- Index for looking up invitations by inviter
CREATE INDEX IF NOT EXISTS idx_user_invitations_invited_by ON user_invitations(invited_by);

-- RLS for user_invitations
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Only admins can view invitations (we'll check admin status in API)
CREATE POLICY "Authenticated users can view their sent invitations" ON user_invitations
  FOR SELECT USING (invited_by = auth.uid());

-- Admins can insert invitations (checked in API)
CREATE POLICY "Authenticated users can create invitations" ON user_invitations
  FOR INSERT WITH CHECK (invited_by = auth.uid());

-- Allow updating invitation status
CREATE POLICY "System can update invitations" ON user_invitations
  FOR UPDATE USING (true);

COMMENT ON TABLE user_invitations IS 'Tracks magic link invitations sent by admins to new users';
COMMENT ON COLUMN profiles.must_change_password IS 'If true, user must set a new password before accessing the app';
COMMENT ON COLUMN profiles.must_setup_2fa IS 'If true, user must enable 2FA before accessing the app';

