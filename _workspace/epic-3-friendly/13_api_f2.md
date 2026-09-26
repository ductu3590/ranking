# Epic 3 F2: bàn giao API + migration 111 (api-dev)

Nhánh `epic-3-friendly`. Commit trung gian `d8aa1d5`, `11d3467`, `c135049`, `4d43c45`, `57f1d2a` + commit cuối
`feat(giao-huu): Epic 3 F2 API + migration 111 (chot giai giao huu, BXH CLB)`. Migration 111 **chưa apply**.
Nguồn: spec `lat-f2-chot-giai-va-xep-hang-clb.md` (§3.5, §5, §6, §7.2, §8, §10, "Bổ sung D49"), domain `12_engine_f2.md`, F1 `11_api_f1.md`.

## 1. File

| File | Loại | Việc |
|---|---|---|
| `database/migrations/111_finalize_v4_friendly.sql` | mới | `CREATE OR REPLACE finalize_internal_setup_v4` dựng từ **108** (109/110 không đụng hàm), thêm nhánh friendly |
| `lib/tournament/friendlyServer.js` | sửa | `loadFriendlyContext`, `loadFriendlyTournament`, `organizerModeMismatch`, `friendlySetupView`, `loadFriendlyClubStandings`, `publicFriendlyBlock`, `publishFriendlyTournament` (D50) |
| `lib/tournament/setupServer.js` | sửa | `setupView(db, groupId, draft, { friendly })` |
| `lib/tournament/publicSlug.js` | mới | `slugify` + `generateSlug` chép nguyên từ `tournaments/route.js` (thuật toán không đổi) |
| `app/api/tournament-v2/setup/finalize/route.js` | sửa | cặp hiệu lực + `entryClubs`, `p_plan` qua `finalizePlanPayload`, mã RPC 111, D50, `publicUrl` |
| `app/api/tournament-v2/preview-schedule/route.js` | sửa | cặp hiệu lực + `entryClubs`, luật bước theo `ctx.friendly` |
| `app/api/tournament-v2/setup/route.js` | sửa | GET: khối `friendly` + readiness theo cặp hiệu lực; POST `save_aggregate`: `ORGANIZER_MODE_LOCKED` + `ctx.friendly` |
| `app/api/tournament-v2/friendly/standings/route.js` | mới | BXH tổng CLB |
| `app/api/tournament-v2/public/route.js` | sửa | khối `friendly` (allowlist) khi giải friendly **đã chốt** |
| `app/api/tournament-v2/tournaments/route.js` | sửa nhỏ | import `generateSlug` từ `publicSlug.js` |
| `lib/tournamentV2Client.js` | sửa | `getFriendlyStandings({ tournamentId \| tournamentClubId })` |
| `scripts/qa/epic3-f2-integration.js` → `database/tests/epic3_f2_integration.sql` | mới | SQL tích hợp 1 transaction, ROLLBACK |
| `tests/stitch-setup/epic-3/f2-api-contract.test.js` | mới | khoá 111 ↔ 108 + route + SQL tích hợp (18 ca, viết đỏ trước) |
| `tests/stitch-setup/epic-3/f2-server.test.js`, `_fakeDb.js` | mới | lớp server với Supabase giả (8 ca) |
| `tests/stitch-setup/lat-0/api-contract.test.js` | sửa 1 dòng | `buildSetupView(…, division.setup_draft)` → cho phép thêm `, { friendly }` |
| `tests/tournament/api-tournaments.contract.test.js` | sửa 1 dòng | `randomBytes` giờ nằm ở `publicSlug.js` |

## 2. Endpoint

Lỗi luôn `{ error, code, step?, params? }`. `params` của lỗi RPC 111 = `DETAIL` JSON của `RAISE` (vd `{ clubs: [tên] }`, `{ max, used }`, `{ quota, count, club }`, `{ name, athleteId }`, `{ count }`).

