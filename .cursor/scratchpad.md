# QERO CRM - Cold Calling CRM for Recruiters

## Background and Motivation

**Project Goal:** Build a hyper-focused Cold Calling CRM optimized for recruiters who make 100+ calls per day.

**Core Philosophy:**
- Speed over features
- Minimal clicks to complete any action
- Keyboard-first navigation
- Notion + Superhuman aesthetic (clean, fast, weightless)

**Target User:** Recruiters doing mass cold calling who need to:
1. Select contact → Call → Log outcome → Move to next (in seconds)
2. Manage large contact lists efficiently
3. Track performance metrics
4. Run reliably on modest client hardware (e.g., Intel i5-8500T, 8 GB RAM, Intel UHD 630) with a native-app feel
5. Track lead heat (Hot/Working/Follow Up) and schedule follow-ups inside the CRM

**Tech Stack:**
- Frontend: React + TypeScript + Tailwind CSS
- Backend: Supabase (PostgreSQL + Auth + RLS)
- Styling: Notion-inspired minimalistic design (black/white/gray palette)

---

## Key Challenges and Analysis

### Challenge 1: Ultra-Fast Cold Calling Flow
- **Problem:** Recruiters need to log 100+ calls/day. Any friction = lost productivity.
- **Solution:** 
  - Single-screen calling view with all controls visible
  - 1-click outcome buttons
  - Auto-advance to next contact
  - Keyboard shortcuts for everything

### Challenge 2: Notion-Style Minimalism
- **Problem:** Most CRMs are cluttered with features
- **Solution:**
  - Strict design tokens (gray palette, 1px borders, subtle shadows)
  - Maximum whitespace
  - Only show what's needed for the current task

### Challenge 3: Data Model for Speed
- **Problem:** Need to support lists, call logs, and quick filtering
- **Solution:**
  - Denormalized where beneficial for read speed
  - Proper indexes on frequently queried fields
  - Simple status enum for quick filtering

### Challenge 4: Keyboard Navigation
- **Problem:** Mouse navigation is slow
- **Solution:**
  - Global keyboard shortcuts (J/K/E/C/L/Q)
  - Command palette for quick actions
  - Focus management for seamless navigation

### Challenge 5: Native-App Performance on Modest Hardware
- **Problem:** Users on i5-8500T / 8 GB RAM experience sluggish UI, delayed button responses, multiple clicks required to trigger actions.
- **Solution Hypotheses:**
  - Profile interaction latency (React Profiler, Performance tab) to identify expensive re-renders or blocking async work.
  - Reduce bundle weight & unnecessary client components; prefer server components + streaming where possible.
  - Virtualize large lists (contact table, calling list) and memoize derived data to lower DOM/React workload.
  - Offload heavy fetches to background prefetch / cache layers; debounce user-triggered mutations.
  - Audit animations/transitions for GPU-friendliness; avoid layout thrash (prefer transform/opacity).

### Challenge 6: Lead Heat Tracking & Follow-up Scheduling
- **Problem:** Current “NEW” badge is noisy and doesn’t reflect recruiter workflow; no way to schedule or monitor follow-ups.
- **Solution Hypotheses:**
  - Replace legacy statuses with streamlined lead-heat tags (Hot, Working, Follow Up) and show lightweight badges.
  - Provide one-click follow-up scheduling (next day 9 AM) plus custom datetime picker, persisting to Supabase.
  - Surface upcoming follow-ups on dashboard metrics/cards for quick action.

---

## High-level Task Breakdown

### Phase 1: Foundation (Tasks 1-3)

**Task 1: Project Setup & File Structure**
- [ ] Initialize Next.js 14 project with TypeScript (App Router)
- [ ] Configure Tailwind with custom design tokens (gray palette, spacing, radius)
- [ ] Set up complete folder structure
- [ ] Create base layout with navigation sidebar
- [ ] Set up keyboard shortcut hook infrastructure
- **Success Criteria:** `npm run dev` works, Tailwind loads, layout renders with sidebar navigation

**Task 2: Data Layer with Mock Data**
- [ ] Create TypeScript types for all entities (Contact, CallLog, List, ListMember)
- [ ] Create mock data file with 15-20 sample contacts
- [ ] Create data service layer (abstracts data source)
- [ ] Write SQL schema file (for future Supabase connection)
- [ ] Prepare Supabase client files (commented out until connected)
- **Success Criteria:** Types defined, mock data renders, schema SQL ready for later
- **Note:** Will connect real Supabase database after core features work

