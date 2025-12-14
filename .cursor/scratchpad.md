# Background and Motivation
- Implement PWA (Progressive Web App) with Web Push Notifications ✅
- Allow users to install QERO CRM to their phone's home screen ✅
- Get push notifications when someone sends a chat message ✅
- Chat realtime stabilized ✅
- **Make follow-ups and status PERSONAL per user (not shared across team)** ✅
- New issue reported: repeated 400 errors on `POST /api/contacts/call-logs` plus realtime subscriptions flapping (SUBSCRIBED → CLOSED → SUBSCRIBED).
- New regression: personal status still shows "Not set" after reload (Task 19 not stable).
- **NEW: Task 25 - Complete Mobile UI Revamp** - Make the app feel native on iPhone 16 Pro/Pro Max
- **NEW: Improve Email client** - full email bodies (no cut off), correct recipients (no \"An Unbekannt\"), and conversation-based Inbox/Sent behavior

---

# Task 25: Mobile UI Revamp (Native iOS Feel)

## Goal
Transform the mobile experience to feel like a native iOS app, specifically optimized for iPhone 16 Pro/Pro Max.

## Current Problems
1. Desktop sidebar shows on mobile (except Chat) - cramped & unusable
2. No bottom tab navigation (standard iOS pattern)
3. List+Detail views lack proper slide transitions
4. No safe area handling for Dynamic Island or home indicator
5. Touch targets too small, spacing too tight

## High-level Task Breakdown

### Phase 1: Global Mobile Shell
- [ ] **1.1** Create `MobileNavBar` - iOS-style bottom tab bar (5 tabs: Calling, Companies, TMA, Email, Chat)
- [ ] **1.2** Modify `layout.tsx` - Sidebar for desktop (≥768px), MobileNavBar for mobile
- [ ] **1.3** Safe areas - `env(safe-area-inset-*)` for Dynamic Island + home indicator

### Phase 2: Calling Page Mobile  
- [ ] **2.1** Mobile detection + state management (`isMobile`, `mobileView: 'list' | 'detail'`)
- [ ] **2.2** Slide transitions (translateX) like ChatView
- [ ] **2.3** Mobile header with back button + contact name
- [ ] **2.4** Optimize ContactDetail for touch (44px targets, better spacing)

### Phase 3: TMA Page Mobile
- [ ] **3.1** List/detail split with transitions
- [ ] **3.2** Filters in collapsible sheet or pill bar
- [ ] **3.3** Candidate cards with key info visible

### Phase 4: Other Pages
- [ ] **4.1** Email - folder selector + thread transitions
- [ ] **4.2** Dashboard - single column cards
- [ ] **4.3** Settings/Profile - move to nav bar menu

### Design Specs
- **Bottom nav height**: 83px (49pt tabs + 34pt home indicator)
- **Touch targets**: min 44px
- **Transitions**: 300ms ease-out
- **Safe areas**: top (Dynamic Island ~59pt), bottom (home indicator ~34pt)

---

# Task 26: Global TMA Cache for Real-time Performance

## Problem
- TMA data only loads when visiting `/tma` page → first load is slow
- Realtime subscriptions only active on TMA page
- Claimed status changes may be missed if user is on another page
- Critical for business: accurate claiming prevents double-work

## Current Flow
```
User visits /tma → Server fetches all candidates → TmaView renders → Realtime subscription starts
```

## Solution: Global TMA Cache

### Architecture
```
App Mount (any authenticated page)
    ↓
TmaCacheProvider starts
    ↓
├── Fetch all TMA candidates immediately
├── Start realtime subscription (INSERT/UPDATE/DELETE)
├── Store in React Context
    ↓
TmaView / CommandPalette / etc. consume from cache (instant!)
```

### High-level Task Breakdown

- [x] **26.1** Create `TmaCacheContext` and `TmaCacheProvider` ✅
- [x] **26.2** Fetch TMA data on provider mount ✅
- [x] **26.3** Global realtime subscription ✅
- [x] **26.4** Integrate with TmaView ✅
- [x] **26.5** Integrate with CommandPalette ✅
- [x] **26.6** Add cache invalidation strategy ✅

**COMPLETED** - Deployed v1.06.0

### Key Design Decisions
- **Fetch on app load, not page load** - cache warms up immediately
- **Single source of truth** - one realtime subscription for all components
- **Optimistic updates** - UI reflects changes before server confirms
- **Graceful degradation** - if cache fails, fall back to server fetch

### Success Criteria
- [ ] TMA page loads instantly (data already in cache)
- [ ] Claimed status updates appear in <1 second everywhere
- [ ] No stale data shown (realtime updates work globally)
- [ ] Works across page navigations without re-fetching

---

# Key Challenges and Analysis

## Personal Follow-ups & Status ✅
Previously, `status`, `follow_up_at`, and `follow_up_note` were stored directly on the `contacts` and `tma_candidates` tables. This meant when User A set a follow-up, User B saw it too.

**Solution implemented:** Created junction tables that store per-user settings:

```sql
user_contact_settings (
  user_id     → profiles.id
  contact_id  → contacts.id  
  status      → 'hot' | 'working' | 'follow_up' | null
  follow_up_at → timestamp
  follow_up_note → text
)

user_tma_settings (
  user_id     → profiles.id
  tma_id      → tma_candidates.id
  status      → 'A' | 'B' | 'C' | null
  follow_up_at → timestamp
  follow_up_note → text
)
```

## New: Call-log POST 400 & realtime flapping
- Frontend logs show repeated `POST https://qero-crm.vercel.app/api/contacts/call-logs 400 (Bad Request)` while realtime channels flicker between SUBSCRIBED and CLOSED.
- Likely causes: payload missing required fields, validation mismatch between frontend and API, or auth/session issues causing Supabase RPC failure.
- Need to capture request payload/response body and inspect API handler schema/DB constraints; also verify realtime channel lifecycle (disconnections vs cleanup).

## Personal status still missing after reload (SSR/auth mismatch)
- Symptoms: Sidebar/header/Calling list show status as "Not set" on reload even though personal status was saved earlier.
- Hypothesis 1: API routes (`/api/contacts`, `/api/contacts/personal-settings`, `/api/contacts/[id]`) use the **browser** Supabase client (`createBrowserClient`), so in server context there is no session → RLS returns empty personal rows and `updateContactSettings` early-returns because `supabase.auth.getUser()` is null.
- Hypothesis 2: Server data merge (`server-data-service`) may not see a user in SSR requests (cookies/session missing), so personal settings are not merged into initial payload.
- Required: audit every call path that touches personal status/follow-up to ensure the right Supabase client (server vs browser) with cookies/session is used; add logging to verify `auth.getUser()` and row counts in server contexts.

# High-level Task Breakdown

## Task 19: Personal Follow-ups & Status ✅

### Step 1: Create database migration ✅
- Created `user_contact_settings` table
- Created `user_tma_settings` table
- Added indexes for efficient querying
- Set up RLS policies

### Step 2: Update Contacts API routes ✅
- Modified `data-service.ts` to merge personal settings with contact data
- Created `personal-settings-service.ts` for managing user-specific settings
- Status filter now works with personal settings

### Step 3: Update TMA API routes ✅
- Same pattern as contacts
- Personal status/follow-up merged with TMA data

### Step 4: Update Follow-ups API ✅
- Modified `/api/followups` to query from `user_contact_settings` and `user_tma_settings`
- Each user only sees their own follow-ups

### Step 5: Update types and test ✅
- Build passes
- TypeScript checks pass

## Task 20: Fix call-log 400s & realtime flapping ✅

### Step 1: Reproduce and capture payload/response ✅
- Root cause: Client sends >500 contact IDs in single batch, exceeds server limit (500 max per request).

### Step 2: Inspect API handler and validation ✅
- API handler correctly validates and rejects batches >500 contacts with 400 error.

### Step 3: Implement client-side batching ✅
- Created `chunkUnique` helper to batch contact IDs (max 200 per request, dedup, trim).
- Updated `CallingView` to fetch call logs in parallel batches under server limit.

### Step 4: Add tests ✅
- Created `tests/call-log-batching.test.ts` with node:test coverage for chunking logic.
- All tests pass (`npm test`).

### Step 5: Verify build and deploy ✅
- Build passes with no TypeScript/linting errors.
- Deployed to production (commit: 23673c7).

### Step 6: Manual verification (pending)
- Ready for testing in production - verify no more 400 errors and realtime channels stay stable.

## Task 23: Fix personal status SSR/auth (IN PROGRESS - PLANNING)
- Goal: personal status/follow-up must appear on first render (SSR) and after reload; updates must persist per-user via RLS.
- Success criteria:
  - `/api/contacts` and `/api/contacts/personal-settings` return personal status for the authenticated user.
  - `serverContactService.getAll()` merges personal settings on SSR (user detected, non-zero settings merged).
  - Setting status in Calling/Contacts persists after hard reload and across routes; Tag no longer shows "Not set".
  - RLS respected (no leakage of other users’ settings).

- Plan / steps:
  1) **Reproduce & instrument**: Hit `/api/contacts/personal-settings` and `/api/contacts` with an authenticated session; log `auth.getUser()` result, settings row count, and any RLS errors. Check server logs from `server-data-service` (existing console logs) to confirm user is null vs present in SSR.
  2) **Fix Supabase client usage in API routes**: Introduce a route-handler Supabase helper (server client with request cookies). Update `personal-settings-service` (or create server variant) and `contactService` to use the server client when called from API routes; remove browser client usage in server contexts.
  3) **Plumb clients through services**: Allow `contactService`/`personalSettingsService` to accept an injected Supabase client so API routes can pass the server client, while client components can still use the browser client if ever needed.
  4) **Re-test SSR merge**: Verify `serverContactService.getAll()` merges personal settings (user present) and that Calling/Contacts initial render shows the saved status.
  5) **Regression checks**: Confirm status updates still work, follow-up scheduling unaffected, and RLS still enforced. Add a lightweight node:test for the service merge helper (mocking settings map) if feasible; otherwise document manual verification steps.

