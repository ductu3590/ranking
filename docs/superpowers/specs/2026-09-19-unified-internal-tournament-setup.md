# Unified Internal Tournament Setup

Date: 2026-09-19  
Task: T0.1  
Status: contract freeze for Wave 0

## Scope and non-goals

This document specifies the four-step internal tournament setup workspace: information and participants, format and pairing, draw and schedule preview, and review/finalize. It is a contract for the domain, API, and UI workstreams. It does not change production code, migrations, tests, or frozen baseline files.

The setup aggregate is tenant-scoped by the server session `group_id`. Client-supplied group, role, athlete, or tournament ownership is never trusted.

## SetupDraftV2

```js
{
  draftVersion: 2,
  draftId: string,
  tournamentId: string|null,
  divisionId: string|null,
  groupId: string, // server-derived; response metadata only
  state: 'local_only'|'server_draft'|'roster_ready'|'pairing_ready'|'draw_drafted'|'finalized',
  revision: number,
  clientDraftKey: string,
  idempotencyKey: string|null,
  currentStep: 1|2|3|4,
  tournament: { name, description, eventDate, location, organizerMode },
  participants: {
    selectedMemberIds: string[],
    inactiveSelectedMemberIds: string[],
    unresolvedMemberIds: string[],
    athleteSnapshots: [{ memberId, athleteId, displayNameSnapshot, clubNameSnapshot }]
  },
  format: {
    entrantType: 'singles'|'doubles'|'team',
    formatKey: 'round_robin'|'knockout'|'group_knockout'|'mlp',
    config: object
  },
  pairs: [{ pairId, memberIds: string[], athleteIds: string[], nameSnapshot: string, locked: boolean, status }],
  unpairedMemberIds: string[],
  reserveMemberIds: string[],
  draw: {
    status: 'none'|'draft'|'invalidated'|'locked',
    seed: string|null,
    assignments: [{ entrantId, groupLabel, slot }],
    stagePlans: [StagePlan],
    matches: [MatchFrame]
  },
  readiness: { blockers: [ReadinessIssue], warnings: [ReadinessIssue] },
  invalidation: { roster, pairing, format, draw, reasonCodes: string[] },
  savedAt: string|null,
  finalizedAt: string|null
}
```

Old drafts are read through a one-way adapter: missing `draftVersion` is version 1; old participant arrays are normalized to `memberId`, old pair arrays receive generated stable `pairId` values once and remain stable thereafter, and old single-stage group-knockout drafts are marked `draw.invalidated` rather than silently upgraded. No destructive rewrite occurs on load.

## State machine and invalidation

- `local_only -> server_draft`: first successful aggregate save.
- `server_draft -> roster_ready`: all selected IDs resolve in the tenant and the roster snapshot is saved.
- `roster_ready -> pairing_ready`: the selected entrant type has valid pairs/teams; doubles cannot contain a one-person pair.
- `pairing_ready -> draw_drafted`: a real entrant identity and stage plan produce a deterministic preview.
- `draw_drafted -> finalized`: admin finalize succeeds atomically.
- `finalized` is terminal for setup. Operational corrections use the operations flow, not setup.

Participant changes invalidate pairing and draw. Format or pair changes invalidate draw only; they never auto-randomize. Draw changes invalidate only the preview fixtures and require a new preview. A revision conflict invalidates the local save attempt, not the server draft. Any invalidation records a reason code and the earliest affected step.

A tournament/division with a started match or any score/result cannot be structurally changed or finalized through setup. Existing fixtures and results remain untouched.

## Load, save, revision, and idempotency

- `GET /api/tournament-v2/setup?divisionId=...` returns the complete aggregate, server-derived group context, `revision`, readiness, and resume step.
- `PUT /api/tournament-v2/setup` accepts an allowlisted aggregate patch, `divisionId`, `expectedRevision`, and `idempotencyKey`. It performs compare-and-swap; success increments `revision` and returns the complete aggregate.
- `POST /api/tournament-v2/preview-schedule` accepts the draft snapshot and expected revision. It is read/compute-only and returns real entrant, stage, progression, placeholder, and match identities; it does not persist a draw.
- `POST /api/tournament-v2/setup/finalize` accepts `expectedRevision`, `idempotencyKey`, and the approved preview fingerprint. It writes stages, entrants, transitions, fixtures, and lock state in one transaction.
- Retrying an identical idempotency key returns the stored response from `tournament_setup_mutations`; a changed payload under the same key returns `IDEMPOTENCY_KEY_REUSED`.
- Save draft never locks roster/draw and never creates official fixtures. Finalize never means LIVE; it redirects to schedule.

## Stage plan contract

`group_knockout` has exactly two stages with the same `division_id`: a group round-robin stage and a knockout stage. The only payload builder is `buildDivisionStagePayloads()` from `lib/tournament/wizardModel.js`; T1.A wraps/calls it and must not create a second format converter.

