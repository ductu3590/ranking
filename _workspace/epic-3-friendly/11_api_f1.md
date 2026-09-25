# Epic 3 F1 — bàn giao API + migration 110 (api-dev)

Nhánh `epic-3-friendly`, commit `a58261b` (code) + commit tài liệu này. Migration 110 **chưa apply** — supervisor chạy SQL tích
hợp (ROLLBACK) rồi apply. Nguồn: spec `lat-f1-loi-moi-va-dang-ky.md` §2, §5–§9; domain `10_engine_f1.md`.

## 1. File

| File | Loại |
|---|---|
| `database/migrations/110_friendly_club_rosters.sql` | mới — cột + CHECK + index + 4 hàm |
| `scripts/qa/epic3-f1-integration.js` → `database/tests/epic3_f1_integration.sql` | mới — SQL tích hợp 1 transaction, ROLLBACK |
| `lib/tournament/friendlyServer.js` | mới (CJS) — cột select, kiểm body, ánh xạ lỗi RPC → HTTP, chiếu dòng, sắp hộp lời mời, loader chỉ đọc |
| `lib/tournament/accessRuntime.js` | thêm `requireParticipantClubAccess`, `loadParticipantClubRow` |
| `app/api/tournament-v2/clubs/route.js` | viết lại (chủ nhà) |
| `app/api/tournament-v2/friendly/window/route.js` | mới |
| `app/api/tournament-v2/friendly/invitations/route.js` | mới |
| `app/api/tournament-v2/friendly/invitations/[id]/route.js` | mới |
| `app/api/tournament-v2/friendly/invite-links/resolve/route.js` | mới |
| `app/api/club/notifications/route.js` | thêm `display` + dọn thông báo mồ côi; khối `unassigned_transaction` giữ nguyên |
| `app/api/tournament-v2/tournaments/route.js` | vá (a): PATCH gộp `settings` qua `preserveServerOwnedSettings` |
| `app/api/tournament-v2/setup/route.js` | `replace_invited_clubs` → 410 `SETUP_ACTION_RETIRED` khi `setup_draft.draftVersion ≥ 3` |
| `components/pickhub/PhNotificationBell.js` | vá (b): rẽ nhánh theo `kind` |
| `lib/tournamentV2Client.js` | 9 hàm client (§2.4) |
| `tests/stitch-setup/epic-3/f1-{api-contract,server,tournaments-settings,bell}.test.js` | mới |
| `tests/phase3/wizard-competition-contract.test.js` | sửa 1 khẳng định cũ (route không còn `transitionTournamentClub`) |

## 2. Endpoint

Lỗi luôn `{ error, code, params? }` (`blockers` thêm khi route chặn trước RPC). HTTP theo `friendlyClubs.FRIENDLY_ERROR_STATUS`;
lỗi không mang mã → theo SQLSTATE (`P0002` 404, `PH409` 409, `22023` 400), còn lại 500 `FRIENDLY_MUTATION_FAILED`
/ `FRIENDLY_READ_FAILED` (không lộ câu SQL). `params` = `DETAIL` JSON của RPC + tham số route.

### 2.1 Chủ nhà