**Task 3: Core UI Components**
- [ ] Button (variants: primary, secondary, ghost, danger)
- [ ] Input (text, textarea with autosave)
- [ ] Tag (for status display)
- [ ] Badge (for counts)
- [ ] Panel (card container)
- [ ] Modal (dialog)
- **Success Criteria:** All components render with Notion-style aesthetics

### Phase 2: Core Features (Tasks 4-6)

**Task 4: API Routes + Data Layer**
- [ ] GET /api/contacts (with filters: status, canton, search)
- [ ] POST /api/contacts (create new contact)
- [ ] GET /api/contacts/[id] (single contact)
- [ ] PATCH /api/contacts/[id] (update contact)
- [ ] DELETE /api/contacts/[id] (delete contact)
- [ ] POST /api/call (log call outcome, updates contact.last_call and status)
- [ ] GET /api/call?contact_id= (get call history for contact)
- [ ] Supabase client integration
- **Success Criteria:** All endpoints tested and working

#### Task 4 Detailed Plan (Planner)
1. **Route Files & Structure**
   - `src/app/api/contacts/route.ts`: collection handler (`GET` list with filters, `POST` create).
   - `src/app/api/contacts/[id]/route.ts`: single resource (`GET`, `PATCH`, `DELETE`).
   - `src/app/api/call/route.ts`: `GET` by `contact_id`, `POST` to log outcome.
2. **Validation Layer**
   - Add `zod` for runtime schema validation of request bodies/query params.
   - Define schemas for contact create/update + call logging.
   - Map validation errors → `400 Bad Request` with helpful messages.
3. **Data Source Abstraction**
   - Use existing `contactService`, `callLogService`, `listService` for actual operations.
   - Keep TODO comments where Supabase queries will replace service usage later.
   - Ensure functions remain async to ease future swap.
4. **Response Shape**
   - Standard JSON envelope: `{ data, error }`.
   - Use appropriate HTTP codes (`200/201`, `400`, `404`, `500`).
   - Include metadata placeholders (e.g., `meta: { count }`) for list responses.
5. **Error Handling**
   - Central helper to format errors (validation vs unexpected).
   - Graceful handling when ID not found (404) or method unsupported (405).
6. **Testing / Verification**
   - Manual `curl`/REST client smoke tests for each endpoint (document commands in README notes).
   - Unit smoke tests optional future step; ensure `npm run lint` + `npm run dev` remain clean.
7. **Supabase Readiness**
   - Keep Supabase client imports commented with clear instructions.
   - Limit use of Node-specific APIs so handlers remain edge-compatible if needed.

**Task 5: Cold Calling View + Keyboard Shortcuts (PRIMARY FEATURE)**
- [ ] Two-panel layout: contact list (left) + detail panel (right)
- [ ] Contact list with selection highlighting
- [ ] Contact detail panel with all fields
- [ ] Big prominent CALL button (tel: link)
- [ ] 1-click outcome buttons: No Answer, Not Interested, Interested, Follow-Up, Meeting Set
- [ ] Notes field with autosave (debounced)
- [ ] Auto-advance to next contact after logging outcome
- [ ] Keyboard shortcuts integrated:
  - J/K = navigate up/down contact list
  - C = initiate call
  - 1-5 = quick outcome selection
  - N = focus notes field
  - Enter = confirm and advance
- **Success Criteria:** 
  - Full calling workflow possible without mouse
  - Can log outcome and advance to next contact in <3 seconds
  - Keyboard shortcuts work throughout

**Task 6: Table View**
- [ ] Notion-style table with sortable columns
- [ ] Inline editing (click cell to edit)
- [ ] Search bar (searches company_name, contact_name, email)
- [ ] Filter dropdowns (canton, status)
- [ ] Checkbox multi-select
- [ ] Bulk action bar (appears when items selected):
  - Assign to list
  - Update status
  - Delete
- **Success Criteria:** Can search, filter, inline edit, and bulk update contacts

#### Task 6 Detailed Plan (Planner)
1. **Data Loading & Hooks**
   - Server component fetches initial contacts + lists using `contactService` and `listService`.
   - Create `useContactsTable` hook managing filters (status, canton, search), sorting, selection, inline edits, bulk actions.
   - Debounce search input (250ms) and keep filter state mirrored in URL search params.
2. **Layout & Controls**
   - Top toolbar: search, status pills, canton dropdown, bulk actions summary, quick stats (total, selected).
   - Main table uses responsive, zebra-styled rows with sticky header; optional density toggle for compact mode.
   - Left optional panel for saved lists (drag future extension).
