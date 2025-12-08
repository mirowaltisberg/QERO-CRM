-- Check if user_contact_settings table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'user_contact_settings'
) as user_contact_settings_exists;

-- Check if user_tma_settings table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'user_tma_settings'
) as user_tma_settings_exists;

-- Check columns in user_contact_settings
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'user_contact_settings'
ORDER BY ordinal_position;

-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('user_contact_settings', 'user_tma_settings');

-- Check policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('user_contact_settings', 'user_tma_settings');
