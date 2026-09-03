# Phase 1 RLS and Fund Participant Tenant Plan

> **For agentic workers:** Execute with TDD. Lock the legacy-policy and
> parent-scoped participant invariants in deterministic contracts before adding
> the forward-only migration.

**Goal:** Remove permissive legacy financial RLS policies and prevent a fund
event from referencing a member in another club.

**Architecture:** Migration 021 enables RLS for `ranking_snapshots`, revokes
direct browser access, and removes migration-005 public/manage policies while
leaving migration-009 group-scoped authenticated policies intact. Migration 022
adds `fund_event_participants.group_id`, backfills it from the event, aborts on
orphan/cross-tenant data, and adds composite FKs for event/member ownership.

## Constraints

- Historical migrations remain immutable; 021 and 022 are forward-only.
- No data is silently deleted or merged. Invalid production rows abort rollout.
- Server routes continue to use signed-session authorization and service-role
  access; browser clients do not receive a privileged key.
- Production/staging execution remains manual after schema preflight review.

## Tasks

### Task 1: Contract tests

- [x] Add RLS policy-removal contract and include it in `test:phase1`.
- [x] Add participant composite-FK, preflight, and API write-scope contract.
- [x] Run each new contract red before implementation, then green.

### Task 2: Implement migrations and API boundary

- [x] Add migration 021 and migration 022 with abort-on-violation checks.
- [x] Update the fund-event route to validate member ownership before creating
  the event and to persist `group_id` on participant rows.
- [x] Extend the read-only preflight to report participant and snapshot gaps.

### Task 3: Verify and record

- [x] Regenerate the local migration ledger through migration 022.
- [x] Run focused/regression/build gates.
- [x] Keep Phase 1 `in_progress`; production apply and evidence remain release
  gates.
