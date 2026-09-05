# Phase 3 Interclub Tournament MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Phase 3 foundation for internal, friendly and community tournaments while preserving legacy tournament v2 during migration.

**Architecture:** First converge the competition model on `tournament → division → entry → stage → match → game`. Legacy `tournament_entrants` remains read-compatible only during migration; new draw, match, standings and public flows use division-scoped entries. Add platform auth, guest clubs/athletes, pairings and PHR warnings before rebuilding the Wizard.

**Tech Stack:** Next.js 14 App Router, JavaScript, CommonJS domain modules, Supabase/PostgreSQL migrations, Node script tests.

**Spec:** `docs/superpowers/specs/2026-09-04-phase-3-interclub-tournament-mvp-design.md` and `docs/pickhub-core/03-phase-interclub-tournament-mvp.md`

## Global Constraints

- `group_id` is retained as a technical compatibility tenant in the transition; it is not the ownership model for community tournaments. Long-term authorization is tournament/organizer scoped.
- `community_admin` uses a platform account/session, never a fabricated `group_session`.
- Every mutation must enforce organizer/club scope; public reads use a global slug and explicit projection allowlists.
- New stages and matches must be division-scoped and reference `tournament_entries`.
- Pool duplicate-club behavior is ruleset-specific: warn/spread by default; hard-block only when the template explicitly requires uniqueness.
- A club organizer may submit on behalf of an invited club, but the submission must record `submitted_by = organizer` and remain pending club confirmation.
- External clubs and guest athletes are tournament-scoped and must not silently become PickHub groups or club memberships.
- Migration được phép apply trực tiếp trên Supabase hiện hữu qua Supabase MCP; phải giữ RLS bật và không làm mất dữ liệu.
- Migration 030 đã được apply trên project `uhhlelemewilgsdijwja` (các bảng `tournament_divisions`, `tournament_clubs`, `tournament_registrations`, `tournament_entries`, `tournament_staff` đã tồn tại). Không sửa file 030; mọi thay đổi là migration mới.
- Scoring rules and tie-break order are versioned policies (tournament default → division override → stage snapshot at draw commit). Engines take the policy as input; the current hard-coded order becomes preset `legacy_v2` and must reproduce existing standings.
- Zalo sharing means Open Graph preview, PNG export and copy-text built from the public projection only. No Zalo OA/ZNS integration.

### Task 1: Inventory, compatibility and preflight

**Files:**
- Create: `database/migrations/031_phase3_competition_preflight.sql`
- Create: `tests/phase3/competition-preflight.test.js`

- [ ] Inventory all legacy tournament rows, stages, entrants, matches and status values.
- [ ] Define explicit mapping/report for `draft|active|completed` and `pending|live|done`.
- [ ] Detect orphan stages/matches and ambiguous `group_id` ownership; abort migration on ambiguity.
- [ ] Decide/record the temporary PickHub system group used by community rows.
- [ ] Add preflight queries and evidence output before any backfill.

### Task 2: Platform identity and organizer authorization

**Files:**
- Create: `database/migrations/032_platform_accounts.sql`
- Create/modify: `lib/platformSession*`, `lib/domain/identity/*`, `app/api/platform/*`
- Create: `tests/phase3/platform-auth.test.js`

- [ ] Add `platform_accounts` with hashed password and `community_admin|platform_admin` role.
- [ ] Add a bootstrap script (`scripts/seed-platform-account.js`, reads env) to create the first `community_admin`; no public sign-up route.
- [ ] Update `assertTournamentOrganizer` so `community` no longer requires `organizer_community_id`; keep error codes stable.
- [ ] Add separate signed HTTP-only `platform_session` with expiry, revoke and rate limit.
- [ ] Add organizer authorization for `community_admin` across all tournaments.
- [ ] Keep `group_session` for club operations; do not use it for platform actors.
- [ ] Make profile references nullable/compatibility-safe until profile identity exists.

### Task 3: Converge division, entry, stage and match

**Files:**
- Create: `database/migrations/033_phase3_division_entry_convergence.sql`
- Modify: `lib/tournament/engines/*`, `lib/tournament/standingsService.js`, `app/api/tournament-v2/{stages,matches,games,generate,advance,standings,public}/*`
- Create: `tests/phase3/division-entry-convergence.test.js`

