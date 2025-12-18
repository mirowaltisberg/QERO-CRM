# Task 34: Cross-Team Company Access - Implementation Summary

## Version: v1.53.0

## Overview
Implemented cross-team company (contacts/Firmen) access with team filtering. Users can now view contacts from all teams while maintaining a default filter to their own team.

## What Changed

### 1. Database (Migration Required) ⚠️
**File:** `supabase/migrations/041_cross_team_contact_access.sql`

**Changes:**
- Relaxed RLS SELECT policy on `contacts` table
- Old policy: Users could only see contacts where `team_id` matched their profile
- New policy: All authenticated users can SELECT contacts from any team
- Write operations (INSERT/UPDATE/DELETE) remain team-restricted

**⚠️ IMPORTANT:** This migration must be applied before deployment:
```bash
# Option 1: Via Supabase CLI (recommended)
cd /Users/miro/Desktop/QERO_CRM
supabase db push

# Option 2: Manual SQL execution
# Run the SQL from supabase/migrations/041_cross_team_contact_access.sql in Supabase dashboard
```

### 2. Backend Changes

**Server Data Service** (`src/lib/data/server-data-service.ts`):
- Added team filtering logic with 3 modes:
  - No `teamId` param → defaults to user's team
  - `teamId: "all"` → returns all teams
  - `teamId: "<uuid>"` → returns specific team
- Added team join to fetch team name/color with contacts

**API Routes:**
- `/api/contacts` - accepts `?team=all` or `?team=<uuid>` query param
- `/api/teams` - new endpoint to fetch all teams
- `/api/contacts/fix-encoding` - accepts `?all_teams=true` (admin only)
- `/api/contacts/dedupe` - accepts `?all_teams=true` (admin only)

**Types & Validation:**
- Added `teamId?: string | "all" | null` to `ContactFilters`
- Updated Zod schema to validate team UUIDs or "all"

### 3. Frontend Changes

**New Component:** `src/components/contacts/TeamFilter.tsx`
- Dropdown showing "My Team", "All Teams", and individual teams
- Displays team colors as indicators
- Updates URL params on selection

**Calling Page** (`src/app/calling/page.tsx`):
- Reads `?team` from URL search params
- Passes to server service for filtering
- Passes current user's team ID to CallingView

**CallingView** (`src/components/calling/CallingView.tsx`):
- Integrated TeamFilter component
- Handles team filter changes via URL navigation

**Contacts Page** (`src/app/contacts/page.tsx`):
- Reads `?team` from URL search params
- Passes to server service for filtering
- Passes current user's team ID to ContactsTable

**ContactsTable** (`src/components/contacts/ContactsTable.tsx`):
- Integrated TeamFilter component
- Handles team filter changes via URL navigation

### 4. Translations

**German** (`src/i18n/messages/de.json`):
```json
{
  "contact.teamFilter": {
    "label": "Team",
    "myTeam": "Mein Team",
    "allTeams": "Alle Teams"
  },
  "cleanup": {
    "allTeamsCheckbox": "Auf alle Teams anwenden",
    "allTeamsWarning": "Dies betrifft {count} Firmen in {teamCount} Teams"
  }
}
```

**English** (`src/i18n/messages/en.json`):
```json
{
  "contact.teamFilter": {
    "label": "Team",
    "myTeam": "My Team",
    "allTeams": "All Teams"
  },
  "cleanup": {
    "allTeamsCheckbox": "Apply to all teams",
    "allTeamsWarning": "This will affect {count} companies across {teamCount} teams"
  }
}
```

## How It Works

### For Regular Users
1. By default, users see contacts from their own team (existing behavior preserved)
2. Team filter dropdown in Calling and Contacts pages
3. Options: "Mein Team (Teamname)", "Alle Teams", individual team names
4. Selection persists via URL params (`?team=all` or `?team=<uuid>`)
5. Page re-renders server-side with new team data
6. Personal settings (status, follow-ups) work across teams (user-specific)

### For Admins
1. All regular user features
2. Can run encoding fix on all teams: `GET/POST /api/contacts/fix-encoding?all_teams=true`
3. Can run dedupe on all teams: `GET/POST /api/contacts/dedupe?all_teams=true`
4. Unauthorized users attempting `all_teams=true` get 403 Forbidden
5. Default behavior (no param): operates on admin's team only

