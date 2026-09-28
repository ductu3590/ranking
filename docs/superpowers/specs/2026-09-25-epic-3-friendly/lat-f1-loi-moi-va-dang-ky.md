# Lát F1 — Lời mời CLB, hạn mức, link/thông báo và đăng ký cặp của CLB khách

Trạng thái: spec · Phụ thuộc: `origin/main` có Epic 1 + 2 (finalize 108, 109) · Xem [README](README.md)
Không có UI (D44): lát này giao domain + API + migration 110, kiểm bằng node test + kiểm thử tích hợp SQL ROLLBACK.
Ngoại lệ duy nhất chạm file giao diện: gỡ import hỏng nếu có (§2) — không đổi hành vi hiển thị.

Thay đổi so với bản nháp trước: bỏ tra CLB theo mã (`clubs/lookup`) → giữ danh sách mọi CLB (D46); thêm
`friendlyEntitlements.js` + tham số hạn mức ở RPC mời; `reinvite` gộp vào RPC mời; thêm token link mời, `rotate_link`,
route giải link, đồng bộ `club_notifications` (D47); vá `PATCH /tournaments` giữ khóa `settings` do server quản lý.

## 1. Mục tiêu

Chủ nhà chọn CLB từ **danh sách mọi CLB PickHub**, mời (tối đa theo hạn mức gói — mặc định **1 CLB khách mỗi giải**),
đặt hạn mức số cặp, hạn chót, khoá đăng ký; nhận **link mời** để gửi ngoài hệ thống. Admin CLB khách thấy lời mời qua
**thông báo trong app** hoặc mở link (bắt buộc đăng nhập đúng CLB), nhận lời/từ chối, **tự** chọn thành viên, ghép cặp,
lưu nháp, gửi; chủ nhà (cũng được báo qua chuông) duyệt hoặc yêu cầu sửa. Mọi ghi đi qua RPC có khoá lạc quan `version`,
kiểm cửa sổ đăng ký và hạn mức phía server.

## 2. File (ownership của lát)

| File | Việc |
|---|---|
| `lib/tournament/friendlyClubs.js` (mới, thuần CommonJS) | Máy trạng thái, cửa sổ đăng ký, kiểm roster khi gửi, chiếu dữ liệu cho chủ nhà/khách, nhãn trạng thái, khóa cặp hiệu lực |
| `lib/tournament/friendlyEntitlements.js` (mới, thuần) | Điểm quyết định quyền lợi D46 (§3.2) |
| `lib/tournament/friendlyInviteLink.js` (mới, thuần; dùng `node:crypto`) | Phát/băm token, quyết định giải link, kiểm tham số `next` (§3.3) |
| `lib/tournament/friendlyNotifications.js` (mới, thuần) | Trạng thái thông báo mong muốn theo `invitation_status`, chiếu hiển thị cho chuông (§3.4) |
| `lib/tournament/setupDraftV3.js` (sửa, thêm export) | `normalizeClubRoster(raw)` — normalizer duy nhất cho `roster_draft`; không đổi `normalizeDraft` ở lát này |
| `lib/tournament/access.js` (sửa, thêm export) | `resolveParticipantClubAccess` |
| `lib/tournament/accessRuntime.js` (sửa, thêm export) | `requireParticipantClubAccess`, `loadParticipantClubRow` |
| `lib/tournament/setupMessages.js` (sửa) | Văn bản tiếng Việt cho mã lỗi mới (§7) |
| `app/api/tournament-v2/clubs/route.js` (sửa) | GET (`mode=available` giữ, thêm hạn mức; GET theo giải cho chủ nhà), POST (mời / mời lại), PATCH (hành động của chủ nhà) |
| `app/api/tournament-v2/friendly/invitations/route.js` (mới) | Hộp lời mời của CLB khách |
| `app/api/tournament-v2/friendly/invitations/[id]/route.js` (mới) | Chi tiết + hành động của CLB khách |
| `app/api/tournament-v2/friendly/invite-links/resolve/route.js` (mới) | Giải link mời (§6.3) |
| `app/api/tournament-v2/friendly/window/route.js` (mới) | Hạn chót / khoá đăng ký |
| `app/api/club/notifications/route.js` (sửa) | Thêm `display` cho `kind` giải đấu + dọn thông báo mồ côi; nhánh `unassigned_transaction` **không đổi** |
| `app/api/tournament-v2/tournaments/route.js` (sửa nhỏ) | PATCH giữ `settings.organizer_mode` và `settings.friendly` (README §7.6) |
| `app/api/tournament-v2/setup/route.js` (sửa nhỏ) | Action `replace_invited_clubs` (RPC 090) trả 410 `SETUP_ACTION_RETIRED` khi division có bản nháp v3 |
| `lib/tournamentV2Client.js` (sửa — shared entry, integrator) | `listAvailableTournamentClubs({ tournamentId, q })` (đổi chữ ký, giữ tên), `listFriendlyClubs`, `inviteFriendlyClub`, `hostClubAction`, `setFriendlyWindow`, `listFriendlyInvitations`, `getFriendlyInvitation`, `guestInvitationAction`, `resolveInviteLink` |
| `database/migrations/110_friendly_club_rosters.sql` (mới) | §5 |
| `tests/stitch-setup/epic-3/f1-*.test.js` (mới) | §8 |
| `scripts/qa/epic-3-f1-integration.js` → `database/tests/epic_3_f1_friendly_clubs.sql` (mới) | §9 |

Không sửa: `draw.js` (FROZEN), `setupContract.js`, `engines/roundRobin.js`, `wizardModel.js`, hàm finalize (F2),
`CLUB_TRANSITIONS` / `transitionTournamentClub` cũ trong `interclub.js`, `PhNotificationBell.js` (F3). Caller cũ của
`listAvailableTournamentClubs` là `app/giai-dau/v2/setup/steps/InfoParticipantsStep.js` (thư mục `setup/` **không còn
mount**, luồng thật là `setup-v3/`): chữ ký mới nhận thêm object nhưng vẫn chấp nhận gọi bằng `tournamentId` thuần → không
phải sửa file đó.