3. **Table Functionality**
   - Columns: checkbox, company, contact, canton, status (editable tag), last call, notes snippet, lists (badges).
   - Inline status change via dropdown that PATCHes contact.
   - Notes icon opens modal editor with autosave.
   - Sorting per column (client-side for now).
4. **Bulk Actions**
   - `Assign to list`: modal to select list, uses `listService.addContacts`.
   - `Update status`: apply single status to all selected (PATCH loop or future batch endpoint).
   - `Delete`: confirmation modal, call DELETE API for each (or future batch).
   - Show contextual bulk bar when `selected.length > 0`.
5. **Keyboard & Accessibility**
   - Arrow keys move focused row; space toggles checkbox; Cmd/Ctrl+A selects all filtered rows.
   - Provide screen-reader text for selection counts, live region for bulk operations.
   - Maintain tab order and focus styling consistent with Notion aesthetic.
6. **Testing & Validation**
   - Manual: filter combos, search, inline status change, list assignment, delete flow.
   - Keep `npm run lint` green; consider small unit test for table hook lookups if time.

### Phase 3: Dashboard & Polish (Tasks 7-8)

**Task 7: Dashboard**
- [ ] Stats cards: Calls Today, Calls This Week, Follow-ups Due
- [ ] Conversion rate metric
- [ ] Top performing lists
- [ ] Ultra-minimal chart (gray lines, tiny accents)
- **Success Criteria:** Dashboard displays real aggregated data from call_logs

#### Task 7 Detailed Plan (Planner)
1. **Data Requirements**
   - Extend `statsService.getDashboardStats()` (already exists) if needed for extra metrics (e.g. calls trend data per day).
   - Fetch aggregated stats + lists server-side in `src/app/dashboard/page.tsx` to keep page fast (RSC).
   - Provide sample “calls per day” array for mini chart (use `callLogService` to group by date).
2. **UI Layout**
   - Hero row with stat cards (calls today/week, follow-ups due, conversion rate) using `Panel`/`StatsCard`.
   - Secondary row: mini line chart for call volume trend, list of top lists (by contact count/call count).
   - Keep Notion aesthetic: white background, subtle grid, small typography.
3. **Components**
   - `StatsCard` (value, label, delta).
   - `MiniChart` (SVG line sparkline), `TopLists` list (name, contact count, call count).
   - `FollowUpsList` (optional) showing next follow-up contacts.
4. **Interactivity**
   - Add filter chips (Today / Week / Month) for chart (client component hooking into cached data).
   - Keyboard: numbers to jump between cards? (optional; focus on read speed).
5. **Testing**
   - Verify data renders with mock dataset.
   - Run `npm run lint`.

**Task 9: Command Palette & Final Polish**
- [ ] Command Palette (Q to open):
  - Quick navigation to views
  - Search contacts
  - Quick actions
- [ ] E = edit current contact (opens modal)
- [ ] L = open call log
- [ ] ARIA labels on all interactive elements
- [ ] Loading states
- [ ] Error handling with toast notifications
- **Success Criteria:** App fully keyboard navigable, accessible, production-ready

**Task 20: TMA Mode (Candidate CRM)**

**Background / Goal**
- Users need a dedicated area for tracking **TMA (talent/employee) records** independent from company contacts.
- TMA entries require CSV import, document storage (CV + Zeugnisse), custom status labels (A/B/C), canton filters, rich notes, and follow-ups similar to companies.
- UI should expose TMA as a new primary nav item under Companies, with its own calling/table/dashboard surfaces eventually.

**Key Workstreams**
1. **Data Model**
   - Create new Supabase table `tma_candidates` with fields: `id`, `first_name`, `last_name`, `phone`, `email`, `canton`, `status` (enum A/B/C), `notes`, `follow_up_at`, `follow_up_note`, `cv_url`, `references_url`, `created_at`.
   - Document storage: configure Supabase Storage bucket `tma-docs/` for CVs & Zeugnisse; store signed URLs.
   - Zod schemas + TypeScript types mirroring new table.

2. **API Layer**
   - New Next.js routes `/api/tma` (GET/POST), `/api/tma/[id]` (GET/PATCH/DELETE), `/api/tma/import` (POST for CSV).
   - Services similar to `contactService`, but scoped to `tma` table + storage helpers for file uploads.

3. **UI / Navigation**
   - Update Sidebar nav: add “TMA” entry beneath Companies.
   - Create `/tma` route with table/filters (status A/B/C, canton, search) and CSV importer (mapping candidate fields).
   - Provide detail drawer/panel showing candidate info, large notes area, follow-up scheduling (same pattern as companies but with A/B/C statuses).
   - Add document upload controls (CV, Zeugnisse) with drag/drop + preview/download links.

