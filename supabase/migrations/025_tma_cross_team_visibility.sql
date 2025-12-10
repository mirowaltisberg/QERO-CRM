-- Allow all authenticated users to view ALL TMA candidates (cross-team visibility)
-- This enables the team filter in the UI while allowing users to see candidates from all teams

-- Drop the restrictive team-only view policy
DROP POLICY IF EXISTS "Team members can view team tma" ON tma_candidates;

-- Create new policy allowing all authenticated users to view all TMA candidates
CREATE POLICY "Authenticated users can view all tma" ON tma_candidates
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Note: Update/Insert/Delete policies remain team-scoped for data integrity
-- Users can only modify candidates from their own team