**Thứ tự làm trong lát:** domain (§3) + test đỏ → migration 110 + SQL tích hợp (ROLLBACK) → route (§6) → test contract.

## 3. Domain

### 3.1 `lib/tournament/friendlyClubs.js`

```js
FRIENDLY_STATUSES   // ['invited','accepted','declined','roster_submitted','changes_requested','approved','withdrawn']
FRIENDLY_TRANSITIONS // [{ from:[…], action, side:'host'|'guest', to|null(giữ nguyên), needsOpenWindow, rpc:'invite'|'action' }]
                     // đúng bảng README §4
transitionFriendlyClub({ status, action, side }) → { to, needsOpenWindow, rpc } | throw FRIENDLY_TRANSITION_INVALID
registrationWindow({ settings, rosterLockStatus, now }) → { open, reason: null|'FINALIZED'|'LOCKED'|'DEADLINE_PASSED', deadline, lockedAt }
validateClubRosterForSubmit(roster, { quota, members /* Map memberId → {active, hasAthlete, name} */ })
  → { ok, blockers:[{code, params}] }   // FRIENDLY_ROSTER_EMPTY, FRIENDLY_ROSTER_UNPAIRED, FRIENDLY_QUOTA_EXCEEDED,
                                        // FRIENDLY_GUEST_NOT_ALLOWED, FRIENDLY_MEMBER_OUTSIDE_CLUB, FRIENDLY_ATHLETE_ID_MISSING
projectClubForHost(row, { clubName, logoUrl }) → HostClubView     // KHÔNG có roster_draft, invite_token_hash
projectInvitationForGuest({ row, tournament, hostClub, window, formatLabel, publicUrl }) → GuestInvitationView
statusLabel(status, side) → 'Chờ phản hồi' | 'Đang đăng ký' | 'Chờ duyệt' | 'Cần sửa' | 'Đã duyệt' | 'Từ chối' | 'Đã rút' / 'Đã huỷ mời'
friendlyPairKey(tournamentClubId, approvedVersion, pairId) → 'c<id>.<ver>.<pairId>'   // dùng ở F2, định nghĩa ở đây
parseFriendlyPairKey(key) → { tournamentClubId, approvedVersion, pairId } | null      // ^c([0-9]+)\.([0-9]+)\.([A-Za-z0-9_-]{1,64})$
```

Hạn mức cặp D38 đếm **số cặp** (`roster.pairs.length`). Lưu nháp được vượt hạn mức và lẻ người (giống Bước 3 của chủ
nhà: nháp lẻ người lưu được); **gửi** thì không.

### 3.2 `lib/tournament/friendlyEntitlements.js` (D46)

```js
const PLAN_GUEST_CLUB_LIMITS = Object.freeze({ free: 1 });  // gói trả phí: thêm khóa, vd { club_plus: 5 } — làm khi có gói
const DEFAULT_PLAN = 'free';
const CORE_MAX_GUEST_CLUBS = 31;   // trần kỹ thuật (giải ≤ 32 cặp, mỗi CLB ≥ 1 cặp); SQL kiểm cùng trần

function resolveClubPlan({ groupId }) { return DEFAULT_PLAN; }
// Điểm cắm DUY NHẤT của gói. Khi có nơi lưu gói: đổi thành async resolveClubPlan({ db, groupId }) — mọi caller đã đi
// qua resolveFriendlyEntitlements (async) nên không phải sửa route.

function maxGuestClubsPerTournament({ plan = DEFAULT_PLAN } = {}) // → PLAN_GUEST_CLUB_LIMITS[plan] ?? PLAN_GUEST_CLUB_LIMITS.free
                                                                  //   kẹp vào 1..CORE_MAX_GUEST_CLUBS; gói lạ → 1 (fail closed)
async function resolveFriendlyEntitlements({ db, groupId })        // → { plan, maxGuestClubs, upgradeAvailable: false }
function countsTowardGuestLimit(status)                             // status ∉ {'declined','withdrawn'}
function guestClubLimitView({ maxGuestClubs, rows })                // rows = dòng CLB khách (không tính chủ nhà)
// → { max, used, remaining, reached, upgradeHint: reached ? 'Mời nhiều CLB hơn là quyền lợi của gói trả phí (sắp ra mắt).' : null }
```

Route **không bao giờ** tự viết số `1`; mọi chỗ cần hạn mức gọi `resolveFriendlyEntitlements`. Test node truyền
`maxGuestClubs` lớn hơn trực tiếp vào hàm thuần / RPC để phủ ca ≥ 3 CLB (README §9 G-core3) — không có biến môi trường
hay cờ runtime nào nâng hạn mức.

### 3.3 `lib/tournament/friendlyInviteLink.js` (D47)

```js
issueInviteToken() → { rawToken /* base64url 43 ký tự từ 32 byte ngẫu nhiên */, tokenHash /* sha256 hex */ }
hashInviteToken(rawToken) → sha256 hex
isInviteTokenShape(raw) → /^[A-Za-z0-9_-]{43}$/
invitePath(rawToken) → '/giai-dau/moi/' + rawToken
decideInviteLink({ session, row, tournament, rosterLockStatus, now })
  → { status: 401|404|403|410|200, code, invitationId?, currentClubName? }   // đúng thứ tự bảng README §5.3
safeNextPath(value) → value nếu khớp ^/giai-dau/(moi|loi-moi)(/[A-Za-z0-9_-]+)?$ , ngược lại null   // dùng ở F3 (trang đăng nhập)
```

`decideInviteLink` là hàm thuần; route chỉ nạp dữ liệu. Nhánh 403 `FRIENDLY_INVITE_WRONG_CLUB` chỉ được mang
`currentClubName = session.group_name`; test khóa danh sách khóa trả về.

### 3.4 `lib/tournament/friendlyNotifications.js` (D47)