4. **CSV Import**
   - New importer component accepting candidate CSV, mapping headers (Vorname, Nachname, Kanton, etc.) to TMA schema.
   - Batch processing similar to contacts importer; after import show summary and refresh TMA list.

5. **Storage Integration**
   - Expose file upload UI in candidate detail to push to Supabase Storage via signed URLs (server action or API route).
   - Display uploaded docs as badges/links with metadata (uploaded at).

6. **Follow-up & Status**
   - Replace Hot/Working/Follow Up with TMA statuses A/B/C (color-coded).
   - Keep follow-up scheduling identical to companies (tomorrow 9am + custom), highlight next action in list/table.

7. **Dashboard Tie-in (later)**
   - Future work: unify dashboards or add TMA-focused metrics (A/B/C counts, upcoming candidate follow-ups).

**Success Criteria**
- Sidebar shows new TMA mode, fully functional table + detail view separated from companies.
- Users can import candidates via CSV, upload CV/Zeugnisse, assign status A/B/C, schedule follow-ups, and filter by canton.
- Supabase schema + storage configured, deployed, and documented.

## Phase 5: Performance & Native Feel

**Task 14: Profiling & Baseline Metrics**
- [ ] Capture React Profiler + Chrome Performance traces for /calling & /contacts.
- [ ] Measure interaction latency (button click → UI update), render counts, bundle size (`next build --analyze`).
- [ ] Document top CPU/paint bottlenecks and set target budgets (e.g., <200 ms contact switch).
- **Success Criteria:** Written profiling report with quantified hotspots & baseline numbers.

**Task 15: Interaction Responsiveness**
- [ ] Optimize button handlers (call, outcomes, bulk actions) to remove redundant async work and state churn.
- [ ] Add optimistic UI / `useTransition` where needed so feedback appears instantly.
- [ ] Ensure focus/pressed states show within 100 ms on target hardware; eliminate double-click necessity.
- **Success Criteria:** Manual timing/profiler shows <100 ms from click to visual feedback across core actions.

**Task 16: List Rendering Optimization**
- [ ] Virtualize large lists/tables (ContactList, ContactsTable) via `@tanstack/react-virtual` or similar.
- [ ] Memoize heavy selectors & avoid re-sorting/filtering on every render; split ContactDetail into memoized subcomponents.
- [ ] Reduce DOM weight (only render visible rows) and ensure scroll remains 60 fps with 1.3k+ rows.
- **Success Criteria:** Main thread frames stay under 16 ms during scroll/selection; profiler shows drastic render count drop.

**Task 17: Data Fetching & Caching**
- [ ] Ensure Supabase queries use pagination/keyset to avoid multi-thousand row payloads per interaction.
- [ ] Introduce client-side cache (SWR/React Query/custom store) so UI reuses fetched contacts instead of refetching.
- [ ] Prefetch neighboring contacts/call logs to make navigation instantaneous.
- **Success Criteria:** No duplicate fetches in Network tab during normal flow; contact switch does not trigger full reload.

**Task 18: Animation & Bundle Polish**
- [ ] Audit Framer Motion usage; keep essential transitions ≤200 ms, prefer CSS transforms.
- [ ] Lazy-load non-critical routes/components and drop unused dependencies.
- [ ] Re-run Lighthouse/Next build stats to confirm meaningful bundle & TTI improvements.
- **Success Criteria:** Production bundle shrinks ≥15%, Lighthouse Interaction to Next Paint in green, app “feels native” on i5-8500T/8 GB.

**Task 19: Status Model Overhaul & Follow-up Scheduling**

**Requirements**
- Replace legacy status pill (“NEW”) with new categories: **Hot**, **Working**, **Follow Up**.
- Status should update when contact is opened/acted upon (e.g., default to Working after first view unless already Hot/Follow Up).
- Provide follow-up controls in Calling view:
  - Quick button: “Follow Up tomorrow 09:00”
  - Custom scheduling (date + time picker) with ability to add note.
  - Store follow-up timestamp + note in Supabase (likely `contacts.follow_up_at` + `follow_up_note` columns).
- Dashboard must highlight upcoming follow-ups (count + list) and show conversions by status.

**Implementation Plan**
1. **Data Model**
   - Add columns to Supabase: `lead_status` (enum: hot/working/follow_up), `follow_up_at` (timestamptz), `follow_up_note` (text).
   - Create migration SQL + update `supabase/schema.sql`; ensure RLS allows owner updates.
