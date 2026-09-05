# Phase 3 Interclub Tournament MVP — Design

**Goal:** Mở rộng tournament v2 thành hệ thống giải nội bộ, giao hữu và cộng đồng có organizer, nhiều division, roster approval, ghép cặp, draw theo ruleset và BXH cá nhân/CLB.

**Scope:** Phase 3 gồm preflight tương thích, platform auth tối thiểu, mô hình division-entry-stage-match hội tụ, domain thuần, migration additive, API và Wizard cho nội bộ/giao hữu/cộng đồng. Legacy v2 được giữ read-compatible trong thời gian chuyển đổi.

## Decisions

- Giữ các bảng tournament v2 hiện có để tránh phá Phase 2; bổ sung ownership/organization và các bảng Phase 3 bằng migration mới.
- `club_admin` là organizer của giải CLB; `community_admin` là platform actor có quyền toàn hệ thống cho giải cộng đồng.
- `community_admin` dùng platform account/session riêng, không giả lập bằng `group_session`.
- `community` là organizer scope toàn hệ thống; `organizer_community_id` không bắt buộc. Actor được lưu bằng `created_by_platform_account_id`.
- Giải bản nháp riêng tư; giải cộng đồng công khai khi mở đăng ký.
- Một tournament chứa nhiều division; mỗi division có `play_type`, `scoring_scope`, `rating_policy`, `rating_cap` và `pairing_mode`.
- Vocabulary quyết định: `play_type` là nguồn chân lý cho format (`singles|doubles|team`); `entrant_type` legacy vẫn giữ để tương thích nhưng bị ràng buộc tương ứng `singles→individual`, `doubles→pair`, `team→team`, không được tự do mâu thuẫn.
- Mọi mutation nghiệp vụ dùng transition hợp lệ và `expected_version` ở lớp application/API; domain không truy cập Supabase.
- Captain chỉ được thao tác participation của club mình; public projection chỉ nhận snapshot đã công khai.
- Template pilot có id `interclub_friendly_team_v1`, scheduler tái sử dụng engine hiện hữu nhưng duplicate-club là ruleset policy: `unique_per_pool`, `spread_if_possible` hoặc `allow_multiple`.
- CLB ngoài PickHub và VĐV khách được lưu theo phạm vi tournament.
- BTC có thể nhập hộ roster với actor/reason và chờ CLB xác nhận.
- Nội dung capped tính tổng PHR của cặp; thiếu/pending/vượt cap chỉ tạo warning, vẫn cho gửi và BTC duyệt.
- Scorekeeper Phase 3 có thể dùng token ký/hash theo trận hoặc sân thay vì tài khoản cá nhân.
- Migration được phép apply trực tiếp trên Supabase hiện hữu qua MCP, phải forward-only, preflight và không mất dữ liệu. Migration 030 đã apply; không sửa lại file 030, mọi thay đổi đi vào migration mới.
- `assertTournamentOrganizer` phải bỏ yêu cầu `organizer_community_id` cho `community`, đồng bộ với constraint mới.
- Luật điểm số (`scoring`) và tie-break (`tiebreak`) là policy có version: `tournaments.default_scoring`/`tiebreak_policy`, `tournament_divisions.scoring_override`/`tiebreak_override`, snapshot vào `tournament_stages.config` khi commit draw. Engine nhận policy làm input; thứ tự hiện hành trở thành preset `legacy_v2`.
- Chia sẻ Zalo = Open Graph metadata + xuất ảnh PNG từ public projection + copy text; không tích hợp Zalo OA/ZNS.

## Domain interfaces

- `lib/tournament/interclub.js`
  - `assertTournamentOrganizer(input)`
  - `transitionTournamentClub(status, action)`
  - `transitionRegistration(status, action)`
  - `validateRosterSubmission({ registrations, quota, eligibility })`
  - `validateInterclubPool(entries, ruleset)`
  - `previewPairing(athletes, options)`
  - `confirmPairing(pairing, options)`
  - `evaluateRatingWarning(pair, division)`
  - `aggregateClubStandings(matches, entries, options)`
  - `buildPublicInterclubProjection({ tournament, clubs, divisions, entries, matches, games })`
- `lib/tournament/rules/scoring.js`
  - `resolveStageScoring(tournament, division, stage)` → scoring hiệu lực (snake_case) kèm adapter sang key engine cũ
  - `validateGameScore(game, scoring, gameIndex)` → `{ ok, code }`
  - `SCORING_PRESETS` có version
- `lib/tournament/rules/tiebreak.js`
  - `resolveTiebreak(tournament, division, stage)`
  - `rankStandings(rows, matches, policy, seed)` → rows có `rank` và `explanation[]`; xử lý hòa nhiều bên theo `scope`
  - `TIEBREAK_PRESETS` gồm `legacy_v2`, `phong_trao_mac_dinh`, `hieu_so_van_truoc`, `giao_huu_clb`
- `lib/tournament/share.js`
  - `buildOpenGraph(projection, divisionId?)`
  - `buildShareText(projection, template, options)`
  - `renderShareImage(projection, kind, options)` → PNG buffer, chỉ đọc public projection

All functions are deterministic and return plain objects or throw an error with a stable `code`.

## Data model

The migration adds organizer fields to `tournaments` and creates/extends:

- `tournament_divisions`
- `tournament_clubs`
- `tournament_registrations`
- `tournament_entries` and `tournament_entry_members`
- `tournament_staff`
- `tournament_external_clubs`
- `tournament_athletes`
- `tournament_pairs` and `tournament_pair_members`
- `athlete_ratings`
- `platform_accounts` and `platform_sessions`
- match/court score tokens
- `tournaments.default_scoring`, `tournaments.tiebreak_policy`, `tournament_divisions.scoring_override`, `tournament_divisions.tiebreak_override` (jsonb), `tournament_matches.result_type`
- `tournaments.share_settings` (poster URL, OG image override, share text template version)

Existing `tournament_entrants` remain compatible during the migration window, but new stages/matches reference division-scoped `tournament_entries`. `group_id` is retained temporarily as a technical tenant; ownership and authorization use organizer/tournament scope. Public slug lookup is global. RLS remains enabled as the database backstop.

## Testing

- Node runtime tests prove state transitions, pairing, quota/eligibility/rating warnings, ruleset-aware draw, aggregate tie-break and public privacy filtering.
- Scoring/tiebreak tests: preset `legacy_v2` reproduces current round-robin ordering on the existing engine corpus; three-way tie with `scope: tied_group`; deterministic `draw_lot`; game validation for `points_to`/`win_by`/`cap`/`deciding_game`; policy change after commit does not alter snapshotted stage standings.
- Share tests: OG metadata contains no private fields; share image/text built only from public projection; export respects `visibility`.
- SQL contract tests prove preflight/backfill, division-entry-stage-match foreign keys, platform auth, external clubs/guests, indexes, enabled RLS and idempotent forward-only migrations.
- API contract tests will be added when routes are introduced.

## Explicit non-goals

Payment, official rating calculation, check-in, substitution, full court/time optimization and VIP quotas remain outside this increment. PHR entry/status/warning is included; full confirmation workflow is extended in Phase 4.
