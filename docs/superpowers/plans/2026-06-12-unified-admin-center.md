# Unified Admin Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one shared `/admin` module that contains fund and tournament administration.

**Architecture:** Add a client-side admin center route with tabs for fund and tournament tools. Reuse the existing fund and tournament admin pages as embeddable panels first, then update global navigation and old admin links to point into `/admin`.

**Tech Stack:** Next.js App Router, React client components, existing Supabase client/API routes, Node contract tests.

---

### Task 1: Admin Center Contract

**Files:**
- Modify: `tests/mobile-bottom-tabs.test.js`
- Create: `tests/unified-admin-center.test.js`

- [ ] Assert global header and mobile nav point to `/admin`.
- [ ] Assert `/admin` route exists.
- [ ] Assert fund and tournament admin pages can be embedded in the shared center.

### Task 2: Shared Admin Route

**Files:**
- Create: `app/admin/page.js`
- Create: `app/admin/admin-center.css`
- Modify: `app/quy/admin/page.js`
- Modify: `app/giai-dau/admin/page.js`
- Modify: `app/giai-dau/admin/pairings/page.js`

- [ ] Create `/admin` with two top tabs: `Quỹ` and `Giải đấu`.
- [ ] Make fund admin and tournament admin render without their old cross-admin header buttons when embedded.
- [ ] Update tournament pairing back links to `/admin?section=tournament`.

### Task 3: Navigation Cleanup

**Files:**
- Modify: `components/HomeHeader.js`
- Modify: `components/MobileBottomNav.js`
- Modify: `components/TournamentModuleNav.js`
- Modify: `app/giai-dau/page.js`

- [ ] Replace `/quy/admin` global admin links with `/admin`.
- [ ] Replace `/giai-dau/[id]/admin` module links with `/admin?section=tournament`.
- [ ] Keep the public tournament detail/live/captain links scoped by tournament id.

### Task 4: Verification

**Files:**
- Modify: `package.json`

- [ ] Add `test:admin-center`.
- [ ] Run `npm run test:admin-center`, `npm run test:mobile-nav`, `npm run test:tournament-dashboard`, `npm run build`.
- [ ] Verify `/admin`, `/admin?section=fund`, and `/admin?section=tournament` return 200.
