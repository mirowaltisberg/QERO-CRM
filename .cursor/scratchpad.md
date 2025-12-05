# Background and Motivation
- Implement PWA (Progressive Web App) with Web Push Notifications ✅
- Allow users to install QERO CRM to their phone's home screen ✅
- Get push notifications when someone sends a chat message ✅
- Chat realtime stabilized ✅
- **NEW: Make follow-ups and status PERSONAL per user (not shared across team)**

# Key Challenges and Analysis

## Personal Follow-ups & Status
Currently, `status`, `follow_up_at`, and `follow_up_note` are stored directly on the `contacts` and `tma_candidates` tables. This means when User A sets a follow-up, User B sees it too.

**Goal:** Each user has their own follow-up schedule and status tags for contacts. User A's follow-ups don't affect User B.

**Approach:** Create a junction table that stores per-user settings:

```sql
user_contact_settings (
  user_id     → profiles.id
  contact_id  → contacts.id  
  status      → 'hot' | 'working' | 'follow_up' | null
  follow_up_at → timestamp
  follow_up_note → text
)
```

Same for TMA:
```sql
user_tma_settings (
  user_id     → profiles.id
  tma_id      → tma_candidates.id
  status      → 'A' | 'B' | 'C' | null
  follow_up_at → timestamp
  follow_up_note → text
)
```

# High-level Task Breakdown

## Task 19: Personal Follow-ups & Status

### Step 1: Create database migration
- Create `user_contact_settings` table
- Create `user_tma_settings` table
- Add indexes for efficient querying
- Set up RLS policies
- **DO NOT migrate old data** (user confirmed deletion is OK)

**Success criteria:** Tables exist in Supabase, RLS works correctly

---

### Step 2: Update Contacts API routes
- `GET /api/contacts` - Join with `user_contact_settings` to get current user's status/follow-up
- `PATCH /api/contacts/[id]` - Write to `user_contact_settings` instead of `contacts` table
- Keep shared fields (company_name, phone, etc.) on `contacts` table

**Success criteria:** API returns personal status/follow-up for each user

---

### Step 3: Update TMA API routes
- Same pattern as contacts
- `GET /api/tma` - Join with `user_tma_settings`
- `PATCH /api/tma/[id]` - Write to `user_tma_settings`

**Success criteria:** API returns personal status/follow-up for TMA

---

### Step 4: Update Follow-ups API
- `GET /api/followups` - Filter by `user_id = current_user`
- Only show the logged-in user's due follow-ups

**Success criteria:** Each user sees only their own follow-ups

---

### Step 5: Update types and frontend
- Update TypeScript types to reflect the new structure
- Ensure CallingView and TMA views work correctly
- Test end-to-end

**Success criteria:** UI shows personal follow-ups, setting a follow-up doesn't affect other users

---

# Project Status Board
- [x] Task 1-7: PWA & Push Notifications
- [x] Task 8-11: Chat Realtime Stability
- [x] Task 16: Favicon/Icons
- [x] Task 17: Batched call-logs
- [x] Task 18: Login CORS fix
- [ ] **Task 19: Personal follow-ups & status** ← CURRENT

# Current Status / Progress Tracking
- Planner: Task 19 planned, awaiting approval to execute

# Executor's Feedback or Assistance Requests
- None

# Lessons
- VAPID keys are free to generate
- Service worker must be at root (public/sw.js)
- iOS Safari has some limitations with Web Push (requires iOS 16.4+)
- Batching API requests dramatically reduces Supabase usage
- `src/app/favicon.ico` overrides `public/favicon.ico` in Next.js app router