### URL Structure
- `/calling` - shows user's team (default)
- `/calling?team=all` - shows all teams
- `/calling?team=<uuid>` - shows specific team
- Same for `/contacts`

## Security

### RLS (Row-Level Security)
- **SELECT**: Open to all authenticated users
- **INSERT**: Team-restricted (user can only insert to their team)
- **UPDATE**: Team-restricted (user can only update their team's contacts)
- **DELETE**: Team-restricted (user can only delete their team's contacts)

### Admin Operations
- Only users in `cleanup-auth.ts` allowlist can run cleanup operations
- `all_teams=true` checked against same allowlist
- Non-admins get 403 Forbidden

### Personal Settings
- `user_contact_settings` RLS remains unchanged
- User can set status/follow-ups on any contact (including cross-team)
- Settings are user-specific (not leaked to other users)

## Testing Checklist

### Prerequisites
- [ ] Apply database migration `041_cross_team_contact_access.sql`
- [ ] Deploy application

### Regular User Testing
- [ ] Open `/calling` - should see own team by default
- [ ] Click team filter dropdown - should see "Mein Team", "Alle Teams", other teams
- [ ] Select "Alle Teams" - URL changes to `?team=all`, page shows all contacts
- [ ] Select a specific team - URL changes to `?team=<uuid>`, page shows that team
- [ ] Set status on a cross-team contact - should work and persist
- [ ] Reload page - team filter selection persists via URL
- [ ] Repeat for `/contacts` page

### Admin Testing
- [ ] Run encoding fix preview: `GET /api/contacts/fix-encoding?all_teams=true`
- [ ] Should see counts across all teams
- [ ] Run encoding fix apply: `POST /api/contacts/fix-encoding?all_teams=true`
- [ ] Should fix issues across all teams
- [ ] Run dedupe preview: `GET /api/contacts/dedupe?all_teams=true`
- [ ] Should see duplicates across all teams
- [ ] Run dedupe apply: `POST /api/contacts/dedupe?all_teams=true`
- [ ] Should merge duplicates across all teams

### Edge Cases
- [ ] User with `currentUserTeamId: null` - filter defaults to "all"
- [ ] Personal settings work on contacts from other teams
- [ ] Canton filter works with "All Teams" selected
- [ ] Search works with "All Teams" selected
- [ ] Pagination works with large datasets

## Future Enhancements (Deferred)

### Task 34.9: Cleanup Modal UI
- Add "Apply to all teams" checkbox in CleanupModal component
- Show warning: "This will affect X companies across Y teams"
- Only visible to admins

### Task 34.10: Team Badges
- Display team color badge next to company name in lists
- Data is already joined (`contact.team.name`, `contact.team.color`)
- Just needs UI component

## Rollback Plan

If issues arise after deployment:

1. **Revert RLS policy:**
```sql
DROP POLICY IF EXISTS "Authenticated users can view all contacts" ON contacts;

CREATE POLICY "Team members can view team contacts" ON contacts
  FOR SELECT USING (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );
```

2. **Redeploy previous version** (v1.52.0)

## Files Changed

### Database
- `supabase/migrations/041_cross_team_contact_access.sql` (NEW)

### Backend
- `src/lib/types.ts` (MODIFIED)
- `src/lib/validation/schemas.ts` (MODIFIED)
- `src/lib/data/server-data-service.ts` (MODIFIED)
- `src/app/api/contacts/route.ts` (MODIFIED)
- `src/app/api/contacts/fix-encoding/route.ts` (MODIFIED)
- `src/app/api/contacts/dedupe/route.ts` (MODIFIED)
- `src/app/api/teams/route.ts` (NEW)

### Frontend
- `src/components/contacts/TeamFilter.tsx` (NEW)
- `src/app/calling/page.tsx` (MODIFIED)
- `src/components/calling/CallingView.tsx` (MODIFIED)
- `src/app/contacts/page.tsx` (MODIFIED)
- `src/components/contacts/ContactsTable.tsx` (MODIFIED)

### Translations
- `src/i18n/messages/de.json` (MODIFIED)
- `src/i18n/messages/en.json` (MODIFIED)

### Version
- `src/components/layout/Sidebar.tsx` (MODIFIED - version to v1.53.0)

## Build Status
✅ Build passes successfully
✅ TypeScript compilation clean
✅ No linting errors
✅ All existing functionality preserved