2. **API & Services**
   - Extend Zod schemas/types to include new fields.
   - Update contact service (client & server) to read/write `lead_status` and follow-up info.
3. **UI Updates**
   - Replace Tag usage across Calling/Contacts/Dashboard to show new statuses (color-coded, subtle).
   - Add follow-up CTA in `ContactDetail` (buttons for quick + custom modal).
   - In Contacts table, add columns/filtering for lead status & follow-up date.
4. **Dashboard**
   - Show “Follow-ups due today/tomorrow” metric.
   - Add list of upcoming follow-ups (sorted by `follow_up_at`) with link to open contact.
5. **Automation**
   - When contact opened from Calling view:
     - If status empty → set to Working.
     - If follow-up was due and action taken, optionally clear after completion.
6. **Testing**
   - Manual flow: set statuses, schedule follow-ups, verify persistence + dashboard counts.
   - Ensure migrations run on Supabase instance before deploy.

**Success Criteria**
- Recruiter can tag contact Hot/Working/Follow Up from calling/table views.
- Follow-up quick actions persist to Supabase and appear on dashboard list.
- Default status transitions don’t feel intrusive; UI no longer shows redundant “NEW” pill.

---

## Project Status Board

### Current Phase: Phase 5 – Performance & Native Feel

### Todo
- [ ] Task 17: Data Fetching & Caching
- [ ] Task 18: Animation & Bundle Polish
- [ ] Task 20: TMA Mode (Candidate CRM) with CSV import & document uploads

### In Progress
- (none)

### Completed
- [x] Task 1: Project Setup & File Structure ✅
- [x] Task 2: Data Layer with Mock Data ✅
- [x] Task 3: Core UI Components ✅
- [x] Task 4: API Routes + Data Layer ✅
- [x] Task 5: Cold Calling View + Keyboard Shortcuts ✅
- [x] Task 6: Table View ✅
- [x] Task 7: Dashboard ✅
- [x] Task 8: Canton Tags + Apple-like Polish ✅
- [x] Task 9: Supabase + Vercel Deployment ✅
- [x] Task 10: Authentication System (Supabase Auth) ✅
- [x] Task 11: Account Settings Dashboard ✅
- [x] Task 12: Large Dataset Support (10k+ contacts) ✅
- [x] Task 13: Smooth notes autosave indicator ✅
- [x] Task 14: Profiling & Baseline Metrics ✅
- [x] Task 15: Interaction Responsiveness ✅
- [x] Task 16: List Rendering Optimization ✅
- [x] Task 19: Status Model Overhaul & Follow-up Scheduling ✅

### Blocked
- (none)

## Current Status / Progress Tracking
- Task 13 completed: Notes autosave indicator now debounced + subtle “Saving/Synced” states, preventing flicker spam.
- Tasks 14-16 delivered (profiling insights, interaction responsiveness, list virt) and deployed; app now feels instant on target hardware.
- Task 19 completed: database + UI now use Hot/Working/Follow Up statuses, quick/custom follow-up scheduling, dashboard follow-up cards, Supabase schema updated & deployed.
- Task 20 scoped: TMA (talent) mode will mirror company CRM with separate data model, CSV import, doc uploads, and candidate-specific labels (A/B/C) + canton filters + follow-ups.

---

## Phase 4: Authentication & User Management

### Task 10: Authentication System (Supabase Auth)

**Requirements:**
- Registration with: Full Name, Swiss Phone Number, @qero.ch email only
- Email confirmation link required
- Login via email/password
- Protected routes (redirect to login if not authenticated)

**Technical Approach:**
1. **Use Supabase Auth** (not Vercel Auth - Supabase Auth is already integrated and more suitable)
   - Supabase Auth supports email confirmation, custom email templates, and integrates with our existing Supabase setup
   - No additional setup needed - just enable email auth in Supabase dashboard

2. **Registration Validation:**
   - Email must end with `@qero.ch`
   - Swiss phone format validation (+41 or 0xx xxx xx xx)
   - Full name required (min 2 characters)

3. **Database Schema Addition:**
   ```sql
   -- profiles table (extends auth.users)
   CREATE TABLE profiles (
     id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
     full_name TEXT NOT NULL,
     phone TEXT NOT NULL,
     avatar_url TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   
   -- Enable RLS
   ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
   
   -- Users can only read/update their own profile
   CREATE POLICY "Users can view own profile" ON profiles
     FOR SELECT USING (auth.uid() = id);
   CREATE POLICY "Users can update own profile" ON profiles
     FOR UPDATE USING (auth.uid() = id);
   ```