```js
{
  sourceStageId: string,
  targetStageId: string,
  sourceKind: 'standing',
  sourceGroupLabel: 'A'|'B'|string,
  sourceRank: 1|2|number,
  targetSlot: string,
  outcome: 'qualifies',
  sourceEntryKind: 'entry',
  targetDivisionId: string,
  thirdPlaceEnabled: boolean
}
```

For the locked acceptance case, 14 athletes become 7 pairs; groups A/B contain 4/3 pairs; group matches are 6+3=9; cross-over semifinals are `Nhất A–Nhì B` and `Nhất B–Nhì A`; final is 1 match, total 12, or 13 with third place. Unequal group size is warning `GROUP_SIZE_IMBALANCE`, not a blocker. Progression always names the target stage and validates tenant, tournament, division, and stage IDs; it never infers a target using `stage_order + 1`.

## Knockout pending-slot contract

A pending knockout side is `{ kind: 'progression', sourceStageId, sourceGroupLabel, sourceRank, label }`, not a fake entrant, athlete, or entry. The same object is used by preview, persisted match frame, and bracket UI. A match may have `entry_a_id`/`entry_b_id` null while its `slot_a`/`slot_b` contains the progression reference. The entry is resolved only after the source result is confirmed. Advance is rejected with `ADVANCE_RESULTS_INCOMPLETE` until all required source results exist.

## Pair identity contract

Pairs have stable `pairId` values and `locked` state. Members are selected by `member_id`; the server resolves and stores `athlete_id`, while names are display snapshots. Duplicate names are distinct members. An unknown athlete mapping is explicit (`ATHLETE_ID_MISSING`), never silently discarded.

Adding a member appends it to `unpairedMemberIds`. Removing a member removes only that member from its containing pair and moves the remaining member to unpaired; every other pair stays byte-for-byte stable, including unlocked pairs. `regenerateUnlockedPairs` is an explicit action, skips locked pairs, and cannot duplicate a member. Replacing a member is explicit and affects only one pair. An odd doubles roster offers: add a member, place one in reserve, or switch to a supported format. It never creates a one-person pair or uses BYE as a teammate.

## Readiness and redirects

Blockers and warnings are calculated from current data, never hard-coded. Stable blocker codes include `TOURNAMENT_NAME_REQUIRED`, `ROSTER_EMPTY`, `MEMBER_OUTSIDE_GROUP`, `ATHLETE_ID_MISSING`, `UNPAIRED_MEMBER`, `PAIR_MEMBER_COUNT_INVALID`, `DIVISION_CONFIG_INVALID`, `DRAW_REQUIRED`, `DRAW_STALE`, `STAGE_PLAN_INVALID`, `ADVANCE_RESULTS_INCOMPLETE`, `STRUCTURE_LOCKED_BY_RESULTS`, `REVISION_CONFLICT`, and `FINALIZE_NOT_ATOMIC`. Warning codes include `INACTIVE_MEMBER_SELECTED`, `GROUP_SIZE_IMBALANCE`, `GROUPS_UNEVEN`, `KNOCKOUT_BYE`, and `PLAYOFF_PENDING_SLOTS`. A pending playoff stage does not block readiness when its source stage and progression are valid.

Legacy setup URLs redirect draft records to the four-step workspace, preserving `divisionId` and step. Finalized records redirect to the schedule/operations tab. A finalized tournament never re-enters setup through a redirect.

## Preflight and migration conclusion

Preflight was run against Supabase project `uhhlelemewilgsdijwja` using the configured service-role environment and PostgREST OpenAPI, then compared with `npm run migration:ledger`.

Existing live tables and relevant columns include: `tournaments.client_draft_key`; `tournament_divisions.setup_revision`, `roster_lock_status`, `setup_updated_at`; `tournament_stages` with `division_id` and `config`; `tournament_athletes` with `athlete_id`; `tournament_division_roster_members`; `tournament_pairs`; `tournament_pair_members`; `tournament_entries` with `pair_id`; `tournament_matches` with `entry_a_id`, `entry_b_id`, `parent_match_id`, `loser_match_id`, and `match_key`; `tournament_stage_transitions` with explicit source/target stage and target slot; `tournament_setup_mutations` with idempotency and fingerprint fields; and venue/court/assignment tables.

`tournament_draw_slots` is absent from the live API schema. No dedicated setup save/finalize RPC is exposed by the repository’s migration inventory or required by the current REST preflight; setup writes must therefore use the server-side transactional route/use-case, not a browser-callable RPC. Existing stage-advance functionality is separate and must not be repurposed as setup finalize.

The ledger completed successfully and contains migrations through the repository’s current latest version (including the tournament setup mutation, stage transition, entry, and assignment changes). Conclusion: T0.1 requires no migration. Reuse the existing tables and explicit transition/placeholder columns; introduce a migration only if an implementation proves a required field/constraint absent after a new preflight. No production or test data was edited.

## Ownership and implementation order

T1.A owns pure state, pairing, stage-plan, readiness helpers. T1.B owns aggregate/preview/finalize routes and transactional persistence. T1.C owns roster/member/pair application. T2.A/B/C consume this contract for shell, participants/pairing, and draw/review. The architect contract is frozen unless an ADR records a deliberate change.
