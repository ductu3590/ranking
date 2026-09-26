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

## 3. Migration 111 — khác 108 ở đâu

Chữ ký, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, REVOKE/GRANT/COMMENT **y hệt 108**; một
`CREATE OR REPLACE`, không DROP/ALTER/TRUNCATE/DELETE. Mọi thay đổi nằm trong 4 khối `-- friendly:begin … -- friendly:end`
+ 7 dòng khai báo `-- friendly:decl` + 2 phép đảo; test khoá: xoá khối, bỏ dòng decl, `NOT IN ('internal', 'friendly')` →
`<> 'internal'`, `v_pairs` → `v_draft->'pairs'` ⇒ **bằng đúng từng byte** thân 108 (11 điểm của `FRIENDLY_FINALIZE_SQL_CONTRACT.differencesFrom108`).

1. `organizerMode ∈ {internal, friendly}`; friendly mà `settings.organizer_mode ≠ friendly` → `FINALIZE_DRAFT_INVALID`.
2. D49: friendly + `participants.guests` không rỗng → `FRIENDLY_HOST_GUEST_NOT_ALLOWED` (PH409, DETAIL `{count}`).
3. `p_plan->'friendly'->>'maxGuestClubs'` phải là **số JSON** nguyên 1–31 (chuỗi `"1"`, thiếu, 0, 32 → `FINALIZE_PLAN_INVALID`).
4. `PERFORM … FROM tournament_clubs … ORDER BY id FOR UPDATE` sau khoá division → tournament.
5. `FRIENDLY_CLUB_NOT_READY` (DETAIL `{clubs:[tên]}`), `EXTERNAL_CLUB_NOT_SUPPORTED`, `FRIENDLY_CLUB_LIMIT_REACHED` (DETAIL `{max, used}`).
6. `v_guest_pairs` từ `roster_submitted->'pairs'` (theo id, ordinal), khóa `'c'||id||'.'||roster_approved_version||'.'||pairId`; tập khóa khách của plan (regex `^c([0-9]+)\.([0-9]+)\.([A-Za-z0-9_-]{1,64})$`) ≠ → `FRIENDLY_ROSTER_CHANGED`.
7. Ref khách: `member:<id>` (`FRIENDLY_GUEST_NOT_ALLOWED`), ∈ `roster_submitted->'memberIds'` của chính dòng (`PAIRING_INVALID`), `club_members.group_id = club_id` đang hoạt động (`MEMBER_NOT_ACTIVE_IN_GROUP`), có `athletes` (`ATHLETE_IDENTITY_MISSING`), số cặp ≤ `quota` (`FRIENDLY_QUOTA_EXCEEDED`, DETAIL `{quota, count, club}`).
8. `FRIENDLY_ATHLETE_DUPLICATE` (DETAIL `{name, athleteId}`), `FRIENDLY_CLUBS_TOO_FEW`; thêm: khóa cặp trùng trong `v_pairs` → `PAIRING_INVALID`.
9. `v_pairs := v_draft->'pairs' || v_guest_pairs`; khối kiểm cặp 108 dùng `v_pairs` trừ mệnh đề "ref ∈ người tham gia bản nháp"; `v_participant_count += 2 × số cặp khách`.
10. Khối ghi sau "Cặp → entry": `tournament_athletes(group_id = 59, tournament_club_id = dòng khách, club_name_snapshot = groups.name, source club_member)` → roster members → `tournament_pairs` → `tournament_entries(tournament_club_id = dòng khách)` → pair/entry members (`club_name_snapshot`); `v_pair_entries[khóa khách]`.
11. `result.friendly_clubs` (chỉ friendly), trước khi lưu idempotency.

Sau chốt: division `locked` → mọi RPC 110 của CLB khách trả `FRIENDLY_REGISTRATION_CLOSED`; chốt đòi mọi dòng khách ở
approved/declined/withdrawn nên `friendly_sync_notifications` đã đóng thông báo — không cần code thêm (SQL tích hợp kiểm).

## 4. Supervisor chạy kiểm thử + apply