4. **File Structure:**
   ```
   src/app/
   ├── (auth)/
   │   ├── login/page.tsx
   │   ├── register/page.tsx
   │   └── confirm/page.tsx      # Email confirmation landing
   ├── (protected)/
   │   ├── layout.tsx            # Auth guard wrapper
   │   ├── calling/page.tsx
   │   ├── contacts/page.tsx
   │   ├── dashboard/page.tsx
   │   └── settings/
   │       └── page.tsx          # Account settings
   src/lib/
   ├── auth/
   │   ├── middleware.ts         # Auth middleware
   │   └── actions.ts            # Server actions for auth
   ```

5. **Implementation Steps:**
   - [ ] Add profiles table to Supabase
   - [ ] Create login page with email/password form
   - [ ] Create registration page with validation (@qero.ch, Swiss phone)
   - [ ] Set up email confirmation flow
   - [ ] Create auth middleware to protect routes
   - [ ] Update layout to show user info in sidebar
   - [ ] Add logout functionality

**Success Criteria:**
- Only @qero.ch emails can register
- Email confirmation required before access
- Protected routes redirect to login
- User session persists across page refreshes

---

### Task 11: Account Settings Dashboard

**Requirements:**
- Profile picture upload (stored in Supabase Storage)
- Edit full name
- View/edit phone number
- Change password
- View email (read-only)

**UI Design:**
- Minimalistic settings page matching existing aesthetic
- Avatar with upload overlay on hover
- Form fields with autosave (like notes in calling view)
- Success/error toast notifications

**File Structure:**
```
src/app/(protected)/settings/
├── page.tsx                    # Settings page
src/components/settings/
├── ProfileForm.tsx             # Name, phone, avatar
├── AvatarUpload.tsx            # Image upload component
├── PasswordChange.tsx          # Change password form
```

**Implementation Steps:**
- [ ] Create Supabase Storage bucket for avatars
- [ ] Build AvatarUpload component with drag-drop
- [ ] Build ProfileForm with autosave
- [ ] Build PasswordChange form
- [ ] Create settings page layout
- [ ] Add settings link to sidebar
- [ ] Test full flow

**Success Criteria:**
- Can upload/change profile picture
- Can edit name and phone
- Can change password
- Changes persist and reflect across app

---

## Executor's Feedback or Assistance Requests

### Plan Review Completed (Executor)
Reviewed original requirements against plan. Changes made:

1. **Merged keyboard navigation into Task 5** - shortcuts are core to Cold Calling View, not polish
2. **Reduced from 9 tasks to 8 tasks** - combined related work
3. **Added /api/contacts/[id] route** - needed for individual PATCH/DELETE operations
4. **Added keyboard shortcut numbers 1-5** - for quick outcome selection during calls
5. **Clarified file structure** - added comments explaining each file's purpose
6. **Task 5 is now the PRIMARY feature** - marked with ⭐
7. **Nov 30:** Executor addressing Task 13 (smooth notes autosave indicator, remove flicker)

### Decision Log
- **Mock Data First:** User confirmed to start with mock/sample data, connect Supabase later
- Plan approved, beginning Task 1
- **Nov 26:** User requested visible canton tags + smoother Apple-like animations across the product
- **Nov 26 (PM):** User requested deeper animation polish, canton-specific color coding (e.g., Zürich blue, Thurgau green), canton-based listing controls, and company-only contacts
- **Nov 30 (PM):** User prioritized native-feel performance on i5-8500T / 8 GB RAM setups → Phase 5 plan (Tasks 14-18) added.
- **Dec 01:** User requested removal of “NEW” badge, introduction of Hot/Working/Follow Up statuses, follow-up scheduling (quick + custom), and dashboard surfacing → Task 19 added.

### Task 2 Completion Notes
- Strongly typed entities in `src/lib/types.ts` mirroring Supabase schema
- Swiss-focused mock data + seed SQL for contacts, lists, list_members, call_logs
- Data service abstraction with filtering, bulk ops, dashboard stats (`src/lib/data/data-service.ts`)
- Supabase client stubs with setup instructions (`src/lib/supabase/*`)
- Ready to swap mock service with Supabase queries once credentials are added

### Task 3 Completion Notes
- Built reusable primitives in `src/components/ui/` (Button, Input, Textarea with autosave, Tag, Badge, Panel, Modal)
- Centralized exports via `src/components/ui/index.ts` for easy imports
- Tailored status colors + badges hooked into design tokens (`CONTACT_STATUS_COLORS`)
- Modal handles focus, ESC, overlay click, and body scroll lock; Textarea supports debounced autosave indicators