- [x] Add `division_id` to stages and matches with validated backfill.
- [x] Add entry-based match references and stage-entry references.
- [x] Revise organizer constraint so global `community_admin` tournaments do not require `organizer_community_id`; record `created_by_platform_account_id`.
- [x] Switch engines and standings to `tournament_entries`; keep legacy adapters read-only.
- [x] Add global slug lookup in public APIs without group filtering.
- [x] Add compatibility mapping for legacy statuses; do not delete old data.
- [x] Extend `tournaments.status` and `tournament_matches.status` check constraints with the Phase 3 values actually used (`registration_open`, `registration_closed`, `scheduled`, `live`, `archived`; match `finalized`) and add `tournament_matches.result_type`; list which values stay Phase 4.
- [x] Test one tournament with two divisions, independent draws, matches and standings.

### Task 4: Phase 3 domain schema: division options, clubs and guests

**Files:**
- Create: `database/migrations/035_phase3_division_options_guest_clubs_pairings.sql` (030 is already applied; do not edit it)
- Modify: `lib/tournament/interclub.js`
- Modify: `tests/phase3/interclub-domain.test.js`

- [ ] Add division attributes: `play_type`, `scoring_scope`, `rating_policy`, `rating_cap`, `pairing_mode`, `scoring_override`, `tiebreak_override`.
- [ ] Add `tournaments.default_scoring`, `tournaments.tiebreak_policy`, `tournaments.share_settings`.
- [ ] Add `tournament_external_clubs`; make `tournament_clubs.club_id` nullable with `external_club_id` and a check that exactly one is set; replace `UNIQUE (tournament_id, club_id)` with partial unique indexes for each.
- [ ] Add `tournament_athletes`, `tournament_pairs` and pair members with snapshots.
- [ ] Add organizer-submitted roster status and club confirmation workflow.
- [ ] Add PHR value/status/history needed for warnings; no hard block on registration.
- [ ] Implement stable error codes and pure validators with no I/O.
- [ ] Run focused domain tests and then the existing tournament engine tests.

### Task 5: Pairing and ruleset-aware draw

**Files:**
- Modify: `lib/tournament/interclub.js`, `lib/tournament/engines/*`
- Create: `tests/phase3/interclub-competition.test.js`

- [ ] Implement singles entries without pair records.
- [ ] Implement doubles preview using PHR-balanced pairing, random fallback and manual pairing.
- [ ] Prevent athlete duplication inside a division and lock confirmed pairs.
- [ ] Replace global duplicate-club exception with `unique_per_pool`, `spread_if_possible` and `allow_multiple` policies.
- [ ] Return warnings when a pool cannot be perfectly spread; only hard-block explicit rulesets.
- [ ] Preserve deterministic ordering and configured standings tie-breaks.
- [ ] Run focused competition tests plus `npm run test:t-engines`.

### Task 5b: Scoring rules and tie-break policy

**Files:**
- Create: `lib/tournament/rules/scoring.js`, `lib/tournament/rules/tiebreak.js`
- Modify: `lib/tournament/engines/roundRobin.js`, `lib/tournament/match/simple.js`, `lib/tournament/match/mlp.js`, `lib/tournament/standingsService.js`, `lib/tournament/interclub.js`, `app/api/tournament-v2/{games,generate,standings}/*`
- Create: `tests/phase3/scoring-rules.test.js`, `tests/phase3/tiebreak-policy.test.js`

- [ ] Write failing tests: `legacy_v2` preset reproduces current `computeStandings` order on the existing engine fixtures; three-way tie resolved with `scope: tied_group`; `draw_lot` deterministic by stage seed; `validateGameScore` rejects 11-10 with `win_by: 2`, accepts 15-14 with `cap: 15`.
- [ ] Implement `resolveStageScoring`/`resolveTiebreak` (tournament default → division override → stage snapshot) and `SCORING_PRESETS`/`TIEBREAK_PRESETS` as versioned data.
- [ ] Snapshot resolved `scoring` and `tiebreak` into `tournament_stages.config` inside `CommitDraw`; adapter maps snake_case keys to existing `bestOf`/`winPoints`/`lossPoints`/`subMatches`/`dreambreaker`.
- [ ] Replace the hard-coded comparator in `roundRobin.computeStandings` and `aggregateClubStandings` with `rankStandings(rows, matches, policy, seed)` returning `explanation[]`.
- [ ] Validate score submission in the games API against the stage's snapshotted `scoring`; return stable error codes; correction workflow remains the only override path.
- [ ] Block `UpdateScoringRules`/`UpdateTiebreakPolicy` for stages already `live`/`done`.
- [ ] Run focused tests, then `npm run test:t-engines` and confirm existing fixtures are unchanged.

### Task 6: Scorekeeper token and privacy-safe public projection

