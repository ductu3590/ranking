# Lát F2 — Chốt giải giao hữu, rải CLB khi bốc thăm, BXH tổng CLB

Trạng thái: spec · Phụ thuộc: F1 (migration 110 đã apply, `friendlyClubs.js`, `friendlyEntitlements.js`) · Xem [README](README.md)
Không có UI (D44): lát này giao domain + route + migration 111; kiểm bằng node test + kiểm thử tích hợp SQL ROLLBACK.

## 1. Mục tiêu

Bản nháp setup v3 của chủ nhà chạy được chế độ `friendly`: Bước 3/4 thấy **cặp hiệu lực** = cặp của chủ nhà + cặp của
CLB khách đã duyệt; bốc thăm **rải cặp cùng CLB** ra các bảng / nửa nhánh (D41, cảnh báo không chặn); chốt giải qua
**cùng** pipeline `buildSetupPlan` → `finalize_internal_setup_v4` (nhánh friendly kiểm thành viên theo đúng CLB, chặn hạn
mức CLB khách D46); sau chốt có **BXH tổng CLB** (D40, đối đầu hai CLB với tài khoản thường) cho bàn điều hành và trang
công khai. Giải nội bộ **không đổi một byte** (fingerprint plan, thân phần chủ nhà của finalize).

## 2. File (ownership của lát)

| File | Việc |
|---|---|
| `lib/tournament/setupDraftV3.js` (sửa) | `normalizeTournament` giữ `organizerMode ∈ {'internal','friendly'}` (khác → `'internal'`) |
| `lib/tournament/friendlySetup.js` (mới, thuần) | Cặp hiệu lực, `entryClubs`, readiness giao hữu (§3.2) |
| `lib/tournament/friendlyServer.js` (mới, I/O nhận `db`) | `loadFriendlyContext(db, { groupId, tournamentId })` (§3.3) |
| `lib/tournament/setupStepRules.js` (sửa) | Bước 3/4 dùng `ctx.friendly` khi có (§3.4) |
| `lib/tournament/setupReadiness.js` (sửa nếu cần) | Truyền `ctx.friendly` xuống step rules; không đổi khi `ctx.friendly` vắng |
| `lib/tournament/setupServer.js` (sửa) | `setupContext` nhận `friendly` tùy chọn; `participantNames` thêm tên cặp khách |
| `lib/tournament/setupPlans/clubSpread.js` (mới, thuần) | Rải CLB cho bảng và cho thứ tự hạt giống nhánh (§4) |
| `lib/tournament/setupPlans/index.js`, `groupKnockout.js`, `knockout.js`, `doubleElim.js` (sửa) | Nhận `entryClubs` tùy chọn; vắng hoặc < 2 CLB → **đúng đường cũ** |
| `app/api/tournament-v2/setup/route.js` (sửa) | View có khối `friendly`; `ORGANIZER_MODE_LOCKED` |
| `app/api/tournament-v2/preview-schedule/route.js` (sửa) | Dựng plan từ cặp hiệu lực + `entryClubs` |
| `app/api/tournament-v2/setup/finalize/route.js` (sửa) | Như preview + `p_plan.friendly` + tự bật link công khai (§5) |
| `lib/tournament/publicSlug.js` (mới) | Tách `generateSlug` khỏi `tournaments/route.js` để finalize dùng chung (không đổi thuật toán) |
| `app/api/tournament-v2/tournaments/route.js` (sửa nhỏ) | Import `generateSlug` từ `publicSlug.js` |
| `database/migrations/111_finalize_v4_friendly.sql` (mới) | §6 |
| `lib/tournament/friendlyStandings.js` (mới, thuần) | BXH tổng CLB, màu CLB, `countsForRanking` (§7) |
| `app/api/tournament-v2/friendly/standings/route.js` (mới) | BXH CLB cho bàn điều hành |
| `app/api/tournament-v2/public/route.js` (sửa) | Thêm khối `friendly` vào snapshot công khai (allowlist) |
| `lib/tournamentV2Client.js` (sửa — integrator) | `getFriendlyStandings` |
| `tests/stitch-setup/epic-3/f2-*.test.js` (mới) | §9 |
| `scripts/qa/epic-3-f2-integration.js` → `database/tests/epic_3_f2_friendly_finalize.sql` (mới) | §10 |

