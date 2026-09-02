# Phase 1 Tenant Constraint Plan

> **For agentic workers:** Use TDD. Add the migration contract first, run RED, then implement an abort-on-violation migration and verify the complete regression/build gate.

**Goal:** Replace global member-name uniqueness with tenant-scoped uniqueness, backfill ranking snapshot ownership, and make tournament child rows unable to reference another club’s parent.

**Architecture:** Migration 020 is additive/forward-only and assumes the read-only schema preflight has been reviewed. It aborts before destructive constraint changes when null, ambiguous, orphan, or cross-tenant rows exist; otherwise it adds composite parent keys/FKs and normalized tenant indexes.

**Spec:** `docs/pickhub-core/01-phase-foundation-hardening.md`, schema inventory and tenant-constraint sections.

## Global Constraints

- Historical migrations remain immutable; migration 020 only.
- No silent winner selection for duplicate or ambiguous production data.
- Guest tournament entrant members remain valid only when `member_id IS NULL`; non-null IDs must reference a same-group `club_members` row.
- Production/staging execution remains manual after preflight evidence review.

### Task 1: Write failing migration contract

**Files:** Create `tests/phase1/tenant-constraints.test.js`; add it to `package.json` phase1 script.

- [x] Require group-scoped member uniqueness, snapshot group backfill/NOT NULL, orphan aborts, composite FKs, and explicit no-silent-merge behavior.
- [x] Run the test and capture RED.

### Task 2: Implement migration 020

**Files:** Create `database/migrations/020_phase1_tenant_constraints.sql`.

- [x] Validate and backfill `group_id` ownership, abort on ambiguity/orphans, and set required columns `NOT NULL`.
- [x] Replace `club_members.full_name` global uniqueness with normalized `(group_id, full_name)` uniqueness.
- [x] Add ranking snapshot tenant uniqueness and tournament composite parent/child FKs, including guest/member semantics.

### Task 3: Verify evidence and commit

- [x] Regenerate local migration ledger (020), run focused/regression/build gates, and record that production SQL remains unapplied.
- [x] Commit without changing Phase 1 to completed.