| Method + path | Quyền | Request | Response 200 | Lỗi |
|---|---|---|---|---|
| `GET /api/tournament-v2/clubs?mode=available[&q=]` | `requireValidatedGroupAdmin` | `q` ≤ 60 ký tự (ilike tên, đã escape) | `{ clubs: [{id, name}] }` (bỏ CLB phiên + `PICKHUB_SYSTEM_GROUP_ID`, `order(name).limit(200)`) | 400 `SETUP_PAYLOAD_INVALID` (q dài) |
| `GET …/clubs?mode=available&tournamentId=` | + `requireTournamentAccess(write)` | | `{ clubs: [{id, name, invitation: {id, status, statusLabel} \| null}], limit }` | 404/403 access |
| `GET …/clubs?tournamentId=` | `requireTournamentAccess(write)` | | `{ window: {open, reason, deadline, lockedAt}, limit: {max, used, remaining, reached, upgradeHint}, clubs: HostClubView[] }` | 400, 404/403 |
| `POST …/clubs` | `requireTournamentAccess(write)` | `{ tournament_id, club_id, quota?, invitation_note? }` | `{ club: HostClubView, invitePath: '/giai-dau/moi/<token>', limit }` (`Cache-Control: no-store`) | 400 `EXTERNAL_CLUB_NOT_SUPPORTED` (có `external_club_id/_name`), 400 `SETUP_PAYLOAD_INVALID`, 400 `FRIENDLY_QUOTA_INVALID`, 404 `CLUB_NOT_FOUND` (không tồn tại / CLB hệ thống), 409 `CLUB_IS_HOST`, 409 `CLUB_ALREADY_INVITED`, 409 `FRIENDLY_CLUB_LIMIT_REACHED` `params:{max, used}`, 409 `FRIENDLY_MODE_REQUIRED`, 409 `FRIENDLY_REGISTRATION_CLOSED`, 404 `TOURNAMENT_NOT_FOUND` |
| `PATCH …/clubs` | nạp dòng theo `id` → `requireTournamentAccess(write)` trên `row.tournament_id` + `row.group_id = access.groupId` | `{ id, action: approve\|request_changes\|remove\|set_quota\|rotate_link, expected_version, note?, quota? }` | `{ club }`; `rotate_link` thêm `invitePath` (no-store) | 400 `SETUP_PAYLOAD_INVALID`, 400 `FRIENDLY_NOTE_REQUIRED`, 400 `FRIENDLY_QUOTA_INVALID`, 404 `FRIENDLY_CLUB_NOT_FOUND`, 409 `FRIENDLY_CLUB_VERSION_CONFLICT`, 409 `FRIENDLY_TRANSITION_INVALID`, 409 `FRIENDLY_REGISTRATION_CLOSED`, 409 `FRIENDLY_QUOTA_BELOW_ROSTER` `params:{count, quota}`, 400 roster blockers khi `approve` kiểm lại (`FRIENDLY_MEMBER_OUTSIDE_CLUB`, `FRIENDLY_ATHLETE_ID_MISSING`, `FRIENDLY_QUOTA_EXCEEDED`) |
| `POST /api/tournament-v2/friendly/window` | `requireTournamentAccess(write)` | `{ tournament_id, deadline: ISO có Z/±HH:MM \| null, locked: boolean }` | `{ window }` | 400 `FRIENDLY_DEADLINE_INVALID`, 400 `SETUP_PAYLOAD_INVALID`, 409 `FRIENDLY_MODE_REQUIRED`, 409 `FRIENDLY_REGISTRATION_CLOSED` (đã chốt) |

`limit` luôn do `resolveFriendlyEntitlements` + `guestClubLimitView`; body không có trường hạn mức / băm / phía.

### 2.2 CLB khách