Không sửa: `draw.js` (FROZEN — luồng v4 không dùng nó), `setupContract.js`, `engines/roundRobin.js`, `engines/knockout.js`,
`seeding.js`, `interclub.js` (chỉ gọi `aggregateClubStandings`), `wizardModel.js`, 110.

## 3. Bản nháp `friendly` và cặp hiệu lực

### 3.1 Chế độ

- `normalizeTournament(raw).organizerMode` = `raw.organizerMode` nếu thuộc `{'internal','friendly'}`, ngược lại `'internal'`.
  Bản nháp nội bộ hiện có không có khóa này hoặc là `'internal'` → không đổi (test snapshot Lát 0).
- `setup/route.js` (lưu): nếu giải đã tồn tại và `draft.tournament.organizerMode !== tournaments.settings.organizer_mode`
  → 409 `ORGANIZER_MODE_LOCKED` (không gọi RPC). Lần lưu đầu (tạo giải) ghi chế độ qua `_v1` như hiện nay.
- Bước 2 của chủ nhà giữ nguyên luật (`ROSTER_EMPTY`: chủ nhà vẫn cần ≥ 2 người — "chỉ tổ chức, không đánh" ngoài phạm vi).

### 3.2 `lib/tournament/friendlySetup.js`

```js
HOST_CLUB_KEY = 'host'
clubKeyOf(pairId) → parseFriendlyPairKey(pairId) ? 'tc:' + tournamentClubId : HOST_CLUB_KEY
approvedGuestPairs(clubRows) → [{ pairId: friendlyPairKey(row.id, row.roster_approved_version, p.pairId),
                                  participantRefs, tournamentClubId: row.id, clubName, memberNames }]
                               // chỉ dòng status='approved', đọc từ roster_submitted, theo thứ tự row.id rồi thứ tự cặp
effectivePairs(draft, friendly) → [...draft.pairs (club: host), ...friendly.approvedPairs]   // friendly vắng → draft.pairs
entryClubs(pairs) → { [pairId]: clubKey }                          // chỉ dựng khi giải friendly
friendlyReadiness({ clubRows, hostPairCount, maxGuestClubs })
  → { blockers:[{code, params}], warnings:[…] }
  // FRIENDLY_CLUB_NOT_READY {clubs:[tên]}  — còn dòng khách ∉ {approved, declined, withdrawn}
  // FRIENDLY_CLUB_LIMIT_REACHED {max}      — số dòng khách approved > maxGuestClubs (vd sau khi hạ gói)
  // FRIENDLY_CLUBS_TOO_FEW                 — số CLB có ≥ 1 cặp (chủ nhà + khách approved) < 2
  // FRIENDLY_ATHLETE_DUPLICATE {name}      — cần athleteIds; tính ở friendlyServer, domain nhận map sẵn
  // cảnh báo FRIENDLY_CLUB_DECLINED {clubs} — CLB đã từ chối/rút (thông tin, không chặn)
```

### 3.3 `lib/tournament/friendlyServer.js`

`loadFriendlyContext(db, { groupId, tournamentId })` → `null` nếu `settings.organizer_mode ≠ 'friendly'`; ngược lại
`{ clubRows, approvedPairs, entitlements, readiness, clubs }` với: `clubRows` = `tournament_clubs.eq('group_id',
groupId).eq('tournament_id', tournamentId)` trừ dòng chủ nhà (chọn cột roster, **không** `roster_draft`,
`invite_token_hash`); tên CLB từ `groups`; `entitlements = resolveFriendlyEntitlements`; athleteIds của thành viên trong
cặp đã duyệt + cặp chủ nhà (một truy vấn `athletes.in('legacy_club_member_id', ids)`) để phát hiện trùng VĐV.

### 3.4 Luật bước (`setupStepRules.js`)

Chỉ khi `ctx.friendly` có mặt:

