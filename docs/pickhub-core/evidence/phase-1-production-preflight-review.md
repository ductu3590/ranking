# Phase 1 production preflight review

## Environment

- Database: Supabase `Ranking 246 / main PRODUCTION`.
- Migration scope reviewed in the captured production output: `017` through `027`,
  already applied in production. Migrations `025`–`027` were verified through
  Supabase MCP with the member-origin FK, compatibility trigger hardening, index,
  and ledger checksums.
- Application deployment observed: Vercel production deployment
  `dpl_9W34rhQFyGQetvKkPU1MvGGWRzWw`, commit
  `bc68e05c01a3c0a812151888f96fe28fa26ee73c`.
- Phase 1 Preview deployment: `https://ranking-aeaclq5rx-do-duc-tus-projects.vercel.app`
  (Vercel deployment `dpl_Hhs1h6s76MwpvDrKAfTFaTwgW4FK`, target `preview`, status
  `READY`). Production aliases were not promoted.
- Phase 1 implementation branch: `codex/phase-1-foundation-hardening`, commit
  `bdc2d0081490d62ab126cabb4429da42a3d6cb27`, merged into `main`.
- Raw evidence: `phase-1-schema-preflight-production.txt` (pre-025) and
  `phase-1-schema-preflight-production-post-027.txt` (post-025–027).
- Advisor evidence: `phase-1-supabase-advisors-production.txt`.
- Backup/PITR: unavailable on the current Free plan; the product owner explicitly
  accepted this limitation for the current Phase 1 review.

## Checks supported by the preflight

- All 17 expected Phase 1 tables exist.
- All tenant-scoped tables have a non-null `group_id` column.
- Existing rows have zero null tenant IDs, including 20 ranking snapshots.
- Duplicate normalized member names within a club: no rows returned.
- Duplicate webhook references within a club: no rows returned.
- Orphan/cross-tenant relationship counts: zero for every reported relation.
- Member-origin checks after 025: 56 linked rows, zero missing/mismatched origins.
- RLS is enabled on all 24 public tables reported by the query.
- The migration ledger table exists.

## Findings and resolutions

### 1. Entrant member origin — resolved

The preflight output captured before migration 025 showed zero current violations,
but the old production constraints only showed:

`FOREIGN KEY (member_id) REFERENCES club_members(id) ON DELETE SET NULL`

The new design intentionally keeps `group_id` as the tournament organizer and adds
`member_group_id` as the source club of `member_id`. Migration 025 adds the
composite source FK, server-side origin resolution, and a compatibility trigger
for the currently deployed old writer. Migrations 026–027 harden the trigger
search path and add the FK-supporting index. The post-027 preflight reports zero
member-origin violations.

### 2. Global transaction-reference uniqueness is intentional

The product owner confirmed that the provider's transaction reference is globally
unique. The historical constraint `quy_pickleball_ma_giao_dich_key` is therefore
retained intentionally; no migration is required for this item.

## Ledger status

The database ledger contains eleven Phase 1 migrations confirmed as applied in
production. The recorded versions and checksums match the repository manifest,
including migrations 025–027.
the captured output is stored at:

`phase-1-migration-ledger-production.txt`

The guarded registration script used for this bookkeeping remains available at:

`database/audits/phase-1-register-applied-ledger.sql`

It does not rerun migrations or alter business tables.

## Local verification

The main-branch verification completed successfully after the merge:

- `npm run test:phase1` — pass, including the migration-025 member-origin contract.
- `npm run test:t-api` — pass, including the entrants API contract.
- `npm run test:ci` — exit code 0 (regression suite and Next.js production build).
- `npm run test:isolation` — pass (`anon sees no rows`) against the configured
  production Supabase project; evidence is in `phase-1-test-isolation-production.txt`.
- Production smoke evidence: `phase-1-vercel-production-smoke-2026-09-03.txt`.
  Read-only route checks returned 200 for the home and public snapshot API;
  anonymous tournament listing returned the expected 401.

The build still prints pre-existing warnings about an ESLint plugin conflict,
dynamic rendering of the public tournament route, and metadata viewport exports.
They do not fail the build and are recorded in `phase-1-test-ci-local.txt`.
Supabase advisors also retain pre-existing GH RPC/RLS and password-protection
warnings; no new member-origin security warning remains after 026–027.

## Release status

This review is **COMPLETED/PASS**. Migrations 025–027, post-apply preflight,
main-branch verification, production deployment, and post-deploy read-only smoke
are complete. The product owner confirmed that the basic smoke test runs without
errors. Backup/PITR remains unavailable on the current Free plan and was
explicitly accepted for this phase.