| Method + path | Quyền | Request | Response 200 | Lỗi |
|---|---|---|---|---|
| `GET /api/tournament-v2/friendly/invitations` | `requireValidatedGroupAdmin`; truy vấn `.eq('club_id', groupId).neq('group_id', groupId)` + giải `organizer_mode = friendly` | | `{ invitations: [{ id, tournament{name,eventDate,startTime,location,status}, hostClub{name,logoUrl:null}, status, statusLabel, quota, pairCount, window{deadline,open,reason}, finalized, publicUrl }] }` sắp: cần làm → đang mở → đã chốt → từ chối/rút | 401/403 phiên |
| `GET …/friendly/invitations/:id` | `requireParticipantClubAccess` (lọc `club_id` trong truy vấn) | | `{ invitation: GuestInvitationView (§6.2 + actions), members: [{memberId, name, active, hasAthlete}] }` | 404 `TOURNAMENT_NOT_FOUND` (mọi từ chối), 403 `GROUP_ADMIN_REQUIRED` (đúng CLB, không admin) |
| `POST …/friendly/invitations/:id` | như GET | `{ action: accept\|decline\|save_roster\|submit_roster\|unsubmit\|withdraw, expected_version, roster? }` | `{ invitation }` | 400 `SETUP_PAYLOAD_INVALID`, 400 blockers (`FRIENDLY_GUEST_NOT_ALLOWED`, `FRIENDLY_ROSTER_EMPTY`, `FRIENDLY_ROSTER_UNPAIRED` `{count}`, `FRIENDLY_QUOTA_EXCEEDED` `{quota,count}`, `FRIENDLY_MEMBER_OUTSIDE_CLUB` `{memberIds}`, `FRIENDLY_ATHLETE_ID_MISSING` `{name, memberId}`) + `blockers[]`, 404 `FRIENDLY_CLUB_NOT_FOUND`, 409 `FRIENDLY_CLUB_VERSION_CONFLICT` / `FRIENDLY_TRANSITION_INVALID` / `FRIENDLY_REGISTRATION_CLOSED` |

`save_roster`: `validateClubRosterForSave(body.roster)` → `normalizeClubRoster` → RPC. `submit_roster` gửi **bản đã lưu**
(`roster_draft`), route chạy `validateClubRosterForSubmit` với `loadMemberContext(db, clubGroupId, ids)` trước RPC; `roster`
trong body bị bỏ qua cho `submit_roster` (UI lưu trước rồi gửi).

### 2.3 Link mời

`POST /api/tournament-v2/friendly/invite-links/resolve` `{ token }` — rate limit `invite-link:<ip>` 30/10 phút (429
`RATE_LIMITED` + `Retry-After`); phiên = `getValidatedGroupSessionFromCookies()`; token sai định dạng → không truy vấn; dòng
chỉ chọn `id, club_id, group_id, tournament_id, invitation_status`; giải + division chỉ nạp sau khi qua bước so CLB + admin.

| HTTP | Body |
|---|---|
| 200 | `{ invitationId }` |
| 401 | `{ error, code: 'UNAUTHENTICATED', loginUrl: '/?dang-nhap=clb&next=%2Fgiai-dau%2Fmoi%2F<token>' }` |
| 404 | `{ error, code: 'FRIENDLY_INVITE_LINK_INVALID' }` (không khớp / withdrawn / giải không còn friendly) |
| 403 | `{ error, code: 'FRIENDLY_INVITE_WRONG_CLUB', currentClubName }` hoặc `{ error, code: 'GROUP_ADMIN_REQUIRED' }` |
| 410 | `{ error, code: 'FRIENDLY_INVITE_LINK_EXPIRED', invitationId }` |

### 2.4 Thông báo + client

- `GET /api/club/notifications`: như cũ + mỗi dòng có `display` (`projectClubNotification`; `null` với kind khác). Dòng
  `tournament_invitation`/`tournament_roster_review` mà dòng `tournament_clubs` không còn, không thuộc CLB phiên, hoặc trạng
  thái không còn đòi mở → `resolved` và bỏ khỏi kết quả. `openCount` tính sau lọc. PATCH không đổi.
- `lib/tournamentV2Client.js`: `listAvailableTournamentClubs({ tournamentId, q })` → `{ clubs, limit }` (gọi kiểu cũ
  `listAvailableTournamentClubs(id)` → `clubs[]`), `listFriendlyClubs(tournamentId)`, `inviteFriendlyClub({ tournamentId, clubId,
  quota, invitationNote })`, `hostClubAction({ id, action, expectedVersion, note, quota })`, `setFriendlyWindow({ tournamentId,
  deadline, locked })`, `listFriendlyInvitations()`, `getFriendlyInvitation(id)`, `guestInvitationAction(id, { action,
  expectedVersion, roster })`, `resolveInviteLink(token)`. Lỗi: `error.code`, `error.status`, `error.details` (body server).

## 3. RPC (migration 110)