| Bước | Thay đổi |
|---|---|
| 3 | Kiểm cặp của chủ nhà **như cũ** (trên `draft.pairs`). Đếm số cặp cho `minPairs/maxPairs/recommended` trên `effectivePairs`. Thêm blocker/cảnh báo của `friendlyReadiness` (bước 3, trường `clubs`) |
| 4 | `planInputSignature` tính trên `effectivePairs(...).map(pairId)` → duyệt lại / rút / yêu cầu sửa sau khi bốc làm `DRAW_STALE` tự nhiên. Cảnh báo plan `FRIENDLY_CLUB_SPREAD_LIMITED` đọc thêm `plan.clubSpread` để có tên CLB |

`ctx.friendly` vắng → mọi hàm cho kết quả **bằng đúng** trước Epic 3 (test hồi quy trên fixture Lát 0/A/B/C).

### 3.5 View setup (`GET`/`POST /api/tournament-v2/setup`)

Khi giải friendly, response thêm:

```json
"friendly": {
  "limit": { "max": 1, "used": 1, "remaining": 0, "reached": true, "upgradeHint": "…" },
  "window": { "deadline": null, "lockedAt": null, "open": true, "reason": null },
  "clubs": [{ "tournamentClubId": 881, "name": "CLB Test Responsive UI", "status": "approved", "statusLabel": "Đã duyệt", "pairCount": 3, "color": "#0e7490" }],
  "approvedPairs": [{ "pairId": "c881.7.pair_x", "tournamentClubId": 881, "clubName": "CLB Test Responsive UI",
                      "members": [{ "name": "Nguyễn Văn A" }, { "name": "Trần B" }] }],
  "hostClub": { "name": "CLB Test 23.9.2026", "color": "#7c3aed" }
}
```

`approvedPairs` chỉ có tên (không `memberId`, không điện thoại) — đủ cho Bước 3 chỉ đọc và Bước 4 hiện tên.

## 4. Rải CLB khi bốc thăm — `lib/tournament/setupPlans/clubSpread.js` (D41)

Chính sách = `spread_if_possible` của `distributeEntriesAcrossPools` (ít cặp cùng CLB nhất trước, không đủ chỗ thì cảnh
báo). **Không gọi thẳng** hàm đó vì: (a) nó không tôn trọng kích thước bảng cố định `dealtGroupSizes` (bảng A 4 / B 3) →
`GROUP_DEAL_MISMATCH`; (b) nó xáo bằng PRNG số của `interclub.js`, khác PRNG chuỗi của `setupPlans` → fingerprint không còn
chỉ phụ thuộc `seed`. Test khóa: với sức chứa không ràng buộc, số cặp mỗi CLB mỗi bảng của `spreadIntoGroups` bằng của
`distributeEntriesAcrossPools` trên cùng đầu vào đã sắp.

```js
spreadIntoGroups({ shuffledIds, entryClubs, groupCount, sizes /* dealtGroupSizes */, seed })
  → { groups: [{ label, entryIds }], clubSpread: [{ clubKey, count, perGroup:{A:2,B:2}, limited:boolean }] }
// 1) Xếp CLB theo số cặp giảm dần (hoà: 'host' trước, rồi tournamentClubId tăng); trong mỗi CLB giữ thứ tự shuffledIds.
// 2) Chia bài vòng tròn qua các bảng, bắt đầu ở bảng seededIndex('club-spread:' + seed, groupCount), liên tục qua các
//    CLB, bỏ qua bảng đã đủ sức chứa.
// 3) limited = một bảng có ≥ 2 cặp của CLB đó.
spreadSeedOrder({ shuffledIds, entryClubs, seed }) → { order, clubSpread }
// Cho knockout / double_elimination: vị trí nhánh của hạt giống s lấy từ seeding.seedOrder(nextPowerOfTwo(n)); chia đệ
// quy cây nhánh (nửa → tư → …), mỗi tầng đặt cặp theo thứ tự CLB như trên vào nửa có ít cặp cùng CLB hơn, hoà thì nửa
// còn nhiều chỗ thật hơn, hoà nữa thì theo shuffledIds. Chỗ trống (bye) giữ đúng vị trí engine đặt. Trả thứ tự hạt giống
// mới để đưa vào engine như cũ. limited = hai cặp cùng CLB chung một nửa nhánh.
```

