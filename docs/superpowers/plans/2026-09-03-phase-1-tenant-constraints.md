# Phase 1 Tenant Constraint Plan

## Design amendment — 2026-09-03

`tournament_entrant_members.group_id` is the tournament organizer tenant. A
tournament owned by club A may invite a member record owned by club B, so the
member's source tenant is stored separately in `member_group_id`. The invariant
is now `(member_id, member_group_id) -> club_members(id, group_id)`; guest rows
keep both member fields `NULL`. This amendment supersedes the earlier wording
that required `member_id` to match the tournament's `group_id`.

> **For agentic workers:** Use TDD. Add the migration contract first, run RED, then implement an abort-on-violation migration and verify the complete regression/build gate.

**Goal:** Replace global member-name uniqueness with tenant-scoped uniqueness, backfill ranking snapshot ownership, and make tournament child rows unable to reference another club’s parent.

**Architecture:** Migration 020 is additive/forward-only and assumes the read-only schema preflight has been reviewed. It aborts before destructive constraint changes when null, ambiguous, orphan, or cross-tenant rows exist; otherwise it adds composite parent keys/FKs and normalized tenant indexes.

**Spec:** `docs/pickhub-core/01-phase-foundation-hardening.md`, schema inventory and tenant-constraint sections.

## Global Constraints

- Historical migrations remain immutable; corrections use a new forward-only migration.
- No silent winner selection for duplicate or ambiguous production data.
- Guest tournament entrant members remain valid only when both `member_id` and `member_group_id` are `NULL`; non-null IDs must reference the same source group through the composite key.
- Production/staging execution remains manual after preflight evidence review.

### Task 1: Write failing migration contract

**Files:** Create `tests/phase1/tenant-constraints.test.js`; add it to `package.json` phase1 script.

- [x] Require group-scoped member uniqueness, snapshot group backfill/NOT NULL, orphan aborts, composite FKs, and explicit no-silent-merge behavior.
- [x] Run the test and capture RED.

### Task 2: Implement migration 020

**Files:** Create `database/migrations/020_phase1_tenant_constraints.sql`.

- [x] Validate and backfill `group_id` ownership, abort on ambiguity/orphans, and set required columns `NOT NULL`.
- [x] Replace `club_members.full_name` global uniqueness with normalized `(group_id, full_name)` uniqueness.
- [x] Add ranking snapshot tenant uniqueness and tournament composite parent/child FKs.

### Task 3: Correct tournament member origin ownership

**Files:** Create `database/migrations/025_tournament_member_origin.sql`;
modify the entrants API and schema preflight; add
`tests/phase1/tournament-member-origin.test.js`.

- [x] Preserve organizer `group_id` and add nullable `member_group_id`.
- [x] Backfill linked members from `club_members.group_id` and reject mismatched rows.
- [x] Add a composite member-origin FK with guest semantics.
- [x] Add a compatibility trigger so the currently deployed old writer remains valid during rollout.
- [x] Resolve `member_group_id` server-side in the entrants route.
- [x] Update preflight to validate member origin against `member_group_id`.

### Task 4: Harden advisor findings with forward-only migrations

**Files:** Create migrations `026_harden_member_origin_trigger.sql` and
`027_index_member_origin_fk.sql`, their ledger registration scripts, and focused
contract tests.

- [x] Pin the trigger function `search_path` to `public`.
- [x] Add a child index matching `(member_id, member_group_id)` for the composite FK.
- [x] Apply and register migrations 026–027 in production; advisor confirms no
  new member-origin security/performance warning remains.

### Task 5: Verify evidence and commit

- [x] Regenerate local migration ledger (025–027), run focused/regression/build gates, and record production preflight/ledger evidence.
- [x] Commit without changing Phase 1 to completed.