# Project Status Board
- [x] Task 1-7: PWA & Push Notifications
- [x] Task 8-11: Chat Realtime Stability
- [x] Task 16: Favicon/Icons
- [x] Task 17: Batched call-logs
- [x] Task 18: Login CORS fix
- [x] **Task 19: Personal follow-ups & status** ✅ COMPLETE
- [x] **Task 20: Fix call-log 400s & realtime flapping** ✅ COMPLETE
- [x] **Task 21: Diagnose and fix non-working status/follow-up buttons** ✅ COMPLETE
- [x] **Task 23: Fix personal status SSR/auth merge** ✅ DEPLOYED (commit: 95cd4ea)
- [ ] **Task 27: Fix contact person emails not sending + diagnostics UI**
  - Add attempted/sent/failed recipients to send response and surface in UI
  - Normalize/validate emails, dedupe correctly, fetch contact persons fresh at send-time
  - Ensure prompts reject “call me back” phrasing

# Current Status / Progress Tracking
- **Task 20 COMPLETE** ✅
- **Task 21 COMPLETE** ✅
- Call-log 400 errors fixed: client-side batching prevents requests >500 IDs
- Status/follow-up button fix deployed (commit: a38da18)
  - Added detailed error logging to diagnose upsert failures
  - Removed auto-clear logic that interfered with independent status/follow-up
  - Created migration application guide in `supabase/migrations/APPLY_MIGRATIONS.md`