Cả ba RPC công khai: `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon,
authenticated`, `GRANT EXECUTE … TO service_role`. Trả `(to_jsonb(row) - 'invite_token_hash') || {has_invite_link}`. Khoá:
division v3 `FOR SHARE` → tournaments → tournament_clubs `FOR UPDATE` → club_notifications.

```sql
friendly_invite_club(p_group_id bigint, p_tournament_id bigint, p_club_id bigint, p_quota integer, p_note text,
                     p_max_guest_clubs integer, p_invite_token_hash text) RETURNS jsonb      -- tournaments FOR UPDATE
friendly_club_action(p_actor_group_id bigint, p_side text, p_tournament_club_id bigint, p_action text,
                     p_expected_version bigint, p_payload jsonb) RETURNS jsonb              -- tournaments FOR SHARE
set_friendly_registration_window(p_group_id bigint, p_tournament_id bigint, p_deadline timestamptz,
                                 p_locked boolean) RETURNS jsonb                            -- tournaments FOR UPDATE
friendly_sync_notifications(p_tournament_club_id bigint) RETURNS void   -- nội bộ: không SECURITY DEFINER, REVOKE cả service_role, không GRANT
```

Khối `-- friendly:transitions` (30 dòng) và `-- friendly:notifications` (7 dòng) bằng đúng output
`renderFriendlyTransitionsSql()` / `renderFriendlyNotificationsSql()` (test khoá, bỏ `\r`).

## 4. Supervisor chạy kiểm thử + apply

1. Kiểm số: `git ls-tree --name-only origin/main database/migrations/ | grep '^database/migrations/110_'` → rỗng.
2. Preflight (§7) → ghi evidence.
3. SQL tích hợp (110 **chưa** apply): nội dung `database/tests/epic3_f1_integration.sql` (sinh lại bằng
   `node scripts/qa/epic3-f1-integration.js > database/tests/epic3_f1_integration.sql`) qua Supabase MCP `execute_sql`.
   **Kỳ vọng:** không lỗi; bảng `it_result` 94 dòng, dòng cuối `zz.ALL = ok`. Ca sai → lỗi `IT_FAIL <ca>: …` (transaction
   hỏng, không ghi gì). Host = group 59 (giải tạm), khách = 2 group tạm `zze3a-…`/`zze3b-…` + 1 ca mời group 19 thật (chỉ
   trong transaction; tự bỏ qua nếu không có group 19).
4. Sau ROLLBACK: `node scripts/qa/epic3-f1-integration.js --post-check` → chạy câu in ra; kỳ vọng mọi cột = 0.
5. Apply 110 (nội dung file, như 107/108).
6. So thân hàm: `node scripts/qa/epic3-f1-integration.js --md5` in md5 kỳ vọng + câu SQL:

   ```text
   friendly_sync_notifications       5ace3341a9cb3e982df3405b4c37371c
   friendly_invite_club              fcfbee57ffa00cb1b25285aee162c1b7
   friendly_club_action              4bc5639bb5799b86f530b7acc6ae423b
   set_friendly_registration_window  5fb2405536d092353325d225298ac06f
   ```
   ```sql
   SELECT proname, md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('friendly_sync_notifications', 'friendly_invite_club', 'friendly_club_action', 'set_friendly_registration_window')
     ORDER BY proname;
   ```
   (md5 tính trên file LF; đã đối chiếu khớp với `md5(prosrc)` trên Postgres cục bộ.)
7. Tuỳ chọn sau apply: `node scripts/qa/epic3-f1-integration.js --applied` → chạy lại (không nạp thân hàm), kỳ vọng như bước 3.
8. Quyền sau apply: `SELECT proname, proacl FROM pg_proc WHERE proname IN (…4 tên…)` → 3 RPC `{postgres=X/postgres,service_role=X/postgres}`,
   `friendly_sync_notifications` chỉ `{postgres=X/postgres}`.