### Task 4 Completion Notes
- Added `zod`-backed validation schemas (`src/lib/validation/schemas.ts`) for contact CRUD, filters, and call logs
- Introduced API response helpers (`respondSuccess`, `respondError`) for consistent envelopes
- Implemented Next.js route handlers:
  - `api/contacts` (list + create with filters and metas)
  - `api/contacts/[id]` (get/update/delete)
  - `api/call` (list by contact + log outcome)
- Routes remain wired to `contactService`/`callLogService` with clear TODOs for future Supabase swap
- Smoke-tested with `curl http://localhost:3000/api/contacts` and `npm run lint`

### Task 5 Completion Notes
- Built full Cold Calling surface (`CallingView`, `ContactList`, `ContactDetail`, `OutcomeButtons`) with Notion-style split layout
- Added `useContacts` hook for fetching, selection, auto-advance, logging outcomes, and debounced note saving via `/api` routes
- Integrated keyboard shortcuts (J/K, C, 1-5, N, Enter) using existing `useKeyboardShortcuts` hook
- Notes field autosaves via PATCH `/api/contacts/:id`, outcome buttons trigger `/api/call`, and auto-advance moves to next contact in the queue
- Implemented client/server bridge: server component fetches initial contacts, client component handles speed-sensitive UX

### Task 6 Completion Notes
- Implemented Notion-style table (`ContactsTable`, `TableToolbar`) with search, status pills, canton filters, sortable headers, selection checkboxes
- Created `useContactsTable` hook for filtering, sorting, selection, and bulk actions (status update, assign list placeholder, delete)
- Added bulk action bar and modals with contextual counts, integrated with existing API routes for PATCH/DELETE operations
- Table rows show key info (status tags, last call, notes snippet) with responsive zebra styling and sticky header

### Task 7 Completion Notes
- Extended `statsService.getDashboardStats()` to return call trend data and follow-up contact list
- Built dashboard components (`StatsCard`, `MiniTrend`, `TopLists`, `FollowUpsList`) for minimal stat presentation
- Server-rendered dashboard page aggregates metrics and renders hero stats + chart + follow-up widgets
- Layout keeps Notion aesthetic: subtle cards, inline hints, responsive grids

### Task 8 Completion Notes (Canton Tags + Apple-like Polish)
- Refreshed global design tokens (larger radii, smoother cubic-bezier transitions, soft shadows) for all surfaces
- Updated core UI components (Button, Panel, Input, Textarea, Modal, Tag) to adopt the new curvature + animation tokens
- Introduced reusable `CantonTag` component with regional color palettes and click-to-filter support
- Surfaced canton tags across Calling View (list + detail), Contacts table rows, and Dashboard follow-ups; clicking tags filters instantly
- Added hover/focus micro-interactions (lift/translate) to list items, table rows, and cards for Apple-like fluidity

### Task 9 Detailed Plan (Animation Polish + Canton Controls + Company Vocabulary)
1. **Animation Deep Dive**
   - Audit key interactions (calling list transitions, table hover, button press, modal entry) and implement tangible transform/opacity animations using Framer Motion or CSS keyframes.
   - Ensure smooth 60fps transitions on Safari (prefer `transform` over expensive properties, use `will-change` where needed).
   - Add page-level fade/slide transitions between routes if feasible (App Router `Transition`).
2. **Canton Color System**
   - Expand `CantonTag` mapping to explicit canton codes (e.g., `ZH` blue, `TG` green) with consistent usage in list/table/dash.
   - Add legend or chip group showing color meaning; allow quick filter toggles for each canton via button.
3. **Canton Listing Controls**
   - Add “Group by Canton” toggle in Contacts + Calling views:
     * Contacts page: segmented control (All / Grouped) + filter button to open canton picker; when grouped, show subheaders per canton.
     * Calling view: button near list header to sort/group by canton and optionally filter.
4. **Company-Only Vocabulary**
   - Rename data labels and sample data to represent companies (remove personal contact names, replace with titles like “HR Lead” or leave blank).
   - Update UI copy: “Company Name”, “Primary Contact Role (optional)” or similar; adjust API data (mock) to align.
   - Ensure fields still map to DB columns; consider renaming `contact_name` to `company_contact` later (out of scope now, but update labels).
5. **Implementation Order**
   - Update mock data + UI labels first (so vocabulary is consistent).
   - Enhance `CantonTag` color mapping + add grouping controls (hooks, new buttons).
   - Layer in animation improvements (global CSS + key component-level transitions, optionally using `framer-motion` if needed).