**✅ Migration 022 Successfully Applied to Production**

Migration `022_personal_followups_fix.sql` has been applied to production Supabase via `supabase db push`.
- Tables `user_contact_settings` and `user_tma_settings` exist ✅
- All indexes created ✅
- RLS policies recreated (ensured correct) ✅

**✅ TESTING COMPLETE - BUTTONS ARE WORKING!**

Tested in production (2025-12-08):
1. ✅ Clicked "Working" button → PATCH request successful (200 OK)
2. ✅ Status persisted when switching contacts and returning
3. ✅ Personal settings saved to `user_contact_settings` table
4. ✅ Server logs show `[Personal Settings]` logs (visible in Vercel logs, not browser console)

**Task 23: Fix Server Auth for Personal Settings** (IN PROGRESS - IMPLEMENTING)

Root cause identified: API routes were using browser Supabase client (`createBrowserClient`) which has no auth context on server. `auth.getUser()` returned null, so personal settings were never saved/fetched.

**Implementation completed:**
1. ✅ Created `src/lib/data/personal-settings-service-server.ts` - server-side service using `createClient` from `../supabase/server`
2. ✅ Updated `src/lib/data/server-data-service.ts`:
   - Added `getById`, `update`, `create`, `delete` methods to `serverContactService`
   - All methods use `serverPersonalSettingsService` for personal fields
