-- ================================================
-- Add email to profiles + open RLS for authenticated users
-- Enables email recipient autocomplete for compose
-- ================================================

-- 1) Add email column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2) Create index for fast email/name searches
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON profiles(full_name);

-- 3) Backfill existing users from auth.users
-- NOTE: This uses admin privileges; run in Supabase SQL editor or via supabase db push
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL
  AND u.email IS NOT NULL;

-- 4) Update the trigger function to also copy email on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, team_id, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    (NEW.raw_user_meta_data->>'team_id')::UUID,
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Adjust RLS: allow any authenticated user to SELECT limited fields from all profiles
-- Drop the restrictive "own profile only" SELECT policy
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Create a new policy allowing any authenticated user to read all profiles
CREATE POLICY "Authenticated users can view all profiles" ON profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Keep existing policies for INSERT/UPDATE (users can only modify their own)
-- They already exist from profiles.sql, no changes needed

-- 6) (Optional) Add a trigger to keep email in sync if user changes email in auth.users
-- This is a nice-to-have; for now, email is set on signup and can be updated manually