6. **Testing**
   - Manual QA on /calling and /contacts to ensure grouping/filter buttons work and animations are visible.
   - `npm run lint` and confirm dev server performance.

---

## Lessons

1. **npm naming restrictions**: Cannot use capital letters in project names. Created project with lowercase name then copied files.
2. **node_modules copy issues**: When copying project files, reinstall node_modules rather than copying them to avoid module resolution errors.

---

## Technical Specifications

### File Structure (Proposed)
```
QERO_CRM/
├── .cursor/
│   └── scratchpad.md
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with sidebar nav
│   │   ├── page.tsx                # Redirects to /calling
│   │   ├── calling/
│   │   │   └── page.tsx            # ⭐ Cold Calling View (PRIMARY)
│   │   ├── contacts/
│   │   │   └── page.tsx            # Table View
│   │   ├── dashboard/
│   │   │   └── page.tsx            # Dashboard
│   │   └── api/
│   │       ├── contacts/
│   │       │   ├── route.ts        # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       └── route.ts    # GET, PATCH, DELETE (single)
│   │       └── call/
│   │           └── route.ts        # GET (history), POST (log call)
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Textarea.tsx
│   │   │   ├── Tag.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Panel.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Table.tsx
│   │   │   └── CommandPalette.tsx
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── KeyboardHints.tsx
│   │   ├── calling/
│   │   │   ├── ContactList.tsx     # Left panel list
│   │   │   ├── ContactDetail.tsx   # Right panel detail
│   │   │   ├── CallButton.tsx      # Big call button
│   │   │   └── OutcomeButtons.tsx  # 1-click outcome buttons
│   │   ├── contacts/
│   │   │   ├── ContactsTable.tsx
│   │   │   ├── ContactFilters.tsx
│   │   │   └── BulkActions.tsx
│   │   └── dashboard/
│   │       ├── StatsCard.tsx
│   │       └── MiniChart.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # Browser client
│   │   │   ├── server.ts           # Server client
│   │   │   └── types.ts            # TypeScript types
│   │   ├── hooks/
│   │   │   ├── useContacts.ts
│   │   │   ├── useCallLog.ts
│   │   │   └── useKeyboardShortcuts.ts
│   │   └── utils/
│   │       ├── cn.ts               # className helper
│   │       └── constants.ts        # Status/outcome enums
│   └── styles/
│       └── globals.css
├── supabase/
│   ├── schema.sql                  # Full database schema
│   └── seed.sql                    # Sample data
├── tailwind.config.ts
├── package.json
├── tsconfig.json
├── .env.local.example              # Environment template
└── README.md
```

### Design Tokens (Proposed)
```css
/* Colors - Ultra minimal gray palette */
--gray-50: #FAFAFA;
--gray-100: #F5F5F5;
--gray-200: #E5E5E5;
--gray-300: #D4D4D4;
--gray-400: #A3A3A3;
--gray-500: #737373;
--gray-600: #525252;
--gray-700: #404040;
--gray-800: #262626;
--gray-900: #171717;

/* Accents - Very subtle */
--accent-blue: #2563EB;
--accent-green: #16A34A;
--accent-red: #DC2626;
--accent-yellow: #CA8A04;

/* Spacing */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;

/* Radius */
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;

/* Borders */
--border: 1px solid #E5E5E5;
```

### Supabase Schema (Proposed)
```sql
-- contacts table
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  canton TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'called', 'interested', 'not_interested', 'follow_up', 'wrong_number')),
  last_call TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- call_logs table
CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('no_answer', 'interested', 'follow_up', 'wrong_number', 'meeting_set', 'not_interested')),
  notes TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- lists table
CREATE TABLE lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- list_members junction table
CREATE TABLE list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID REFERENCES lists(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  UNIQUE(list_id, contact_id)
);

-- Indexes for performance
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_canton ON contacts(canton);
CREATE INDEX idx_call_logs_contact ON call_logs(contact_id);
CREATE INDEX idx_call_logs_timestamp ON call_logs(timestamp);
```

---

## Notes

- User preference: Minimalistic white-mode based UI (from memory)
- Focus on Cold Calling View first - it's the heart of the product
- Every interaction should feel instant
- Keyboard shortcuts (from original requirements):
  - J/K = move up/down contact list
  - E = edit
  - C = call
  - L = log
  - Q = quick actions menu (command palette)
- Outcome buttons: No Answer, Not Interested, Interested, Follow-Up, Meeting Set
- Contact statuses: new, called, interested, not_interested, follow_up, wrong_number