**Files:**
- Create: `database/migrations/035_phase3_match_score_tokens.sql`
- Modify: `lib/tournament/interclub.js`, `app/api/tournament-v2/public/*`
- Create: `tests/phase3/interclub-public.test.js`, `tests/phase3/score-token.test.js`

- [ ] Write failing tests proving public metadata/schedule/results/standings are returned while notes/contact/private registration fields are omitted.
- [ ] Run the focused test and confirm failure.
- [ ] Add signed/hashed match or court score tokens with expiry/revoke/replay protection.
- [ ] Allow organizer-entered rosters with audit and later club confirmation.
- [ ] Implement projection using explicit allowlists, global slug lookup and immutable snapshots.
- [ ] Publicly expose only display name and representing club for athletes.
- [ ] Run all Phase 3 tests.

### Task 6b: Share link, image export and copy text (Zalo)

**Files:**
- Create: `lib/tournament/share.js`
- Modify: `app/giai-dau/v2/[slug]/page.js` (add `generateMetadata`), `app/api/tournament-v2/public/route.js`
- Create: `app/api/tournament-v2/public/share-image/route.js`, `app/giai-dau/v2/[slug]/opengraph-image.js`
- Create: `tests/phase3/share.test.js`

- [ ] Write failing tests: `buildOpenGraph` output has title/description/image and no private fields; `buildShareText` for schedule/result/call-to-court templates; `renderShareImage` refuses non-public visibility.
- [ ] Add `generateMetadata` with Open Graph on the public tournament page and per-division view, resolved by global slug and honoring `visibility`.
- [ ] Add a default OG image route rendered from tournament name/date/venue/host logo when no poster is uploaded (`share_settings.poster_url`).
- [ ] Add "Xuất ảnh" for draw result, schedule (by court/by club), standings, results/bracket and final honors; PNG sized for portrait mobile, watermark with tournament name and export time, built only from the public projection.
- [ ] Add "Sao chép thông báo" with versioned Vietnamese text templates editable before copy.
- [ ] Manually verify in the browser: paste the public link into a chat and confirm the preview card; export one standings image and inspect it for private data.

### Task 7: Rebuild Wizard on the converged model

**Files:**
- Modify: `app/giai-dau/v2/TournamentWizard.js`, `lib/tournamentV2Client.js`
- Modify/Create: relevant tournament API routes
- Create: `tests/phase3/wizard-competition-contract.test.js`

- [ ] Make the Wizard select internal/friendly/community organizer mode.
- [ ] Create multiple “Nội dung thi đấu” divisions in one tournament.
- [ ] Configure singles/doubles/team, athlete/club scoring, Open/capped PHR and pairing mode per division.
- [ ] Support internal clubs, invited internal/external clubs and open community registration.
- [ ] Support club member selection, guest athletes, auto pairing preview and manual pairing.
- [ ] Show warnings without blocking registration; allow BTC approval and organizer-submitted roster audit.
- [ ] Add a scoring/tie-break step: choose presets for the tournament, override per division, preview the effective rules per stage before draw commit.
- [ ] Add share actions on the organizer console and public page: copy link, export image, copy text.

### Task 8: Phase 3 test runner and runbook

**Files:**
- Modify: `package.json`
- Create: `TEST_PHASE_3.md`
- Create: `evidence/phase-3-test-report.md`

- [ ] Add `test:phase3-interclub` and `test:phase3` scripts that run the Phase 3 test matrix.
- [ ] Document prerequisites, focused commands, regression commands, migration apply steps, pilot rehearsal and expected outputs in Vietnamese.
- [ ] Run the complete Phase 3 command and record actual output in the evidence report.
- [ ] Run `npm run test:ci` or report the exact pre-existing blocker with command output.

## Self-review checklist

- [ ] No new flow reads legacy `tournament_entrants` except the explicit compatibility adapter.
- [ ] Every new public function has a runtime test that was observed failing before implementation.
- [ ] SQL is additive/forward-only, preserves old tournament data and has preflight/backfill verification.
- [ ] A two-division tournament has independent stages, matches and standings.
- [ ] Community tournament works with platform auth and an external invited club.
- [ ] Scorekeeper can score through an expiring token without a personal account.
- [ ] No migration file already applied to Supabase was edited; `legacy_v2` tie-break preset reproduces pre-Phase-3 standings on existing fixtures.
- [ ] Public link shows an Open Graph card; exported images and copy text contain no private data.
- [ ] Test instructions distinguish local domain tests from Supabase migration and browser rehearsal.
