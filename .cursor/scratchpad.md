# Background and Motivation
- Implement PWA (Progressive Web App) with Web Push Notifications ✅
- Allow users to install QERO CRM to their phone's home screen ✅
- Get push notifications when someone sends a chat message ✅
- Chat realtime stabilized ✅
- **Make follow-ups and status PERSONAL per user (not shared across team)** ✅
- New issue reported: repeated 400 errors on `POST /api/contacts/call-logs` plus realtime subscriptions flapping (SUBSCRIBED → CLOSED → SUBSCRIBED).
- New regression: personal status still shows "Not set" after reload (Task 19 not stable).
- **NEW: Task 25 - Complete Mobile UI Revamp** - Make the app feel native on iPhone 16 Pro/Pro Max ✅ ✅
- **NEW: Improve Email client** - full email bodies (no cut off), correct recipients (no \"An Unbekannt\"), and conversation-based Inbox/Sent behavior
- **NEW: Task 26 - Two-Factor Authentication (2FA) with Google Authenticator** - Add TOTP-based 2FA for enhanced security
- **NEW: Task 37 - Admin Magic-Link Invitations (Onboarding)** - Admin creates invite link for a user; user clicks link and is taken directly into **password setup → 2FA setup** (no manual login/register).

---

# Task 37: Admin Magic-Link Invitations (Onboarding) (PLANNING)

## Problem (Current Behavior)
- Admin can send an invite email via Supabase Auth, but when the invited user clicks the link they land on `https://qero.international` (or `/login`) and see the **normal login UI**.
- The invite link looks like:
  - `https://<project>.supabase.co/auth/v1/verify?token=...&type=invite&redirect_to=https://qero.international`
- This means the user is **not getting a usable app session** before we decide where to route them.

## Key Challenges and Analysis
- Supabase `/auth/v1/verify` invite flow often redirects back to the site using **hash-based tokens** (e.g. `#access_token=...`) or other params.
- Our app currently checks `getUser()` on `/login`, but **does not reliably consume the auth redirect** and **store the session**.
- Also, the observed email link uses `redirect_to=https://qero.international` (root) rather than a dedicated auth landing page, which makes this harder to handle consistently.

## Proposed Fix (Robust + Deterministic)
### Strategy
Create a dedicated client-side landing page that **always** consumes Supabase redirect params and stores the session, then routes:
- `/setup-account` if user must set password or setup 2FA
- `/calling` otherwise

### Why this works
`supabase-js` provides a dedicated function to parse redirect params and persist session (`getSessionFromUrl({ storeSession: true })`). This is the canonical way to handle hash-based auth redirects.

## High-level Task Breakdown

### 37.1 Create `/auth/confirm` page that consumes the invite redirect
**File**: `src/app/auth/confirm/page.tsx` (client component)
**Behavior**:
- Call `supabase.auth.getSessionFromUrl({ storeSession: true })`
- After session is stored, fetch user + profile flags (`profiles.must_change_password`, `profiles.must_setup_2fa`)
- Redirect to:
  - `/setup-account` if either flag is true
  - `/calling` otherwise
**Success criteria**:
- Clicking invite link results in a valid session in browser storage/cookies and immediately routes away from Login UI.

### 37.2 Ensure middleware allows `/auth/confirm`
**File**: `src/middleware.ts`
**Change**: include `/auth/confirm` in public routes (or allow it explicitly).
**Success criteria**:
- Invited user can reach `/auth/confirm` without being bounced to `/login`.

### 37.3 Update invite creation to use redirectTo=`/auth/confirm`
**File**: `src/app/api/admin/users/invite/route.ts`
**Change**: Set invite redirect target to:
- `https://qero.international/auth/confirm`
**Success criteria**:
- Newly generated invite emails include `redirect_to=https://qero.international/auth/confirm` (not root).

### 37.4 Supabase dashboard configuration (manual step)
**Where**: Supabase → Authentication → URL Configuration
**Ensure**:
- **Site URL**: `https://qero.international`
- **Redirect URLs** include:
  - `https://qero.international/auth/confirm`
  - `https://qero.international/setup-account`
  - (optional) `https://qero.international/login`
**Success criteria**:
- Supabase accepts the redirect target; does not downgrade to root URL.

### 37.5 (Optional hardening) Login fallback
**File**: `src/app/login/page.tsx`
**Change**: If we ever land on `/login` with hash tokens, call `getSessionFromUrl({ storeSession: true })` rather than “sleep and hope”.
**Success criteria**:
- Even if redirect_to lands on `/login`, user is still routed to `/setup-account`.

### 37.6 Version bump + deploy
**Success criteria**:
- Production invite flow works end-to-end for a fresh invite.

## Test Checklist (Production)
1. Admin sends a **fresh** invite.
2. Email link contains `redirect_to=https://qero.international/auth/confirm`.
3. Invited user clicks link in a private/incognito window:
   - Should NOT see register/login.
   - Should land on setup: password → 2FA.
4. After completing setup, user is redirected to `/calling`.


# Task 25: Mobile UI Revamp (Native iOS Feel) ✅ COMPLETED

## Goal
Transform the mobile experience to feel like a native iOS app, specifically optimized for iPhone 16 Pro/Pro Max.

## Completed Work (Dec 15, 2025)

### 1. iOS PWA Safe-Area Support ✅
- Added `viewportFit: "cover"` to viewport metadata in `layout.tsx`
- Added `100dvh` height support for iOS PWA in `globals.css`
- Added iOS-specific text size stability and body overflow prevention

### 2. Floating Tab Bar (Higher Up, Won't Clip on iPhone Corners) ✅
- Redesigned `MobileNavBar` to float with side insets (12px from edges)
- Uses `bottom: calc(env(safe-area-inset-bottom) + 12px)` to sit above home indicator
- Rounded corners (20px) for iOS-native appearance
- Updated `AppShell` mobile layout to properly pad content for floating bar

### 3. "More" Tab with Bottom Sheet for Vacancies ✅
- Added "More" tab to bottom nav bar
- Created `MobileMoreSheet.tsx` - iOS-style bottom sheet with drag handle
- Includes navigation to: Vacancies, Dashboard, Settings
- iOS-style 52px touch targets with chevron indicators

### 4. Email Mobile Layout (List → Detail) ✅
- Full mobile redesign of `EmailView.tsx`
- List and detail views with slide transitions
- Mobile header with folder dropdown selector
- Back button navigation from detail to list
- Added overflow handling for email body content in `globals.css`

### 5. App-Wide Mobile Polish ✅
- All main pages (Calling, Contacts, TMA, Chat, Dashboard, Vacancies, Settings) have safe-area padding
- Dashboard and Settings pages updated with mobile-friendly spacing
- ContactsTable updated with safe-area support

### Design Specs
- **Bottom nav height**: 56px in floating pill
- **Bottom offset**: 12px + safe-area-inset-bottom
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
  - Ensure prompts reject "call me back" phrasing
- [x] **Task 29: Fix Ansprechperson Modal Clickthrough** ✅ COMPLETE
  - Root cause: Radix Dialog modal mode blocked pointer events on nested portaled modals
  - Fix: Set Sheet to `modal={false}` by default; added context-based close handler for overlay; preserved nested modal dismiss guard

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


---

# Task 28: Calling UI Redesign (Apple-Native)

## Goal
Redesign the Calling page to feel like an Apple-native app with:
- Notes as the primary workspace (largest, most prominent area)
- Status controls moved into a frosted sticky header
- Ansprechpersonen moved into a slide-over drawer (triggered from header)
- Compact info chips for contact details (phone/email/canton/address)
- Minimal, calm aesthetic with smooth interactions

## Implementation Completed ✅

### New Components Created
1. **`src/components/ui/sheet.tsx`** - Apple-style slide-over drawer using Radix Dialog
2. **`src/components/ui/segmented-control.tsx`** - iOS-style segmented control with sliding indicator

### Files Modified
1. **`src/components/calling/ContactDetail.tsx`** - Complete redesign:
   - Frosted sticky header with company name, status segmented control, follow-up chip
   - Compact info chips row (phone, email, canton, location, Ansprechpersonen button)
   - Call/Email action buttons in header
   - Travel time widget inline in header when candidate selected
   - Vacancy banner compact in header
   - Notes panel takes full remaining space
   - Minimal footer with keyboard shortcuts

2. **`src/components/calling/NotesPanel.tsx`** - Enhanced styling:
   - Removed Panel wrapper, using custom card styling
   - Cleaner input area with better placeholder
   - Improved scrollable notes list with subtle background

3. **`src/components/calling/TravelTimeWidget.tsx`** - Added horizontal layout support

4. **`src/app/globals.css`** - Added slide animations for Sheet component

### Dependencies Added
- `@radix-ui/react-dialog` - For Sheet component
- `lucide-react` - For icons

### Build Status
✅ Build passes successfully with no TypeScript/linting errors

## Success Criteria Met
- ✅ Status controls visible and usable in header without scrolling
- ✅ Notes area is the largest section (dominant visual priority)
- ✅ Ansprechpersonen accessible via header button opening slide-over drawer
- ✅ All existing Calling features preserved (Call/Email, navigation, notes, vacancies, etc.)
- ✅ Apple-native feel: frosted header, segmented control, smooth drawer, subtle styling

---

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
- **🚨 CRITICAL: ALWAYS UPDATE VERSION NUMBER BEFORE EVERY DEPLOYMENT 🚨** - Version format: v1.XX.X (major.middle.small). This is MANDATORY and must be done BEFORE pushing to production. NO EXCEPTIONS.
- If `npm test` fails with an esbuild platform/binary mismatch, running `npm rebuild esbuild` can fix it without reinstalling everything.
- **Zod's `.uuid()` uses strict RFC 4122 validation** - It rejects UUIDs that don't have valid version (1-5) and variant (8,9,a,b) bits. Use a lenient regex pattern `/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/` if your database uses non-RFC-4122 compliant UUIDs.

---

# Task 26: Two-Factor Authentication (2FA) with Google Authenticator

## Goal
Implement TOTP-based two-factor authentication using Google Authenticator (or any compatible authenticator app) to enhance account security.

## Background
- Supabase Auth has built-in MFA support with TOTP (Time-Based One-Time Password)
- Uses standard TOTP algorithm (RFC 6238) compatible with Google Authenticator, Authy, Microsoft Authenticator, etc.
- Requires enabling MFA in Supabase dashboard (one-time manual step)

## Key Challenges and Analysis

### 1. Supabase MFA Flow
- **Enrollment**: User starts enrollment → Supabase generates QR code + secret → User scans QR → User verifies with code → Factor enrolled
- **Login Flow**: User enters email/password → If MFA enabled, create challenge → User enters TOTP code → Verify code → Session upgraded to AAL2
- **AAL (Authenticator Assurance Level)**: AAL1 = password only, AAL2 = password + MFA

### 2. Implementation Considerations
- Need to check if user has enrolled factors before requiring MFA during login
- Must handle MFA challenge creation and verification in login flow
- QR code generation happens server-side (Supabase returns QR code data URI)
- Need UI for: setup flow, QR code display, code input, enable/disable toggle
- Should store MFA status in user profile for quick checks

### 3. User Experience
- Setup should be optional (users can enable/disable)
- Clear instructions for scanning QR code
- Backup codes (Supabase provides these, but we may want to display them)
- Graceful error handling if code is invalid/expired

## High-level Task Breakdown

### Phase 1: Supabase Configuration (Manual Step)
- [ ] **1.1** Enable MFA in Supabase Dashboard
  - Go to Authentication → Settings → Multi-Factor Authentication
  - Enable TOTP factor type
  - Note: This is a one-time manual configuration step

### Phase 2: MFA Setup UI in Settings
- [ ] **2.1** Create MFA API routes
  - `POST /api/auth/mfa/enroll` - Start enrollment, return QR code
  - `POST /api/auth/mfa/verify` - Verify enrollment code
  - `POST /api/auth/mfa/challenge` - Create challenge for login
  - `POST /api/auth/mfa/verify-challenge` - Verify challenge code
  - `GET /api/auth/mfa/status` - Get user's MFA enrollment status
  - `DELETE /api/auth/mfa/unenroll` - Remove MFA factor

- [ ] **2.2** Add MFA Panel to SettingsForm
  - Show current MFA status (enabled/disabled)
  - "Enable 2FA" button if not enabled
  - "Disable 2FA" button if enabled
  - Display enrolled factor name (e.g., "Google Authenticator")

- [ ] **2.3** Create MFA Setup Modal/Flow
  - Step 1: Show QR code (from enrollment API)
  - Step 2: Instructions ("Scan with Google Authenticator app")
  - Step 3: Code verification input
  - Step 4: Success confirmation
  - Handle errors (invalid code, expired, etc.)

- [ ] **2.4** QR Code Display Component
  - Display QR code image (data URI from Supabase)
  - Show manual entry code as fallback
  - Copy-to-clipboard for manual code

### Phase 3: Login Flow Integration
- [ ] **3.1** Update `signIn` action in `src/lib/auth/actions.ts`
  - After successful password auth, check if user has MFA factors
  - If yes, return special response indicating MFA required (don't redirect)
  - Store session temporarily (Supabase handles this)

- [ ] **3.2** Create MFA Challenge API Route
  - `POST /api/auth/mfa/challenge` - Create challenge for current session
  - Returns challenge ID

- [ ] **3.3** Update Login Page UI
  - Add MFA code input step (conditional, shown after password)
  - Handle MFA challenge creation and verification
  - Show loading states during verification
  - Error handling for invalid/expired codes

- [ ] **3.4** Update Middleware (if needed)
  - Check AAL level for sensitive routes (optional enhancement)
  - Currently middleware only checks if user exists, which is sufficient

### Phase 4: MFA Management
- [ ] **4.1** Add MFA Status to Profile Query
  - Check enrolled factors via `supabase.auth.mfa.listFactors()`
  - Store in profile or check on-demand

- [ ] **4.2** Disable MFA Flow
  - Confirm dialog before disabling
  - Call unenroll API
  - Update UI state

- [ ] **4.3** Backup Codes (Optional Enhancement)
  - Supabase may provide backup codes during enrollment
  - Display them once (with warning to save securely)
  - Allow regeneration

### Phase 5: Testing & Edge Cases
- [ ] **5.1** Test Complete Flow
  - New user enables 2FA
  - User logs in with 2FA
  - User disables 2FA
  - User logs in without 2FA after disabling

- [ ] **5.2** Error Handling
  - Invalid TOTP code
  - Expired challenge
  - Network errors during enrollment/verification
  - User already has MFA enabled (prevent duplicate enrollment)

- [ ] **5.3** Mobile Optimization
  - QR code displays well on mobile
  - Code input is mobile-friendly
  - Instructions are clear on small screens

## Technical Implementation Details

### API Route Structure
```
/api/auth/mfa/
  ├── enroll (POST) - Start enrollment
  ├── verify (POST) - Verify enrollment code
  ├── challenge (POST) - Create login challenge
  ├── verify-challenge (POST) - Verify challenge code
  ├── status (GET) - Get enrollment status
  └── unenroll (DELETE) - Remove factor
```

### Supabase MFA Methods
```typescript
// Enrollment
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: 'totp',
  friendlyName: 'Google Authenticator'
});
// Returns: { id, secret, qr_code, uri }

// Verify enrollment
await supabase.auth.mfa.verify({
  factorId: data.id,
  code: userCode
});

// List factors
const { data } = await supabase.auth.mfa.listFactors();

// Create challenge (during login)
const { data } = await supabase.auth.mfa.challenge({ factorId });

// Verify challenge
await supabase.auth.mfa.verify({
  factorId,
  challengeId: data.id,
  code: userCode
});

// Unenroll
await supabase.auth.mfa.unenroll({ factorId });
```

### Database Schema Changes
- No schema changes needed (Supabase handles MFA factors internally)
- Optional: Add `mfa_enabled` boolean to profiles table for quick checks (can also query factors on-demand)

## Success Criteria
- ✅ Users can enable 2FA from Settings page
- ✅ QR code displays correctly and can be scanned with Google Authenticator
- ✅ Users can verify enrollment with TOTP code
- ✅ Login flow prompts for 2FA code when enabled
- ✅ Users can disable 2FA from Settings
- ✅ Error messages are clear and helpful
- ✅ Works on both desktop and mobile (iOS PWA)
- ✅ No breaking changes to existing auth flow

## Notes
- Supabase MFA is optional - users without MFA can still log in normally
- AAL2 sessions are automatically maintained by Supabase
- QR codes are one-time use (for enrollment only)
- TOTP codes are time-based (30-second windows)
- Consider rate limiting on verification attempts to prevent brute force

## Project Status Board
- [x] Phase 1: Supabase Configuration (Manual step - user needs to enable in dashboard)
- [x] Phase 2: MFA Setup UI ✅
- [x] Phase 3: Login Flow Integration ✅
- [x] Phase 4: MFA Management ✅
- [ ] Phase 5: Testing & Edge Cases (Ready for testing)

## Executor's Feedback or Assistance Requests

### Implementation Completed (Dec 15, 2025)

**Phase 2: MFA Setup UI** ✅
- Created all 6 MFA API routes:
  - `POST /api/auth/mfa/enroll` - Start enrollment
  - `POST /api/auth/mfa/verify` - Verify enrollment code
  - `POST /api/auth/mfa/challenge` - Create login challenge
  - `POST /api/auth/mfa/verify-challenge` - Verify challenge code
  - `GET /api/auth/mfa/status` - Get enrollment status
  - `DELETE /api/auth/mfa/unenroll` - Remove factor
- Created `MfaSetupModal.tsx` component with:
  - QR code display (from Supabase data URI)
  - Manual entry code with copy button
  - Two-step flow: QR display → Code verification
  - Error handling
- Added MFA Panel to `SettingsForm.tsx`:
  - Shows current MFA status (enabled/disabled)
  - Enable button if disabled
  - Disable button with confirmation if enabled
  - Status indicator with shield icon

**Phase 3: Login Flow Integration** ✅
- Updated `signIn` action in `src/lib/auth/actions.ts`:
  - Checks for enrolled TOTP factors after password auth
  - Returns `requiresMfa: true` and `factorId` if MFA is enabled
  - Only redirects if no MFA required
- Updated `LoginPage` component:
  - Two-step login flow: password → MFA code
  - Creates MFA challenge automatically when needed
  - MFA code input with 6-digit validation
  - Back button to return to password step
  - Error handling for invalid/expired codes

**Phase 4: MFA Management** ✅
- MFA status fetched on Settings page load
- Disable MFA flow with confirmation dialog
- Success/error messages integrated with existing message system

### Manual Step Required
**Phase 1: Supabase Configuration**
- User must manually enable MFA in Supabase Dashboard:
  1. Go to Authentication → Settings → Multi-Factor Authentication
  2. Enable TOTP factor type
  3. Save changes

### Next Steps
- Test complete flow: enable 2FA, login with 2FA, disable 2FA
- Verify error handling (invalid codes, expired challenges)
- Test on mobile (iOS PWA)

### Bug Fix: 2FA QR Code and Manual Code Not Displaying (Dec 16, 2025) ✅
- **Issue**: QR code and manual secret code were not displaying in the 2FA setup modal
- **Root Cause**: Supabase MFA enrollment returns data in nested structure (`data.totp.qr_code`, `data.totp.secret`, `data.totp.uri`), but the component expected a flat structure
- **Fix**: Updated `/api/auth/mfa/enroll` route to transform the Supabase response to match the expected format
- **Version**: v1.38.0

### Bug Fix: 2FA Not Prompting During Login (Dec 16, 2025) ✅
- **Issue**: After enabling 2FA, login did not prompt for the 6-digit code
- **Root Cause**: The enrollment verification endpoint (`/api/auth/mfa/verify`) was incorrectly creating a challenge before verifying. Challenges are only for login flow, not enrollment. This prevented the factor from being properly enrolled as "verified".
- **Fix**: Updated `/api/auth/mfa/verify` to use direct verification without challenge for enrollment
- **Version**: v1.38.1

## Legacy Notes Migration Script (Dec 16, 2025)
Created comprehensive migration scripts to move all old single-field notes to the new multi-author notes system:

**Files created:**
- `036_migrate_all_legacy_notes.sql` - Main migration script
- `CHECK_LEGACY_NOTES_STATUS.sql` - Pre-migration status check
- `MIGRATE_LEGACY_NOTES_README.md` - Complete instructions

**What it does:**
- Migrates `contacts.notes` → `contact_notes` table
- Migrates `tma_candidates.notes` → `tma_notes` table
- Assigns oldest user as author for legacy notes
- Clears old notes fields after migration
- Safe, idempotent, with duplicate detection

---

## v1.41.0 - AI Kurzprofil Generator (Dec 16, 2025)

### New Feature: AI-Powered Kurzprofil Generation
Complete implementation of automatic Kurzprofil (short profile) PDF generation from candidate CVs.

**Core Features:**
- Upload CV (PDF) → AI extracts structured data → Fills DOCX template → Converts to PDF
- Photo upload support (JPG, PNG, GIF, WebP, HEIC)
- Uses Gotenberg (self-hosted on Railway) for DOCX→PDF conversion (~$5/month, unlimited)
- OpenAI GPT-4o-mini for data extraction (~$0.90 per 1000 profiles)

**Template System:**
- DOCX template with `[[placeholder]]` tokens
- Supports: name, age/gender, region, license, vehicle, nationality, profession, skills, experience, employment type, availability, salary, contact person, photo
- Fixed values: "Nach Vereinbarung" for salary

**AI Extraction Rules:**
- Swiss German (CH) professional tone
- EFZ/Gesellenbrief title only (no further education)
- Post-apprenticeship experience only ("Mehr als X Jahre Berufserfahrung")
- Region format: "PLZ Ort (Kanton)" without comma
- Max 5 concise skills (1-page limit)
- Excludes: Windows, Office, SAP, languages, salary info, other agencies

**Technical:**
- Gotenberg on Railway for PDF conversion
- Template embedded as base64 for Vercel compatibility
- Photo upload accepts all common image formats
- MFA verify fix for Supabase challengeId requirement

**Files Added/Modified:**
- `src/lib/short-profile/` - schema, openai, docx, extract, pdf-convert
- `src/app/api/tma/[id]/short-profile/generate/route.ts`
- `supabase/migrations/038_tma_photo_url.sql`
- Updated TmaDetail with photo upload + generate button

---

# Task 31 - Kurzprofil Fixes: Photo + Layout Stability (PLANNING)

## Background and Motivation
User reports remaining issues in generated Kurzprofil PDFs:
- Photo is not embedded (placeholder remains empty / no image shown)
- A green line appears (likely formatting artifact)
- "Berufliche Erfahrung" block shifts to the bottom (layout instability)

## Key Challenges and Analysis
- **Photo embedding has 2 likely failure points**:
  - Storage access: `candidate.photo_url` is a Supabase Storage URL; if the bucket/object is not truly public, server-side `fetch(photo_url)` fails and we silently continue without the photo.
  - Template constraints: the image placeholder must be in a supported location (not in a shape/textbox/header that docxtemplater doesn’t process) and must be a “clean” tag that the image module can replace.
- **Green line and shifting layout are often template/conversion issues**:
  - Green line is usually a table border or paragraph underline style in the DOCX (or a style applied by LibreOffice during conversion).
  - LibreOffice/Gotenberg can render Word layout slightly differently than Word itself; fixed row heights, spacing, or oversized images can push sections down.

## High-level Task Breakdown (Planner)

### 31.1 Add “debug artifacts” for fast diagnosis
**Change**: During generation, also upload the filled DOCX (before PDF conversion) to Supabase Storage, and log photo download status (HTTP status + content-type + bytes).
**Success criteria**:
- We can open the generated DOCX and confirm whether the photo is embedded there (separates “docx templating” vs “pdf conversion” issues).

### 31.2 Make photo fetching robust (no dependency on public URLs)
**Change** (preferred): Store and use storage *paths* (or derive them) and download the photo via `supabase.storage.from("tma-docs").download(path)` server-side (service role/server client), instead of `fetch(publicUrl)`.
**Fallback**: If we must keep URLs, generate a signed URL server-side for private objects and use that for download.
**Success criteria**:
- Photo reliably downloads server-side (works even if the bucket is private).

### 31.3 Make image module integration deterministic
**Change**: Pass the actual image payload via `templateData.photo` (e.g., base64 or Buffer reference) and implement `getImage(tagValue)` to decode that value, rather than relying on the sentinel `"photo"`.
**Also**: Reduce and clamp `getSize()` to the exact placeholder box size (so inserted images cannot expand table rows and push “Berufliche Erfahrung” downward).
**Success criteria**:
- Filled DOCX contains an embedded image in `word/media/*`.
- “Berufliche Erfahrung” no longer shifts due to image sizing.

### 31.4 Fix the green line (template-first, then conversion fallback)
**Change**:
- Inspect the generated DOCX around “Berufliche Erfahrung” to identify whether the green line exists already in DOCX.
  - If yes: remove the green border/underline in `template.docx` and re-embed `TEMPLATE_BASE64`.
  - If no (only appears in PDF): adjust LibreOffice conversion options (where possible) or tweak template styles to avoid the artifact (e.g., remove borders/underlines on that row, avoid “accent” theme colors).
**Success criteria**:
- Green line is gone in the final PDF.

### 31.5 Stabilize layout so “Berufliche Erfahrung” doesn’t drop to bottom
**Change**:
- Enforce tight length limits in code for fields that can explode layout (e.g. `kontaktperson`, `faehigkeiten_bullets` already constrained, but also clamp accidental long strings).
- Ensure template uses auto row height (“At least”) not “Exactly” where content must flow, and avoid large spacing before/after paragraphs inside table cells.
**Success criteria**:
- Generated PDFs stay on one page and “Berufliche Erfahrung” stays in the intended position across multiple candidates.

### 31.6 Version + changelog + deploy
**Change**:
- Bump version (required before deploy) and add a short entry describing the photo + layout fixes.
**Success criteria**:
- Vercel build succeeds and production shows fixed behavior.

---

# Task 32 - Fix “green line” + heading shifts (Berufliche Erfahrung) (PLANNING)

## Problem (observed)
- **Green line comes back** intermittently in the generated PDF.
- The **“Berufliche Erfahrung” heading shifts downward** (often leaving large whitespace), even though it is correctly placed in the Word template between the two tables.

## Most likely root cause (think hard)
This is almost certainly **LibreOffice (Gotenberg) layout behavior** interacting with **Word “floating tables / positioned tables” and/or border theme colors**:
- The template tables contain `w:tblpPr` (positioned table). LibreOffice can reflow positioned tables differently than Word, causing following paragraphs (the heading) to be pushed down.
- The green line is a **real border color** in the DOCX (`70AD47`) that LibreOffice renders; it may reappear depending on which style/border instance is actually used after token processing.

## Fix strategy: diagnose first, then apply minimal-safe transforms

### 32.1 Add DOCX artifact output (debug)
**Change**: During generation, upload the **filled DOCX** (pre-PDF) alongside the PDF and return its URL in the API response.
**Why**: Determine whether the heading shift exists in the DOCX (template/templating issue) or only in the PDF (conversion issue).
**Success criteria**:
- API response includes `filled_docx_url`.
- Opening the DOCX in Word shows whether the heading placement is correct.

### 32.2 Make template “LibreOffice-safe”: remove positioned-table properties
**Change**: Remove `w:tblpPr` blocks from `word/document.xml` before rendering (or preferably, remove them in `template.docx` permanently).
**Why**: Positioned tables are the #1 cause of “content jumps” in LibreOffice conversion.
**Success criteria**:
- In the resulting PDF, the heading “Berufliche Erfahrung” stays immediately under the first table (as intended) across multiple candidates.

### 32.3 Remove green border color deterministically (safe replace)
**Change**: Before rendering, apply a safe string replacement in `document.xml`:
- Replace all `w:color="70AD47"` with `w:color="000000"` (or the intended border color).
**Why**: This is safe (does not delete structure) and directly targets the known green border.
**Success criteria**:
- No green line in the PDF across multiple generations.

### 32.4 Reduce “layout pressure” from dynamic fields (guard rails)
**Change**: Hard-cap or normalize the most layout-sensitive fields:
- Ensure `faehigkeiten_bullets` stays exactly 5 lines (already enforced, but double-check for long words).
- Cap `kontaktperson` to 2 lines max (name + tel/email) to avoid pushing the second table.
**Success criteria**:
- One-page PDF, heading remains correctly positioned.

### 32.5 Version + changelog + deploy

---

## v1.42.0 - Kurzprofil Photo Fix (Dec 16, 2025)

### Fixes
- **Photo embedding**: Fixed image module configuration
  - Added `%` prefix conversion for image tags (`[[photo]]` → `[[%photo]]`)
  - Image module now properly configured with standard prefix
  - Photo download includes content-type detection
  - Better error handling and logging for photo processing
  
- **Template cleanup**:
  - Remove `proofErr` elements (spell check markers) that caused rendering issues
  - Graceful handling when no photo is uploaded (removes placeholder)
  
- **Layout stability**:
  - Reduced photo size to 113x150 pixels (passport ratio)
  - Should prevent content from being pushed to second page

### Technical Details
- Photo is fetched from Supabase Storage public URL
- If photo download fails, generation continues without photo
- Image module uses `[[%photo]]` syntax internally for compatibility

---

## v1.43.0 - Direct Image Embedding (Dec 16, 2025)

### Major Fix: Photo Embedding
- **Replaced broken image module with direct DOCX XML manipulation**
- Photo is now embedded directly into the DOCX:
  1. Added to `word/media/` folder
  2. Relationship added to `word/_rels/document.xml.rels`
  3. `[[photo]]` placeholder replaced with inline drawing XML
- No longer depends on `docxtemplater-image-module-free` for photos

### Template Fixes
- **Green line**: Changed border color `70AD47` to black `000000`
- **"Berufliche Erfahrung" at bottom**: Removed stray paragraph after `</w:tbl>`

### Code Cleanup
- Removed unused `ImageModule` import
- Removed unused `mergeSplitTokens` and `fixSplitTokensSimple` functions
- Removed unused `getImageSize` function
- Simplified code flow

---

# Task 33 - Swiss City Autocomplete for TMA Address + "Last Edited By" (PLANNING)

## Background and Motivation
User wants to improve the address editing experience in TMA:
1. **City/PLZ autocomplete**: User types beginning of city name OR PLZ → CRM shows dropdown of matching Swiss cities → User selects → City + PLZ auto-filled
2. **"Last edited by" tracking**: Show who last edited the address and when

## Key Challenges and Analysis

### 1. Swiss City Data Already Exists ✅
- **Dataset**: `/public/data/swiss-plz.json` contains ~4,700 Swiss postal codes with:
  - `plz`: 4-digit postal code
  - `name`: City/town name  
  - `lat`, `lng`: Coordinates
  - `canton`: Optional canton code
- **Client-side search**: `src/lib/geo/client.ts` has `searchLocationsClient(query, limit)` that:
  - Matches PLZ prefix (e.g., "80" → 8000, 8001, ...)
  - Matches city name substring (normalized, diacritics-insensitive)
  - Returns `PlzEntry[]` sorted by relevance

### 2. Current Address Fields in TMA
- `tma_candidates` table has: `city`, `postal_code`, `street`
- `TmaDetail.tsx` has 3 separate Input fields (city, postal_code, street)
- `onUpdateAddress` callback sends all 3 fields together on blur

### 3. "Last Edited By" Pattern Exists
- `contact_persons` table already has `updated_by` + `updated_by_profile` join pattern
- We need to add: `address_updated_by` (FK → profiles) + `address_updated_at` (timestamp) to `tma_candidates`

### 4. UX Design Decision
**Option A (simpler)**: Single "City/PLZ" autocomplete input that fills BOTH city AND postal_code when selected
- User types "Zür" → sees "8000 Zürich", "8001 Zürich", etc.
- On select: city="Zürich", postal_code="8000"
- Street remains separate text field

**Option B (more flexible)**: Separate PLZ and City fields with linked autocomplete
- User can type in either field; suggestions update both
- More complex UX

**→ Recommend Option A** for simplicity and most intuitive flow.

## High-level Task Breakdown

### 33.1 Database Migration: Add address edit tracking fields
**Change**: Create migration to add `address_updated_by` and `address_updated_at` to `tma_candidates`
```sql
ALTER TABLE tma_candidates
ADD COLUMN address_updated_by UUID REFERENCES profiles(id),
ADD COLUMN address_updated_at TIMESTAMPTZ;
```
**Success criteria**: 
- Migration applies cleanly to production
- New columns exist on `tma_candidates`

### 33.2 Create `SwissCityAutocomplete` Component
**Files**: `src/components/ui/SwissCityAutocomplete.tsx`
**Change**: Create a reusable autocomplete component:
- Input field with dropdown
- On type: debounced search using `searchLocationsClient()` from `src/lib/geo/client.ts`
- Dropdown shows: "PLZ City (Canton)" format, e.g., "8000 Zürich (ZH)"
- On select: calls `onSelect({ city, postal_code, canton })` callback
- Keyboard navigation (↑/↓/Enter/Escape)
- Click-outside closes dropdown
**Success criteria**:
- Component renders with placeholder
- Typing "80" shows ~10 results starting with 80xx
- Typing "Zürich" shows all Zürich postal codes
- Selecting an item fires callback with city + postal_code + canton
- Arrow keys + Enter work for selection

### 33.3 Update TmaDetail to Use SwissCityAutocomplete
**Files**: `src/components/tma/TmaDetail.tsx`
**Change**:
- Replace separate "City" and "Postal Code" inputs with single `SwissCityAutocomplete`
- Display current value as "PLZ City" (e.g., "8000 Zürich")
- Keep "Street" as separate text input (unchanged)
- Update `handleAddressBlur` to work with new component (called on select, not blur)
**Success criteria**:
- City/PLZ autocomplete shows in TmaDetail
- Selecting a city updates both fields in candidate
- Street input still works independently
- Address saves correctly

### 33.4 Update TMA API to Track Address Editor
**Files**: `src/app/api/tma/[id]/route.ts`
**Change**:
- When `city`, `postal_code`, or `street` changes, also set:
  - `address_updated_by = user.id`
  - `address_updated_at = NOW()`
- Return these fields in response with joined profile info
**Success criteria**:
- Updating address sets `address_updated_by` and `address_updated_at`
- Response includes editor's name

### 33.5 Update TMA Types and Selects
**Files**: `src/lib/types.ts`, data service files
**Change**:
- Add `address_updated_by`, `address_updated_at`, `address_updated_by_profile` to `TmaCandidate` type
- Update select queries to join `profiles!address_updated_by`
**Success criteria**:
- TypeScript types are correct
- API responses include the new fields

### 33.6 Display "Last Edited By" in TmaDetail
**Files**: `src/components/tma/TmaDetail.tsx`
**Change**:
- Below the address fields, show: "Zuletzt bearbeitet von {Name} am {Date}"
- Format: Small gray text, relative time (e.g., "vor 2 Stunden") or absolute date
- Only show if `address_updated_at` is set
**Success criteria**:
- After saving address, "Last edited by X on Y" appears
- Shows correct editor name and formatted timestamp
- Hidden if no address edits yet

### 33.7 Add i18n Keys
**Files**: `src/messages/en.json`, `src/messages/de.json`
**Change**: Add translations:
- `tma.cityPlz`: "City / PLZ"
- `tma.searchCityPlz`: "Search city or postal code..."
- `tma.addressLastEditedBy`: "Last edited by {name} on {date}"
**Success criteria**:
- No hardcoded strings in components
- Both EN and DE translations work

### 33.8 Version + Deploy
**Change**:
- Bump version to v1.44.0
- Add changelog entry
**Success criteria**:
- Build passes
- Deploys to production successfully

## Technical Implementation Notes

### SwissCityAutocomplete Props
```typescript
interface Props {
  value: { city: string | null; postal_code: string | null };
  onChange: (value: { city: string | null; postal_code: string | null; canton?: string | null }) => void;
  placeholder?: string;
  disabled?: boolean;
}
```

### Display Format
- Dropdown item: "8000 Zürich (ZH)" 
- Selected value display: "8000 Zürich"
- Empty state: placeholder text

### API Response Shape (after update)
```typescript
{
  // ... existing fields ...
  address_updated_by: string | null,
  address_updated_at: string | null,
  address_updated_by_profile: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null
}
```

## Success Criteria (Overall)
- [ ] User can type "Zür" or "80" and see matching Swiss cities
- [ ] Selecting a city auto-fills both city AND postal_code fields
- [ ] Street remains editable separately
- [ ] After saving, shows "Last edited by {Name} on {Date/Time}"
- [ ] Works on mobile (iOS PWA)
- [ ] No regressions to existing TMA functionality

## Project Status Board
- [x] **33.1** Database migration ✅
- [x] **33.2** SwissCityAutocomplete component ✅
- [x] **33.3** Integrate into TmaDetail ✅
- [x] **33.4** Update TMA API (track editor) ✅
- [x] **33.5** Update types and selects ✅
- [x] **33.6** Display "Last edited by" ✅
- [x] **33.7** i18n translations ✅
- [x] **33.8** Version bump to v1.46.0 ✅

## Implementation Complete (Dec 17, 2025)

### Files Created
- `supabase/migrations/039_tma_address_tracking.sql` - Database migration
- `src/components/ui/SwissCityAutocomplete.tsx` - Autocomplete component

### Files Modified
- `src/lib/types.ts` - Added address tracking fields to TmaCandidate
- `src/lib/validation/schemas.ts` - Added validation for new fields
- `src/components/tma/TmaDetail.tsx` - Replaced city/PLZ inputs with autocomplete
- `src/app/api/tma/[id]/route.ts` - Track who/when edited address
- `src/app/api/tma/route.ts` - Include address editor in select
- `src/app/api/tma/[id]/claim/route.ts` - Include address editor in select
- `src/lib/data/data-service.ts` - Include address editor in all TMA queries
- `src/lib/cache/TmaCacheContext.tsx` - Include address editor in cache queries
- `src/i18n/messages/de.json` - Added German translations
- `src/i18n/messages/en.json` - Added English translations
- `src/components/layout/Sidebar.tsx` - Bumped version to v1.46.0

### Migration Required
Apply migration before testing:
```sql
ALTER TABLE tma_candidates
ADD COLUMN IF NOT EXISTS address_updated_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS address_updated_at TIMESTAMPTZ;
```

---

# Task 34: Cross-Team Company Access with Team Filter (PLANNING)

## Background and Motivation

User wants to make companies (contacts/Firmen) available across all teams, not just restricted to one team:

1. **Every member in EVERY team can see ALL companies** - break the current team isolation
2. **Default filter: show user's team** - don't overwhelm users, show their team by default
3. **Option to view ALL companies** - toggle/filter to expand beyond team boundary
4. **Admin features work across all teams** - encoding fix and duplicate merge should work on ALL companies when executed by admins

## Current Architecture

### Team Isolation Model (Current State)
- **Database**: `contacts` table has `team_id` column (FK to `teams`)
- **RLS Policies**: Row-Level Security restricts users to only see contacts where `team_id` matches their profile's `team_id`
  ```sql
  -- From 001_teams.sql
  CREATE POLICY "Team members can view team contacts" ON contacts
    FOR SELECT USING (
      team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
    );
  ```
- **API Routes**: Server services respect RLS automatically (no explicit team filtering in code)
- **UI Components**: No team selector/filter exists - users only see their own team's data

### Admin Operations (Current State)
- **Authorization**: Only specific emails can run cleanup operations (`cleanup-auth.ts`)
  - Hardcoded: `shtanaj@qero.ch`, `m.waltisberg@qero.ch`
- **Encoding Fix** (`/api/contacts/fix-encoding`): Currently scoped to user's team
  ```typescript
  // Lines 50-102 in fix-encoding/route.ts
  const { data: profile } = await supabase.from("profiles").select("team_id").eq("id", user.id).single();
  const teamId = profile?.team_id;
  const result = await scanForEncodingIssues(adminClient, teamId, true);
  ```
- **Duplicate Merge** (`/api/contacts/dedupe`): Currently scoped to user's team
  ```typescript
  // Lines 74-90 in dedupe/route.ts
  const teamId = profile?.team_id;
  let query = supabase.from("contacts").select("...");
  if (teamId) {
    query = query.eq("team_id", teamId);
  }
  ```

## Key Challenges and Analysis

### 1. RLS Policy Redesign
**Current**: Users can only SELECT contacts where `team_id = their_team_id`  
**Required**: Users can SELECT all contacts, but we need application-level filtering for good UX

**Options**:
- **Option A**: Drop team restriction from RLS SELECT policy entirely → all users see all contacts at DB level
  - ✅ Simple, no RLS complexity
  - ✅ Allows cross-team queries
  - ⚠️ Need to ensure INSERT/UPDATE/DELETE still respect teams (prevent cross-team modifications)
  
- **Option B**: Keep RLS, use admin client for cross-team reads
  - ❌ Complex, need admin client in many places
  - ❌ Breaks server-side caching patterns

**→ Recommendation: Option A** - Relax SELECT policy, keep write restrictions

### 2. Application-Level Team Filtering
**Challenge**: Don't break existing UX - users should still see "their" contacts by default

**Implementation**:
- Add `?team_id=<uuid>` query param to `/api/contacts` (optional)
- Add `?team_id=all` to fetch all teams
- Default (no param): filter to user's `team_id`
- Server service accepts optional `teamId` filter parameter

### 3. UI Team Selector
**Required UI Changes**:
- **Calling Page**: Add team filter dropdown in toolbar/header
  - Options: "Mein Team" (default), "Alle Teams", plus individual team names
- **Contacts Page**: Same team filter dropdown
- **Merge/Encoding Modals**: Add "Apply to all teams" checkbox (admin-only)

**State Management**:
- Use URL search params (`?team=elektro` or `?team=all`) for persistence
- Update `useContacts` hook to accept/pass team filter
- Update server data service to accept team filter

### 4. Admin Operations Across All Teams
**Current Problem**: Admin operations are team-scoped (only fix/merge within admin's team)

**Solution**:
- Add `?all_teams=true` query param to admin endpoints
- Check `isCleanupAllowed(user.email)` → if true, allow `all_teams` param
- When `all_teams=true`, pass `teamId = null` to processing functions
- Processing functions already handle `teamId = null` as "fetch all" (see dedupe/route.ts line 88-90)

### 5. Team Display in UI
**Enhancement**: Show which team each contact belongs to
- Add team badge/color indicator in contact list
- Already have `team` join in types (lines 52-57 of types.ts)
- Display team name/color next to company name

## High-level Task Breakdown

### 34.1 Database Migration: Relax RLS SELECT Policy ✅ PLANNED
**Change**: Update RLS policy to allow all authenticated users to SELECT contacts regardless of team
```sql
-- Drop existing restrictive SELECT policy
DROP POLICY IF EXISTS "Team members can view team contacts" ON contacts;

-- Create new permissive SELECT policy (anyone authenticated can read)
CREATE POLICY "Authenticated users can view all contacts" ON contacts
  FOR SELECT USING (auth.role() = 'authenticated');

-- Keep INSERT/UPDATE/DELETE team-restricted (prevent cross-team modifications)
-- (existing policies are fine)
```

**Success criteria**:
- Any authenticated user can SELECT contacts from any team
- INSERT/UPDATE/DELETE still restricted to user's own team
- No errors on existing queries

### 34.2 Update Server Data Service: Add Team Filter Parameter
**Files**: `src/lib/data/server-data-service.ts`, `src/lib/data/data-service.ts` (client-side)

**Change**:
- Add optional `teamId?: string | "all" | null` to `ContactFilters` type
- Update `serverContactService.getAll()`:
  ```typescript
  async getAll(filters?: ContactFilters): Promise<Contact[]> {
    // ... existing code ...
    
    // Team filtering logic
    if (filters?.teamId && filters.teamId !== "all") {
      query = query.eq("team_id", filters.teamId);
    } else if (!filters?.teamId) {
      // Default: filter to current user's team
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("team_id").eq("id", user.id).single();
        if (profile?.team_id) {
          query = query.eq("team_id", profile.team_id);
        }
      }
    }
    // If filters.teamId === "all", no team filter applied
  }
  ```

**Success criteria**:
- Default behavior (no `teamId` param): returns user's team contacts
- `teamId: "all"`: returns all contacts across all teams
- `teamId: "<uuid>"`: returns specific team's contacts
- All existing code continues to work (default filter preserves current behavior)

### 34.3 Update API Routes: Accept Team Filter
**Files**: `src/app/api/contacts/route.ts`

**Change**:
- Update `buildFilters()` to parse `team` or `team_id` from query params
- Pass through to server service
```typescript
function buildFilters(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = {
    // ... existing filters ...
    teamId: params.get('team_id') || params.get('team') || undefined,
  };
  return ContactFilterSchema.safeParse(raw);
}
```

**Success criteria**:
- `/api/contacts` returns user's team by default
- `/api/contacts?team_id=all` returns all teams
- `/api/contacts?team_id=<uuid>` returns specific team

### 34.4 Update Types and Validation
**Files**: `src/lib/types.ts`, `src/lib/validation/schemas.ts`

**Change**:
- Add `teamId?: string | null` to `ContactFilters` interface
- Update `ContactFilterSchema` to accept and validate team filter

**Success criteria**:
- TypeScript accepts new filter parameter
- Zod validation passes for valid team UUIDs and "all"

### 34.5 Create TeamFilter Component
**Files**: `src/components/contacts/TeamFilter.tsx` (new)

**Change**: Create dropdown component
```tsx
interface Props {
  value: string | "all";
  onChange: (teamId: string | "all") => void;
  teams: Team[];
  currentUserTeamId: string | null;
}
```
- Shows: "Mein Team (Elektro)" (default), "Alle Teams", individual team options
- Uses Radix Select for consistent UI
- Syncs with URL search params

**Success criteria**:
- Dropdown renders with team options
- Selecting "Alle Teams" passes "all" to onChange
- Selecting a specific team passes that team UUID
- Default shows current user's team

### 34.6 Integrate TeamFilter in Calling Page
**Files**: `src/components/calling/CallingView.tsx`

**Change**:
- Add team filter state (read from URL, default to user's team)
- Add `<TeamFilter>` to toolbar/header
- Pass team filter to `useContacts` hook
- Update URL when filter changes

**Success criteria**:
- Team filter dropdown appears in Calling page
- Changing filter refreshes contact list
- URL updates with `?team=all` or `?team=<uuid>`
- Persists across navigation/refresh

### 34.7 Integrate TeamFilter in Contacts Page
**Files**: `src/components/contacts/ContactsTable.tsx` or parent page

**Change**: Same as Calling page integration

**Success criteria**:
- Team filter works on Contacts page
- Consistent behavior with Calling page

### 34.8 Update Cleanup/Admin Operations: Support All Teams
**Files**: 
- `src/app/api/contacts/fix-encoding/route.ts`
- `src/app/api/contacts/dedupe/route.ts`

**Change**:
- Accept `?all_teams=true` query param (or similar)
- Only allow if `isCleanupAllowed(user.email) === true`
- Pass `teamId = null` to processing functions when `all_teams=true`

```typescript
// In fix-encoding/route.ts
export async function POST(request: NextRequest) {
  // ... auth checks ...
  if (!isCleanupAllowed(user.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const allTeams = request.nextUrl.searchParams.get('all_teams') === 'true';
  
  const { data: profile } = await supabase.from("profiles").select("team_id").eq("id", user.id).single();
  const teamId = allTeams ? null : profile?.team_id; // null = all teams

  const result = await scanForEncodingIssues(adminClient, teamId, true);
  // ...
}
```

**Success criteria**:
- Admins can run encoding fix on all teams via `POST /api/contacts/fix-encoding?all_teams=true`
- Admins can run dedupe on all teams via `POST /api/contacts/dedupe?all_teams=true`
- Non-admins attempting `all_teams=true` get 403 Forbidden
- Default behavior (no param): operates on user's team only

### 34.9 Update Cleanup Modals: Add "All Teams" Checkbox
**Files**: `src/components/contacts/CleanupModal.tsx` (or wherever these modals live)

**Change**:
- Add checkbox: "Apply to all teams" (only show if `isCleanupAllowed`)
- Pass `all_teams` query param when checked
- Show warning: "This will affect X companies across Y teams"

**Success criteria**:
- Admins see "All Teams" checkbox
- Non-admins don't see it
- Selecting checkbox updates preview counts
- Apply operation uses `all_teams=true` param

### 34.10 Display Team Badges in Contact Lists
**Files**: 
- `src/components/calling/ContactList.tsx`
- `src/components/contacts/ContactsTable.tsx`

**Change**:
- Show team badge/color next to company name
- Use existing `contact.team` join data
- Small colored dot or pill with team name

**Success criteria**:
- Each contact shows its team affiliation
- Color matches team color from database
- Visible but not intrusive
- Works when viewing "All Teams"

### 34.11 Update Personal Settings Join
**Files**: `src/lib/data/server-data-service.ts`

**Note**: Personal settings (`user_contact_settings`) are user-specific, not team-specific  
**Verification Needed**: Ensure personal settings queries still work when viewing contacts from other teams

**Success criteria**:
- User can set status on contacts from any team
- Personal settings remain user-specific (not leaked to other users)
- RLS on `user_contact_settings` remains intact

### 34.12 i18n Translations
**Files**: `src/messages/en.json`, `src/messages/de.json`

**Change**: Add keys
```json
{
  "contacts.teamFilter.myTeam": "Mein Team",
  "contacts.teamFilter.allTeams": "Alle Teams",
  "contacts.teamFilter.label": "Team",
  "cleanup.allTeamsCheckbox": "Auf alle Teams anwenden",
  "cleanup.allTeamsWarning": "Dies betrifft {count} Firmen in {teamCount} Teams"
}
```

**Success criteria**:
- German and English translations exist
- No hardcoded strings in components

### 34.13 Version Bump and Deploy
**Files**: `src/components/layout/Sidebar.tsx` (version display)

**Change**:
- Bump version to v1.47.0 (or next appropriate version)
- Add changelog entry

**Success criteria**:
- Version updated before deploy
- Build passes
- Deploys successfully

## Technical Implementation Notes

### RLS Policy Changes (Critical)
Current policy:
```sql
CREATE POLICY "Team members can view team contacts" ON contacts
  FOR SELECT USING (
    team_id IS NULL OR team_id = (SELECT team_id FROM profiles WHERE id = auth.uid())
  );
```

New policy:
```sql
CREATE POLICY "Authenticated users can view all contacts" ON contacts
  FOR SELECT USING (auth.role() = 'authenticated');
```

**IMPORTANT**: Keep existing UPDATE/DELETE policies unchanged to prevent cross-team modifications

### API Response Shape (no change needed)
Contacts already include team info via join:
```typescript
{
  id: "...",
  company_name: "...",
  team_id: "...",
  team: {
    id: "...",
    name: "Elektro",
    color: "#3B82F6"
  }
}
```

### Default Filter Behavior
**Key Principle**: Preserve existing UX by default
- If user doesn't specify `team` param → show only their team
- Explicit opt-in to view "all teams" or switch teams
- URL state drives the filter (enables bookmarking/sharing)

### Admin Authorization Check
```typescript
import { isCleanupAllowed } from "@/lib/utils/cleanup-auth";

// In admin endpoints:
if (!isCleanupAllowed(user.email)) {
  return NextResponse.json({ error: "Not authorized" }, { status: 403 });
}

const allTeams = request.nextUrl.searchParams.get('all_teams') === 'true';
if (allTeams && !isCleanupAllowed(user.email)) {
  return NextResponse.json({ error: "Cannot apply to all teams" }, { status: 403 });
}
```

## Success Criteria (Overall)

### For Regular Users
- [ ] Can see their team's contacts by default (existing behavior preserved)
- [ ] Can switch to "All Teams" view via dropdown
- [ ] Can switch to a specific other team via dropdown
- [ ] Can see which team each contact belongs to (badge/color)
- [ ] Personal settings (status, follow-ups) work on any contact regardless of team
- [ ] No access to admin operations

### For Admins
- [ ] All regular user features work
- [ ] Can run encoding fix on all teams via checkbox/toggle
- [ ] Can run duplicate merge on all teams via checkbox/toggle
- [ ] See clear indication when operating on "all teams" vs "my team"
- [ ] Cleanup operations log which teams were affected

### Technical
- [ ] RLS allows cross-team reads but restricts cross-team writes
- [ ] Server services default to user's team (backward compatible)
- [ ] API routes accept and respect team filter parameter
- [ ] No N+1 query issues when joining team data
- [ ] Personal settings RLS remains secure (user can only see their own)

## Risks and Mitigations

### Risk 1: Performance Impact
**Concern**: Fetching all teams' contacts could be slow  
**Mitigation**: 
- Keep default filter to user's team (no change in typical usage)
- Existing batching logic in server-data-service handles large datasets
- Add indexes on `team_id` if not already present

### Risk 2: Accidental Cross-Team Modifications
**Concern**: User might try to edit a contact from another team  
**Mitigation**:
- RLS UPDATE/DELETE policies remain team-restricted
- Database will reject cross-team updates automatically
- Could add UI-level check (disable edit for other team's contacts) as enhancement

### Risk 3: Admin Operations Too Powerful
**Concern**: Admin accidentally runs dedupe/encoding on all teams  
**Mitigation**:
- Require explicit checkbox selection (not default)
- Show preview with team breakdown before applying
- Log all operations with team scope in `contact_cleanup_runs` table

### Risk 4: Personal Settings Confusion
**Concern**: User sets status on contact from Team A, then teammate on Team A doesn't see it  
**Mitigation**:
- This is expected behavior (personal settings are per-user)
- No change from current system
- Could add tooltip: "Status is personal - only you see it"

## Project Status Board

- [x] **34.1** Database migration: Relax RLS SELECT policy ✅
- [x] **34.2** Update server data service: team filter parameter ✅
- [x] **34.3** Update API routes: accept team filter ✅
- [x] **34.4** Update types and validation schemas ✅
- [x] **34.5** Create TeamFilter component ✅
- [x] **34.6** Integrate TeamFilter in Calling page ✅
- [x] **34.7** Integrate TeamFilter in Contacts page ✅
- [x] **34.8** Update admin operations: support all teams ✅
- [ ] **34.9** Update cleanup modals: add "all teams" checkbox (DEFERRED - can be added later)
- [ ] **34.10** Display team badges in contact lists (DEFERRED - can be added later)
- [ ] **34.11** Verify personal settings work cross-team (NEEDS TESTING)
- [x] **34.12** Add i18n translations ✅
- [x] **34.13** Version bump to v1.53.0 ✅

## Executor Notes (Dec 18, 2025)
**✅ CORE IMPLEMENTATION COMPLETE**

**What was implemented:**
1. ✅ Database migration to allow cross-team reads (RLS policy updated)
2. ✅ Server data service with team filtering (default: user's team, "all": all teams, UUID: specific team)
3. ✅ API routes accept team_id/team query params
4. ✅ Admin operations (fix-encoding, dedupe) support ?all_teams=true for admins
5. ✅ TeamFilter component with dropdown UI
6. ✅ /api/teams endpoint to fetch teams
7. ✅ Calling page integrated with TeamFilter
8. ✅ Contacts page integrated with TeamFilter
9. ✅ i18n translations (German & English)
10. ✅ Version bumped to v1.53.0
11. ✅ Build passes successfully

**How it works:**
- By default, users see contacts from their own team
- Team filter dropdown allows switching to "All Teams" or any specific team
- URL params persist the selection (?team=all or ?team=<uuid>)
- Page re-renders server-side with new team data
- Personal settings (status, follow-ups) work across teams (user-specific, not team-specific)
- Admins can apply encoding fix and dedupe to all teams via ?all_teams=true query param

**Deferred (can be added incrementally):**
- Task 34.9: Add "All Teams" checkbox in cleanup modals UI (backend already supports it)
- Task 34.10: Display team color badges next to company names (data is already joined)

**Ready for deployment** - Database migration needs to be applied first:
```bash
# Apply migration in Supabase dashboard or via CLI:
supabase db push
# Or run the SQL from: supabase/migrations/041_cross_team_contact_access.sql
```

**Testing checklist for user:**
1. ✅ Build passes
2. [ ] Apply database migration (041_cross_team_contact_access.sql)
3. [ ] Test team filter dropdown in Calling page
4. [ ] Test team filter dropdown in Contacts page
5. [ ] Verify "All Teams" shows contacts from all teams
6. [ ] Verify personal status/follow-ups work on cross-team contacts
7. [ ] Test admin encoding fix with ?all_teams=true (admin only)
8. [ ] Test admin dedupe with ?all_teams=true (admin only)

## Executor's Feedback or Assistance Requests

**Ready for Review**: This plan covers the full scope of making companies available across all teams with proper filtering and admin controls.

**Questions for User**:
1. Should regular users be able to **modify** contacts from other teams, or only view them? (Current plan: view-only for other teams)
2. Team filter persistence: URL params (current plan) or localStorage? URL enables sharing/bookmarking.
3. Should we add a "Recently Viewed Teams" list for quick switching?

---

# Task 35: Outlook Contact Sync via Microsoft Graph ✅ COMPLETE

## Goal
Import Outlook personal contacts via Microsoft Graph into Supabase. No auto-loading from Outlook on page open - only manual sync button. Source of truth remains Supabase (notes/CRM fields never lost). Duplicates are skipped entirely using loose matching.

## Implementation Complete (Dec 21, 2025)

### Files Created
- `supabase/migrations/042_outlook_contact_sync.sql` - Database migration for sync state and normalized fields
- `src/app/api/contacts/outlook/sync/route.ts` - User sync endpoint
- `src/app/api/admin/contacts/outlook/sync-all/route.ts` - Admin bulk sync endpoint
- `src/components/contacts/OutlookSyncButton.tsx` - UI component with buttons
- `src/lib/utils/outlook-dedupe.ts` - Deduplication utilities
- `tests/outlook-dedupe.test.ts` - Unit tests for dedupe logic

### Files Modified
- `src/app/api/email/auth/connect/route.ts` - Added Contacts.Read scope
- `src/app/contacts/page.tsx` - Pass userEmail to ContactsTable
- `src/components/contacts/ContactsTable.tsx` - Added OutlookSyncButton

### Database Changes
New columns on `email_accounts`:
- `contacts_delta_token` - Delta token for incremental Graph sync
- `contacts_last_sync_at` - Last successful sync timestamp
- `contacts_sync_error` - Last error message if any

New columns on `contacts`:
- `source` - Import source: "outlook", "csv", or null (manual)
- `source_account_id` - FK to email_accounts for Outlook-imported contacts
- `source_graph_contact_id` - Microsoft Graph contact ID
- `normalized_phone_digits` - Generated column for dedupe
- `normalized_name` - Generated column for dedupe
- `email_domain` - Generated column for dedupe

### How It Works
1. **User clicks "Outlook Sync"** → POST /api/contacts/outlook/sync
2. API fetches user's email_account (stored OAuth tokens)
3. Calls Microsoft Graph `/me/contacts/delta` with paging
4. For each contact, checks for duplicates:
   - Same phone (digits-only) → skip
   - Same email domain (unless public like gmail.com) → skip
   - Same company name (normalized) → skip
   - Already imported (Graph ID) → skip
5. Inserts only new contacts into Supabase
6. Stores delta token for incremental sync next time

### Admin Feature
- Admins (m.waltisberg@qero.ch, shtanaj@qero.ch) see "Alle Teams" button
- POST /api/admin/contacts/outlook/sync-all loops through all connected users
- Syncs each user's Outlook contacts into their respective team

### OAuth Scope Change
- Added `https://graph.microsoft.com/Contacts.Read` to Microsoft OAuth scopes
- **Users who previously connected Outlook for email may need to reconnect** to grant the new Contacts scope

### Testing
- 158 tests pass including new dedupe tests
- Build compiles successfully

### Migration Required
Apply migration before deployment:
```bash
supabase db push
# Or run: supabase/migrations/042_outlook_contact_sync.sql
```

### Success Criteria Met
- ✅ Users can sync their own Outlook contacts with one button click
- ✅ Admins can sync all teams' contacts
- ✅ Duplicates are skipped (phone, email domain, name)
- ✅ Delta sync for incremental updates
- ✅ Source of truth stays in Supabase
- ✅ No auto-loading on page open
- ✅ All tests pass
- ✅ Build compiles

---

# Task 36: Vacancy Auto-Match Notifications (PLANNING)

## Goal
When a new vacancy is created:
1. **Automatically run the matching algorithm** - no manual trigger needed
2. **Show in-app notification**: "X matching candidates found for [Vacancy Title]"
3. **Push notification for high-urgency vacancies** (urgency ≥2) - notify team members

## Background
- Vacancy creation happens in:
  - `/api/vacancies` POST - main endpoint
  - `QuickVacancyPopup` (from Calling page) - calls above endpoint
  - `VacancyForm` (from Vakanzen page) - calls above endpoint
- Matching algorithm exists at `/api/vacancies/[id]/candidates` GET endpoint
- Push notifications work via `sendPushToUsers()` from `src/lib/push/send-notification.ts`

## High-level Task Breakdown

### 36.1 Extract Matching Logic into Reusable Function
**Files**: Create `src/lib/vacancy/match-candidates.ts`

**Change**: Extract the scoring/matching algorithm from `/api/vacancies/[id]/candidates/route.ts` into a reusable function:
```typescript
export async function findMatchingCandidates(
  supabase: SupabaseClient,
  vacancy: Vacancy,
  limit?: number
): Promise<{ candidates: MatchedCandidate[]; count: number }>
```

**Why**: Reuse in both GET candidates endpoint and POST vacancy creation

**Success criteria**:
- Function exported and callable
- Same matching results as existing endpoint
- No changes to existing API behavior

### 36.2 Update POST /api/vacancies to Return Match Count
**Files**: `src/app/api/vacancies/route.ts`

**Change**:
- After inserting vacancy, call `findMatchingCandidates()`
- Add `match_count` to response:
```typescript
return NextResponse.json({
  ...vacancy,
  match_count: matchResult.count,
  top_matches: matchResult.candidates.slice(0, 3) // Preview
}, { status: 201 });
```

**Success criteria**:
- POST /api/vacancies returns `match_count` field
- Count matches the number from GET /api/vacancies/[id]/candidates
- No performance regression (matching should be fast)

### 36.3 Update QuickVacancyPopup Success Message
**Files**: `src/components/calling/QuickVacancyPopup.tsx`

**Change**:
- On success, display match count in the success overlay
- Change message from "Vakanz erstellt!" to "Vakanz erstellt! X passende Kandidaten gefunden"
- Add click action: navigate to Vakanzen page with vacancy highlighted

**Success criteria**:
- Success message shows match count
- User knows immediately if there are matches
- Click navigates to vacancy detail

### 36.4 Update VakanzenView Success Toast
**Files**: `src/components/vakanzen/VakanzenView.tsx`

**Change**:
- After creating vacancy, show toast with match count
- Use existing toast/notification system (or add simple one)

**Success criteria**:
- Toast appears after vacancy creation
- Shows "X passende Kandidaten gefunden für [Title]"

### 36.5 Push Notification for High-Urgency Vacancies
**Files**: 
- `src/app/api/vacancies/route.ts` (or create webhook/background job)
- `src/lib/push/send-notification.ts`

**Change**:
- After vacancy creation, check urgency level
- If urgency ≥ 2, send push notification to team members
- Payload:
```typescript
{
  title: "Neue dringende Vakanz",
  body: `${vacancy.title} - ${matchCount} passende Kandidaten`,
  url: `/vakanzen?id=${vacancy.id}`,
  tag: `vacancy-${vacancy.id}` // Prevent duplicate notifications
}
```

**Who receives**:
- All users in the same team as the contact's team_id
- Query: `SELECT id FROM profiles WHERE team_id = contact.team_id`

**Success criteria**:
- Push notification sent for urgency ≥2 vacancies
- Only team members receive it
- Clicking notification opens Vakanzen page
- No notification for urgency 1 vacancies

### 36.6 Add i18n Translations
**Files**: `src/i18n/messages/de.json`, `src/i18n/messages/en.json`

**Change**: Add keys
```json
{
  "vacancy.matchingCandidates": "{count} passende Kandidaten gefunden",
  "vacancy.newUrgentVacancy": "Neue dringende Vakanz",
  "vacancy.createdWithMatches": "Vakanz erstellt! {count} passende Kandidaten"
}
```

### 36.7 Version Bump and Deploy
- Bump version to v1.57.0
- Add changelog entry

## Technical Notes

### Performance Considerations
- Matching algorithm runs on vacancy creation (synchronous)
- For large TMA datasets, this could take 100-500ms
- Consider: Run in background if slow (but user wants immediate feedback)
- Alternative: Return estimated count based on role match only (faster), full count async

### Push Notification Rate Limiting
- Don't spam users if they create multiple vacancies
- Use `tag` field to collapse notifications for same vacancy
- Consider: Daily digest instead of individual notifications (enhancement)

### Match Algorithm Reuse
The existing algorithm in `/api/vacancies/[id]/candidates` scores on:
- Role match (required if specified)
- Location distance (haversine)
- Quality rating (A/B/C)
- Activity status (active preferred)
- Driving license
- Experience level

All these fields are already in the vacancy at creation time.

## Success Criteria (Overall)
- [ ] Vacancy creation returns match count immediately
- [ ] QuickVacancyPopup shows "X passende Kandidaten" in success message
- [ ] VakanzenView shows toast with match count
- [ ] High-urgency vacancies trigger push notifications to team
- [ ] Push notification opens Vakanzen page
- [ ] No significant performance regression
- [ ] All tests pass
- [ ] Build compiles

## Project Status Board
- [ ] **36.1** Extract matching logic into reusable function
- [ ] **36.2** Update POST /api/vacancies to return match count
- [ ] **36.3** Update QuickVacancyPopup success message
- [ ] **36.4** Update VakanzenView success toast
- [ ] **36.5** Push notification for high-urgency vacancies
- [ ] **36.6** Add i18n translations
- [ ] **36.7** Version bump and deploy