| Method + path | Quyền | Thay đổi F2 |
|---|---|---|
| `GET /api/tournament-v2/setup?tournamentId=&divisionId=` | `requireValidatedGroupAdmin` | Giải friendly: `setup.readiness` tính trên cặp hiệu lực; thêm `friendly: { limit, window, clubs:[{tournamentClubId, name, status, statusLabel, pairCount, color}], approvedPairs:[{pairId, tournamentClubId, clubName, members:[{name}]}], hostClub:{name, color} }` (chỉ tên, không memberId / club_id / băm). Giải nội bộ: response không đổi |
| `POST /api/tournament-v2/setup` `save_aggregate` | như cũ | Giải đã tồn tại mà `draft.tournament.organizerMode ≠ settings.organizer_mode` → **409 `ORGANIZER_MODE_LOCKED`** (không gọi RPC). `readiness` tính với `ctx.friendly` |
| `POST /api/tournament-v2/preview-schedule` | như cũ | `loadFriendlyContext` → `setupContext(…, { friendly })` → `firstBlocker(…, 3)` → `buildSetupPlan({ pairIds: cặp hiệu lực, entryClubs })`. Bản nháp lệch chế độ → 409 `ORGANIZER_MODE_LOCKED`. Blocker F2 (`FRIENDLY_CLUB_NOT_READY`, `FRIENDLY_CLUBS_TOO_FEW`, …) → 409 |
| `POST /api/tournament-v2/setup/finalize` | như cũ | Như preview (bước 4) + `p_plan = finalizePlanPayload({ plan, pairs, friendly })` (hạn mức từ `friendlyEntitlements` trên server; body không có trường hạn mức). Mã 111 → **409**. Sau RPC + `prepare_tournament_after_finalize`: giải friendly đang `private` → `unlisted` + `public_slug` (lỗi chỉ log). Response thêm `friendly_clubs` (từ RPC) và `publicUrl` (chỉ giải friendly) |
| `GET /api/tournament-v2/friendly/standings?tournamentId=` | `requireTournamentAccess({ need: 'read' })` (admin + thành viên chủ nhà) | Giải không friendly → **404 `FRIENDLY_MODE_REQUIRED`** "Giải này không phải giải giao hữu liên CLB." |
| `GET /api/tournament-v2/friendly/standings?tournamentClubId=` | `requireParticipantClubAccess` (admin CLB khách, truy vấn lọc `club_id`) | Chỉ khi dòng `approved` **và** giải đã chốt; mọi trường hợp khác → 404 `TOURNAMENT_NOT_FOUND` |
| `GET /api/tournament-v2/public?slug=` | công khai | Giải `organizer_mode = friendly` **đã chốt**: thêm `friendly: { clubs:[{tournamentClubId, name, color, isHost}], entryClubs:{entryId: tournamentClubId}, clubStandings:{rows, headToHead} }` |

Response standings: `{ finalized, clubs:[{tournamentClubId, name, isHost, color}], entryClubs, rows:[{rank, tournamentClubId, name, color, isHost, played, won, lost, pointsFor, pointsAgainst, diff, pairCount}], headToHead:{left, right, wins:[w0,w1]} | null, counts:{interclubDone, internalDone} }`, `Cache-Control: no-store`.

Client: `getFriendlyStandings({ tournamentId })` (chủ nhà) / `getFriendlyStandings({ tournamentClubId })` (CLB khách).

**Quyết định supervisor (ghi lại):**
1. `FRIENDLY_MODE_REQUIRED`: route **đọc** mà người gọi không phải chủ nhà (BXH phía khách, trang công khai) → 404 không lộ giải (phía khách trả `TOURNAMENT_NOT_FOUND`; trang công khai chỉ không có khối `friendly`); route **ghi/chốt** của chủ nhà → 409 như bảng F1. BXH phía chủ nhà (đọc) → 404 `FRIENDLY_MODE_REQUIRED`.
2. `FRIENDLY_QUOTA_EXCEEDED`, `FRIENDLY_GUEST_NOT_ALLOWED`, `EXTERNAL_CLUB_NOT_SUPPORTED` trong luồng chốt → **409**; luồng lưu roster F1 giữ 400.
