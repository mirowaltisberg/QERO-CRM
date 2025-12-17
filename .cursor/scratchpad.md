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

---

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
- **ALWAYS update version number** on every deploy (format: v1.XX.X - major.middle.small)
- If `npm test` fails with an esbuild platform/binary mismatch, running `npm rebuild esbuild` can fix it without reinstalling everything.

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
