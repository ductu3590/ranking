# Phase 2 test evidence

Date: 2026-09-04  
Implementation branch: `main` (`479bdd9`, follow-up guard hardening in working tree)

## Automated verification

| Command | Result | Notes |
|---|---|---|
| `npm run test:identity` | PASS | Domain, migration contracts, session integration, services, compatibility repository and route adapters |
| `npm run test:regression` | PASS | Existing Phase 1, team-fund, leaderboard, tournament and mobile suites |
| `npm run test:ui-phase2` | PASS | Static contracts and Playwright browser contracts at the repository test viewport |
| `node tests/phase2/validated-mutation-guard.test.js` | PASS | Quỹ/giải mutation routes use the DB-backed validated session guard and retain club scoping |
| `npm run build` | PASS | Next production build completed; only pre-existing ESLint/metadata/dynamic-route warnings |
| `npm run test:isolation` | NOT RUN | Requires configured Supabase URL, anon key and service role credentials in the test environment |
| `git diff --check` | PASS | No whitespace errors |

## Scope covered

- Migration 028/029 contracts for athletes, memberships, mappings, assessments, sessions,
  access-version revocation and manual duplicate review.
- Pure identity domain rules and application services for join, rotation, revocation,
  roster, alias, PHR, membership end and duplicate review.
- Thin identity route adapters with stable errors and member/admin permission checks.
- Legacy fund and tournament mutation routes now validate the signed session against the
  current club access version and active `group_sessions` row before writing.
- Regression/isolation contracts cover stale-session rejection at the shared guard boundary
  and prevent mutation routes from losing `group_id` scoping.
- Club switcher, role-aware navigation, roster/member information panels and the five-tab
  member navigation contract.

## Release-gate status

Manual smoke confirmation: product owner reported that selected Phase 2 UI operations
passed on the localhost production build (`npm run build` + `npm run start`) on
2026-09-04. This is recorded as a smoke result, not as evidence that every mutation
scenario was exercised.

The code and repository regression gate for moving legacy fund/tournament mutations to the
DB-backed validated session guard is complete. The Supabase migration/RLS integration suite
still needs to run against a staging project with configured credentials; it must verify
Club A/B isolation, legacy mapping counts, and revocation after password/code rotation.
No production migration or production mutation was run for this change. Product-owner
approval remains a release-recording step.