Nối vào builder: `buildSetupPlan({ …, entryClubs })` chuyển `entryClubs` xuống builder. Trong builder: nếu `entryClubs`
vắng hoặc số CLB khác nhau < 2 → **giữ nguyên dòng code cũ** (`index % groupCount`, thứ tự `seededShuffle`); ngược lại
dùng `clubSpread`. Plan thêm `clubSpread` và mã `FRIENDLY_CLUB_SPREAD_LIMITED` vào `warnings` khi có CLB `limited`.
`round_robin` (một bảng) không cần rải. `planInputSignature` **không** thêm `entryClubs`: CLB suy ra được từ `pairId` (khóa
khách mang `tournamentClubId`), nên chữ ký đã đổi khi tập CLB đổi — và giải nội bộ giữ chữ ký cũ.

Ví dụ khóa (README §9): G1 (59 = 4, khách = 3, `2x2`) → A = 2 + 2, B = 2 + 1, hai CLB `limited`; G-core3 (3/2/2) → A =
2 cặp 59 + 1 A + 1 B, B = 1 + 1 + 1, chỉ 59 `limited`; G-core3-KO (2/2/2, nhánh 8) → mỗi CLB một cặp mỗi nửa, không
`limited`; G2-KO (4/3, nhánh 8, 1 bye) → nửa đủ 4 chỗ = 2 + 2, nửa 3 chỗ = 2 + 1, cả hai `limited`.

## 5. Route preview và finalize

`preview-schedule` (bốc / xem lại) và `setup/finalize` cùng một đoạn, đặt trong `friendlyServer.js`:

```js
const friendly = await loadFriendlyContext(db, { groupId, tournamentId });   // null với giải nội bộ
const ctx = await setupContext(db, groupId, draft, { friendly });
const blocker = firstBlocker(draft, ctx, 3 /* preview */ | 4 /* finalize */);
const pairs = effectivePairs(draft, friendly);
const plan = buildSetupPlan({ formatKey, config, pairIds: pairs.map((p) => p.pairId), seed, divisionId,
                              ...(friendly ? { entryClubs: entryClubs(pairs) } : {}) });
```

Finalize thêm: so fingerprint như cũ (`DRAW_STALE`); `p_plan = { ...plan, pairs: pairs.map(({ pairId, participantRefs })
=> ({ pairId, refs: participantRefs })), ...(friendly ? { friendly: { maxGuestClubs: friendly.entitlements.maxGuestClubs } } : {}) }`;
`RPC_CODES` thêm các mã §8. Sau RPC thành công **và** giải friendly: nếu `visibility = 'private'` → cập nhật
`visibility = 'unlisted'`, `public_slug = generateSlug(name)` nếu chưa có (lỗi bước này chỉ log, như
`prepare_tournament_after_finalize`; README §11 câu 3). Response thêm `publicUrl`.

## 6. Migration 111 — `111_finalize_v4_friendly.sql`

`CREATE OR REPLACE FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb)` dựng từ thân
**108**, giữ chữ ký, `SECURITY DEFINER SET search_path = public`, REVOKE/GRANT như 108. Khác 108 đúng ở:

1. **Kiểm bản nháp:** `COALESCE(v_draft->'tournament'->>'organizerMode','') <> 'internal'` →
   `NOT IN ('internal','friendly')`; thêm `v_mode := v_draft->'tournament'->>'organizerMode'`; `friendly` mà
   `t.settings->>'organizer_mode' IS DISTINCT FROM 'friendly'` → `FINALIZE_DRAFT_INVALID`.