```js
FRIENDLY_NOTIFICATION_KINDS = { guest: 'tournament_invitation', host: 'tournament_roster_review' }
desiredNotificationState(status) → { guest: 'open'|'resolved', guestReason: 'invited'|'changes_requested'|null,
                                     host: 'open'|'resolved' }
// guest open ⇔ status ∈ {invited, changes_requested}; host open ⇔ status = roster_submitted. Chép vào khối
// `-- friendly:notifications` của friendly_sync_notifications (110); test khóa hai bên bằng nhau.
projectClubNotification(row) → row + display: { title, body, href, actionLabel }
// tournament_invitation/invited:           "{hostClubName} mời CLB bạn dự giải" · "{tournamentName} · {ngày}" · /giai-dau/loi-moi/{subject_id} · "Xem lời mời"
// tournament_invitation/changes_requested: "Chủ nhà yêu cầu sửa danh sách cặp" · "{tournamentName}" · như trên · "Sửa danh sách"
// tournament_roster_review:                "{guestClubName} gửi {pairCount} cặp" · "{tournamentName} · cần duyệt" ·
//                                          /giai-dau/v2?create=internal&tournamentId={tournamentId}&divisionId={divisionId}&step=2 · "Duyệt"
// kind khác (unassigned_transaction…): trả nguyên row, display = null (chuông giữ cách hiển thị cũ)
```

### 3.5 `normalizeClubRoster(raw)` (trong `setupDraftV3.js`)

Trả `{ memberIds, pairs:[{pairId, participantRefs, locked}], unpairedRefs }`; `memberIds` qua cùng `MEMBER_ID_RE`; tập
người được chọn **chỉ gồm `member:<id>`** → ref `guest:` không bao giờ vào roster khách (cặp chứa ref đó bị tách bởi
`reconcilePairs`, D38). Bỏ một người chỉ tách cặp của người đó (bất biến §3.3 của skill).

## 4. Quyền — "CLB tham dự"

`access.js`:

```js
resolveParticipantClubAccess({ tournament, tournamentClub, actor })
// allow khi: actor.kind==='group' && actor.role==='admin'
//            && String(tournamentClub.club_id) === String(actor.groupId)
//            && String(tournament.group_id) !== String(actor.groupId)       // chủ nhà đi đường requireTournamentAccess
//            && tournament.settings?.organizer_mode === 'friendly'
// → { allowed:true, actorKind:'participant_club', groupId: tournament.group_id, clubGroupId: actor.groupId,
//     tournamentClubId: tournamentClub.id, canReadPrivate:false }
// sai role → 403 GROUP_ADMIN_REQUIRED; mọi trường hợp còn lại → 404 TOURNAMENT_NOT_FOUND (không lộ tồn tại)
```

`accessRuntime.js`: `requireParticipantClubAccess({ tournamentClubId })` — lấy phiên bằng `resolveActorFromCookies()`;
**truy vấn** `tournament_clubs … .eq('id', id).eq('club_id', actor.groupId)` (lọc ở câu truy vấn, không đọc rồi mới so);
nạp giải với `TOURNAMENT_ACCESS_FIELDS` + `settings, name, event_date, location, description, public_slug, status`; gọi
hàm thuần. Không dùng cho chủ nhà.

## 5. Migration 110 — `110_friendly_club_rosters.sql`

Additive, một transaction. Kiểm số trên `origin/main` ngay trước khi apply. Không `DROP TABLE/COLUMN/FUNCTION`,
`TRUNCATE`, `DELETE FROM`.

1. **Cột** `tournament_clubs` (README §3.1) bằng `ADD COLUMN IF NOT EXISTS`; `CHECK (jsonb_typeof(roster_draft) = 'object')`,
   `CHECK (roster_submitted IS NULL OR jsonb_typeof(roster_submitted) = 'object')`,
   `CHECK (review_note IS NULL OR length(btrim(review_note)) BETWEEN 2 AND 300)`,
   `CHECK (invite_token_hash IS NULL OR invite_token_hash ~ '^[a-f0-9]{64}$')`. `COMMENT ON COLUMN` tiếng Việt.
2. **Index** `idx_tournament_clubs_club_tournament ON tournament_clubs(club_id, tournament_id) WHERE club_id IS NOT NULL`
   (hộp lời mời truy vấn theo `club_id`); `UNIQUE INDEX idx_tournament_clubs_invite_token ON tournament_clubs(invite_token_hash)
   WHERE invite_token_hash IS NOT NULL`.
3. **RPC** (ba hàm công khai cho server: `SECURITY DEFINER SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon,
   authenticated`, `GRANT EXECUTE … TO service_role`; lỗi nghiệp vụ `RAISE EXCEPTION '<MÃ>'`, xung đột `ERRCODE = 'PH409'`,
   không tìm thấy `P0002`, dữ liệu sai `22023`). Trả `jsonb` của dòng **không kèm** `invite_token_hash`.

