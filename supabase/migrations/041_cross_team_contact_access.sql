-- Migration: Cross-Team Contact Access
-- Allow users to view contacts from all teams (read-only cross-team)
-- Keep write operations team-restricted

-- Drop existing team-restricted SELECT policy
DROP POLICY IF EXISTS "Team members can view team contacts" ON contacts;

-- Create new permissive SELECT policy
-- All authenticated users can view all contacts regardless of team
CREATE POLICY "Authenticated users can view all contacts" ON contacts
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Verify other policies remain unchanged (team-restricted writes)
-- These should already exist from migration 001_teams.sql:
-- - "Team members can update team contacts" (UPDATE restricted to user's team)
-- - "Team members can insert team contacts" (INSERT restricted to user's team)
-- - "Team members can delete team contacts" (DELETE restricted to user's team)

-- Add comment for documentation
COMMENT ON POLICY "Authenticated users can view all contacts" ON contacts IS 
  'Allows all authenticated users to view contacts from any team. Write operations remain team-restricted.';
