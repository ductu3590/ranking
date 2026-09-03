# Phase 1 Authorization Boundary Plan

> **For agentic workers:** Execute with TDD: write failing session/authorization behavior tests, run RED, implement the smallest boundary change, then run the regression gate.

**Goal:** Make internal tournament reads require a signed, non-expired group session while preserving the cookie-free public snapshot route.

**Architecture:** Keep `getEffectiveGroupContext()` only for legacy read compatibility and public UI session display. Add explicit `getActor`, `authorize`, and `getClubScope` helpers to `groupSession`; use `getClubScope()` in authenticated console GETs. Signed sessions carry an explicit expiry and malformed/expired cookies fail closed.

**Spec:** `docs/pickhub-core/01-phase-foundation-hardening.md`, especially authorization boundary and test matrix.

## Global Constraints

- JavaScript only; no new dependency.
- Public tournament `/api/tournament-v2/public` remains cookie-free and is not switched to `getClubScope`.
- Mutations continue to use `requireGroupAdmin`; do not weaken existing guards.
- Existing signed cookies remain valid until their original 30-day `issued_at` age expires; new cookies include `expires_at` and a session version.
- Never use localStorage or browser Supabase auth as an authorization source.

### Task 1: Write failing auth/session tests

**Files:** Create `tests/phase1/auth-boundary.test.js`; modify `tests/tournament/api-matches.contract.test.js` and `tests/tournament/api-standings.contract.test.js`.

- [x] Test expiry/malformed signature, actor extraction, role authorization, and required group scope.
- [x] Update internal GET contracts to require `getClubScope`, while asserting public route remains cookie-free.
- [x] Run focused tests and capture RED.

### Task 2: Implement session boundary helpers

**Files:** Modify `lib/groupSession.js`; modify `app/api/groups/session/route.js` only if response needs explicit expiry metadata.

- [x] Add `GROUP_SESSION_VERSION`, expiry-aware signing/verification, fail-closed decode, `getActor`, `authorize`, and `getClubScope`.
- [x] Keep stable 401/403 JSON responses and group ID from the signed cookie only.
- [x] Run auth-focused tests GREEN.

### Task 3: Require session for internal tournament reads

**Files:** Modify `app/api/tournament-v2/matches/route.js`; modify `app/api/tournament-v2/standings/route.js`.

- [x] Replace fallback context lookup with `getClubScope()` and preserve group-scoped queries.
- [x] Keep public snapshot endpoint unchanged and update contracts.
- [x] Run tournament API/UI and full regression tests.

### Task 4: Verify and commit

- [x] Run `git diff --check`, `npm run test:regression`, and `npm run test:ci` with known baseline warnings recorded.
- [x] Commit without changing Phase 1 to completed.