Đã chạy trước bằng PGlite (Postgres WASM) trên schema giả lập các bảng liên quan (DDL 030/035/043/060/061 + `_v1` của 108,
2 dòng `tournament_clubs` cũ): migration apply 2 lần (idempotent), dòng cũ nhận `roster_draft = {}`; SQL tích hợp 94/94 ca
ở cả hai chế độ; post-check 0; đối chứng âm (đảo một kỳ vọng) → `IT_FAIL`. Đây **không** thay cho chạy trên production.

## 5. Test

```text
$ node tests/stitch-setup/run-all.js     # 40 file: 39 PASS, 1 RED
ok   f1 api contract — migration 110: 11/11
ok   f1 api contract — routes: 11/11
ok   f1 api contract — SQL tích hợp: 2/2
ok   f1 chuông thông báo rẽ nhánh theo kind: 3/3
ok   f1 friendlyServer: 9/9
ok   f1 PATCH /tournaments giữ settings do server quản lý: 2/2
(+ 7 file domain của engine-dev: 99/99)
RED  exit=1  epic-1\ui-contract.test.js   ← có sẵn (CRLF StepDraw.js), không liên quan F1
```

Epic-3: 11 file, 137 ca xanh (4 file / 38 ca mới của api-dev, viết đỏ trước). Hồi quy: `tests/phase3/interclub-{migration,domain,
competition,public,ui}`, `wizard-competition-contract`, `tests/tournament/api-tournaments.contract`, `tests/phase1/{auth-boundary,
rls-hardening,migration-ledger}`, `tests/debug-routes-guard` xanh. Có sẵn từ trước, không do F1: `tests/phase2/validated-mutation-guard`
(route `stages`), `tests/club-notifications.test.js` (CSS `z-index` của chuông). Route ESM qua `node --check`; chuông parse bằng SWC.
Worktree không có `node_modules` nên chưa chạy `next build`.

## 6. Lệch spec (đã chọn phương án an toàn hơn)

1. **Tên file tích hợp** theo yêu cầu supervisor: `scripts/qa/epic3-f1-integration.js` → `database/tests/epic3_f1_integration.sql`
   (spec §2/§9: `epic-3-f1-integration.js` → `epic_3_f1_friendly_clubs.sql`).
2. **Chạm `PhNotificationBell.js` ở F1** (spec §2 để F3) theo yêu cầu supervisor — tối thiểu, dùng lại class có sẵn; F3 vẫn làm
   giao diện Stitch.
3. **`friendly_sync_notifications` REVOKE cả `service_role`**: Supabase tự GRANT EXECUTE cho `service_role` qua default
   privileges, nên "không GRANT" chưa đủ để chặn.
4. **Chỉ đồng bộ thông báo khi trạng thái đổi** trong `friendly_club_action` (spec: sau mỗi lần ghi). Nếu không, `set_quota`,
   `rotate_link`, `save_roster` sẽ mở lại thông báo người dùng đã "Bỏ qua". Mời / mời lại luôn đồng bộ.
5. **RPC trả thêm `has_invite_link`** (không kèm băm) để route dựng `hasInviteLink` mà không đọc lại dòng.
6. **Mời lại xoá thêm `roster_submitted_at`, `roster_reviewed_at`** (đi cùng `roster_submitted`/duyệt đã xoá).
7. **Giải không phải friendly trong `friendly_club_action`**: phía khách → `FRIENDLY_CLUB_NOT_FOUND` (không lộ giải), phía chủ nhà
   → `FRIENDLY_MODE_REQUIRED`. Không có đúng một division v3: mời → `FRIENDLY_MODE_REQUIRED`; hành động/cửa sổ →
   `FRIENDLY_REGISTRATION_CLOSED`. Giải không thuộc `p_group_id` → `TOURNAMENT_NOT_FOUND` (P0002).
8. **`save_roster` ở RPC kiểm thêm**: `unpairedRefs` phải đúng tập người đã chọn chưa ghép (route luôn gửi output
   `normalizeClubRoster`), `memberId` ≤ 18 chữ số (vừa `bigint`), `locked` phải boolean.
