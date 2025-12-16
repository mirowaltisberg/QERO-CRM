# Legacy Notes Migration Guide

This guide will help you migrate all legacy notes from the old single-field system (`contacts.notes` and `tma_candidates.notes`) to the new multi-author notes system (`contact_notes` and `tma_notes` tables).

## Overview

**Old System:**
- Each contact/TMA candidate had a single `notes` TEXT field
- No authorship tracking
- No update history

**New System:**
- Multiple notes per contact/TMA candidate
- Each note has an author (tracked via `author_id`)
- Notes have timestamps and can be edited/deleted
- Full attribution and history

## Before You Start

1. **Backup your data** - Always recommended before any migration
2. **Check status** - Run the status check script to see what will be migrated

## Step-by-Step Instructions

### Step 1: Check What Will Be Migrated

Run this query in Supabase SQL Editor to see how many legacy notes exist:

```sql
-- File: CHECK_LEGACY_NOTES_STATUS.sql
-- Copy and paste the entire contents of this file
```

This will show you:
- How many contacts have legacy notes
- How many TMA candidates have legacy notes
- Sample notes
- The default user who will be assigned as author

### Step 2: Run the Migration

Once you've reviewed the status, run the migration:

```sql
-- File: 036_migrate_all_legacy_notes.sql
-- Copy and paste the entire contents of this file
```

**What this does:**
1. Finds the first user in your system (oldest account)
2. Migrates all contact legacy notes to `contact_notes` table with that author
3. Clears the old `contacts.notes` field
4. Migrates all TMA candidate legacy notes to `tma_notes` table
5. Clears the old `tma_candidates.notes` field

**Safety features:**
- Won't duplicate notes (checks for existing identical content)
- Won't migrate empty/whitespace-only notes
- Uses transactions (all-or-nothing)
- Provides progress notices

### Step 3: Verify Results

Run these queries to verify the migration was successful:

```sql
-- Should return 0 (no legacy notes left)
SELECT COUNT(*) FROM contacts WHERE notes IS NOT NULL;
SELECT COUNT(*) FROM tma_candidates WHERE notes IS NOT NULL;

-- Should show all migrated notes
SELECT COUNT(*) FROM contact_notes;
SELECT COUNT(*) FROM tma_notes;

-- View some migrated notes
SELECT 
  cn.content,
  cn.created_at,
  p.full_name AS author,
  c.company_name
FROM contact_notes cn
JOIN contacts c ON cn.contact_id = c.id
JOIN profiles p ON cn.author_id = p.id
ORDER BY cn.created_at DESC
LIMIT 10;
```

## Alternative: Use Supabase CLI

If you have the Supabase CLI set up:

```bash
# Check status
psql $DATABASE_URL -f CHECK_LEGACY_NOTES_STATUS.sql

# Run migration
psql $DATABASE_URL -f 036_migrate_all_legacy_notes.sql
```

Or use `supabase db push`:

```bash
supabase db push
```

## Rollback (If Needed)

If something goes wrong, you can restore from backup. The migration script doesn't delete data, it just moves it, so you can manually restore the `notes` field if needed.

## Notes

- All legacy notes will be attributed to the oldest user account
- The migration is idempotent (safe to run multiple times)
- Legacy notes are preserved in the new system with original timestamps
- The old `notes` field will be cleared but not dropped from the schema (for backward compatibility)

## Support

If you encounter any issues:
1. Check Supabase logs for error messages
2. Verify RLS policies are correct
3. Ensure the profiles table has at least one user
4. Contact your development team for assistance