| RPC | Tham số | Việc |
|---|---|---|
| `friendly_invite_club` | `p_group_id bigint, p_tournament_id bigint, p_club_id bigint, p_quota integer, p_note text, p_max_guest_clubs integer, p_invite_token_hash text` | Kiểm tham số: `p_max_guest_clubs` 1–31, `p_invite_token_hash ~ '^[a-f0-9]{64}$'`, quota NULL hoặc 1–32 (`FRIENDLY_QUOTA_INVALID`), note ≤ 500 ký tự → sai: `SETUP_PAYLOAD_INVALID`. Khoá division v3 `FOR SHARE` → giải **`FOR UPDATE`** (tuần tự hoá các lần mời cùng giải). Giải thuộc `p_group_id`, `settings.organizer_mode = 'friendly'` (`FRIENDLY_MODE_REQUIRED`), đúng một division `competition_template = 'unified_setup_draft_v2'`, `roster_lock_status = 'open'` (`FRIENDLY_REGISTRATION_CLOSED`), `p_club_id` tồn tại (`CLUB_NOT_FOUND`, P0002) và `≠ p_group_id` (`CLUB_IS_HOST`). Dòng cũ (`tournament_id, club_id`) `FOR UPDATE`: có và ∉ {`declined`,`withdrawn`} → `CLUB_ALREADY_INVITED` (PH409). **Hạn mức:** đếm dòng CLB khác chủ nhà (`club_id IS DISTINCT FROM p_group_id`, gồm cả dòng CLB ngoài cũ) của giải có trạng thái ∉ {`declined`,`withdrawn`}, trừ chính dòng đang mời lại; `≥ p_max_guest_clubs` → `FRIENDLY_CLUB_LIMIT_REACHED` (PH409). Ghi: chưa có → `INSERT` (`invited`); có → `UPDATE` sang `invited`, `version + 1`, giữ `roster_draft`, xoá `roster_submitted`, `review_note`, `roster_approved_version`, `responded_at`. Cả hai: `quota`, `invitation_note`, `invite_token_hash`, `invite_token_issued_at = now()`, `updated_at`. Gọi `friendly_sync_notifications(id)`. Trả dòng |
| `friendly_club_action` | `p_actor_group_id bigint, p_side text, p_tournament_club_id bigint, p_action text, p_expected_version bigint, p_payload jsonb` | Đọc dòng (không khoá) để biết giải → khoá division `FOR SHARE` → giải `FOR SHARE` → dòng `FOR UPDATE`. `host`: `group_id = p_actor_group_id`; `guest`: `club_id = p_actor_group_id AND group_id <> p_actor_group_id`; sai → `FRIENDLY_CLUB_NOT_FOUND` (P0002). Rồi: giải friendly; division `open` (`FRIENDLY_REGISTRATION_CLOSED`); `version = p_expected_version` (`FRIENDLY_CLUB_VERSION_CONFLICT`); bảng chuyển trạng thái (khối `-- friendly:transitions`, `FRIENDLY_TRANSITION_INVALID`; `invite`/`reinvite` không có ở đây); cửa sổ mở khi hành động đòi (`FRIENDLY_REGISTRATION_CLOSED`); kiểm theo hành động (dưới); ghi; `version + 1`, `updated_at = now()`; `friendly_sync_notifications(id)`. Trả dòng |
| `set_friendly_registration_window` | `p_group_id bigint, p_tournament_id bigint, p_deadline timestamptz, p_locked boolean` | Khoá division `FOR SHARE` (open) → giải `FOR UPDATE`; `settings = settings || jsonb_build_object('friendly', jsonb_build_object('registrationDeadline', p_deadline, 'registrationLockedAt', CASE WHEN p_locked THEN coalesce(<lockedAt cũ>, now()) END))`. Trả `settings->'friendly'` |
| `friendly_sync_notifications` (nội bộ) | `p_tournament_club_id bigint` → `void` | Không `SECURITY DEFINER` (chạy trong ngữ cảnh hàm gọi), `SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, **không GRANT**. Đọc dòng + tên giải + tên hai CLB; khối `-- friendly:notifications` quyết định trạng thái (README §5.2). Mở: `INSERT … ON CONFLICT (group_id, kind, subject_type, subject_id) WHERE subject_id IS NOT NULL DO UPDATE SET status='open', resolved_at=NULL, payload=EXCLUDED.payload, created_at=now()`. Đóng: `UPDATE … SET status='resolved', resolved_at=now() WHERE … AND status='open'` (không động vào dòng người dùng đã `dismissed`) |

Kiểm theo hành động trong `friendly_club_action`:

| Hành động | Kiểm & ghi |
|---|---|
| `accept` / `decline` | `responded_at = now()` |
| `save_roster` | `p_payload->'roster'` đúng shape: `memberIds` mảng chuỗi `^[1-9][0-9]*$` (≤ 64, không trùng), `pairs` ≤ 32 với `pairId ^[A-Za-z0-9_-]{1,64}$` không trùng, `participantRefs` đúng 2 ref khác nhau dạng `member:<id>` thuộc `memberIds`, mỗi ref ≤ 1 cặp; ref `guest:` → `FRIENDLY_GUEST_NOT_ALLOWED`; mọi `memberId` thuộc `club_members.group_id = club_id` (`FRIENDLY_MEMBER_OUTSIDE_CLUB`). Ghi `roster_draft` |
| `submit_roster` | Từ `roster_draft`: ≥ 1 cặp (`FRIENDLY_ROSTER_EMPTY`), mọi người đã ghép (`FRIENDLY_ROSTER_UNPAIRED`), số cặp ≤ `quota` (`FRIENDLY_QUOTA_EXCEEDED`), thành viên đang hoạt động trong `club_id` (`FRIENDLY_MEMBER_OUTSIDE_CLUB`), có `athletes.legacy_club_member_id` (`FRIENDLY_ATHLETE_ID_MISSING`). Ghi `roster_submitted = roster_draft || {memberNames, pairCount}`, `roster_submitted_at`, xoá `review_note` |
| `unsubmit` | Không đổi dữ liệu roster |
| `approve` | Kiểm lại `roster_submitted` như `submit_roster` (thành viên có thể đã nghỉ); `roster_approved_version = p_expected_version + 1`; `roster_reviewed_at` |
| `request_changes` | `p_payload->>'note'` 2–300 ký tự (`FRIENDLY_NOTE_REQUIRED`); `review_note`; `roster_approved_version = NULL`; `roster_reviewed_at` |
| `remove` | `roster_approved_version = NULL`, **`invite_token_hash = NULL`** (thu hồi link) |
| `withdraw` | `roster_approved_version = NULL`, `responded_at` |
| `set_quota` | `p_payload->'quota'` NULL hoặc 1–32 (`FRIENDLY_QUOTA_INVALID`); nếu trạng thái `roster_submitted`/`approved` và `pairCount > quota` → `FRIENDLY_QUOTA_BELOW_ROSTER` |
| `rotate_link` | `p_payload->>'inviteTokenHash' ~ '^[a-f0-9]{64}$'` (route tự sinh, không lấy từ body) → thay `invite_token_hash`, `invite_token_issued_at = now()` |

Thứ tự khoá division → tournament → club → notifications trùng với `finalize_internal_setup_v4` (108) và `_v1` → không
deadlock (README §7.5).

## 6. API

Mọi route: `const db = supabaseAdmin || supabaseServer`; lỗi `{ error, code, params? }`; ánh xạ lỗi RPC theo **message
chứa mã** (như `setup/route.js`), không theo SQLSTATE. Body chỉ nhận field trong allowlist; `side`, `club_id` của khách,
`group_id`, hạn mức, băm token **không bao giờ** lấy từ body.

### 6.1 Chủ nhà

**`GET /api/tournament-v2/clubs?mode=available[&tournamentId=][&q=]`** (D46) — `requireValidatedGroupAdmin()`;
`groups.select('id, name').neq('id', groupId)` bỏ thêm `PICKHUB_SYSTEM_GROUP_ID` (nếu cấu hình), `q` (≤ 60 ký tự) lọc
`ilike` tên, `order('name').limit(200)`. **Không** chọn `code`, `logo_url`. Có `tournamentId` → thêm
`requireTournamentAccess({ tournamentId, need: 'write' })`, gắn `invitation` của từng CLB và `limit`:

```json
{
  "clubs": [{ "id": 19, "name": "CLB Test Responsive UI", "invitation": { "id": 881, "status": "invited", "statusLabel": "Chờ phản hồi" } },
            { "id": 23, "name": "CLB Cầu Giấy", "invitation": null }],
  "limit": { "max": 1, "used": 1, "remaining": 0, "reached": true,
             "upgradeHint": "Mời nhiều CLB hơn là quyền lợi của gói trả phí (sắp ra mắt)." }
}
```

**`GET /api/tournament-v2/clubs?tournamentId=`** — `requireTournamentAccess({ tournamentId, need: 'write' })` (thay
`requireValidatedGroupAdmin` + `.eq('group_id')`).

```json
{
  "window": { "deadline": "2026-10-05T23:59:00+07:00", "lockedAt": null, "open": true, "reason": null },
  "limit": { "max": 1, "used": 1, "remaining": 0, "reached": true, "upgradeHint": "…" },
  "clubs": [{
    "id": 881, "clubId": 19, "name": "CLB Test Responsive UI", "logoUrl": null, "isHost": false,
    "status": "roster_submitted", "statusLabel": "Chờ duyệt", "quota": 3, "version": 6,
    "invitationNote": "…", "reviewNote": null, "respondedAt": "…", "submittedAt": "…", "reviewedAt": null,
    "approvedVersion": null, "inviteLinkIssuedAt": "2026-09-26T09:12:00+07:00", "hasInviteLink": true,
    "submitted": { "pairCount": 2, "pairs": [{ "pairId": "pair_x", "members": [{ "memberId": "991", "name": "Nguyễn Văn A" }, { "memberId": "992", "name": "Trần B" }] }] }
  }]
}
```

**`POST /api/tournament-v2/clubs`** `{ tournament_id, club_id, quota?, invitation_note? }` — mời **hoặc mời lại** (CLB
đã `declined`/`withdrawn`). `requireTournamentAccess(write)`; `club_id` số nguyên dương, ≠ `PICKHUB_SYSTEM_GROUP_ID`; có
`external_club_id`/`external_club_name` → 400 `EXTERNAL_CLUB_NOT_SUPPORTED` (D39).
`resolveFriendlyEntitlements({ db, groupId: access.groupId })` → `issueInviteToken()` → `friendly_invite_club(…,
maxGuestClubs, tokenHash)`. Trả `{ club: HostClubView, invitePath: '/giai-dau/moi/<token>', limit }` — `invitePath` chỉ
có trong response này (client ghép `window.location.origin`).

**`PATCH /api/tournament-v2/clubs`** `{ id, action: 'approve'|'request_changes'|'remove'|'set_quota'|'rotate_link',
expected_version, note?, quota? }` — nạp dòng theo `id` → `requireTournamentAccess({ tournamentId: row.tournament_id,
need: 'write' })` → với `rotate_link` route sinh token, đặt `inviteTokenHash` vào payload → `friendly_club_action(
access.groupId, 'host', …)`. Trả `{ club, invitePath? }`.

**`POST /api/tournament-v2/friendly/window`** `{ tournament_id, deadline: ISO|null, locked: boolean }` —
`requireTournamentAccess(write)`; `deadline` phải parse được và có múi giờ (`FRIENDLY_DEADLINE_INVALID` 400). Trả
`{ window }`. UI gợi ý giờ mặc định 23:59 (giờ Việt Nam) của ngày chọn.

### 6.2 CLB khách

**`GET /api/tournament-v2/friendly/invitations`** — `requireValidatedGroupAdmin()`; `tournament_clubs.eq('club_id',
groupId).neq('group_id', groupId)` + giải `settings.organizer_mode = 'friendly'`. Sắp: cần làm (`invited`,
`changes_requested`) → đang mở → đã chốt → từ chối/rút.

```json
{ "invitations": [{
  "id": 881, "tournament": { "name": "Giao hữu Thu 2026", "eventDate": "2026-10-12", "startTime": "07:30", "location": "…", "status": "draft" },
  "hostClub": { "name": "CLB Test 23.9.2026", "logoUrl": null },
  "status": "invited", "statusLabel": "Chờ phản hồi", "quota": 3, "pairCount": 0,
  "window": { "deadline": "…", "open": true, "reason": null }, "finalized": false, "publicUrl": null
}] }
```

`publicUrl` = `/giai-dau/v2/<public_slug>` chỉ khi giải đã chốt và `visibility ≠ 'private'`.

**`GET /api/tournament-v2/friendly/invitations/[id]`** — `requireParticipantClubAccess({ tournamentClubId: id })`.
Trả `GuestInvitationView` đầy đủ + thành viên **của chính CLB mình** (cùng truy vấn với `athletes?mode=roster`, thêm
`hasAthlete`):

```json
{
  "invitation": { "...như danh sách...", "formatLabel": "Vòng bảng → Loại trực tiếp", "description": "…", "invitationNote": "…",
    "reviewNote": "Cặp 2 thiếu người đánh tay trái", "version": 7, "canEdit": true,
    "rosterDraft": { "memberIds": ["991","992"], "pairs": [{ "pairId": "pair_x", "participantRefs": ["member:991","member:992"], "locked": false }], "unpairedRefs": [] },
    "rosterSubmitted": { "pairCount": 1, "pairs": [ … ], "submittedAt": "…" } },
  "members": [{ "memberId": "991", "name": "Nguyễn Văn A", "active": true, "hasAthlete": true }]
}
```

Không có: dòng CLB khác, số CLB/cặp khác, `group_id` chủ nhà, `captain_contact_profile_id`, số điện thoại, băm token.
`formatLabel` lấy từ `setup_draft.format.formatKey` của chủ nhà qua `getFormat().label` (chỉ nhãn).

**`POST /api/tournament-v2/friendly/invitations/[id]`** `{ action: 'accept'|'decline'|'save_roster'|'submit_roster'|
'unsubmit'|'withdraw', expected_version, roster? }` — quyền như GET; `roster` qua `normalizeClubRoster`; với
`submit_roster` route chạy `validateClubRosterForSubmit` (ngữ cảnh `loadMemberContext(db, session.group_id, ids)`) để trả
blocker rõ trước khi gọi RPC (RPC vẫn kiểm lại). Gọi `friendly_club_action(session.group_id, 'guest', …)`. Trả
`{ invitation }`.

### 6.3 Link mời

**`POST /api/tournament-v2/friendly/invite-links/resolve`** `{ token }` — token trong body (không trong query của API để
không vào log truy cập API). `consumeRateLimit('invite-link:' + getClientIdentifier(request), { limit: 30, windowMs:
600000 })` (`RATE_LIMITED` 429). Phiên: `getValidatedGroupSessionFromCookies()` (vé VĐV không tính). Nạp dòng
`.eq('invite_token_hash', hashInviteToken(token))` chỉ chọn `id, club_id, group_id, tournament_id, invitation_status`
(token sai định dạng → không truy vấn). Nạp giải (`settings`) + division (`roster_lock_status`) **chỉ khi** đã qua bước
so CLB. Gọi `decideInviteLink` → trả đúng bảng README §5.3:

```json
{ "invitationId": 881 }                                                           // 200
{ "error": "Cần đăng nhập…", "code": "UNAUTHENTICATED", "loginUrl": "/?dang-nhap=clb&next=%2Fgiai-dau%2Fmoi%2F<token>" }   // 401
{ "error": "…", "code": "FRIENDLY_INVITE_WRONG_CLUB", "currentClubName": "CLB Test 23.9.2026" }                            // 403
{ "error": "…", "code": "FRIENDLY_INVITE_LINK_EXPIRED", "invitationId": 881 }                                             // 410
```

### 6.4 Thông báo — `app/api/club/notifications/route.js`

- GET: sau khi đọc `fresh` (mọi `kind` đang mở của CLB — hành vi hiện có), (1) với các dòng `kind ∈
  FRIENDLY_NOTIFICATION_KINDS`: nạp `tournament_clubs.in('id', subjectIds)`; dòng mà `subject` không còn (giải bị xoá →
  cascade) hoặc `desiredNotificationState(status)` nói `resolved` → cập nhật `resolved` và bỏ khỏi kết quả (tự sửa lệch);
  (2) trả `notifications: fresh.map(projectClubNotification)`. `openCount` tính sau khi lọc. Nhánh
  `unassigned_transaction` giữ nguyên từng dòng.
- PATCH: giữ nguyên (người dùng "Bỏ qua" lời mời chỉ ẩn khỏi chuông; lời mời vẫn nằm trong hộp lời mời).

### 6.5 `PATCH /api/tournament-v2/tournaments`

Khi body có `settings`: đọc `settings` hiện có của giải (cùng `group_id`), ghi `{ ...body.settings, organizer_mode:
current.organizer_mode, friendly: current.friendly }` (bỏ khóa có giá trị `undefined`). Hằng `SERVER_OWNED_SETTINGS_KEYS
= ['organizer_mode', 'friendly']` đặt trong `friendlyClubs.js` để test dùng chung. POST (tạo giải kiểu cũ) không đổi.

## 7. Mã lỗi ổn định

| Mã | HTTP | Văn bản (setupMessages) |
|---|---|---|
| `CLUB_IS_HOST` | 409 | Đây là CLB của bạn. |
| `CLUB_NOT_FOUND` | 404 | CLB không còn tồn tại. |
| `CLUB_ALREADY_INVITED` | 409 | CLB này đã có trong danh sách mời. |
| `EXTERNAL_CLUB_NOT_SUPPORTED` | 400 | Hiện chỉ mời được CLB có trên PickHub. |
| `FRIENDLY_CLUB_LIMIT_REACHED` | 409 | Tài khoản CLB thường mời được tối đa {max} CLB khách cho mỗi giải. Mời nhiều CLB hơn là quyền lợi của gói trả phí (sắp ra mắt). |
| `RATE_LIMITED` | 429 | Thao tác quá nhiều lần, thử lại sau ít phút. |
| `FRIENDLY_MODE_REQUIRED` | 409 | Chỉ giải giao hữu liên CLB mới mời được CLB. |
| `FRIENDLY_CLUB_NOT_FOUND` | 404 | Không tìm thấy lời mời. |
| `FRIENDLY_CLUB_VERSION_CONFLICT` | 409 | Danh sách vừa được cập nhật ở máy khác. Tải lại để xem bản mới nhất. |
| `FRIENDLY_TRANSITION_INVALID` | 409 | Thao tác không còn phù hợp với trạng thái hiện tại. |
| `FRIENDLY_REGISTRATION_CLOSED` | 409 | Đăng ký đã đóng (qua hạn, đã khoá hoặc giải đã chốt). |
| `FRIENDLY_ROSTER_EMPTY` | 400 | Cần ít nhất một cặp. |
| `FRIENDLY_ROSTER_UNPAIRED` | 400 | Còn người chưa ghép cặp: ghép thêm hoặc bỏ chọn. |
| `FRIENDLY_QUOTA_EXCEEDED` | 400 | Vượt hạn mức {quota} cặp. |
| `FRIENDLY_QUOTA_INVALID` | 400 | Hạn mức từ 1 đến 32 cặp. |
| `FRIENDLY_QUOTA_BELOW_ROSTER` | 409 | CLB đã gửi {count} cặp; hạn mức không được nhỏ hơn. |
| `FRIENDLY_GUEST_NOT_ALLOWED` | 400 | Đội CLB khách chỉ gồm thành viên CLB. |
| `FRIENDLY_MEMBER_OUTSIDE_CLUB` | 400 | Có người không còn là thành viên đang hoạt động của CLB. |
| `FRIENDLY_ATHLETE_ID_MISSING` | 400 | {name} chưa có hồ sơ thi đấu. |
| `FRIENDLY_NOTE_REQUIRED` | 400 | Nhập lý do cần sửa (2–300 ký tự). |
| `FRIENDLY_DEADLINE_INVALID` | 400 | Hạn chót không hợp lệ. |
| `FRIENDLY_INVITE_LINK_INVALID` | 404 | Link mời không hợp lệ hoặc đã bị thu hồi. |
| `FRIENDLY_INVITE_WRONG_CLUB` | 403 | Link mời này dành cho một CLB khác. Hãy đăng xuất rồi đăng nhập bằng tài khoản quản trị của CLB được mời. |
| `FRIENDLY_INVITE_LINK_EXPIRED` | 410 | Đăng ký của giải này đã đóng. Bạn vẫn xem được lời mời. |
| `UNAUTHENTICATED` | 401 | Cần đăng nhập CLB để mở lời mời. |
| `SETUP_PAYLOAD_INVALID` | 400 | Dữ liệu gửi lên không hợp lệ. |
| `SETUP_ACTION_RETIRED` | 410 | Thao tác cũ, không dùng cho luồng tạo giải hiện tại. |
| `TOURNAMENT_NOT_FOUND` / `GROUP_ADMIN_REQUIRED` | 404 / 403 | như `access.js` |

## 8. Test node — `tests/stitch-setup/epic-3/` (tự chạy trong `npm run test:stitch-setup`, harness `../_harness`)

| File | Ca bắt buộc |
|---|---|
| `f1-friendly-clubs.test.js` | Mọi dòng bảng README §4 cho kết quả đúng (kể cả cột `rpc`); mọi bộ (trạng thái × hành động × phía) ngoài bảng → `FRIENDLY_TRANSITION_INVALID`; khách không `approve`/`rotate_link`, chủ nhà không `submit_roster`; `registrationWindow`: không hạn, còn hạn, qua hạn đúng mốc giây, đã khoá, đã chốt; `validateClubRosterForSubmit`: rỗng, lẻ người, vượt hạn mức, thiếu hồ sơ, ngoài CLB; lưu nháp lẻ người/vượt hạn mức không bị chặn ở domain; `friendlyPairKey`/`parse` khứ hồi, từ chối khóa lạ |
| `f1-entitlements.test.js` | `maxGuestClubsPerTournament()` = 1; gói lạ → 1; giá trị kẹp 1..31; `countsTowardGuestLimit` đúng 7 trạng thái; `guestClubLimitView`: 0 dòng → `reached:false`; 1 `invited` → `reached:true` + `upgradeHint`; 1 `declined` → `reached:false`; truyền `maxGuestClubs: 2` → 1 dòng chưa đạt (ca core ≥ 3 CLB) |
| `f1-invite-link.test.js` | `issueInviteToken` 43 ký tự base64url, băm 64 hex, 1000 token không trùng; `decideInviteLink` theo **đúng thứ tự** bảng README §5.3 (chưa đăng nhập đi trước token sai; sai CLB đi trước "hết hạn"); nhánh sai CLB chỉ có khóa `{status, code, currentClubName}`; thành viên đúng CLB → `GROUP_ADMIN_REQUIRED`; hết hạn đúng mốc giây của `registrationDeadline`; khoá / đã chốt → 410; `safeNextPath` từ chối `//evil.com`, `https://…`, `/giai-dau/moi/../x`, `/giai-dau/v2`, chuỗi rỗng |
| `f1-notifications.test.js` | `desiredNotificationState` cho 7 trạng thái; `projectClubNotification` đúng tiêu đề/href mỗi `kind`/`reason`; `kind` lạ → `display: null`, row giữ nguyên; payload khách không có `tournamentId`/`group_id` chủ nhà |
| `f1-roster.test.js` | `normalizeClubRoster`: ref `guest:` bị loại, cặp chứa nó bị tách; bỏ một người giữa danh sách chỉ tách đúng một cặp; không tự ghép lại; trùng tên là hai người khác nhau; `normalizeDraft` **không đổi** (so snapshot các fixture Lát 0) |
| `f1-access.test.js` | Ma trận README §6 cho `resolveParticipantClubAccess`: admin khách đúng dòng → cho; thành viên khách → 403; admin CLB khác → 404; admin chủ nhà qua đường này → 404; giải không friendly → 404; platform actor → 404; `resolveTournamentWrite` của khách trên giải chủ nhà vẫn 404 |
| `f1-projection.test.js` | `projectInvitationForGuest` không bao giờ có khóa trong danh sách cấm (`group_id`, `captain_contact_profile_id`, `roster_draft` của dòng khác, `phone`, `private_note`, `invite_token_hash`, danh sách CLB); `projectClubForHost` không có `rosterDraft`, `invite_token_hash` |
| `f1-api-contract.test.js` | Đọc mã nguồn: `clubs` GET `mode=available` chọn đúng `'id, name'` (không `code`, `logo_url`), lọc chính mình, dùng `requireTournamentAccess` khi có `tournamentId`; POST gọi `resolveFriendlyEntitlements` + `issueInviteToken`, không đọc `max_guest_clubs`/`token` từ body; route khách lọc `.eq('club_id'` và không đọc `side`/`club_id`/`group_id` từ body; `POST /clubs` từ chối external; `replace_invited_clubs` trả 410 với bản nháp v3; `tournaments` PATCH dùng `SERVER_OWNED_SETTINGS_KEYS`; `club/notifications` còn nguyên khối `unassigned_transaction`; không nơi nào trong `app/` viết số hạn mức cứng (`maxGuestClubs: 1`); migration 110: không `DROP`, `TRUNCATE`, `DELETE FROM`; ba RPC công khai có `SECURITY DEFINER`, `SET search_path = public`, `REVOKE … FROM PUBLIC, anon, authenticated`, `GRANT … TO service_role`; `friendly_sync_notifications` **không** có `GRANT`; khối `-- friendly:transitions` bằng các dòng `rpc:'action'` của `FRIENDLY_TRANSITIONS`; khối `-- friendly:notifications` bằng `desiredNotificationState`; SQL tích hợp kết thúc bằng `ROLLBACK;` |
| Hồi quy | `npm run test:stitch-setup` (lat-0/a/b/c, epic-1, epic-2) + `tests/phase3/interclub-competition.test.js` xanh |

