# Phase 1 Atomic Stage Advance Plan

> **For agentic workers:** Use TDD. Keep standings/seeding deterministic in
> JavaScript, but move every stage-finalization write behind one transaction.

**Goal:** Prevent a stage from being marked complete while its successor
seedings are only partially written.

**Architecture:** Migration 024 adds a service-role-only
`advance_tournament_stage` RPC. It locks current/next stages, validates seeded
entrants and tenant ownership, replaces next-stage rows, updates both statuses,
and records an idempotent response in the existing mutation ledger.

## Tasks

- [x] Add failing migration/route contract and verify RED.
- [x] Implement RPC with row locks, validation, rollback-safe writes, and
  idempotency replay.
- [x] Replace direct `advance` route writes with the RPC and stable SQL error
  mapping.
- [x] Run phase/regression/build gates and regenerate migration ledger.

## Release note

Migration 024 is forward-only and must be applied after schema preflight and
RPC grant verification; production execution remains a manual release gate.
