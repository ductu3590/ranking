# Phase 3 Test Report

## Scope

Interclub foundation: additive migration contract, domain state/roster validation, constrained pool, club aggregate standings and privacy-safe public projection.

## Local verification

Command:

```powershell
npm run test:phase3-interclub
```

Observed checks:

- `phase3 migration contract ok`
- `phase3 interclub domain ok`
- `phase3 interclub competition ok`
- `phase3 interclub public ok`

Result: PASS.

Command:

```powershell
npm run test:t-engines
```

Observed existing engine checks: seeding, simple, MLP, MLP pairs, round-robin schedule/groups/standings, knockout schedule/standings, registry, orchestrator and mix all report `ok`.

Result: PASS.

Command:

```powershell
npm run build
```

Result: PASS. Next.js compiled, generated 46/46 static pages and completed production optimization. Existing non-blocking warnings remain for `<img>`, viewport metadata and one anonymous default export.

## Environment status

- Supabase migration apply: NOT RUN by Codex; requires manual rehearsal database operation.
- Director/captain/scorekeeper E2E: NOT RUN in this increment; API/UI workflow remains the next Phase 3 slice.
- Production deployment: NOT RUN.

## Interpretation

This report covers the implemented Phase 3 foundation only. It is not an exit-gate PASS for the complete Phase 3 MVP until API, UI, migration rehearsal and three-club E2E are implemented and executed.

## Task 1 — Inventory, compatibility and preflight

### TDD RED

Command:

```powershell
node tests/phase3/competition-preflight.test.js
```

Observed failure:

```text
AssertionError [ERR_ASSERTION]: Task 1 migration preflight must exist
```

Expected: the contract failed because migration 031 did not exist yet.

### TDD GREEN

Command:

```powershell
node tests/phase3/competition-preflight.test.js
```

Observed output:

```text
Phase 3 Task 1 preflight contract: PASS
```

### Supabase preflight

Project: `uhhlelemewilgsdijwja` (Ranking 246)

Read-only inventory observed:

- tournaments: 3 rows, all `draft`;
- stages: 5 rows, all `pending`;
- matches: 0 rows;
- orphan stages: 0;
- orphan entrants: 0;
- orphan match stage references: 0;
- orphan match entrant A/B/winner references: 0;
- tournament/stage/entrant/match tenant mismatches: 0;
- no existing PickHub system-group candidate found.

Migration file executed through Supabase MCP:

```text
database/migrations/031_phase3_competition_preflight.sql
```

Observed result: `[]`.

The SQL is intentionally read-only and ends with `ROLLBACK`; no schema or data mutation was applied. It will abort future community rows if a dedicated PickHub system group has not been provisioned.

### Phase 3 regression after Task 1

Command:

```powershell
npm run test:phase3-interclub
```

Observed output:

```text
phase3 migration contract ok
phase3 interclub domain ok
phase3 interclub competition ok
phase3 interclub public ok
phase3 interclub ui contract ok
```

Result: PASS.

### Task 1 status

Task 1 implementation is complete. Do not proceed to Task 2 automatically; the execution protocol requires a stop and human review here.

## Task 2 — Platform identity and organizer authorization

### TDD RED

Command:

```powershell
node tests/phase3/platform-auth.test.js
```

Observed failure:

```text
Error: Cannot find module '../../lib/platformSessionCore'
```

Expected: the behavior test failed because platform auth implementation did not exist yet.

### TDD GREEN

Command:

```powershell
node tests/phase3/platform-auth.test.js
```

Observed output:

```text
Phase 3 Task 2 platform auth contract: PASS
```

The test exercises real code for password hashing/verification, wrong password rejection, session expiry, session revocation, login rate limiting, group-session/platform boundary and community organizer validation.

### Supabase preflight before constraint change

Command executed through Supabase MCP:

```sql
SELECT
  count(*) FILTER (WHERE organizer_type = 'community')::int AS community_tournaments,
  count(*)::int AS all_tournaments
FROM public.tournaments;
```

Observed result:

```text
community_tournaments: 0
all_tournaments: 3
```

### Migration apply

Migration:

```text
database/migrations/032_platform_accounts.sql
```

