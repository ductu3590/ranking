# Phase 1 Webhook Idempotency Plan

> **For agentic workers:** Use TDD and preserve the existing webhook contract;
> the database unique key is the concurrency backstop, while the route maps a
> duplicate retry to the existing successful response.

**Goal:** Ensure a retried SePay webhook cannot create a second transaction in
the same club.

**Architecture:** Migration 023 aborts on existing duplicate non-blank
references and creates a normalized partial unique index on
`(group_id, ma_giao_dich)`. The webhook trims and requires a stable reference,
then keeps its duplicate-key (`23505`) replay behavior.

## Tasks

- [x] Add failing migration/route contract and verify RED.
- [x] Add abort-on-duplicate migration 023 and regenerate ledger evidence.
- [x] Reject missing references and preserve duplicate retry response.
- [x] Add duplicate-reference output to the read-only schema preflight.
- [x] Run phase/regression/build gates.

## Release note

Migration 023 is forward-only and must be applied only after the schema
preflight confirms no duplicate transaction references; production execution is
still a manual release gate.