3. ✅ Updated API routes to use server services:
   - `/api/contacts/route.ts` → `serverContactService`
   - `/api/contacts/[id]/route.ts` → `serverContactService`
   - `/api/contacts/import/route.ts` → `serverContactService`
   - `/api/contacts/personal-settings/route.ts` → `serverPersonalSettingsService`
4. ✅ Build passes with no errors

**✅ DEPLOYED (commit: 95cd4ea)**

**Task 27: Fix contact person emails not sending** (IN PROGRESS - EXECUTOR)
- Goal: Each contact person gets an individual email with correct greeting; send response returns attempted/sent/failed for UI; emails normalized/deduped; prompts avoid “call me back”.
- ✅ Implemented backend diagnostics: attempted/sent/failed recipients returned; invalid emails reported; normalization (trim/lowercase) and dedupe added; contact persons fetched fresh at send-time.
- ✅ Frontend now shows attempted/sent/failed with warning state; partial failures visible; send button only locks on full success.

---

## Email client improvements (IN PROGRESS)
- ✅ Added local Supabase migration `supabase/migrations/030_email_messages_folder.sql`:
  - Adds `email_messages.folder`
  - Ensures `email_messages.internet_message_id` exists
  - Adds indexes + best-effort backfill from `email_threads.folder`
- ✅ Updated email sync to always store/update: `folder`, `internet_message_id`, recipients/cc/bcc, and keep `email_threads` metadata fresh (participants/snippet/last_message_at).
- ✅ Updated `/api/email/threads` to be conversation-folder based (Inbox/Sent determined by existence of messages in that folder).
- ✅ Added `/api/email/message/[id]/hydrate` + Email UI hydration so missing bodies/recipients get fetched from Graph and persisted (fixes cut-off body + \"An Unbekannt\").
- ✅ Email list now shows Sent as `An {recipient}` (localized) instead of showing your own mailbox.
- ✅ Bumped version label to `v1.16.1` in sidebar (do this before any deploy).

---

## Email Recipient Autocomplete (NEW - v1.17.0)
- ✅ Added Supabase migration `supabase/migrations/031_profiles_email_rls.sql`:
  - Adds `profiles.email` column
  - Backfills from `auth.users`
  - Updates trigger to copy email on signup
  - Opens RLS so any authenticated user can read other profiles' `id, full_name, email, avatar_url`
- ✅ Added `/api/email/recipients` endpoint:
  - Searches contacts, tma_candidates, and profiles (users) by name/email
  - Returns unified results with type badges (Firma, TMA, User)
  - Deduplicates by email, sorts by relevance
- ✅ Updated `ComposeModal`:
  - Added Bcc field (toggle like Cc)
  - All recipient fields (To/Cc/Bcc) now have autocomplete
  - Typing triggers debounced search, dropdown shows results
  - Selecting a result inserts the email
  - Free typing of email addresses still works
- ✅ Added i18n keys for `searchOrTypeEmail` in en.json and de.json
- ✅ Added unit test `tests/recipient-insert.test.ts` for insertEmailIntoList helper
- ✅ All 10 tests pass, build compiles successfully
- ✅ Bumped version to `v1.17.0`

# Executor's Feedback or Assistance Requests
- **Task 23 deployed - needs manual verification**
- Please test in production:
  1. Go to Calling page
  2. Click "Working" or "Hot" button on a contact
  3. Hard refresh the page (Cmd+Shift+R or Ctrl+Shift+R)
  4. **Expected:** Status should persist (not show "Not set")
  5. Check that the status tag shows correctly in both the contact list sidebar and the detail header

- Email DB migration application (needed before conversation-folder improvements can work):
  - Preferred: `supabase db push` from your machine (linked to the prod project).
  - Fallback: run the SQL from `supabase/migrations/030_email_messages_folder.sql` in the Supabase SQL editor.

- Email Recipient Autocomplete migration (needed before recipient search works for users):
  - Apply `supabase/migrations/031_profiles_email_rls.sql` in Supabase.
  - This adds `profiles.email`, backfills from auth.users, and opens RLS for authenticated user reads.

---

# NEW: Two-stage email drafts + multi-recipient sending (Calling)

## Current Problem
- User reports: adding an additional `contact_person` with an email address (e.g. their own email) does **not** result in a separate email being sent to that contact person.
- User cannot see server logs (Vercel logs not visible), so debugging via `console.log` is not practical.

## Expected Behavior (Spec)
- When sending from Calling → **send separate emails**, not a single email with multiple recipients:
  - 1 email to the **general/company email** (if present) with greeting: `Sehr geehrtes <Firmenname> Team,`
  - 1 email to **each contact person** (Ansprechperson) with their own greeting:
    - male → `Sehr geehrter Herr <Nachname>,`
    - female → `Sehr geehrte Frau <Nachname>,`
    - unknown → `Sehr geehrte/r <Vorname> <Nachname>,`
- Each email should include the same attachments (KP PDFs + AGB) and the same subject/body (draft body stored without greeting; greeting injected at send-time).

## Hypotheses (Most likely causes)
1) **Recipient collection bug**: the code might not be reading the contact person email field that the UI writes (schema mismatch or different column).
2) **Recipient de-dupe bug**: the new contact person email could be considered “duplicate” and dropped unintentionally (case/whitespace normalization issues).
3) **Graph send failures are being swallowed**: some sends may fail (e.g., invalid recipient format) but the UI still reports success; user doesn’t see failures.
4) **UI is sending to a different endpoint than expected** or not reloading after adding contact persons (stale data).