1. Số: `git ls-tree --name-only origin/main database/migrations/ | grep '^database/migrations/111_'` → rỗng (đã kiểm lúc làm).
2. Preflight (§7).
3. SQL tích hợp (111 **chưa** apply): nội dung `database/tests/epic3_f2_integration.sql` (779 dòng, ~98 KB; sinh lại:
   `node scripts/qa/epic3-f2-integration.js > database/tests/epic3_f2_integration.sql`) qua MCP `execute_sql`.
   **Kỳ vọng:** không lỗi; `it_result` **42 dòng**, dòng cuối `zz.ALL = ok`; `setup.guest_a = 19`; `g1.finalize.match_count = 12`,
   `g1b… = 13`, `core3… = 12`, `ko… = 6`, `internal14.match_count = 12`, `internal.round_robin = 6`, `internal.knockout = 4`,
   `internal.double_elimination = 6`; các ca âm ghi đúng mã (`limit.over = FRIENDLY_CLUB_LIMIT_REACHED`, `not_ready`,
   `roster_changed`, `inactive`, `athlete_duplicate`, `d49.host_guest`, `too_few`, `external`, `quota`, `guest_ref`, `max.*`…).
   Ca sai → `IT_FAIL <ca>: …` (không ghi gì). Dữ liệu tạm: thành viên `ZZF2 VĐV …` ở 59 và 19, group tạm `zzf2-b-…`, giải `ZZF2 IT …`.
4. Sau ROLLBACK: `node scripts/qa/epic3-f2-integration.js --post-check` → chạy câu in ra; mọi cột = 0.
5. Apply 111 (nội dung file).
6. `node scripts/qa/epic3-f2-integration.js --md5`:
   ```text
   finalize_internal_setup_v4  c1ab7d4d96db9353185fc15ec8377bde
   ```
   ```sql
   SELECT proname, md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'finalize_internal_setup_v4';
   SELECT proname, proacl::text, prosecdef, proconfig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'finalize_internal_setup_v4';
   ```
   Kỳ vọng quyền: `{postgres=X/postgres,service_role=X/postgres}`, `prosecdef = true`, `proconfig = {search_path=public}`.
7. Tuỳ chọn: `node scripts/qa/epic3-f2-integration.js --applied` → chạy lại (không nạp thân hàm), kỳ vọng như bước 3.

Đã chạy trước trên PGlite (Postgres WASM, schema giả lập: DDL cột dùng tới + `_v1` 108 + wrapper 100 + migration 110 + finalize 108):
42/42 ở chế độ đầy đủ và `--applied` (sau khi apply 111 hai lần — idempotent); post-check 0; sau ROLLBACK hàm vẫn là 108;
md5 trên PGlite = `c1ab7d4d…`; đối chứng âm: `--applied` khi hàm còn là 108 → `FINALIZE_DRAFT_INVALID`. Không thay cho production
(PGlite không có trigger 059/064, RLS thật, dữ liệu thật).

## 5. Test

```text
$ node tests/stitch-setup/run-all.js      → 46 file: 45 PASS, 1 RED
ok   f2 api contract — migration 111: 9/9
ok   f2 api contract — routes: 8/8
ok   f2 api contract — SQL tích hợp: 1/1
ok   f2 friendlyServer: 8/8
RED  exit=1  epic-1\ui-contract.test.js    (CRLF StepDraw.js, có từ trước)
```

Hồi quy xanh: `tests/phase3/*` (trừ `wizard-redesign-contract`), `tests/tournament/*`, `tests/unified-setup-v2/api/*`, `tests/phase1/*`,
`tests/unified-setup/{setup-route-actions,release-hardening,tiebreak-policy-end-to-end}`. Đỏ có từ trước, không do F2:
`phase3/wizard-redesign-contract` (đỏ ở `ecbaa16`), `phase2/validated-mutation-guard` (route `stages`),
`unified-setup/legacy-wizard-retired`, `unified-setup/console-empty-roster.repro` (UI console), `wizard-journey.browser` (cần browser).
`f2-api-contract` viết đỏ trước (0/18) rồi mới có 111/route; `f2-server` viết sau khi có helper (không đỏ trước).
Route ESM qua `node --check`; worktree không có `node_modules` nên chưa `next build`.

## 6. Lệch spec (đã chọn phương án an toàn hơn)

1. **Tên file tích hợp** theo yêu cầu supervisor: `scripts/qa/epic3-f2-integration.js` → `database/tests/epic3_f2_integration.sql`
   (spec §2/§10: `epic-3-f2-integration.js` → `epic_3_f2_friendly_finalize.sql`). Không nạp thân 110 (đã apply production).
2. **Plan trong SQL tích hợp** dựng bằng node với khóa khách giữ chỗ `c99900<i>.1.p<n>`, SQL thay bằng khóa thật sau khi duyệt;
   bỏ `clubSpread`/`inputSignature` khỏi plan nhúng cho gọn (111 không đọc; fingerprint giữ của plan đầy đủ).
3. **D50 nằm ở route**, không ở SQL: `UPDATE … SET visibility='unlisted', public_slug=COALESCE(slug, generateSlug(name)) WHERE
   id AND group_id AND visibility='private'`. SQL tích hợp chỉ chạy đúng câu UPDATE đó để kiểm ràng buộc (ca `d50.after`).