2. **Khối `-- friendly:begin` (kiểm)** đặt ngay trước khối kiểm cặp, chỉ chạy khi `v_mode = 'friendly'`:
   - `v_max_guest := (p_plan->'friendly'->>'maxGuestClubs')::integer` (bắt lỗi ép kiểu); NULL / < 1 / > 31 → `FINALIZE_PLAN_INVALID`.
   - `PERFORM 1 FROM tournament_clubs WHERE tournament_id = p_tournament_id AND group_id = p_group_id AND club_id IS DISTINCT
     FROM p_group_id ORDER BY id FOR UPDATE` (thứ tự khoá division → tournament → club).
   - Dòng khách ∉ {`approved`,`declined`,`withdrawn`} → `FRIENDLY_CLUB_NOT_READY` (PH409). Dòng `external_club_id IS NOT
     NULL` và `approved` → `EXTERNAL_CLUB_NOT_SUPPORTED`. `count(approved) > v_max_guest` → `FRIENDLY_CLUB_LIMIT_REACHED` (PH409).
   - Dựng `v_guest_pairs` từ `roster_submitted->'pairs'` của các dòng `approved` (theo `id`, rồi thứ tự cặp): phần tử
     `{ pairId: 'c'||id||'.'||roster_approved_version||'.'||pairId, participantRefs, tournamentClubId: id, clubId: club_id }`;
     `roster_approved_version IS NULL` → `FRIENDLY_CLUB_NOT_READY`.
   - Tập `pairId` khách trong `p_plan->'pairs'` (khớp regex khóa khách) phải **bằng** tập của `v_guest_pairs` →
     nếu không `FRIENDLY_ROSTER_CHANGED` (PH409).
   - Ref khách chỉ `^member:[1-9][0-9]*$` (`FRIENDLY_GUEST_NOT_ALLOWED`); thuộc `roster_submitted->'memberIds'` của chính
     dòng (`PAIRING_INVALID`); `club_members.group_id = clubId AND is_active IS DISTINCT FROM false`
     (`MEMBER_NOT_ACTIVE_IN_GROUP`); có `athletes.legacy_club_member_id` (`ATHLETE_IDENTITY_MISSING`); số cặp mỗi dòng ≤
     `quota` nếu có (`FRIENDLY_QUOTA_EXCEEDED`).
   - Không `athlete_id` nào xuất hiện ở hai CLB (gộp thành viên chủ nhà + khách) → `FRIENDLY_ATHLETE_DUPLICATE`
     (trước khi chạm unique `(tournament_id, athlete_id)` của `tournament_athletes`).
   - Số CLB có ≥ 1 cặp (chủ nhà nếu `jsonb_array_length(v_draft->'pairs') > 0`, cộng mỗi dòng khách có cặp) < 2 →
     `FRIENDLY_CLUBS_TOO_FEW`.
   - `v_pairs := v_draft->'pairs' || v_guest_pairs`. **`-- friendly:end`**. Nhánh nội bộ: `v_pairs := v_draft->'pairs'`.
3. **Khối kiểm cặp của 108:** mọi `v_draft->'pairs'` → `v_pairs` (đếm `v_pair_count`, khớp `p_plan->'pairs'`, hai ref khác
   nhau, không ref trùng) **trừ** mệnh đề "ref thuộc `participants.memberIds`/`guests` của bản nháp" — mệnh đề này đổi
   thành duyệt `v_draft->'pairs'` (giữ nguyên chữ 108) vì cặp khách đã kiểm ở bước 2. `v_participant_count` = số người
   bản nháp + `2 × jsonb_array_length(v_guest_pairs)` (0 với nội bộ). Mọi kiểm cấu trúc plan theo `v_pair_count` giữ nguyên.
4. **Khối `-- friendly:begin` (ghi)** đặt ngay sau vòng "Cặp → entry" của chủ nhà: với mỗi dòng khách `approved` —
   `v_club_tc_id = id`, `v_club_name = groups.name`; mỗi ref của các cặp: nạp athlete + `full_name` theo `club_id` của
   dòng, `INSERT tournament_athletes(group_id=p_group_id, tournament_id, tournament_club_id=v_club_tc_id, athlete_id,
   display_name_snapshot, club_name_snapshot=v_club_name, source='club_member')`, vào `tournament_division_roster_members`;
   mỗi cặp: `tournament_pairs` → `tournament_entries(tournament_club_id = v_club_tc_id)` → `tournament_pair_members`,
   `tournament_entry_members(club_name_snapshot = v_club_name)`; ghi `v_pair_entries[pairId khách] = entry_id`.
   **`-- friendly:end`**. Phần ghi chủ nhà (VĐV, khách mời, cặp), stage, bảng, trận, tuyến, cập nhật division, idempotency
   **không đổi một ký tự** — `v_pair_entries` đã có đủ khóa nên vòng ghi bảng/trận nhận cả cặp khách.