9. **`submit_roster` gửi bản đã lưu**; `roster` trong body bị bỏ qua cho hành động này.
10. **`params` lỗi đi qua `DETAIL` JSON** của `RAISE` (spec không nói cách truyền).
11. **`requireParticipantClubAccess` lấy phiên bằng `getValidatedGroupSessionFromCookies()`** thay `resolveActorFromCookies()`:
    phiên platform không che phiên CLB, vé VĐV không tính (khớp route resolve link). Không phiên → 404 (theo `access.js`).
12. **`GET ?mode=available` không có `tournamentId`** trả `{ clubs }` (không `limit`) — hạn mức là theo giải.
13. **CLB hệ thống** chỉ lọc khi có `PICKHUB_SYSTEM_GROUP_ID`; không chép heuristic tìm theo tên của route `tournaments`.
14. **PATCH `/tournaments`**: đọc-gộp-ghi không nguyên tử với `set_friendly_registration_window` chạy cùng lúc (khoảng hở rất nhỏ;
    ghi đè toàn cột như trước là lỗi lớn hơn đã vá). Muốn tuyệt đối cần RPC riêng cho PATCH settings.
15. **SQL tích hợp**: host 59 + 2 group tạm theo spec §9, thêm ca mời group 19 thật trong transaction (yêu cầu supervisor).
16. **`tests/phase3/wizard-competition-contract.test.js`**: khẳng định cũ "clubs route dùng `transitionTournamentClub`" đổi thành
    `EXTERNAL_CLUB_NOT_SUPPORTED` + `friendly_club_action` (hành vi cũ bị thay có chủ đích, D39).

## 7. Câu hỏi preflight cho supervisor chạy

```sql
-- 1. RLS: không có policy cho anon/authenticated (README §7.2)
SELECT tablename, policyname, roles FROM pg_policies WHERE tablename IN ('tournament_clubs', 'club_notifications');
-- 2. Chủ bảng = chủ hàm (postgres), không FORCE RLS
SELECT relname, relowner::regrole, relrowsecurity, relforcerowsecurity FROM pg_class
WHERE relname IN ('tournament_clubs', 'club_notifications', 'tournaments', 'tournament_divisions', 'club_members', 'athletes', 'groups');
-- 3. Tên hàm / constraint / index mới chưa bị dùng (kỳ vọng 0 dòng)
SELECT proname FROM pg_proc WHERE proname IN ('friendly_sync_notifications', 'friendly_invite_club', 'friendly_club_action', 'set_friendly_registration_window');
SELECT conname FROM pg_constraint WHERE conname IN ('tournament_clubs_roster_draft_object_ck', 'tournament_clubs_roster_submitted_object_ck',
  'tournament_clubs_review_note_length_ck', 'tournament_clubs_invite_token_hash_ck');
SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_tournament_clubs_club_tournament', 'idx_tournament_clubs_invite_token');
-- 4. Kiểu cột mà hàm dùng
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND ((table_name = 'club_members' AND column_name IN ('is_active', 'full_name', 'group_id'))
  OR (table_name = 'tournaments' AND column_name IN ('event_date', 'updated_at', 'settings'))
  OR (table_name = 'athletes' AND column_name = 'legacy_club_member_id'));
-- 5. Dữ liệu cũ: quota > 32 (RPC set_quota không nhận > 32; không chặn apply)
SELECT count(*) FROM public.tournament_clubs WHERE quota > 32;
-- 6. Group 59 / 19 và _v1 (108) có mặt
SELECT id, name FROM public.groups WHERE id IN (19, 59);
SELECT proname FROM pg_proc WHERE proname = 'save_unified_setup_aggregate_draft_v1';
```

Ngoài DB: `PICKHUB_SYSTEM_GROUP_ID` đã đặt trên Vercel chưa (nếu chưa, CLB hệ thống hiện trong danh sách mời).