4. **BXH CLB cho CLB khách** (spec §7.2 chỉ nêu chủ nhà): thêm `?tournamentClubId=` qua `requireParticipantClubAccess`, chỉ khi dòng
   `approved` và giải đã chốt (trước chốt không lộ CLB khác, README §6).
5. **Khối `friendly` công khai chỉ khi đã chốt** (division `roster_lock_status ≠ open`): trước chốt danh sách CLB khách chưa công khai.
   Route công khai đọc chế độ bằng cột ảo PostgREST `organizer_mode:settings->>organizer_mode` (không chiếu ra ngoài — `buildPublicSnapshot`
   allowlist). **Chưa chạy trên PostgREST thật** → F3 kiểm bằng browser.
6. **`ORGANIZER_MODE_LOCKED` cả ở preview/finalize** (spec chỉ nêu route lưu): bản nháp lệch `settings.organizer_mode` → 409 trước khi dựng plan.
7. **111 chặt hơn contract**: `maxGuestClubs` phải là số JSON (chuỗi → `FINALIZE_PLAN_INVALID`); khóa cặp trùng trong `v_pairs` →
   `PAIRING_INVALID`; `participantRefs` khách không phải mảng → `PAIRING_INVALID`; `roster_submitted.pairs` không phải mảng → coi như rỗng
   (rồi `FRIENDLY_ROSTER_CHANGED`). Mã giao hữu dùng SQLSTATE `PH409`; params qua `DETAIL` JSON.
8. **`FRIENDLY_ATHLETE_DUPLICATE` chỉ xảy ra khi thành viên đổi CLB** (`athletes.legacy_club_member_id` unique ⇒ hai thành viên khác nhau
   luôn là hai athlete). SQL tích hợp dựng ca này bằng cách chuyển một thành viên 59 sang CLB A trong transaction.
9. **Tên VĐV khách** trong `tournament_athletes/entry_members` lấy `club_members.full_name` hiện tại của CLB khách (như chủ nhà 108),
   không lấy ảnh chụp `memberNames` của roster.
10. **Đóng thông báo / khoá roster sau chốt**: không thêm code — division `locked` chặn mọi RPC 110; chốt đòi mọi dòng khách ở
    approved/declined/withdrawn nên thông báo đã đóng (kiểm `g1.after.*`).
11. **D43**: không có đường ghi ranking nào đọc `tournament_*` (`ranking_snapshots` chỉ ở `save-snapshot`); không thêm code, test quét của
    `f2-standings` giữ nguyên.
12. **Sửa test cũ có chủ đích**: `lat-0/api-contract` (cho phép `, { friendly }`), `tournament/api-tournaments.contract` (`randomBytes` ở `publicSlug.js`).

## 7. Preflight cho supervisor (trước khi chạy SQL tích hợp)

```sql
-- 1. Hàm đang chạy là 108 (md5 thân 108 tính trên file LF)
SELECT md5(prosrc) = '73d5ad132226394e9bdac0c0d755dd9a' AS is_108, proacl::text, proconfig FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND proname = 'finalize_internal_setup_v4';
-- 2. Cột 110 + cột snapshot mà 111 ghi
SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND (
  (table_name = 'tournament_clubs' AND column_name IN ('roster_submitted', 'roster_approved_version', 'quota', 'external_club_id'))
  OR (table_name IN ('tournament_athletes', 'tournament_entry_members') AND column_name = 'club_name_snapshot')
  OR (table_name = 'tournaments' AND column_name IN ('visibility', 'public_slug', 'settings')));
-- 3. RPC F1 có mặt (SQL tích hợp dùng)
SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('friendly_invite_club', 'friendly_club_action', 'save_unified_setup_aggregate_draft', 'save_unified_setup_aggregate_draft_v1');
-- 4. Group 59 / 19 (D48) và CHECK visibility (D50)
SELECT id, name FROM public.groups WHERE id IN (19, 59);
SELECT conname FROM pg_constraint WHERE conname = 'tournaments_visibility_check';
-- 5. Giải friendly đang có (111 đổi hành vi chốt của chúng; kỳ vọng chỉ giải test)
SELECT t.id, t.group_id, t.name, d.roster_lock_status FROM public.tournaments t
JOIN public.tournament_divisions d ON d.tournament_id = t.id AND d.competition_template = 'unified_setup_draft_v2'
WHERE t.settings->>'organizer_mode' = 'friendly' ORDER BY t.id;
```

Kỳ vọng: (1) `is_108 = true`; (2) đủ 9 dòng; (3) đủ 4 hàm; (4) có 19 và 59, có constraint. Nếu (1) sai: có người đã sửa
hàm sau 108 → dừng, báo lại (111 dựng từ 108).

