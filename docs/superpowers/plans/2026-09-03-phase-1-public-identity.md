# Phase 1 Public Identity and Safe Snapshot Plan

> **For agentic workers:** Execute this plan task-by-task with the TDD loop: write a failing behavior test, run it, implement the smallest change, rerun focused tests, then run the regression gate.

**Goal:** Make tournament share links globally resolvable by slug with explicit visibility, return only a safe public snapshot, and remove browser-side raw Supabase reads from the public page.

**Architecture:** A forward-only migration adds `private|unlisted|public` visibility and a global case-insensitive slug index. The public API resolves only visible slugs without cookie/group context, projects allowlisted fields, and computes standings server-side. The page consumes one snapshot and uses visibility-aware adaptive polling with backoff.

**Tech Stack:** Next.js 14.1 App Router, JavaScript/CommonJS helpers, PostgreSQL/Supabase SQL, plain Node behavior tests.

**Spec:** `docs/pickhub-core/01-phase-foundation-hardening.md` and the approved PickHub Core blueprint.

## Global Constraints

- JavaScript only; no new dependency or test framework.
- Historical migrations 015–017 remain immutable; add migration 018 only.
- Public responses must not expose `group_id`, actor/member identifiers, stage config, or internal settings.
- Public page must not import the browser Supabase client or subscribe to broad realtime channels.
- The public API must not call `getEffectiveGroupContext`; missing and private slugs both return 404.
- Keep the existing admin/member group-session boundary for console APIs.
- Do not mark Phase 1 complete; production migration execution and evidence remain a separate gate.

---

### Task 1: Lock the public contract with failing tests

**Files:**
- Create: `tests/phase1/public-snapshot.test.js`
- Create: `tests/phase1/polling-backoff.test.js`
- Modify: `tests/tournament/api-public.contract.test.js`
- Modify: `tests/tournament/ui-public.contract.test.js`
- Modify: `package.json`

- [x] Write runtime projection/polling tests and update source contracts to require visibility filtering, allowlists, standings snapshots, no cookie resolver, and no raw realtime client.
- [x] Run focused tests and capture RED failures.

### Task 2: Add public identity migration and safe projection helpers

**Files:**
- Create: `database/migrations/018_tournament_public_identity.sql`
- Create: `lib/tournament/publicSnapshot.js`
- Create: `lib/pollingBackoff.js`
- Modify: `lib/tournament/standingsService.js` (or create it)
- Modify: `app/api/tournament-v2/standings/route.js`

- [x] Implement migration 018 as a forward-only, collision-aborting migration; preserve non-null historical slugs as `unlisted`, keep null slugs private, create a global lower-case unique partial index, and remove broad anon match/game policies.
- [x] Implement allowlisted projections, safe snapshot shape, and pure adaptive polling helper.
- [x] Extract reusable server standings computation without changing existing authenticated route behavior.
- [x] Run focused tests GREEN.

### Task 3: Harden API writes and public snapshot reads

**Files:**
- Modify: `app/api/tournament-v2/public/route.js`
- Modify: `app/api/tournament-v2/tournaments/route.js`
- Modify: `lib/tournamentV2Client.js` only if the response contract needs a narrow client adjustment

- [x] Resolve normalized slug globally and query only `unlisted|public` tournaments.
- [x] Load children by the tournament’s own group ID, project safe fields, include `gamesByMatchId` and `standingsByStage`, and return stable 404/500 responses.
- [x] Validate visibility on admin create/update, default new generated links to `unlisted`, and use server-owned collision-resistant slugs.
- [x] Run API and tournament focused tests GREEN.

### Task 4: Replace public-page realtime with adaptive polling

**Files:**
- Modify: `app/giai-dau/v2/[slug]/page.js`

- [x] Consume the single public snapshot, render server-provided standings/game scores, and remove `supabase`/`getStandings` imports.
- [x] Poll only while visible, pause hidden tabs, refetch on focus/visibility restore, and back off on errors up to the helper’s cap.
- [x] Run UI-focused tests and the full deterministic regression gate.

### Task 5: Regenerate evidence and review the baseline

**Files:**
- Modify: `docs/pickhub-core/evidence/phase-1-local-migration-ledger.json`
- Modify: `docs/superpowers/plans/2026-09-03-phase-1-public-identity.md`

- [x] Regenerate the migration ledger so migration 018 is recorded with its checksum.
- [x] Run `git diff --check`, `npm run test:regression`, and `npm run test:ci` with the known dependency/build warnings recorded.
- [ ] Commit the slice without changing Phase 1 status to completed.