5. `result` thêm `'friendly_clubs', <số CLB khách approved>` trong khối friendly (`v_result := v_result || …` trước khi lưu
   idempotency) — nội bộ không có khóa này.

Test khóa khác biệt (`f2-api-contract.test.js`): lấy thân 111, xoá mọi đoạn giữa `-- friendly:begin` và `-- friendly:end`,
thay `v_pairs` → `v_draft->'pairs'`, `NOT IN ('internal', 'friendly')` → `<> 'internal'`, bỏ các dòng khai báo biến mới
(được đánh dấu `-- friendly:decl`), chuẩn hoá khoảng trắng → **bằng đúng** thân 108.

## 7. BXH tổng CLB (D40) và D43

### 7.1 `lib/tournament/friendlyStandings.js`

```js
CLUB_COLORS = ['#7c3aed' /* chủ nhà, brand */, '#0e7490', '#b45309', '#be185d', '#15803d', '#1d4ed8', …]
clubPalette(clubs) → Map(tournamentClubId → color)   // chủ nhà màu 0; khách theo tournament_clubs.id tăng dần
computeFriendlyClubStandings({ clubs, entries, matches, games })
// clubs:   [{ tournamentClubId, name, isHost }]
// entries: [{ id, tournamentClubId }]
// matches: [{ id, entryAId, entryBId, winnerEntryId, status }]  — mọi stage của division
// games:   [{ matchId, scoreA, scoreB }]
// → chuẩn hoá sang đầu vào aggregateClubStandings: trận `status ∈ {'finalized','done'}` → 'done', points_a/b = tổng
//   điểm các ván (W.O. dùng tỉ số W.O. đã ghi ở 096); club_id = tournamentClubId.
// → { rows: [{ rank, tournamentClubId, name, color, isHost, played, won, lost, pointsFor, pointsAgainst, diff, pairCount }],
//     headToHead: rows.length === 2 ? { left, right, wins: [w0, w1] } : null,
//     counts: { interclubDone, internalDone } }
countsForRanking({ settings }) → settings?.organizer_mode !== 'friendly'     // D43
```

Thứ hạng lấy nguyên thứ tự `aggregateClubStandings` trả (điểm trận, rồi tiebreak `legacy_v2`) — không viết luật hạng
mới. Trận nội bộ một CLB bị `aggregateClubStandings` bỏ qua (đúng ý: không tính cho ai).

### 7.2 API

**`GET /api/tournament-v2/friendly/standings?tournamentId=`** — `requireTournamentAccess({ tournamentId, need: 'read' })`
(admin + thành viên chủ nhà); giải không friendly → 404 `FRIENDLY_MODE_REQUIRED`. Nạp `tournament_clubs` (id, club_id,
tên), entries của division v3, matches + games mọi stage. Trả `computeFriendlyClubStandings(...)` + `clubs` (tên, màu).

**`GET /api/tournament-v2/public`** — khi `settings.organizer_mode = 'friendly'` thêm (allowlist):

```json
"friendly": {
  "clubs": [{ "tournamentClubId": 880, "name": "CLB Test 23.9.2026", "color": "#7c3aed", "isHost": true },
            { "tournamentClubId": 881, "name": "CLB Test Responsive UI", "color": "#0e7490", "isHost": false }],
  "entryClubs": { "5012": 880, "5013": 881 },
  "clubStandings": { "rows": [ … ], "headToHead": { … } }
}
```

Không thêm `club_id` (group id), logo data-URL hay thành viên.

### 7.3 D43

Hiện không có pipeline nào đọc kết quả giải vào xếp hạng (`ranking_snapshots` chỉ đọc `quy_pickleball`). Test khóa:
`countsForRanking` = false với giải friendly; quét mã `lib/` + `app/api/`: file nào ghi `ranking_snapshots` thì không đọc
bảng `tournament_*` (nếu sau này có, test đỏ buộc gọi `countsForRanking`).

