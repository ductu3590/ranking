# Phase 1 Atomic Tournament Mutations Plan

> **For agentic workers:** Use TDD. First add failing contracts for the RPC migration and route delegation, then implement the smallest database transaction boundary and verify the complete regression/build gate.

**Goal:** Prevent partial schedule regeneration and partial game replacement by moving both multi-step writes behind database transactions with an idempotency key.

**Architecture:** Migration 019 adds an idempotency ledger, a match `version`, and two `SECURITY DEFINER` functions. The app still validates schedules/results with the existing JS engines, then sends a complete validated payload to the RPC. PostgreSQL locks the parent row, replaces children, updates match/parent links, and stores a replayable response in one transaction.

**Spec:** `docs/pickhub-core/01-phase-foundation-hardening.md`, transaction/concurrency and test matrix sections.

## Global Constraints

- JavaScript only outside SQL migration; no new package.
- Functions validate `p_group_id` ownership and never trust a client-supplied group ID.
- No direct delete/insert sequence remains in the application routes after the RPC exists.
- Replays with the same `(group_id, operation, idempotency_key)` return the original response.
- Expected version mismatch returns a stable conflict (`409` mapping in the route).
- Migration is manual and must be applied after review; do not mutate production from this task.

### Task 1: Write failing mutation-boundary tests

**Files:** Create `tests/phase1/atomic-mutations.test.js`; modify `tests/tournament/api-games.contract.test.js` and `tests/tournament/api-generate.contract.test.js`.

- [x] Require migration 019 to define idempotency storage, match version, both RPCs, row locks, and rollback-safe function bodies.
- [x] Require games/generate routes to call the matching RPC and map conflict errors.
- [x] Run focused tests and capture RED.

### Task 2: Add transaction RPC migration

**Files:** Create `database/migrations/019_tournament_atomic_mutations.sql`.

- [x] Create `pickhub_mutation_idempotency` with tenant/operation/key primary key and response checksum metadata.
- [x] Add `version` to `tournament_matches` and implement `replace_tournament_games` with parent lock, validation, replacement, outcome/parent update, and replay response.
- [x] Implement `replace_tournament_schedule` with stage lock, JSON schedule validation, delete/insert/parent-link/status update, and replay response.
- [x] Restrict function execution to server role and comment the manual rollout order.

### Task 3: Delegate routes and client metadata

**Files:** Modify `app/api/tournament-v2/games/route.js`; modify `app/api/tournament-v2/generate/route.js`; modify `lib/tournamentV2Client.js`; modify UI callers only if they need stable keys/version.

- [x] Validate JS engine input first, then call RPC with `idempotency_key` and optional `expected_version`.
- [x] Return RPC response and map SQLSTATE conflict/validation to stable 409/400 errors.
- [x] Preserve existing response shape for current UI.

### Task 4: Verify and commit

- [x] Run focused tests, full regression, `git diff --check`, and `npm run test:ci` with known baseline warnings.
- [x] Regenerate migration ledger to include 019 and commit without marking Phase 1 complete.
