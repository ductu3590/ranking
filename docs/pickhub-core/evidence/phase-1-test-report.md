# Phase 1 test report

## Scope

Foundation hardening for tenant constraints, RLS/authorization boundaries,
atomic tournament mutations, public snapshot identity, webhook idempotency, and
tournament member-origin integrity.

## Branch and environments

- Branch: `codex/phase-1-foundation-hardening`
- Preview: `https://ranking-aeaclq5rx-do-duc-tus-projects.vercel.app`
- Production database: Supabase project `uhhlelemewilgsdijwja`
- Production migrations verified: versions 017–027
- Product owner smoke confirmation: 2026-09-03

## Verification commands

- `npm run test:phase1` — pass.
- `npm run test:t-api` — pass.
- `npm run test:ci` — exit code 0 (regression suite and Next.js build).
- `npm run test:isolation` — pass (`anon sees no rows`).
- `git diff --check` — no whitespace errors; only expected Windows line-ending warnings.

## Database and security evidence

- Post-027 schema preflight: all expected RLS flags enabled; tenant and
  member-origin integrity counters are zero.
- Production migration ledger: versions 017–027 match repository checksums.
- Supabase advisors: no new member-origin security/performance warning after
  migrations 026–027; remaining findings are pre-existing and documented.
- Evidence files: `phase-1-schema-preflight-production-post-027.txt`,
  `phase-1-migration-ledger-production.txt`, and
  `phase-1-supabase-advisors-production.txt`.

## Preview and smoke evidence

- Preview deployment status: `READY`; production aliases were not promoted.
- Read-only route checks returned expected responses: home/tournament/public
  routes 200, public snapshot API 200, missing slug 400, anonymous tournament
  listing 401.
- Product owner confirmed the basic smoke test works without errors, including
  the controlled application flow.
- Detailed evidence: `phase-1-vercel-preview-smoke-2026-09-03.txt`.

## Known limitations and release gate

- Vercel production still points to the pre-Phase-1 `main` deployment; this
  branch has not been merged or promoted.
- Preview uses the production database, so no unapproved write smoke was run by
  the agent. Any further write test must use disposable group/tournament data.
- Cross-club member invitation UX remains out of scope for Phase 1; the schema
  and server boundary support source-club provenance.
- Existing build warnings (ESLint plugin conflict, dynamic public route, and
  metadata viewport notices) are non-blocking and recorded in the build log.

## Conclusion

**PASS for Phase 1 branch validation; status `awaiting_approval` pending merge to
`main` and post-merge smoke.**