## 8. Mã lỗi mới

| Mã | HTTP | Văn bản | Bước |
|---|---|---|---|
| `ORGANIZER_MODE_LOCKED` | 409 | Không đổi được loại giải sau khi đã tạo. | 1 |
| `FRIENDLY_CLUB_NOT_READY` | 409 | Còn CLB chưa được duyệt danh sách: {clubs}. Duyệt, yêu cầu sửa hoặc rút CLB trước khi bốc thăm. | 3 |
| `FRIENDLY_CLUBS_TOO_FEW` | 409 | Giải giao hữu cần ít nhất 2 CLB có cặp thi đấu. | 3 |
| `FRIENDLY_CLUB_LIMIT_REACHED` | 409 | (như F1) | 3 |
| `FRIENDLY_ATHLETE_DUPLICATE` | 409 | {name} có tên trong danh sách của hai CLB. | 3 |
| `FRIENDLY_ROSTER_CHANGED` | 409 | Danh sách CLB khách vừa thay đổi. Bốc thăm lại trước khi chốt. | 4 |
| `FRIENDLY_QUOTA_EXCEEDED`, `FRIENDLY_GUEST_NOT_ALLOWED`, `EXTERNAL_CLUB_NOT_SUPPORTED` | 409 | (như F1) | 3 |
| `FRIENDLY_CLUB_SPREAD_LIMITED` (cảnh báo) | — | {club} có {count} cặp cho {groupCount} bảng/nửa nhánh: có cặp cùng CLB gặp nhau sớm. | 4 |
| `FRIENDLY_CLUB_DECLINED` (cảnh báo) | — | {clubs} đã từ chối hoặc đã rút. | 3 |
| `FRIENDLY_MODE_REQUIRED` | 404 (standings) | Giải này không phải giải giao hữu liên CLB. | — |

## 9. Test node — `tests/stitch-setup/epic-3/`

| File | Ca bắt buộc |
|---|---|
| `f2-effective-pairs.test.js` | `approvedGuestPairs` chỉ lấy `approved`, khóa đúng `c<id>.<ver>.<pairId>`, thứ tự ổn định; `effectivePairs` không friendly = `draft.pairs` (cùng tham chiếu nội dung); `friendlyReadiness`: không sẵn sàng / quá hạn mức (truyền `maxGuestClubs` 1 và 2) / < 2 CLB / trùng VĐV / cảnh báo từ chối; `normalizeTournament` giữ `friendly`, giá trị lạ → `internal` |
| `f2-step-rules.test.js` | Bước 3 đếm cặp hiệu lực (4 + 3 = 7 qua `minPairs` 6 của `2x2`); blocker `FRIENDLY_CLUB_NOT_READY` khi còn `roster_submitted`; Bước 4 `DRAW_STALE` khi `approved_version` đổi sau bốc; **không có `ctx.friendly` → kết quả bằng đúng trước Epic 3** trên fixture Lát 0/A/B/C |
| `f2-club-spread.test.js` | Các ví dụ khóa §4 (G1, G-core3, G-core3-KO, G2-KO) đúng phân bố + cờ `limited` + số trận (12 / 12 / 5 / 6; +1 khi tranh hạng ba); kích thước bảng luôn bằng `dealtGroupSizes`; cùng `seed` → cùng plan, khác `seed` → vị trí khác; **ca 14 người nội bộ không `entryClubs`: fingerprint bằng hằng số ghi trước Epic 3**; đối chứng `distributeEntriesAcrossPools` (sức chứa không ràng buộc); G2-KO: không trận vòng 1 nào là nội bộ một CLB (chia đệ quy tới tầng tư nhánh); double elimination 2 CLB × 4 cặp: hai nửa nhánh thắng mỗi nửa 2 + 2 |
| `f2-standings.test.js` | 2 CLB: trận nội bộ không tính; `won(59) + won(khách) = played(59) = played(khách)`; W.O. tính thắng; trận chưa chốt không tính; `headToHead` chỉ khi đúng 2 CLB; 3 CLB (ca core) xếp hạng theo `aggregateClubStandings`; màu chủ nhà luôn `CLUB_COLORS[0]`; `countsForRanking`; quét D43 |
| `f2-api-contract.test.js` | Diff 111 ↔ 108 (§6); 111 không `DROP`/`TRUNCATE`/`DELETE FROM`; có `FOR UPDATE` trên `tournament_clubs` trong khối friendly; `p_plan->'friendly'->>'maxGuestClubs'` được đọc; route finalize và preview gọi `loadFriendlyContext` + `effectivePairs`, không đọc `maxGuestClubs` từ body; finalize chỉ thêm `friendly` vào `p_plan` khi giải friendly; `public/route.js` chỉ chiếu khóa allowlist của `friendly`; `setup/route.js` có `ORGANIZER_MODE_LOCKED`; SQL tích hợp kết thúc `ROLLBACK;` |
| Hồi quy | `npm run test:stitch-setup` toàn bộ (ca 14 người = 12 trận, 13 khi hạng ba; 15 người bị chặn) |

