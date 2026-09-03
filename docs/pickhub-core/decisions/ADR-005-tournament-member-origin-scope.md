# ADR-005 — Tournament member origin scope

## Status

Accepted — 2026-09-03

## Decision

`tournament_entrant_members.group_id` is the tenant of the tournament and its
organizer. It must not be compared with the home club of the linked member.

The nullable `member_group_id` column records the source club for a non-guest
`member_id`. The database enforces:

```text
(member_id, member_group_id) -> club_members(id, group_id)
```

Guest rows have both `member_id` and `member_group_id` set to `NULL`. The
entrants API resolves `member_group_id` from the authoritative `club_members`
row; clients cannot choose an arbitrary source group.

Migration 025 also installs a compatibility trigger so the currently deployed
PickHub build, which only sends `member_id`, continues to write valid rows while
the new API is rolled out.

## Rationale

A tournament organized by club A may invite an existing member record from club
B. Using the tournament's `group_id` as the member's source group would reject
that valid case and conflate organizer scope with membership origin.

The later athlete/registration model can add explicit representation and
invitation consent without changing the Phase 1 organizer-scope invariant.

## Consequences

- Existing linked rows are backfilled from `club_members.group_id`.
- A future cross-club member link cannot point to a different member source than
  the stored `member_group_id`.
- The database trigger keeps old writers compatible by deriving the source group
  until all production writers send the new column.
- Cross-club member discovery and invitation authorization remain server-side;
  a public/global member directory is out of scope for Phase 1.
- Migration 025 must be applied manually after preflight review, followed by a
  production preflight rerun.