Applied through Supabase MCP to project `uhhlelemewilgsdijwja`.

Observed result:

```text
{"success":true}
```

Migration 032 created platform account/session tables, added `created_by_platform_account_id`, and replaced the organizer constraint so global `community` tournaments do not require `organizer_community_id`. Migrations 030 and 031 were not modified.

### Verification after migration

Observed:

```text
community_tournaments: 0
platform_accounts: true
platform_sessions: true
creator_column: true
organizer_constraint: community requires organizer_club_id IS NULL; organizer_community_id is optional
rls: platform_accounts=true, platform_sessions=true
```

### Phase 3 regression after Task 2

Command:

```powershell
npm run test:phase3-interclub
```

Observed output:

```text
phase3 migration contract ok
phase3 interclub domain ok
phase3 interclub competition ok
phase3 interclub public ok
phase3 interclub ui contract ok
Phase 3 Task 1 preflight contract: PASS
Phase 3 Task 2 platform auth contract: PASS
```

Result: PASS.

### Task 2 status

Task 2 implementation is complete. Task 3 was not started; the execution protocol requires a stop and human review here.

Additional Task 2 verification:

- `scripts/seed-platform-account.js` now reads `PICKHUB_PLATFORM_ADMIN_EMAIL`, `PICKHUB_PLATFORM_ADMIN_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then creates or updates the first platform account; it does not expose a public signup route.
- `lib/platformSession.js` validates the separate `platform_session` against account/session rows and revocation/access version.
- `app/api/platform/session/route.js` provides the server-side login adapter with hashed-password verification, rate limiting and HTTP-only cookie issuance.

Command:

```powershell
npm run build
```

Result: PASS. Next.js compiled successfully and included `/api/platform/session`. Existing non-blocking warnings remain for image optimization, viewport metadata and the pre-existing anonymous default export.

## Task 2 security remediation — wildcard login/rate-limit bypass

### TDD RED

The regression test was extended before the fix to require exact-login validation, a shared defensive rate-limit key for wildcard variants and database-backed revoke validation. Before implementation it failed at the missing validation helper:

```text
TypeError: validatePlatformLogin is not a function
```

### Fix applied

- Replaced account lookup `ilike('login', login)` with exact `.eq('login', login)` in the platform login route and bootstrap script.
- Normalized seed login with `trim().toLowerCase()` before writing and exact lookup.
- Rejected `%` and `_` at input validation with the same `401 Invalid credentials` response as wrong credentials.
- Rate-limit keys use the account ID when an exact account is resolved; malformed wildcard attempts share `platform-invalid-login` instead of using attacker-controlled patterns.
- Added database-backed session validation and `POST /api/platform/session/logout`, which writes `revoked_at` and clears the HTTP-only cookie.

### Security regression GREEN

```powershell
node tests/phase3/platform-auth.test.js
```

```text
Phase 3 Task 2 platform auth contract: PASS
```

The test now proves a session accepted before database-backed revoke is rejected after the session record is revoked through the same validation path; it does not pass a hand-built revoked-key set to the verifier.

### Required regression commands

```powershell
npm run test:phase3-interclub
npm run test:t-api
```

Both passed. `npm run build` also passed and included `/api/platform/session/logout`.

### Remaining security debt

The login rate limiter is currently in-memory. This is not effective as a security control on Vercel/serverless because consecutive requests may run in different processes/instances. Before enabling platform login for real users, replace it with a shared counter backed by Supabase (or another shared store) and retain the same account/malformed-input keying policy.

## Task 3 — division/entry/stage/match convergence

### TDD RED

The new behavior test was written before implementation. Initial run failed because the division convergence projection did not exist:

```text
Error: Cannot find module '../../lib/tournament/divisionCompetition'
```

The migration contract test was also run before creating the migration and failed because `033_phase3_division_entry_convergence.sql` did not exist. Both tests were then implemented and pass.

### Database migration

- Applied `033_phase3_division_entry_convergence.sql` forward-only. The first apply exposed a missing composite unique key needed by the stage/match foreign key (`42830`); the migration was corrected by adding the validated `(id, division_id)` stage index and reapplied successfully.
- Applied `033b_phase3_entry_schedule_rpc.sql` successfully for atomic entry-based schedule replacement.
- Live Supabase verification after migration: 3 tournaments, 3 legacy-import divisions, 5 stages, 0 matches, 0 entries, 0 games; all stage and match division null counts are zero.
- Explicit status decision recorded in migration: tournament `active -> registration_open`; match `done -> finalized`.
- Public slug lookup is global via `lower(public_slug)`; child public reads no longer use `group_id`.

### Implementation

- Division-scoped schedule generation writes `division_id`, `entry_a_id` and `entry_b_id` through `replace_tournament_entry_schedule`.
- Standings resolve entry-based match references while retaining the legacy `tournament_entrants` read adapter.
- Public snapshots read `tournament_entries` for division-scoped competitions and expose only allowlisted public fields.
- The pure convergence test proves two divisions produce independent stages, matches and standings without cross-contamination.

### Required verification

```text
npm run test:phase3-interclub  PASS
npm run test:t-api             PASS
npm run test:t-engines         PASS
npm run build                  PASS
```

The first sandboxed build attempt failed with Windows `spawn EPERM` while Next.js tried to create worker processes. The same build completed successfully with the required process permission; only pre-existing lint/metadata warnings remain.

### Follow-up corrections

- Renamed `034_phase3_entry_schedule_rpc.sql` so `lib/migrationLedger.js` includes it; the prior `033b_...` filename was not ledger-compatible. Task 4's planned migration is consequently renumbered from `034_...` to `035_...`.
- Replaced the previous in-memory division test with a fake Supabase query-chain integration contract. It exercises `computeStageStandings`, `loadStageData`, `tournament_entries` division filtering, entry-based match columns, legacy fallback behavior and entry-based persistence. The first run of this rewritten test was RED before fixture/implementation correction; it now passes.
- Limitation recorded: `tests/phase3/division-entry-migration.test.js` remains a SQL-text contract and does not prove live database constraints. Live migration verification is still performed separately against Supabase.
- Public allowlists now omit `group_id` for tournament, stage, match and game records; public standings use an unscoped read path while internal authenticated callers retain tenant filtering.

## Task 4 — domain schema and pure validators

### TDD RED

The new behavior assertions were added to `tests/phase3/interclub-domain.test.js` before implementation. The first run failed as expected:

```text
TypeError: validateDivisionOptions is not a function
```

### Implemented in repository

- Added pure, I/O-free validators for division options, exclusive internal/external club references, registered/guest athlete snapshots and pair members.
- Added stable error codes for invalid play type, rating cap, club reference, athlete identity/PHR and duplicate pair members.
- Added migration `035_phase3_division_options_guest_clubs_pairings.sql` covering division options, scoring/share policy columns, external clubs, nullable `club_id` with exclusive-reference constraint, two partial unique indexes, athlete/PHR history, pair tables and registration confirmation fields.

### Live database status

The requested preflight assumption differed from the live database: Supabase returned `3 tournaments`, `3 divisions`, `0 entries`, `0 registrations`, but `2 tournament_clubs`. Both existing rows had valid internal `club_id` values, so the vocabulary-corrected migration was then applied successfully as `phase3_domain_schema_035_vocabulary_fix`.

Live verification after apply:

- `tournament_clubs.club_id`: nullable.
- `tournament_clubs.external_club_id`: exists and nullable.
- Partial unique indexes `idx_tournament_clubs_tournament_club` and `idx_tournament_clubs_tournament_external`: present.
- Division checks: `play_type = singles|doubles|team`, `scoring_scope = athlete|club`, `rating_policy = open|capped`, `pairing_mode = none|manual|random_balanced`.
- Compatibility decision is enforced: `singles→individual`, `doubles→pair`, `team→team` through `tournament_divisions_entrant_type_relation_ck`.

## Task 5 — pairing and ruleset-aware draw

### TDD RED

The behavior test was first changed from the old global duplicate-club exception to the Task 5 policies. It failed before implementation with:

```text
InterclubError: club 10 appears more than once in pool
```

After strengthening the balance assertion, it failed again until the algorithm was corrected to pair high PHR with low PHR instead of adjacent sorted athletes. The focused test is now green.

### Implementation

- Added deterministic PHR-balanced doubles preview using `tournament_athletes.phr_rating`; high/low ratings are paired to minimize pair-sum variance.
- Missing ratings fall back to seeded shuffle; same seed produces the same pairing and returns `PHR_RATING_MISSING` warning.
- Singles with `pairing_mode = none` return direct entries and no pair records.
- Added division-wide duplicate-athlete validation and immutable locked pair snapshots.
- Duplicate-club policy now supports `unique_per_pool` (hard block), `spread_if_possible` (default with warning) and `allow_multiple` (no warning).

### Design questions intentionally left open before Task 7

1. PHR currently exists only per tournament in `tournament_athletes` and `tournament_athlete_phr_history`; decide whether to add an athlete-level PHR source of truth and snapshot it into tournaments.
2. `recorded_by_profile_id` points to a profile table that does not yet exist, while `community_admin` is a platform account; decide how to record the confirming actor required by Phase 4.

## Task 5 / Task 5b follow-up

- Added rating-cap warnings to pairing preview without blocking registration or organizer approval. Partial PHR and odd doubles rosters produce explicit warnings and retain unpaired/available athletes.
- The real round-robin draw path now distributes duplicate-club entries across pools under the selected policy; it returns a warning only when spread capacity is exceeded.
- Added versioned scoring/tiebreak policies. `legacy_v2` is verified against the existing round-robin fixture ordering, while game validation and deterministic draw-lot behavior are covered by focused tests.

### Task 5b vocabulary and tie-break correction

- Corrected the non-legacy presets to the architecture contract: `phong_trao_mac_dinh`, `hieu_so_van_truoc` and `giao_huu_clb` now use the documented order and criterion names. `legacy_v2` keeps its existing ranking order.
- `rankStandings` now uses seeded Fisher–Yates for `draw_lot`, detects cyclic head-to-head mini-leagues, recursively ranks remaining tied subsets, and reports the configured order plus considered/decisive criteria in `explanation`.
- Added scoring presets `phong_trao_11`, `phong_trao_15`, `ban_ket_chung_ket`, `mlp_4_van`, and the missing `deciding_game`, `draw_points`, and `mlp` fields.
- Verification: `test:phase3-interclub`, `test:t-api`, and `test:t-engines` pass; `git diff --name-only -- tests/tournament tests/phase1 tests/phase2` returned no fixture files, confirming legacy fixtures were not edited.

### Task 5b data-shape correction

- `roundRobin.computeStandings` now emits the documented aliases and derived metrics: `wins`, `game_diff`, `point_diff`, `game_ratio`, and `point_ratio`, while retaining `diff` for `legacy_v2` compatibility. `aggregateClubStandings` emits the same ranking fields.
- The tie-break test now obtains rows from `computeStandings` instead of inventing fields absent from the real engine output. It covers the real `diff`-before-`points_for` case and each new derived criterion.
- Missing ranking fields are no longer silently indistinguishable from zero: `explanation` records `available: false` for an unavailable criterion. `scope` is honored as `all` versus `tied_group` when calculating head-to-head values.

## Task 6 — scorekeeper token and privacy-safe public projection

### TDD RED

The new behavior tests were run before implementation. The token test failed with `MODULE_NOT_FOUND` for `lib/tournament/scorekeeperToken`, while the strengthened public projection test failed because `lineup` was still exposed. These failures demonstrated missing implementation rather than a test-only string check.

### Implementation

- Added hashed, expiring, revocable, one-time scorekeeper tokens in migration `036_phase3_scorekeeper_tokens.sql` and `lib/tournament/scorekeeperToken.js`.
- Added organizer issue/revoke API at `/api/tournament-v2/score-tokens`; the games API accepts a valid token for match scoring without requiring a personal account and consumes it after use.
- Public tournament reads remain global-slug based and use explicit allowlists. Internal notes, contact fields, approval state, lineup/private game data and PHR are omitted by default. Confirmed PHR is included only when `share_settings.public_phr` is explicitly enabled.

## Task 6b, 7, 8 — nghiệm thu và các sửa chữa kèm theo

### Bộ Phase 3 đầy đủ

Lệnh: `npm run test:phase3-interclub` — 14 file, thoát mã 0.

```
phase3 migration contract ok
phase3 interclub domain ok
phase3 interclub competition ok
phase3 interclub public ok
phase3 interclub ui contract ok
Phase 3 Task 1 preflight contract: PASS
Phase 3 Task 2 platform auth contract: PASS
Phase 3 Task 3 migration contract: PASS
Phase 3 Task 3 division-entry convergence integration contract: PASS
phase3 scoring rules ok
phase3 tiebreak policy ok
phase3 scorekeeper token ok
phase3 share ok
phase3 wizard competition contract ok
```

### Hồi quy toàn hệ thống

`npm run test:ci` thoát mã 0. `npm run test:regression` thoát mã 0, và bộ Phase 3
đã được đưa vào chuỗi hồi quy nên 14 dòng trên xuất hiện bên trong log hồi quy,
không còn nằm ngoài.

`npm run build` thoát mã 0.

### Sửa chữa phát hiện khi nghiệm thu

**Trang công khai trả 500 với mọi giải.** Route công khai select `phr_rating` và
`phr_status` từ `tournament_entries`, hai cột không tồn tại ở bảng đó. Xác nhận
bằng chính câu truy vấn trên database: `ERROR: 42703: column "phr_rating" does
not exist`. Cả ba giải đều unlisted và có nội dung thi đấu nên nhánh này luôn
chạy. Đã chuyển sang tổng `skill_snapshot` của `tournament_entry_members`, chỉ
truy vấn khi `share_settings.public_phr` bật.

**Token nhập điểm dùng một lần.** Giao diện gửi toàn bộ danh sách ván mỗi lần bấm
lưu, nên người cầm điểm chỉ lưu được đúng một lần mỗi trận. Mô phỏng phiên thật:

```
1. Lưu sau ván 1                  OK
2. Lưu sau ván 2                  BỊ TỪ CHỐI (TOKEN_REPLAYED)
3. Sửa tỉ số gõ nhầm              BỊ TỪ CHỐI (TOKEN_REPLAYED)
4. Thử lại sau khi mất mạng       BỊ TỪ CHỐI (TOKEN_REPLAYED)
```

Đã bỏ cơ chế dùng một lần; chống ghi trùng do `p_idempotency_key` của
`replace_tournament_games` đảm nhiệm. Migration 036 sửa trước khi apply.

**Chuyển vòng không hiểu mô hình entry.** `advance/route.js` giữ một bản sao
`loadStageData` riêng chỉ đọc `entrant_id` và không xét `division_id`, trong khi
`standingsService` đã chuyển sang entry ở Task 3. Vòng bảng lên playoff sẽ hỏng
với giải dùng nội dung thi đấu. Đã xoá bản sao, dùng chung hàm nạp đã được test
hành vi chứng minh là hiểu entry.

### Hai test cũ được sửa vì kiểm sai thứ chúng tuyên bố

- `tests/tournament/ui-wizard.contract.test.js` bắt chuỗi `saveEntrant`. Wizard
  mới không còn ghi entrant cấp giải, nên chuỗi đó chỉ tồn tại trong một comment
  chết để test xanh. Đã đổi sang `saveDivisionEntry` và thêm khẳng định ngược
  rằng Wizard không gọi `saveEntrant`.
- `tests/tournament/api-advance.contract.test.js` bắt `tournament_stage_entrants`
  và `seed_in_stage` với nhãn "ghi stage_entrants kế", nhưng hai chuỗi đó thuộc
  khối ĐỌC; việc ghi thật nằm trong RPC. Đã đổi sang kiểm `advance_tournament_stage`
  và `p_seeded`.

### Còn lại, chưa kiểm chứng được bằng máy

- Dán link vào nhóm chat để xác nhận card Open Graph, và soi ảnh xuất ra bằng mắt.
- Giải cộng đồng chạy end-to-end: cần tạo CLB hệ thống PickHub trước, hiện route
  trả `SYSTEM_GROUP_REQUIRED` thay vì màn trắng.
- Người cầm điểm nhập bằng token trên thiết bị thật.
- `tournament_athletes` chưa có cột `source` (`club_member|guest`) như spec mục
  4.7; hiện suy ra từ `athlete_id`. Cần quyết định có thêm migration 037 không.