## 10. Kiểm thử tích hợp SQL (ROLLBACK)

`scripts/qa/epic-3-f2-integration.js` sinh `database/tests/epic_3_f2_friendly_finalize.sql`: nạp thân 110 (nếu chưa apply)
+ thân 111; tạo trong transaction giải friendly của 59 và hai group tạm A, B như F1; dùng RPC F1 để mời/nhận/gửi/duyệt;
plan dựng sẵn bằng node (`buildSetupPlan` + `entryClubs`) nhúng vào file SQL như Lát C.

| Kịch bản | Kiểm |
|---|---|
| G1 (2 CLB, `maxGuestClubs = 1`) | 59 = 4 cặp, A = 3 cặp approved → finalize thành công: 7 entry (4 `tournament_club_id` chủ nhà, 3 của dòng A), 12 trận, 2 stage, 4 tuyến + trận chờ; `club_name_snapshot` của VĐV A = tên group A; `tournament_athletes` của A có `group_id = 59` |
| G1 + hạng ba | 13 trận |
| G-core3 (`maxGuestClubs = 2`) | 59 = 3, A = 2, B = 2 → 12 trận; cùng dữ liệu với `maxGuestClubs = 1` → `FRIENDLY_CLUB_LIMIT_REACHED`, 0 dòng ghi |
| Chưa sẵn sàng | B còn `roster_submitted` → `FRIENDLY_CLUB_NOT_READY` |
| Roster đổi sau bốc | Duyệt lại A (version đổi) rồi finalize bằng plan cũ → `FRIENDLY_ROSTER_CHANGED` |
| Thành viên nghỉ | Tắt `is_active` một thành viên A sau khi duyệt → `MEMBER_NOT_ACTIVE_IN_GROUP` |
| Trùng VĐV | Cùng `athlete_id` ở 59 và A → `FRIENDLY_ATHLETE_DUPLICATE` |
| Một CLB | A `withdrawn`, 59 có cặp → `FRIENDLY_CLUBS_TOO_FEW` |
| Sau chốt | A gọi `save_roster` → `FRIENDLY_REGISTRATION_CLOSED` |
| Nội bộ không đổi | Chạy lại kịch bản 14 người của `stitch_lat_a_integration.sql` bằng 111 → kết quả bằng 108 |
| Sau rollback | 0 dòng tạm |

Apply (D45): ROLLBACK xanh → apply 111 → so `md5(prosrc)` → evidence.

## 11. Nghiệm thu lát F2

- Test §9 xanh, SQL §10 xanh trên production (ROLLBACK), 111 apply, md5 khớp.
- Gọi `preview-schedule` + `finalize` bằng phiên thật chỉ ở F3 (browser).

## 12. Không làm ở F2

UI (F3); rải CLB cho vòng loại trực tiếp sau vòng bảng; chủ nhà không có cặp; xếp hạng CLB tính theo điểm tùy biến (chỉ
dùng `aggregateClubStandings`); ghi kết quả giao hữu vào ranking (D43).
