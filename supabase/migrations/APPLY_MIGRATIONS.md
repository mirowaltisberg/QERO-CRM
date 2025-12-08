# How to Apply Migrations to Production

## ⚠️ CRITICAL: Migration 021 Must Be Applied

The personal follow-ups feature (Task 19) requires migration `021_personal_followups.sql` to be applied to the production Supabase database.

**Without this migration, status and follow-up buttons will not work.**

## Quick Check: Is Migration Applied?

Run this query in Supabase SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('user_contact_settings', 'user_tma_settings');
```

- If you see 2 rows → Migration is applied ✅
- If you see 0 rows → Migration needs to be applied ❌

## How to Apply Migration 021

### Option 1: Supabase Dashboard (Recommended)

1. Go to Supabase Dashboard → Your Project → SQL Editor
2. Click "New Query"
3. Copy the entire contents of `021_personal_followups.sql`
4. Paste into the SQL Editor
5. Click "Run" or press `Cmd/Ctrl + Enter`
6. Verify: Run the check query above

### Option 2: Supabase CLI

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link to your project (one-time setup)
supabase link --project-ref YOUR_PROJECT_REF

# Apply all pending migrations
supabase db push
```

## After Applying

1. Redeploy the application (or it will auto-deploy from git push)
2. Test status buttons ("Working", "Hot") - they should work immediately
3. Test follow-up scheduling - should store per-user
4. Verify different users see different statuses for the same contact

## Migrations in This Project

Migrations in `_applied/` folder have been applied to production.
Migrations in the root `migrations/` folder may or may not be applied.

Always check before deploying features that depend on new database schema.
