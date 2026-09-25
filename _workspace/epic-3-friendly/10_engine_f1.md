# Epic 3 F1: bàn giao domain (engine-dev)

Nhánh `epic-3-friendly`, commit `b950a52` (và commit tài liệu này). Chỉ có domain thuần + test node. Chưa có migration, route hay UI.
Nguồn: `docs/superpowers/specs/2026-09-25-epic-3-friendly/lat-f1-loi-moi-va-dang-ky.md` §3, §7, §8 và README §4, §5.

## 1. File

| File | Loại |
|---|---|
| `lib/tournament/friendlyClubs.js` | mới |
| `lib/tournament/friendlyEntitlements.js` | mới (không `require`, không `process.env`) |
| `lib/tournament/friendlyInviteLink.js` | mới (`node:crypto`) |
| `lib/tournament/friendlyNotifications.js` | mới |
| `lib/tournament/setupDraftV3.js` | thêm export `normalizeClubRoster`; `normalizeDraft` giữ nguyên (khoá bằng băm) |
| `lib/tournament/access.js` | thêm export `resolveParticipantClubAccess` |
| `lib/tournament/setupMessages.js` | thêm câu cho các mã ở §7 (trừ `UNAUTHENTICATED`, xem lệch #1) |
| `tests/stitch-setup/epic-3/_draftFixtures.js` | fixture của lượt chạy trước, dùng lại nguyên trạng |
| `tests/stitch-setup/epic-3/f1-{friendly-clubs,entitlements,invite-link,notifications,roster,access,projection}.test.js` | 7 file test |

`package.json`: **không sửa**, vì `tests/stitch-setup/run-all.js` tự tìm mọi `*.test.js`.
Không đụng file FROZEN, cũng không đụng `interclub.js` (`CLUB_TRANSITIONS` cũ giữ nguyên).
`f1-api-contract.test.js` thuộc api-dev (đọc route + migration 110), nên chưa viết.

## 2. API

### `friendlyClubs.js`

```js
FRIENDLY_STATUSES        // ['invited','accepted','declined','roster_submitted','changes_requested','approved','withdrawn']
ACTIVE_STATUSES          // 5 trạng thái "còn hiệu lực" (trừ declined/withdrawn)
FRIENDLY_TRANSITIONS     // [{ from:[status|null], action, side:'host'|'guest', to:status|null, needsOpenWindow, rpc:'invite'|'action' }]
transitionFriendlyClub({ status, action, side }) → { to, needsOpenWindow, rpc }   // sai → throw FriendlyError code 'FRIENDLY_TRANSITION_INVALID'
friendlyActionTransitionRows() → [{ from, action, side, to, needsOpenWindow }]    // chỉ rpc:'action', mỗi from một dòng (30 dòng)
renderFriendlyTransitionsSql() → string                                            // khối SQL, xem §4
registrationWindow({ settings, rosterLockStatus, now }) → { open, reason: null|'FINALIZED'|'NOT_FRIENDLY'|'LOCKED'|'DEADLINE_PASSED', deadline, lockedAt }
friendlyActionsFor({ status, side, window }) → action[]                            // hành động làm được ngay (bảng + cửa sổ)
validateClubRosterForSave(raw) → { ok, blockers }        // chỉ chặn FRIENDLY_GUEST_NOT_ALLOWED {count} và SETUP_PAYLOAD_INVALID (shape/trần kỹ thuật)
validateClubRosterForSubmit(roster, { quota, members }) → { ok, blockers:[{code, params?}] }
   // members: Map|object memberId → { active, hasAthlete, name } của CHÍNH CLB khách
   // FRIENDLY_GUEST_NOT_ALLOWED {count} · SETUP_PAYLOAD_INVALID · FRIENDLY_ROSTER_EMPTY · FRIENDLY_ROSTER_UNPAIRED {count}
   // FRIENDLY_QUOTA_EXCEEDED {quota,count} · FRIENDLY_MEMBER_OUTSIDE_CLUB {memberIds} · FRIENDLY_ATHLETE_ID_MISSING {name, memberId} (mỗi người một blocker)
friendlyPairKey(tournamentClubId, approvedVersion, pairId) → 'c<id>.<ver>.<pairId>'  // sai → throw 'FRIENDLY_PAIR_KEY_INVALID'
parseFriendlyPairKey(key) → { tournamentClubId, approvedVersion, pairId } | null     // CHUỖI, regex đúng spec
statusLabel(status, side='host')                          // withdrawn: host 'Đã rút', guest 'Đã huỷ mời'
projectClubForHost(row, { clubName, logoUrl }) → HostClubView     // đúng JSON §6.1; submitted chỉ khi roster_submitted|approved|changes_requested
projectInvitationForGuest({ row, tournament, hostClub, window, formatLabel, publicUrl }) → GuestInvitationView
   // đúng JSON §6.2 + thêm `actions` (friendlyActionsFor phía guest); tournament.startTime lấy từ tournament.settings.start_time
   // publicUrl chỉ trả khi window.reason === 'FINALIZED'. Route vẫn tự kiểm visibility ≠ private trước khi truyền vào
isValidQuota(v)            // null | số nguyên 1–32 (không ép chuỗi)
validateReviewNote(note) → { ok, note } | { ok:false, code:'FRIENDLY_NOTE_REQUIRED' }   // trim, 2–300
parseDeadlineInput(v) → { ok, deadline } | { ok:false, code:'FRIENDLY_DEADLINE_INVALID' } // null/'' = bỏ hạn; ISO phải có Z hoặc ±HH:MM
SERVER_OWNED_SETTINGS_KEYS // ['organizer_mode','friendly']
preserveServerOwnedSettings(current, incoming) → settings    // dùng cho PATCH /tournaments (§6.5); bỏ khóa undefined
FRIENDLY_ERROR_STATUS      // mã → HTTP, đủ bảng §7
QUOTA_MIN/MAX (1/32), ROSTER_MAX_MEMBERS 64, ROSTER_MAX_PAIRS 32, REVIEW_NOTE_MIN/MAX 2/300, INVITATION_NOTE_MAX 500, PAIR_ID_RE
```

HostClubView gồm các khóa `id, clubId, name, logoUrl, isHost, status, statusLabel, quota, version, invitationNote, reviewNote,
respondedAt, submittedAt, reviewedAt, approvedVersion, inviteLinkIssuedAt, hasInviteLink, submitted:{pairCount, pairs:[{pairId, members:[{memberId,name}]}]}|null`.
View này không có `rosterDraft`, `invite_token_hash`, `captain_contact_profile_id` hay `group_id`.

GuestInvitationView gồm `id, tournament{name,eventDate,startTime,location,status}, hostClub{name,logoUrl}, status, statusLabel, quota,
pairCount, window{deadline,open,reason}, finalized, publicUrl, formatLabel, description, invitationNote, reviewNote, version, canEdit,
actions, rosterDraft{memberIds,pairs,unpairedRefs}, rosterSubmitted{pairCount,pairs,submittedAt}|null`.
`pairCount` lấy từ ảnh chụp khi trạng thái là `roster_submitted`/`approved`, ngược lại lấy số cặp của bản nháp.

### `friendlyEntitlements.js`

```js
PLAN_GUEST_CLUB_LIMITS = { free: 1 } (frozen) · DEFAULT_PLAN 'free' · CORE_MAX_GUEST_CLUBS 31 · UPGRADE_HINT
resolveClubPlan({ groupId }) → 'free'                               // điểm cắm gói
clampGuestClubLimit(v) → 1..31 (không phải số → 1)
isValidMaxGuestClubs(v) → số nguyên 1–31                           // khớp kiểm p_max_guest_clubs
maxGuestClubsPerTournament({ plan }) → 1..31                        // gói lạ / khóa prototype → 1
async resolveFriendlyEntitlements({ db, groupId }) → { plan, maxGuestClubs, upgradeAvailable:false }
countsTowardGuestLimit(status)                                      // mọi trạng thái trừ declined|withdrawn (trạng thái lạ: tính)
guestClubLimitView({ maxGuestClubs, rows }) → { max, used, remaining, reached, upgradeHint }
   // rows nhận invitation_status hoặc status; bỏ dòng chủ nhà (club_id = group_id)
```

### `friendlyInviteLink.js`

```js
issueInviteToken() → { rawToken /* base64url 43 */, tokenHash /* sha256 hex 64 */ }
hashInviteToken(raw)          // raw sai định dạng → throw code 'FRIENDLY_INVITE_LINK_INVALID' (route kiểm isInviteTokenShape trước, không truy vấn)
isInviteTokenShape(raw) · isInviteTokenHash(h) · invitePath(raw) → '/giai-dau/moi/<raw>'
inviteLoginPath(raw) → '/?dang-nhap=clb&next=%2Fgiai-dau%2Fmoi%2F<raw>'   // raw sai → '/?dang-nhap=clb'
safeNextPath(v) → v | null
decideInviteLink({ session, row, tournament, rosterLockStatus, now })
   // 401 {status,code} → 404 {status,code} → 403 WRONG_CLUB {status,code,currentClubName} → 403 GROUP_ADMIN_REQUIRED {status,code}
   // → 410 {status,code,invitationId} → 200 {status, code:null, invitationId}
   // session: { group_id|groupId, group_name|groupName, role }; row: { id, club_id, invitation_status }
INVITE_LINK_MESSAGES          // câu cho route resolve (gồm UNAUTHENTICATED)
```

Route resolve tự gắn `loginUrl: inviteLoginPath(token)` vào phản hồi 401. `decideInviteLink` không trả `loginUrl`.

### `friendlyNotifications.js`

```js
FRIENDLY_NOTIFICATION_KINDS = { guest:'tournament_invitation', host:'tournament_roster_review' } · FRIENDLY_NOTIFICATION_SUBJECT_TYPE 'tournament_club'
NOTIFICATION_PAYLOAD_KEYS = { guest:['reason','tournamentName','hostClubName','eventDate'],
                              host:['reason','tournamentName','guestClubName','pairCount','tournamentId','divisionId'] }
desiredNotificationState(status) → { guest:'open'|'resolved', guestReason, host }
renderFriendlyNotificationsSql() → string
isFriendlyNotificationKind(kind) · formatEventDate('2026-10-12') → '12/10/2026'
projectClubNotification(row) → { ...row, payload (lọc allowlist), display:{title, body, href, actionLabel} }   // kind khác: bản sao row + display:null
shouldResolveNotification(notification, tournamentClubRow|null) → bool   // route chuông tự sửa lệch / dọn mồ côi
```

### Sửa file có sẵn

- `setupDraftV3.normalizeClubRoster(raw) → { memberIds, pairs:[{pairId, participantRefs, locked}], unpairedRefs }`. Hàm chỉ nhận `raw.memberIds`, lọc qua `MEMBER_ID_RE` và dùng `reconcilePairs`. Ref `guest:` không bao giờ vào roster: cặp chứa ref đó bị tách.
- `access.resolveParticipantClubAccess({ tournament, tournamentClub, actor })`:
  - Cho phép: `{ allowed:true, code:null, message:null, status:200, actorKind:'participant_club', groupId: tournament.group_id, clubGroupId, tournamentClubId, canReadPrivate:false }`.
  - Thứ tự kiểm: actor là group, sau đó dòng phải khớp `tournament_id` và `group_id` của giải, sau đó `club_id` phải bằng CLB của phiên, CLB của phiên không phải chủ nhà, giải là `friendly`, cuối cùng mới kiểm role.
  - Mọi lần từ chối trả 404 `TOURNAMENT_NOT_FOUND`. Riêng trường hợp đúng CLB mà không phải admin trả 403 `GROUP_ADMIN_REQUIRED`.
  - Route nhớ select `tournament_id, group_id` trên dòng `tournament_clubs`, nếu thiếu thì bị 404.

## 3. Mã lỗi domain phát ra

`FRIENDLY_TRANSITION_INVALID` (throw), `FRIENDLY_PAIR_KEY_INVALID` (throw, mã nội bộ), `FRIENDLY_INVITE_LINK_INVALID` (throw từ `hashInviteToken`).
Blocker: `FRIENDLY_GUEST_NOT_ALLOWED`, `SETUP_PAYLOAD_INVALID`, `FRIENDLY_ROSTER_EMPTY`, `FRIENDLY_ROSTER_UNPAIRED`,
`FRIENDLY_QUOTA_EXCEEDED`, `FRIENDLY_MEMBER_OUTSIDE_CLUB`, `FRIENDLY_ATHLETE_ID_MISSING`.
Validator: `FRIENDLY_NOTE_REQUIRED`, `FRIENDLY_DEADLINE_INVALID`. Quyết định link: `UNAUTHENTICATED`, `FRIENDLY_INVITE_LINK_INVALID`,
`FRIENDLY_INVITE_WRONG_CLUB`, `GROUP_ADMIN_REQUIRED`, `FRIENDLY_INVITE_LINK_EXPIRED`. Bảng HTTP đầy đủ nằm ở `FRIENDLY_ERROR_STATUS`.

## 4. Hằng số cần chép sang SQL (migration 110)

Cách so đề xuất cho `f1-api-contract.test.js`: lấy các dòng nằm giữa `-- friendly:transitions` và `-- friendly:transitions:end`. Với mỗi dòng: bỏ `\r` (worktree đang checkout CRLF), bỏ khoảng trắng đầu dòng, bỏ dòng rỗng và dòng comment. Kết quả nối bằng `\n` phải bằng `renderFriendlyTransitionsSql()`. Khối `-- friendly:notifications` / `-- friendly:notifications:end` so với `renderFriendlyNotificationsSql()` theo cùng cách.

Khối transitions có cột `(from_status, action, side, to_status | NULL = giữ nguyên, needs_open_window)`, 30 dòng, dùng làm `VALUES` của CTE hoặc bảng tạm:

```sql
('invited', 'accept', 'guest', 'accepted', true),
('invited', 'decline', 'guest', 'declined', true),
('accepted', 'save_roster', 'guest', NULL, true),
('changes_requested', 'save_roster', 'guest', NULL, true),
('accepted', 'submit_roster', 'guest', 'roster_submitted', true),
('changes_requested', 'submit_roster', 'guest', 'roster_submitted', true),
('roster_submitted', 'unsubmit', 'guest', 'accepted', true),
('roster_submitted', 'approve', 'host', 'approved', false),
('roster_submitted', 'request_changes', 'host', 'changes_requested', true),
('approved', 'request_changes', 'host', 'changes_requested', true),
('invited', 'remove', 'host', 'withdrawn', false),
('accepted', 'remove', 'host', 'withdrawn', false),
('roster_submitted', 'remove', 'host', 'withdrawn', false),
('changes_requested', 'remove', 'host', 'withdrawn', false),
('approved', 'remove', 'host', 'withdrawn', false),
('accepted', 'withdraw', 'guest', 'withdrawn', true),
('roster_submitted', 'withdraw', 'guest', 'withdrawn', true),
('changes_requested', 'withdraw', 'guest', 'withdrawn', true),
('approved', 'withdraw', 'guest', 'withdrawn', true),
('invited', 'set_quota', 'host', NULL, false),
('accepted', 'set_quota', 'host', NULL, false),
('roster_submitted', 'set_quota', 'host', NULL, false),
('changes_requested', 'set_quota', 'host', NULL, false),
('approved', 'set_quota', 'host', NULL, false),
('invited', 'rotate_link', 'host', NULL, false),
('accepted', 'rotate_link', 'host', NULL, false),
('declined', 'rotate_link', 'host', NULL, false),
('roster_submitted', 'rotate_link', 'host', NULL, false),
('changes_requested', 'rotate_link', 'host', NULL, false),
('approved', 'rotate_link', 'host', NULL, false)
```

`needs_open_window = false` vẫn đòi division `roster_lock_status = 'open'`, vì mọi hành động đều bị chặn sau khi chốt.

Khối notifications có cột `(invitation_status, guest_state, guest_reason | NULL, host_state)`:

```sql
('invited', 'open', 'invited', 'resolved'),
('accepted', 'resolved', NULL, 'resolved'),
('declined', 'resolved', NULL, 'resolved'),
('roster_submitted', 'resolved', NULL, 'open'),
('changes_requested', 'open', 'changes_requested', 'resolved'),
('approved', 'resolved', NULL, 'resolved'),
('withdrawn', 'resolved', NULL, 'resolved')
```

Các giá trị khác phải khớp SQL:
- Hạn mức CLB khách: 1–31 (`isValidMaxGuestClubs`). `countsTowardGuestLimit` tương ứng `invitation_status NOT IN ('declined','withdrawn')`.
- Quota: NULL hoặc 1–32. Roster tối đa 64 `memberIds` và 32 cặp. `pairId` khớp `^[A-Za-z0-9_-]{1,64}$`. `review_note` dài 2–300 ký tự sau trim. `invitation_note` tối đa 500 ký tự.
- Băm token khớp `^[a-f0-9]{64}$`. Khóa cặp khớp `^c([0-9]+)\.([0-9]+)\.([A-Za-z0-9_-]{1,64})$`.
- Payload `club_notifications` có khóa theo `NOTIFICATION_PAYLOAD_KEYS`.

## 5. Output test

```text
$ node tests/stitch-setup/epic-3/f1-*.test.js
ok   f1 access: 8/8
ok   f1 entitlements: 13/13
ok   f1 entitlements (async): 1/1
ok   f1 friendly clubs: 32/32
ok   f1 invite link: 14/14
ok   f1 notifications: 12/12
ok   f1 projection: 9/9
ok   f1 roster: 10/10
```

Epic-3 có 99 ca, tất cả xanh. Các ca này đã được chạy đỏ trước khi code (`is not a function`).

`npm run test:stitch-setup`: 36 file. 35 file PASS, gồm cả lat-0/a/b/c, epic-2 và 7 file epic-3. File RED là `epic-1/ui-contract.test.js` (4/5).
- **Lỗi này có từ trước, không do F1.** Test tìm chuỗi có `\n` trong `app/giai-dau/v2/setup-v3/steps/StepDraw.js`. Worktree checkout file đó với CRLF (`core.autocrlf=true`), trong khi blob ở HEAD là LF.
- Đã kiểm: thay `\r\n` thành `\n` thì chuỗi khớp (`true`). F1 không đụng file này.
- Muốn test xanh thì sửa test cho bỏ `\r`, hoặc checkout LF.

`node tests/phase3/interclub-competition.test.js` cho kết quả `phase3 interclub competition ok`.

## 6. Lệch spec và chỗ spec mơ hồ (đã chọn phương án an toàn hơn, cần architect duyệt)

1. **`UNAUTHENTICATED` không nằm trong `setupMessages`.** Spec §7 muốn đặt câu "Cần đăng nhập CLB để mở lời mời." ở đó. Nhưng `StudioChrome.js` gọi `messageFor(save.error.code)` khi lưu nháp setup lỗi, nên lỗi hết phiên lúc lưu nháp sẽ hiện câu về lời mời. Câu này được chuyển sang `friendlyInviteLink.INVITE_LINK_MESSAGES`. `SETUP_PAYLOAD_INVALID` cũng giữ câu cũ của Lát 0, không đổi thành "Dữ liệu gửi lên không hợp lệ.".
2. **`registrationWindow` có thêm lý do `NOT_FRIENDLY`.** Spec §3.2 ghi điều kiện "giải là friendly" nhưng enum lý do không có giá trị cho trường hợp này. Giải không phải friendly, hoặc thiếu `settings`, thì cửa sổ đóng (fail closed). Thứ tự ưu tiên: `FINALIZED` > `NOT_FRIENDLY` > `LOCKED` > `DEADLINE_PASSED`. `rosterLockStatus` khác `'open'` (kể cả thiếu) tính là `FINALIZED`. Hạn chót không parse được tính là `DEADLINE_PASSED`. Đúng mốc hạn chót thì đã đóng (`now >= deadline`).
3. **Payload thông báo chủ nhà có thêm `tournamentId` và `divisionId`.** Spec §5.2 không liệt kê hai khóa này, nhưng href §3.4 lại cần chúng (`?tournamentId=&divisionId=&step=2`). Đây là giải của chính chủ nhà nên không lộ gì. Payload khách vẫn lọc theo allowlist, không có `tournamentId` hay `group_id`. Nếu thiếu id thì href là `/giai-dau/v2`. `friendly_sync_notifications` (110) phải ghi hai khóa này.
4. **Diễn giải "`invited`…`approved`" trong bảng §4 (`remove`).** Chọn nghĩa là 5 trạng thái còn hiệu lực, không gồm `declined`, cho nhất quán với §5.1.
5. **Ai được mở link ở trạng thái `declined`.** Bảng §5.3 chỉ trả 404 cho `withdrawn`. Vì vậy `declined` còn cửa sổ mở trả 200 và dẫn tới trang lời mời chỉ đọc; `accept` từ `declined` không có trong bảng nên không đáp lại được.
6. **`statusLabel(status, side)`.** `side` là phía đang xem. Với `withdrawn`, chủ nhà thấy "Đã rút" (theo F3 §3.2), khách thấy "Đã huỷ mời". DB không lưu ai là bên rút.
7. **`resolveParticipantClubAccess`.** Spec viết "sai role → 403", nhưng hàm kiểm CLB trước role: thành viên của CLB không được mời nhận 404 chứ không phải 403, để không phân biệt được có dòng hay không. Hàm cũng kiểm thêm dòng phải khớp `tournament_id`/`group_id` của giải. Không có phiên thì trả 404, theo đúng câu "mọi trường hợp còn lại → 404".
8. **Chủ nhà chỉ thấy ảnh chụp `submitted` ở `roster_submitted`, `approved` và `changes_requested`.** Sau `unsubmit` (về `accepted`) hoặc khi `withdrawn`, ảnh cũ vẫn nằm trong DB nhưng không hiện. Spec không nói rõ trường hợp này.
9. **Kiểm thêm so với spec.** `validateClubRosterForSubmit` còn chặn một người ở hai cặp, pairId trùng hoặc sai, và ref không thuộc `memberIds`, tất cả bằng `SETUP_PAYLOAD_INVALID`, khớp kiểm `save_roster` của RPC. Blocker khách mời đếm cả ref `guest:` nằm trong `unpairedRefs`.
10. **`parseFriendlyPairKey` trả chuỗi, không trả số,** để khứ hồi đúng với bigint và số 0 đứng đầu. F2 so với `row.id` bằng `String(...)`.
11. **`projectInvitationForGuest` có thêm khóa `actions`.** Khóa này là danh sách hành động hợp lệ ngay lúc gọi, UI dùng để bật/tắt nút. `startTime` lấy từ `tournaments.settings.start_time` (migration 094/100), vì bảng `tournaments` không có cột giờ.
12. **D49 (cấm khách mời phía chủ nhà) chưa làm ở F1.** Việc này thuộc blocker Bước 2 và finalize của F2, F1 domain không có điểm chạm nào.

## 7. Việc cho api-dev

- Viết `f1-api-contract.test.js` và so các khối SQL theo §4.
- Route khách: gọi `normalizeClubRoster` rồi `validateClubRosterForSave` / `validateClubRosterForSubmit` với `members` lấy từ `club_members.group_id = session.group_id`, trong đó `active` = thành viên đang hoạt động và `hasAthlete` = có `athletes.legacy_club_member_id`.
- `GET /clubs`: dùng `guestClubLimitView({ maxGuestClubs: (await resolveFriendlyEntitlements(...)).maxGuestClubs, rows })` và `registrationWindow`.
- Route resolve link: kiểm `isInviteTokenShape` trước khi truy vấn. Row chỉ select `id, club_id, group_id, tournament_id, invitation_status`, rồi gọi `decideInviteLink`. Giải và division chỉ nạp khi mã CLB khớp.
