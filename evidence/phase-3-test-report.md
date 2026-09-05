# Phase 3 Test Report

## Scope

Interclub foundation: additive migration contract, domain state/roster validation, constrained pool, club aggregate standings and privacy-safe public projection.

## Local verification

Command:

```powershell
npm run test:phase3-interclub
```

Observed checks:

- `phase3 migration contract ok`
- `phase3 interclub domain ok`
- `phase3 interclub competition ok`
- `phase3 interclub public ok`

Result: PASS.

Command:

```powershell
npm run test:t-engines
```

Observed existing engine checks: seeding, simple, MLP, MLP pairs, round-robin schedule/groups/standings, knockout schedule/standings, registry, orchestrator and mix all report `ok`.

Result: PASS.

Command:

```powershell
npm run build
```

Result: PASS. Next.js compiled, generated 46/46 static pages and completed production optimization. Existing non-blocking warnings remain for `<img>`, viewport metadata and one anonymous default export.

## Environment status

- Supabase migration apply: NOT RUN by Codex; requires manual rehearsal database operation.
- Director/captain/scorekeeper E2E: NOT RUN in this increment; API/UI workflow remains the next Phase 3 slice.
- Production deployment: NOT RUN.

## Interpretation

This report covers the implemented Phase 3 foundation only. It is not an exit-gate PASS for the complete Phase 3 MVP until API, UI, migration rehearsal and three-club E2E are implemented and executed.

## Task 1 — Inventory, compatibility and preflight

### TDD RED

Command:

```powershell
node tests/phase3/competition-preflight.test.js
```

Observed failure:

```text
AssertionError [ERR_ASSERTION]: Task 1 migration preflight must exist
```

Expected: the contract failed because migration 031 did not exist yet.

### TDD GREEN

Command:

```powershell
node tests/phase3/competition-preflight.test.js
```

Observed output:

```text
Phase 3 Task 1 preflight contract: PASS
```

### Supabase preflight

Project: `uhhlelemewilgsdijwja` (Ranking 246)

Read-only inventory observed:

- tournaments: 3 rows, all `draft`;
- stages: 5 rows, all `pending`;
- matches: 0 rows;
- orphan stages: 0;
- orphan entrants: 0;
- orphan match stage references: 0;
- orphan match entrant A/B/winner references: 0;
- tournament/stage/entrant/match tenant mismatches: 0;
- no existing PickHub system-group candidate found.

Migration file executed through Supabase MCP:

```text
database/migrations/031_phase3_competition_preflight.sql
```

Observed result: `[]`.

The SQL is intentionally read-only and ends with `ROLLBACK`; no schema or data mutation was applied. It will abort future community rows if a dedicated PickHub system group has not been provisioned.

### Phase 3 regression after Task 1

Command:

```powershell
npm run test:phase3-interclub
```

Observed output:

```text
phase3 migration contract ok
phase3 interclub domain ok
phase3 interclub competition ok
phase3 interclub public ok
phase3 interclub ui contract ok
```

Result: PASS.

### Task 1 status

Task 1 implementation is complete. Do not proceed to Task 2 automatically; the execution protocol requires a stop and human review here.

## Task 2 — Platform identity and organizer authorization

### TDD RED

Command:

```powershell
node tests/phase3/platform-auth.test.js
```

Observed failure:

```text
Error: Cannot find module '../../lib/platformSessionCore'
```

Expected: the behavior test failed because platform auth implementation did not exist yet.

### TDD GREEN

Command:

```powershell
node tests/phase3/platform-auth.test.js
```

Observed output:

```text
Phase 3 Task 2 platform auth contract: PASS
```

The test exercises real code for password hashing/verification, wrong password rejection, session expiry, session revocation, login rate limiting, group-session/platform boundary and community organizer validation.

### Supabase preflight before constraint change

Command executed through Supabase MCP:

```sql
SELECT
  count(*) FILTER (WHERE organizer_type = 'community')::int AS community_tournaments,
  count(*)::int AS all_tournaments
FROM public.tournaments;
```

Observed result:

```text
community_tournaments: 0
all_tournaments: 3
```

### Migration apply

Migration:

```text
database/migrations/032_platform_accounts.sql
```

Applied through Supabase MCP to project `uhhlelemewilgsdijwja`.

Observed result:

```text
{"success":true}
```

Migration 032 created platform account/session tables, added `created_by_platform_account_id`, and replaced the organizer constraint so global `community` tournaments do not require `organizer_community_id`. Migrations 030 and 031 were not modified.

### Verification after migration

Observed:

```text
community_tournaments: 0
platform_accounts: true
platform_sessions: true
creator_column: true
organizer_constraint: community requires organizer_club_id IS NULL; organizer_community_id is optional
rls: platform_accounts=true, platform_sessions=true
```

### Phase 3 regression after Task 2

Command:

```powershell
npm run test:phase3-interclub
```

Observed output:

```text
phase3 migration contract ok
phase3 interclub domain ok
phase3 interclub competition ok
phase3 interclub public ok
phase3 interclub ui contract ok
Phase 3 Task 1 preflight contract: PASS
Phase 3 Task 2 platform auth contract: PASS
```

Result: PASS.

### Task 2 status

Task 2 implementation is complete. Task 3 was not started; the execution protocol requires a stop and human review here.

Additional Task 2 verification:

- `scripts/seed-platform-account.js` now reads `PICKHUB_PLATFORM_ADMIN_EMAIL`, `PICKHUB_PLATFORM_ADMIN_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then creates or updates the first platform account; it does not expose a public signup route.
- `lib/platformSession.js` validates the separate `platform_session` against account/session rows and revocation/access version.
- `app/api/platform/session/route.js` provides the server-side login adapter with hashed-password verification, rate limiting and HTTP-only cookie issuance.

Command:

```powershell
npm run build
```

Result: PASS. Next.js compiled successfully and included `/api/platform/session`. Existing non-blocking warnings remain for image optimization, viewport metadata and the pre-existing anonymous default export.

## Task 2 security remediation — wildcard login/rate-limit bypass

### TDD RED

The regression test was extended before the fix to require exact-login validation, a shared defensive rate-limit key for wildcard variants and database-backed revoke validation. Before implementation it failed at the missing validation helper:

```text
TypeError: validatePlatformLogin is not a function
```

### Fix applied

- Replaced account lookup `ilike('login', login)` with exact `.eq('login', login)` in the platform login route and bootstrap script.
- Normalized seed login with `trim().toLowerCase()` before writing and exact lookup.
- Rejected `%` and `_` at input validation with the same `401 Invalid credentials` response as wrong credentials.
- Rate-limit keys use the account ID when an exact account is resolved; malformed wildcard attempts share `platform-invalid-login` instead of using attacker-controlled patterns.
- Added database-backed session validation and `POST /api/platform/session/logout`, which writes `revoked_at` and clears the HTTP-only cookie.

### Security regression GREEN

```powershell
node tests/phase3/platform-auth.test.js
```

```text
Phase 3 Task 2 platform auth contract: PASS
```

The test now proves a session accepted before database-backed revoke is rejected after the session record is revoked through the same validation path; it does not pass a hand-built revoked-key set to the verifier.

### Required regression commands

```powershell
npm run test:phase3-interclub
npm run test:t-api
```

Both passed. `npm run build` also passed and included `/api/platform/session/logout`.

### Remaining security debt

The login rate limiter is currently in-memory. This is not effective as a security control on Vercel/serverless because consecutive requests may run in different processes/instances. Before enabling platform login for real users, replace it with a shared counter backed by Supabase (or another shared store) and retain the same account/malformed-input keying policy.
