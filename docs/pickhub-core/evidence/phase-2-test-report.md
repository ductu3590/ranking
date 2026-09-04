# Phase 2 test evidence

Date: 2026-09-04  
Implementation branch: `codex/pickhub-ui-brand-preview` (temporary worktree; creation of
`codex/phase-2-identity-clubs` was blocked by a local `.git` ref-lock permission error)

## Automated verification

| Command | Result | Notes |
|---|---|---|
| `npm run test:identity` | PASS | Domain, migration contracts, session integration, services, compatibility repository and route adapters |
| `npm run test:regression` | PASS | Existing Phase 1, team-fund, leaderboard, tournament and mobile suites |
| `npm run test:ui-phase2` | PASS | Static contracts and Playwright browser contracts at the repository test viewport |
| `npm run build` | PASS | Next production build completed; only pre-existing ESLint/metadata/dynamic-route warnings |
| `npm run test:isolation` | NOT RUN | Requires configured Supabase URL, anon key and service role credentials in the test environment |
| `git diff --check` | PASS | No whitespace errors |

## Scope covered

- Migration 028/029 contracts for athletes, memberships, mappings, assessments, sessions,
  access-version revocation and manual duplicate review.
- Pure identity domain rules and application services for join, rotation, revocation,
  roster, alias, PHR, membership end and duplicate review.
- Thin identity route adapters with stable errors and member/admin permission checks.
- Club switcher, role-aware navigation, roster/member information panels and the five-tab
  member navigation contract.

## Remaining release gate

Manual smoke confirmation: product owner reported that selected Phase 2 UI operations
passed on the localhost production build (`npm run build` + `npm run start`) on
2026-09-04. This is recorded as a smoke result, not as evidence that every mutation
scenario was exercised.

The migration and RLS integration suite must be run against a staging Supabase project
before merge. It must verify Club A/B isolation, legacy mapping counts, and revocation
after password/code rotation. The remaining migration-window task is to move the
legacy tournament/quỹ mutation consumers from the synchronous compatibility guard to
the DB-backed validated session guard before locking `club_members` writes. Product-owner
approval is also required; this report does not mark Phase 2 as completed.
