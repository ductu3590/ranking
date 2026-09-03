# Phase 1 test report

## Scope

Foundation hardening for tenant constraints, RLS/authorization boundaries,
atomic tournament mutations, public snapshot identity, webhook idempotency, and
tournament member-origin integrity.

## Branch and environments

- Implementation branch: `codex/phase-1-foundation-hardening` (`bdc2d0081490d62ab126cabb4429da42a3d6cb27`)
- Main merge commit: `bc68e05c01a3c0a812151888f96fe28fa26ee73c`
- Preview: `https://ranking-aeaclq5rx-do-duc-tus-projects.vercel.app`
- Production database: Supabase project `uhhlelemewilgsdijwja`
- Production migrations verified: versions 017–027
- Production deployment: `dpl_9W34rhQFyGQetvKkPU1MvGGWRzWw` (`READY`), aliased to
  `https://rank.soccernow.net`
- Product owner smoke confirmation: 2026-09-03

## Verification commands

- `npm run test:phase1` — pass.
- `npm run test:t-api` — pass.
- `npm run test:ci` on `main` — exit code 0 (regression suite and Next.js build).
- `npm run test:isolation` — pass (`anon sees no rows`).
- `git diff --check` — no whitespace errors; only expected Windows line-ending warnings.
- Main test output: `phase-1-test-ci-main.txt`; isolation output:
  `phase-1-test-isolation-production.txt`.

## Database and security evidence

- Post-027 schema preflight: all expected RLS flags enabled; tenant and
  member-origin integrity counters are zero.
- Production migration ledger: versions 017–027 match repository checksums.
- Supabase advisors: no new member-origin security/performance warning after
  migrations 026–027; remaining findings are pre-existing and documented.
- Evidence files: `phase-1-schema-preflight-production-post-027.txt`,
  `phase-1-migration-ledger-production.txt`, and
  `phase-1-supabase-advisors-production.txt`.

## Production and smoke evidence

- Production deployment status: `READY`; alias is active on `rank.soccernow.net`.
- Post-deploy read-only checks returned expected responses: home 200, public
  snapshot API 200, anonymous tournament listing 401.
- Product owner confirmed the basic smoke test works without errors, including
  the controlled application flow.
- Detailed evidence: `phase-1-vercel-production-smoke-2026-09-03.txt` and the
  earlier Preview record `phase-1-vercel-preview-smoke-2026-09-03.txt`.

## Known limitations and release gate

- The agent did not run additional production write smoke after the product
  owner confirmation; any further write test must use disposable
  group/tournament data.
- Cross-club member invitation UX remains out of scope for Phase 1; the schema
  and server boundary support source-club provenance.
- Existing build warnings (ESLint plugin conflict, dynamic public route, and
  metadata viewport notices) are non-blocking and recorded in the build log.

## Conclusion

**PASS for Phase 1 release validation; status `completed` after merge to `main`,
production deployment, and post-deploy smoke.**