## Fix Plan (Small steps with success criteria)

### Step A — Make failures visible to the user (no log dependency)
- Update the send endpoint response to include:
  - `attemptedRecipients: string[]`
  - `sentRecipients: string[]`
  - `failedRecipients: { email: string; error: string }[]`
- Update frontend “Sent” message in the email modal to show:
  - “Sent to X recipients”
  - If any failed: show the failed list

**Success criteria**
- After pressing “Mail senden”, the UI always shows exactly which recipients were attempted/sent/failed.

### Step B — Normalize + validate recipient emails
- Trim and lowercase emails before de-duping.
- Skip invalid emails (basic `@` presence) and report them in `failedRecipients` before calling Graph.

**Success criteria**
- Adding `test@domain.ch ` (with trailing space) still results in a send attempt to `test@domain.ch`.

### Step C — Ensure contact persons are actually fetched from DB at send-time
- On send-time, fetch contact persons from DB fresh and include them; do not rely on UI state.
- Confirm the select includes the correct email column (`contact_persons.email`) and that the UI saves into that column.

**Success criteria**
- Adding a new contact person and immediately clicking “Mail senden” includes that contact person in `attemptedRecipients`.

### Step D — Fix dedupe rule
- Only dedupe exact normalized matches; do not drop distinct emails.
- Dedup between company email and contact person email.

**Success criteria**
- If company email is `info@x.ch` and contact person email is `me@x.ch`, both are attempted.
- If both are `info@x.ch`, only one is attempted.

### Step E — Update prompts per latest instruction
- Latest instruction: AI drafts must NOT say “call me back / Rückruf / rufen Sie mich an”.
- Ensure validator also rejects “Rückruf” / “rufen Sie mich an” patterns if necessary.

**Success criteria**
- Generated drafts do not contain “Rückruf” or “rufen Sie mich an”.


# Lessons
- VAPID keys are free to generate
- Service worker must be at root (public/sw.js)
- iOS Safari has some limitations with Web Push (requires iOS 16.4+)
- Batching API requests dramatically reduces Supabase usage
- `src/app/favicon.ico` overrides `public/favicon.ico` in Next.js app router
- Use object destructuring instead of `delete` operator for TypeScript compatibility
- Client-side batching prevents 400 errors when dataset exceeds API limits (batch size <50% of server limit for safety margin)
- **CRITICAL: NEVER use Cursor worktree for code changes, OR if used, ALWAYS sync to main repo immediately** - changes in worktree don't deploy to production!
- **API routes MUST use server Supabase client** - `createClient` from `@/lib/supabase/server`, NOT from `@/lib/supabase/client`. Browser client has no auth context in server context, so `auth.getUser()` returns null.
- **CRITICAL: Never hardcode status_tags in API payloads** - The `scheduleFollowUp` was sending `status_tags: ["C"]` which wiped out existing quality ratings. Follow-ups should be independent from quality assessment.
- **Realtime can cause race conditions** - When updating data, realtime subscription might fire and overwrite local state. Use a skip mechanism to ignore realtime updates for recently-modified records.
- **ALWAYS update version number** on every deploy (format: v1.XX.X - major.middle.small)
- If `npm test` fails with an esbuild platform/binary mismatch, running `npm rebuild esbuild` can fix it without reinstalling everything.
