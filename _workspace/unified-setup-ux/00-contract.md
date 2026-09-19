# T0.1 Contract — Unified Internal Tournament Setup

Date: 2026-09-19. This is the frozen handoff contract for T1.A, T1.B, T1.C, and T2.*. No production code, migrations, tests, or frozen files are changed by T0.1.

## SetupDraftV2

```js
{
  draftVersion: 2, draftId, tournamentId, divisionId, state, revision,
  clientDraftKey, idempotencyKey, currentStep,
  tournament: { name, description, eventDate, location, organizerMode },
  participants: {
    selectedMemberIds, inactiveSelectedMemberIds, unresolvedMemberIds,
    athleteSnapshots: [{ memberId, athleteId, displayNameSnapshot, clubNameSnapshot }]
  },
  format: { entrantType, formatKey, config },
  pairs: [{ pairId, memberIds, athleteIds, nameSnapshot, locked, status }],
  unpairedMemberIds, reserveMemberIds,
  draw: { status, seed, assignments, stagePlans, matches },
  readiness: { blockers, warnings },
  invalidation: { roster, pairing, format, draw, reasonCodes },
  savedAt, finalizedAt
}
```

`formatKey` is `round_robin`, `knockout`, `group_knockout`, or `mlp`; format-specific fields belong in `config`. `groupId` is server-derived and is not accepted as an authority from the client. Version-1 drafts are normalized without destructive rewrite; old group-knockout drafts are marked stale until previewed again.

## State, invalidation, persistence

States: `local_only -> server_draft -> roster_ready -> pairing_ready -> draw_drafted -> finalized`. Finalized is terminal for setup. Participant changes invalidate pairing and draw; format/pair changes invalidate draw; draw changes invalidate preview fixtures. Nothing auto-randomizes after invalidation.

`GET /api/tournament-v2/setup?divisionId=...` loads the complete aggregate and resume step. `PUT /api/tournament-v2/setup` accepts an allowlisted patch, `expectedRevision`, and `idempotencyKey`; it uses CAS and returns the complete aggregate. `POST /api/tournament-v2/preview-schedule` computes but does not persist. `POST /api/tournament-v2/setup/finalize` atomically persists stage payloads, entrants, progression, fixtures, and draw lock. Repeating the same idempotency key and fingerprint returns the stored response; reusing it with a different payload returns `IDEMPOTENCY_KEY_REUSED`. Save draft does not lock or create official fixtures. Finalize redirects to schedule and does not set LIVE.

Any started match or recorded score makes structure immutable through setup and yields `STRUCTURE_LOCKED_BY_RESULTS`. Revision mismatch yields `REVISION_CONFLICT` without overwriting server state.

## Group-knockout stage contract

`group_knockout` always emits exactly two stages with the same `division_id`: group round-robin and knockout. The only builder is `buildDivisionStagePayloads()` in `lib/tournament/wizardModel.js`; T1.A may wrap and call it, but must not implement another converter. The progression record includes explicit `sourceStageId`, `targetStageId`, `sourceGroupLabel`, `sourceRank`, `targetSlot`, and `targetDivisionId`, with `thirdPlaceEnabled`. It never derives the target as `stage_order + 1`.

Locked example: 14 athletes -> 7 pairs -> A=4/B=3 -> 6+3=9 group matches -> `Nhất A–Nhì B`, `Nhất B–Nhì A` semifinals -> 1 final = 12, or 13 with third place. `GROUP_SIZE_IMBALANCE` is warning-only. A playoff may be ready while its matches await valid source results.

## Pair identity and member rules

A pair has stable `pairId`, `locked`, and members identified by `member_id`; server resolves `athlete_id`, and names remain snapshots. Duplicate names are not merged. Missing mapping returns `ATHLETE_ID_MISSING`; cross-tenant selection returns `MEMBER_OUTSIDE_GROUP`.

Add member -> unpaired only. Remove member -> affect only its containing pair; all other pairs remain stable, even unlocked. `regenerateUnlockedPairs` is explicit, skips locked pairs, and checks duplicate membership. Replacement is explicit and local to one pair. Odd doubles presents three choices: add member, reserve one, or switch supported format. No singleton pair and no BYE as a teammate.

## Knockout placeholder

A waiting slot is `{ kind: 'progression', sourceStageId, sourceGroupLabel, sourceRank, label }`. It is shared by preview, persisted match frame, and bracket. `entry_a_id`/`entry_b_id` may be null until source results are confirmed; no fake entrant is created. Missing source results return `ADVANCE_RESULTS_INCOMPLETE` and do not create temporary semifinal pairs.

## Readiness codes and redirects

Blockers: `TOURNAMENT_NAME_REQUIRED`, `ROSTER_EMPTY`, `MEMBER_OUTSIDE_GROUP`, `ATHLETE_ID_MISSING`, `UNPAIRED_MEMBER`, `PAIR_MEMBER_COUNT_INVALID`, `DIVISION_CONFIG_INVALID`, `DRAW_REQUIRED`, `DRAW_STALE`, `STAGE_PLAN_INVALID`, `ADVANCE_RESULTS_INCOMPLETE`, `STRUCTURE_LOCKED_BY_RESULTS`, `REVISION_CONFLICT`, `FINALIZE_NOT_ATOMIC`.

Warnings: `INACTIVE_MEMBER_SELECTED`, `GROUP_SIZE_IMBALANCE`, `GROUPS_UNEVEN`, `KNOCKOUT_BYE`, `PLAYOFF_PENDING_SLOTS`.

Readiness is computed from actual aggregate data; no field is hard-coded true. Legacy draft URL redirects to workspace with division and step preserved. Finalized URL redirects to schedule/operations; it cannot reopen setup.

## Live preflight: project `uhhlelemewilgsdijwja`

Observed in PostgREST OpenAPI: `tournaments` (including `client_draft_key`); `tournament_divisions` (including `setup_revision`, `roster_lock_status`, `setup_updated_at`); `tournament_stages`; `tournament_athletes`; `tournament_division_roster_members`; `tournament_pairs`; `tournament_pair_members`; `tournament_entries` (including `pair_id`); `tournament_matches` (including `entry_a_id`, `entry_b_id`, `parent_match_id`, `loser_match_id`, `match_key`); `tournament_stage_transitions` (explicit source/target/slot); `tournament_setup_mutations` (idempotency/fingerprint/response); venues, courts, and match assignments. `tournament_draw_slots` is missing.

The migration ledger command completed successfully and reports the current repository migration set through its latest version, including the tournament v2, mutation, transition, entry, and assignment work. Repository migration inventory contains no dedicated setup save/finalize RPC contract. Existing operational RPCs are not a substitute for setup finalization; browser code must not call privileged RPCs directly.

Conclusion: no migration is required for T0.1. Reuse the actual schema and server-side transactional use case. If implementation discovers a missing required constraint/field, repeat preflight and add only an additive forward migration.

## Stable error envelope

```js
{ error: { code: 'STABLE_CODE', message: string, field?: string, step?: 1|2|3|4 }, revision?: number }
```

Preview and finalize must produce the same match identities and count for the same entrant identities, draw, and stage config. This contract is frozen; changes require a short ADR.