## 9. Kiểm thử tích hợp SQL (ROLLBACK)

`scripts/qa/epic-3-f1-integration.js` sinh `database/tests/epic_3_f1_friendly_clubs.sql` (mẫu `stitch-lat-c-integration.js`):
một transaction, `ROLLBACK;` ở cuối, nạp thân 110 trước (kiểm trước khi apply). Dữ liệu tạm tạo **trong transaction**:
giải friendly của group 59 (qua `save_unified_setup_aggregate_draft_v1` với `organizerMode: 'friendly'`), **hai `groups`
tạm** (khách A, B; mã `ZZE3A…`) + `club_members` + `athletes` — không dựa vào group 19 thật.

| Kịch bản | Kiểm |
|---|---|
| Mời + hạn mức mặc định | Mời A (`p_max_guest_clubs = 1`) → `invited`, `invite_token_hash` 64 hex, không có token thô ở đâu trong DB; mời B cùng hạn mức → `FRIENDLY_CLUB_LIMIT_REACHED`; mời lại A → `CLUB_ALREADY_INVITED`; mời 59 → `CLUB_IS_HOST`; giải internal → `FRIENDLY_MODE_REQUIRED`; `p_max_guest_clubs` NULL/0 → `SETUP_PAYLOAD_INVALID` |
| Suất được trả lại | A `decline` → mời B (hạn mức 1) được; chủ nhà `remove` B → mời lại A (`reinvite`) được, băm token đổi, `roster_draft` còn |
| Core ≥ 3 CLB | Giải thứ hai, `p_max_guest_clubs = 2`: mời A và B đều được (ca G-core3) |
| Thông báo | Sau mời: một dòng `club_notifications` `group_id = A`, `kind='tournament_invitation'`, `open`, payload có tên giải + tên 59; A `accept` → `resolved`; A `submit_roster` → dòng `tournament_roster_review` của 59 `open`; `approve` → `resolved`; `request_changes` → thông báo của A mở lại (`reason='changes_requested'`); đã `dismissed` rồi trạng thái rời → vẫn `dismissed` |
| Khách A | `accept` → `save_roster` 2 cặp → `submit_roster` → `roster_submitted`, `roster_submitted.memberNames` đủ tên |
| Xung đột | Gọi lại với `version` cũ → `FRIENDLY_CLUB_VERSION_CONFLICT`, dòng không đổi |
| Sai phía | A gọi bằng `p_actor_group_id` của B → `FRIENDLY_CLUB_NOT_FOUND`; khách gọi `approve` → `FRIENDLY_TRANSITION_INVALID` |
| Yêu cầu sửa | Chủ nhà `request_changes` không lý do → lỗi; có lý do → `changes_requested`; A sửa + gửi lại; chủ nhà `approve` → `roster_approved_version = version` |
| Roster sai (B, ở giải hạn mức 2) | Roster có `guest:` → `FRIENDLY_GUEST_NOT_ALLOWED`; thành viên của A → `FRIENDLY_MEMBER_OUTSIDE_CLUB`; 4 cặp với quota 3 → gửi bị `FRIENDLY_QUOTA_EXCEEDED` (lưu nháp được); thành viên thiếu `athletes` → `FRIENDLY_ATHLETE_ID_MISSING` |
| Hạn mức cặp | Chủ nhà `set_quota` 1 khi A đã duyệt 2 cặp → `FRIENDLY_QUOTA_BELOW_ROSTER` |
| Link | `rotate_link` thay băm; `remove` → băm NULL; băm trùng giữa hai dòng → vi phạm unique |
| Cửa sổ | Khoá → B `submit_roster` → `FRIENDLY_REGISTRATION_CLOSED`; mở, đặt hạn trong quá khứ → như trên; bỏ hạn → gửi được; `settings` khác (`poster_url`…) giữ nguyên sau khi đặt cửa sổ |
| Đã chốt | Đặt division `roster_lock_status = 'locked'` trong transaction → mọi hành động và mời → `FRIENDLY_REGISTRATION_CLOSED` |
| Sau rollback | 0 dòng tạm còn lại (đếm theo mã group tạm, tên giải tạm, `club_notifications` của group tạm) |

Không kiểm được trong một transaction: hai lần mời song song (khóa `FOR UPDATE`) — ghi rõ trong evidence là kiểm bằng
đọc mã (test contract kiểm `FOR UPDATE` trên `tournaments` trong `friendly_invite_club`).

Apply (D45): chạy file tích hợp (ROLLBACK) → apply 110 qua Supabase MCP → so `md5(prosrc)` bốn hàm với thân trong file →
ghi `_workspace/epic-3-friendly/evidence.md`.

## 10. Nghiệm thu lát F1

- Test §8 xanh; kiểm thử tích hợp §9 xanh trên production (ROLLBACK), 110 đã apply, md5 khớp.
- Preflight RLS (README §7.2) ghi vào evidence.
- Gọi thử API bằng phiên thật **không bắt buộc** ở F1 — nghiệm thu browser đầy đủ ở F3.

## 11. Không làm ở F1

UI (F3: chuông, trang link, hộp lời mời, `?next=` ở trang đăng nhập); bản nháp `friendly`, cặp hiệu lực, bốc thăm,
finalize, BXH (F2); CLB ngoài hệ thống (D39); gói trả phí thật (chỉ điểm cắm); thông báo ngoài app.
