# Epic 3 F2: bàn giao domain (engine-dev)

Nhánh `epic-3-friendly`. Commit `a500aff` (rải CLB + organizerMode) và commit `feat(giao-huu): Epic 3 F2 domain - cap hieu luc, rai CLB, BXH tong CLB`.
Phạm vi: domain thuần và test node. Chưa làm migration 111, route, `loadFriendlyContext` (I/O) hay UI. Những phần này là việc của api-dev, xem §7.
Nguồn: `docs/superpowers/specs/2026-09-25-epic-3-friendly/lat-f2-chot-giai-va-xep-hang-clb.md` (§3–§9 và phần "Bổ sung D49"), ADR-007 D40/D41/D43/D46/D49.

## 1. File

| File | Loại | Việc |
|---|---|---|
| `lib/tournament/setupDraftV3.js` | sửa | `normalizeTournament().organizerMode` giữ `'friendly'`. Giá trị khác `'internal'`/`'friendly'` thì về `'internal'` |
| `lib/tournament/setupPlans/clubSpread.js` | mới | Rải CLB cho vòng bảng và cho thứ tự hạt giống nhánh |
| `lib/tournament/setupPlans/{index,groupKnockout,knockout,doubleElim}.js` | sửa | Nhận thêm `entryClubs` (tùy chọn). Thiếu hoặc chỉ có 1 CLB thì chạy **đúng dòng code cũ** |
| `lib/tournament/friendlySetup.js` | mới | Cặp hiệu lực, `buildFriendlyContext`, `friendlyReadiness`, `finalizePlanPayload`, mã lỗi, hợp đồng SQL 111 |
| `lib/tournament/friendlyStandings.js` | mới | BXH tổng CLB, bảng màu, `countsForRanking` (D43) |
| `lib/tournament/setupStepRules.js` | sửa | Bước 2 (D49), Bước 3 (cặp hiệu lực + readiness CLB), Bước 4 (chữ ký trên cặp hiệu lực + cảnh báo rải CLB có tên). Chỉ đổi khi có `ctx.friendly` |
| `lib/tournament/setupServer.js` | sửa | `setupContext(db, groupId, draft, { friendly })`; `participantNames` thêm tên thành viên cặp khách |
| `lib/tournament/setupMessages.js` | sửa | Thêm câu cho 8 mã F2 (§3) |
| `tests/stitch-setup/epic-3/f2-{effective-pairs,step-rules,club-spread,standings}.test.js` | mới | 4 file, 51 ca |
| `tests/stitch-setup/epic-3/_f2Fixtures.js`, `_f2Baseline.js` | mới | Fixture. `_f2Baseline` là bộ bản nháp Lát 0/A/B/C cho khoá hồi quy |
| `tests/stitch-setup/epic-3/f1-roster.test.js` | sửa có chủ đích | Băm fixture #7 (`organizerMode:'friendly'`) đổi. Có thêm ca chứng minh fixture này chỉ khác trước F2 ở `organizerMode` |

Các file sau **không** bị sửa: `setupContract.js`, `engines/roundRobin.js`, `engines/knockout.js`, `draw.js`, `wizardModel.js`, `seeding.js`, `interclub.js`, `friendlyClubs.js`, `setupReadiness.js`. Riêng `setupReadiness.js` không cần sửa vì nó đã chuyển nguyên `ctx` xuống `validateStep`.

## 2. API

### `friendlySetup.js`

```js
HOST_CLUB_KEY = 'host' · FRIENDLY_READY_STATUSES = ['approved','declined','withdrawn']
clubKeyOf(pairId)        → 'tc:<tournamentClubId>' nếu là khóa khách (parseFriendlyPairKey), ngược lại 'host'
clubKeyForId(id)         → 'tc:<id>'
approvedGuestPairs(clubRows, { clubNames?, groupNames? })
  → [{ pairId:'c<id>.<ver>.<pairId>', sourcePairId, participantRefs, tournamentClubId:'<id>' (chuỗi), clubKey:'tc:<id>', clubName, memberNames:[tên theo ref] }]
  // Chỉ lấy dòng: approved, có roster_approved_version, không phải CLB ngoài, không phải dòng chủ nhà.
  // Thứ tự: id dòng tăng dần, sau đó theo thứ tự cặp trong roster_submitted.pairs. Cặp có pairId sai bị bỏ (111 sẽ báo FRIENDLY_ROSTER_CHANGED).
buildFriendlyContext({ clubRows, groupNames:{[groups.id]:name}, hostClubName, entitlements, athletes })
  → ctx.friendly = { clubRows (bỏ dòng chủ nhà, sort theo id, có gắn clubName), approvedPairs, entitlements,
                     maxGuestClubs (clampGuestClubLimit, thiếu → 1), clubNames:{host, 'tc:<id>'}, hostClubName, athletes }
effectivePairs(draft, friendly)   // không có friendly → trả đúng mảng draft.pairs; có → [...cặp chủ nhà có thêm clubKey:'host', ...approvedPairs]
entryClubs(pairs)                 // { [pairId]: clubKey }
friendlyReadiness({ clubRows, hostPairCount, maxGuestClubs, clubNames?, athletes? }) → { blockers:[{code, params?}], warnings }
finalizePlanPayload({ plan, pairs, friendly })
  → { ...plan, pairs:[{pairId, refs}] } và thêm friendly:{ maxGuestClubs } nếu là giải friendly
  // maxGuestClubs lấy từ ctx; giá trị ngoài 1–31 → throw code FINALIZE_PLAN_INVALID
projectApprovedPairs(pairs) → [{ pairId, tournamentClubId, clubName, members:[{name}] }]   // khối view §3.5, chỉ có tên
FRIENDLY_SETUP_CODES          // mã → { status, step, severity }
FRIENDLY_FINALIZE_SQL_CONTRACT  // hằng dùng để đối chiếu với 111 (xem §4)
```

`athletes` là mảng `[{ clubKey, memberId, athleteId, name }]` gồm mọi `participants.memberIds` của chủ nhà (`clubKey:'host'`) và mọi thành viên trong các cặp khách đã duyệt (`'tc:<id>'`). Route dựng mảng này bằng **một** truy vấn `athletes.in('legacy_club_member_id', ids)`.

### `setupPlans/clubSpread.js`

```js
compareClubKeys(a, b)                // thứ tự: 'host' trước, sau đó 'tc:<id>' theo id tăng dần (so như số, dạng chuỗi)
shouldSpread(ids, entryClubs)        // entryClubs là object và có ≥ 2 CLB; cặp không có CLB → throw ENTRY_CLUBS_INVALID
orderByClub(shuffledIds, entryClubs) // CLB nhiều cặp đứng trước; hoà thì theo compareClubKeys; trong một CLB giữ thứ tự shuffledIds
spreadIntoGroups({ shuffledIds, entryClubs, groupCount, sizes, seed, labels? })
  → { groups:[{label, entryIds}], clubSpread:[{ clubKey, count, perGroup:{A,B,…}, limited }] }
spreadSeedOrder({ shuffledIds, entryClubs, seed })
  → { order:[pairId theo hạt giống 1..n], clubSpread:[{ clubKey, count, perHalf:{top, bottom}, limited }] }
spreadWarnings(clubSpread) → ['FRIENDLY_CLUB_SPREAD_LIMITED'] | []
```

Plan (`buildSetupPlan({ …, entryClubs })`) có thêm hai thứ khi rải:
- khóa `clubSpread`;
- mã `FRIENDLY_CLUB_SPREAD_LIMITED` ở **cuối** `warnings`.

`planInputSignature` không thay đổi. Ở `round_robin`, tham số `entryClubs` bị bỏ qua.

### `friendlyStandings.js`

```js
CLUB_COLORS  // 10 màu; [0] '#7c3aed' là màu chủ nhà
clubPalette(clubs) → Map(String(tournamentClubId) → màu)
  // chủ nhà luôn nhận màu [0]; khách nhận từ [1] theo id tăng dần, hết thì quay vòng nhưng không bao giờ lấy lại [0]
computeFriendlyClubStandings({ clubs, entries, matches, games }) → { rows, headToHead, counts }
  // rows: [{ rank, tournamentClubId, name, color, isHost, played, won, lost, pointsFor, pointsAgainst, diff, pairCount }]
  // headToHead chỉ có khi đúng 2 dòng: { left: chủ nhà, right, wins:[w0, w1] }
  // counts: { interclubDone, internalDone }
countsForRanking({ settings }) → settings?.organizer_mode !== 'friendly'
```

Luật tính BXH CLB:
- Chỉ tính trận có `status ∈ {finalized, done}` **và** có `winnerEntryId`.
- Điểm = tổng điểm các ván. Trận W.O. dùng tỉ số W.O. đã ghi.
- Thứ hạng lấy nguyên từ `aggregateClubStandings`. Trận nội bộ trong một CLB không tính cho ai.
- Đầu vào được sắp theo (CLB, entry) trước, để kết quả bốc thăm khi hoà tuyệt đối không phụ thuộc thứ tự dòng DB trả về.
- CLB không có entry nào thì không có dòng.

### Luật bước với `ctx.friendly` (`setupStepRules.js`)

| Bước | Khi có `ctx.friendly` |
|---|---|
| 2 | `participants.guests.length > 0` → blocker `FRIENDLY_HOST_GUEST_NOT_ALLOWED {count}`, trường `guests` (D49). Nháp vẫn lưu được |
| 3 | Cặp chủ nhà vẫn kiểm như cũ trên `draft.pairs`. Blocker/cảnh báo của `friendlyReadiness` được thêm vào với step 3, trường `clubs`, và đứng **trước** blocker số cặp. `minPairs`/`maxPairs`/`recommended` đếm trên `effectivePairs` |
| 4 | `planInputSignature` và `drawGroupsChanged` tính trên `effectivePairs`. Cảnh báo `FRIENDLY_CLUB_SPREAD_LIMITED` tách thành một cảnh báo cho mỗi CLB bị `limited`, kèm params `{ club, clubKey, count, groupCount, unit:'group'\|'half' }` |

Không có `ctx.friendly` thì kết quả **bằng đúng** trước Epic 3. Test `f2-step-rules` khoá điều này bằng băm tính trên HEAD `b4b3652`, gồm 17 bản nháp × 3 ctx, cho `validateStep` bước 1–4, `computeCompletedThrough` và `computeSetupReadiness`.

## 3. Mã lỗi (`FRIENDLY_SETUP_CODES`, câu ở `setupMessages`)

| Mã | HTTP | Bước | Loại | params |
|---|---|---|---|---|
| `ORGANIZER_MODE_LOCKED` | 409 | 1 | blocker (route) | — |
| `FRIENDLY_HOST_GUEST_NOT_ALLOWED` | 409 | 2 | blocker | `{count}` |
| `FRIENDLY_CLUB_NOT_READY` | 409 | 3 | blocker | `{clubs:[tên]}` |
| `FRIENDLY_CLUB_LIMIT_REACHED` | 409 | 3 | blocker | `{max}` |
| `EXTERNAL_CLUB_NOT_SUPPORTED` | 409 | 3 | blocker | `{clubs}` |
| `FRIENDLY_GUEST_NOT_ALLOWED` | 409 | 3 | blocker | `{clubs}` |
| `FRIENDLY_QUOTA_EXCEEDED` | 409 | 3 | blocker | `{quota, count, club}` |
| `FRIENDLY_CLUBS_TOO_FEW` | 409 | 3 | blocker | — |
| `FRIENDLY_ATHLETE_DUPLICATE` | 409 | 3 | blocker | `{name, athleteId}` |
| `FRIENDLY_ROSTER_CHANGED` | 409 | 4 | blocker (chỉ phát từ RPC 111) | — |
| `FRIENDLY_CLUB_SPREAD_LIMITED` | — | 4 | cảnh báo | `{club, clubKey, count, groupCount, unit}` |
| `FRIENDLY_CLUB_DECLINED` | — | 3 | cảnh báo | `{clubs}` |
| `FRIENDLY_MODE_REQUIRED` | 404 (standings) | — | — | — |
| `ENTRY_CLUBS_INVALID` | (lỗi plan) | — | throw | `{pairId}` |

Thứ tự blocker trong `friendlyReadiness`: `NOT_READY` → `LIMIT_REACHED` → `EXTERNAL` → `GUEST_NOT_ALLOWED` → `QUOTA_EXCEEDED` → `CLUBS_TOO_FEW` → `ATHLETE_DUPLICATE`.

## 4. Migration 111 phải kiểm lại những gì

Nền là **108**, vì 109 và 110 không đụng tới `finalize_internal_setup_v4`. Toàn bộ danh sách nằm trong `FRIENDLY_FINALIZE_SQL_CONTRACT.differencesFrom108` (11 dòng). Test "111 chỉ khác 108 ở X" nên liệt kê đúng các điểm sau:

1. Ở bước kiểm bản nháp: `<> 'internal'` đổi thành `NOT IN ('internal', 'friendly')`. Thêm `v_mode`. Nếu bản nháp là `friendly` mà `settings.organizer_mode` không phải friendly → `FINALIZE_DRAFT_INVALID`.
2. **D49:** `v_mode = 'friendly'` và `jsonb_array_length(v_draft->'participants'->'guests') > 0` → `FRIENDLY_HOST_GUEST_NOT_ALLOWED`.
3. Đọc `(p_plan->'friendly'->>'maxGuestClubs')::integer` và bắt lỗi ép kiểu. NULL, < 1 hoặc > 31 → `FINALIZE_PLAN_INVALID`.
4. Khoá dòng CLB khách `FOR UPDATE ORDER BY id`, theo thứ tự khoá division → tournament → club.
5. Kiểm trạng thái dòng CLB khách:
   - Trạng thái ∉ `{approved, declined, withdrawn}`, hoặc `approved` mà version là NULL → `FRIENDLY_CLUB_NOT_READY`.
   - `approved` mà có `external_club_id` → `EXTERNAL_CLUB_NOT_SUPPORTED`.
   - Số dòng `approved` > hạn mức → `FRIENDLY_CLUB_LIMIT_REACHED`.
6. Dựng `v_guest_pairs` với khóa `'c'||id||'.'||roster_approved_version||'.'||pairId`, theo id dòng rồi thứ tự cặp. Nếu tập khóa này khác tập khóa khách trong `p_plan->'pairs'` → `FRIENDLY_ROSTER_CHANGED`.
7. Kiểm ref khách, mỗi điều kiện một mã:

   | Điều kiện | Mã |
   |---|---|
   | Khớp `^member:[1-9][0-9]*$` | `FRIENDLY_GUEST_NOT_ALLOWED` |
   | Thuộc `roster_submitted->'memberIds'` của chính dòng | `PAIRING_INVALID` |
   | Là thành viên đang hoạt động, `club_members.group_id = club_id` | `MEMBER_NOT_ACTIVE_IN_GROUP` |
   | Có `athletes.legacy_club_member_id` | `ATHLETE_IDENTITY_MISSING` |
   | Số cặp của dòng ≤ `quota` | `FRIENDLY_QUOTA_EXCEEDED` |

8. Kiểm toàn giải:
   - Một `athlete_id` xuất hiện ở hai CLB → `FRIENDLY_ATHLETE_DUPLICATE`.
   - Có dưới 2 CLB có cặp → `FRIENDLY_CLUBS_TOO_FEW`.
9. `v_pairs := v_draft->'pairs' || v_guest_pairs`. Khối kiểm cặp dùng `v_pairs`, **trừ** mệnh đề "ref thuộc người tham gia của bản nháp". `v_participant_count` cộng thêm 2 × số cặp khách.
10. Thêm khối ghi friendly: VĐV, cặp và entry của từng dòng khách, với `tournament_club_id` = id dòng và `club_name_snapshot` = `groups.name`.
11. `result` có thêm khóa `'friendly_clubs'`.

Các hằng mà api-dev cần đối chiếu:

| Hằng | Giá trị |
|---|---|
| `readyStatuses` | `['approved','declined','withdrawn']` |
| `maxGuestClubsRange` | `[1,31]` |
| `planFriendlyPath` | `p_plan->'friendly'->>'maxGuestClubs'` |
| `pairKeyPattern` | `^c([0-9]+)\.([0-9]+)\.([A-Za-z0-9_-]{1,64})$` |
| `guestRefPattern` | `^member:[1-9][0-9]*$` |
| `markers` | `-- friendly:begin` / `-- friendly:end` / `-- friendly:decl` |
| `raiseCodes` | 14 mã, xem file |

Hai điều cần biết về plan:
- 108 không có allowlist khóa của `p_plan`, nên khóa `clubSpread` và `friendly` không làm hỏng các kiểm hiện có.
- Hai khóa này **có** nằm trong `md5(p_plan)` của idempotency.

## 5. Số trận các ca (test node xanh)

| Ca | Phân bố | Trận |
|---|---|---|
| G1: 59 = 4, khách = 3, `2x2` | A = 2 + 2, B = 2 + 1; cả hai CLB `limited` | 9 vòng bảng (6 liên CLB, 3 nội bộ) + 2 bán kết + 1 chung kết = **12**; **13** khi có tranh hạng ba. Đúng với 7 seed |
| G-core3: 3/2/2, hạn mức 2 | A = 2 cặp 59 + 1 + 1, B = 1 + 1 + 1; chỉ 59 `limited` | **12**, trong đó 8 trận vòng bảng liên CLB và 1 nội bộ. Nếu hạn mức là 1 → `FRIENDLY_CLUB_LIMIT_REACHED` |
| G-core3-KO: 2/2/2, nhánh 8 | Mỗi nửa có 1 cặp mỗi CLB; không `limited` | **5** (6 có hạng ba) |
| G2-KO: 4/3, nhánh 8, 1 bye | Nửa đủ chỗ = 2 + 2, nửa có bye = 2 + 1; không trận vòng 1 nào là nội bộ một CLB | **6** (7 có hạng ba) |
| Loại kép, 2 CLB × 4 cặp | Mỗi nửa 2 + 2, mỗi phần tư 1 + 1 | Không đổi cấu trúc |
| Nội bộ 14 người | Fingerprint bằng hằng số ghi trên HEAD `b4b3652` (gk7/gk7Bronze/ko7/de8/rr7/ko12Bronze) | **12** (13); 15 người bị chặn `UNPAIRED_MEMBER` |

## 6. Output test

```text
$ node tests/stitch-setup/epic-3/f2-*.test.js
ok   f2 club spread: 15/15
ok   f2 effective pairs: 16/16
ok   f2 standings: 7/7
ok   f2 step rules: 13/13

$ node tests/stitch-setup/run-all.js     → 44 file: 43 PASS, 1 RED
RED  exit=1  epic-1\ui-contract.test.js   (4/5 — lỗi CRLF có từ trước, xem 10_engine_f1 §5; F2 không đụng)
$ node tests/phase3/interclub-competition.test.js → phase3 interclub competition ok
```

Các test được chạy đỏ trước khi viết code (`Cannot find module …friendlySetup / clubSpread / friendlyStandings`). Có một chỗ đỏ thật trong lúc làm: `firstBlocker(…, 3)` trả `PAIR_COUNT_BELOW_MINIMUM` trước blocker CLB. Cách sửa là đưa blocker CLB lên trước (lệch #5).

## 7. Việc cho api-dev

- `loadFriendlyContext(db, { groupId, tournamentId })` đặt trong `friendlyServer.js`:
  - Trả `null` nếu `settings.organizer_mode ≠ 'friendly'`.
  - Ngược lại nạp `tournament_clubs`. Các cột chọn giống `HOST_CLUB_FIELDS` nhưng không cần `invite_token_hash`, và không có `roster_draft`.
  - Nạp tên từ `groups`, lấy `resolveFriendlyEntitlements` và mảng `athletes`.
  - Cuối cùng gọi **`buildFriendlyContext`**. Không tự dựng shape khác.
- Route preview và finalize:
  - Gọi `setupContext(db, groupId, draft, { friendly })` rồi `effectivePairs`.
  - Gọi `buildSetupPlan({ …, ...(friendly ? { entryClubs: entryClubs(pairs) } : {}) })`.
  - Dựng `p_plan` bằng `finalizePlanPayload`, sau đó thêm các mã ở §3 vào `RPC_CODES`.
- Route standings: dùng `computeFriendlyClubStandings` và `clubPalette`. Khi trả 404 `FRIENDLY_MODE_REQUIRED`, truyền status và câu một cách tường minh (lệch #10).
- `f2-api-contract.test.js`: dùng `FRIENDLY_FINALIZE_SQL_CONTRACT` để đối chiếu.

## 8. Lệch spec / chỗ mơ hồ (đã chọn phương án an toàn hơn, cần architect duyệt)

1. **Thuật toán rải bảng (§4 bước 2).** Cách chia vòng tròn thuần của spec là: bắt đầu ở `seededIndex`, bỏ qua bảng đầy. Cách này tạo ra `limited` không cần thiết và làm sai chính ví dụ khóa G-core3. Ví dụ, với start = B thì CLB khách B có 2 cặp ở bảng A. Đã đổi thành chia bài có sức chứa. Mỗi cặp, xét theo thứ tự CLB, vào bảng:
   1. có ít cặp cùng CLB nhất;
   2. nếu hoà, bảng còn nhiều chỗ hơn;
   3. nếu vẫn hoà, theo con trỏ vòng tròn bắt đầu ở `seededIndex('club-spread:'+seed)` và tiến lên sau mỗi lần đặt.

   Với nhánh, tiêu chí hoà cuối cùng là con trỏ seed riêng cho từng nút (`club-spread:<seed>:<path>`), thay cho "theo shuffledIds". Thứ tự các cặp trong một CLB vẫn theo `shuffledIds`. Mọi ví dụ khóa §4 đúng với mọi seed đã thử.
2. **Đối chứng với `distributeEntriesAcrossPools`.** Test so **tập** số cặp mỗi CLB trên mỗi bảng (đã sắp), không so theo nhãn bảng. Lý do: hàm kia xáo bằng LCG riêng và hoà thì chọn bảng nhỏ hơn, nên nhãn bảng không trùng được. Tính chất cân bằng (lệch tối đa 1) thì giống nhau.
3. **D49 chỉ bật khi có `ctx.friendly`.** `ctx.friendly` phản ánh `settings.organizer_mode`, nguồn sự thật phía server. Blocker này không dựa vào `draft.tournament.organizerMode`. Nhờ vậy giữ được cam kết "`ctx.friendly` vắng → bằng đúng trước Epic 3": fixture F1 #7 là friendly có khách mời. 111 vẫn chặn lại.
4. **`friendlyReadiness` kiểm thêm những gì 111 kiểm** (để báo sớm): `EXTERNAL_CLUB_NOT_SUPPORTED`, `FRIENDLY_GUEST_NOT_ALLOWED`, `FRIENDLY_QUOTA_EXCEEDED`, và `approved` thiếu version → `NOT_READY`. `FRIENDLY_ATHLETE_DUPLICATE` có thêm param `athleteId`.
5. Blocker CLB ở Bước 3 đứng **trước** blocker số cặp, để preview/finalize báo lý do gốc ("Còn CLB chưa duyệt") thay vì "thiếu cặp".
6. **`FRIENDLY_CLUB_SPREAD_LIMITED` ở Bước 4 tách theo từng CLB và có tên.** Spec chỉ ghi "đọc thêm `plan.clubSpread`". Trong `plan.warnings` vẫn chỉ có một mã.
7. **Shape `clubSpread`.** Với nhánh (knockout, loại kép) dùng `perHalf:{top,bottom}` thay cho `perGroup`. Spec chỉ mô tả shape của bảng.
8. **Thêm lỗi plan `ENTRY_CLUBS_INVALID`** khi `entryClubs` thiếu một cặp. Không đoán CLB cho cặp đó.
9. **Hai hàm thuần mới: `buildFriendlyContext` và `finalizePlanPayload`.** `buildFriendlyContext` chốt shape `ctx.friendly`; `loadFriendlyContext` chỉ còn phần I/O. `finalizePlanPayload` đọc hạn mức từ `ctx.friendly.maxGuestClubs` (đã kẹp, thiếu → 1, fail closed). Nếu giá trị hỏng thì throw `FINALIZE_PLAN_INVALID`.
10. **`FRIENDLY_MODE_REQUIRED` giữ nguyên như F1.** Câu cũ là "Chỉ giải giao hữu liên CLB mới mời được CLB.", `FRIENDLY_ERROR_STATUS` = 409. Spec §8 muốn 404 và câu "Giải này không phải giải giao hữu liên CLB." cho route standings. Không đổi bảng của F1 vì test F1 đang khoá nó. `FRIENDLY_SETUP_CODES` ghi 404; route standings tự truyền status và câu.
11. **HTTP của `FRIENDLY_QUOTA_EXCEEDED`, `FRIENDLY_GUEST_NOT_ALLOWED`, `EXTERNAL_CLUB_NOT_SUPPORTED`.** Bảng §8 của F2 ghi 409 (ở chốt giải), còn `FRIENDLY_ERROR_STATUS` của F1 ghi 400 (ở lời mời/gửi roster). `FRIENDLY_SETUP_CODES` dùng 409 cho luồng chốt; bảng F1 không đổi.
12. **BXH CLB.**
    - CLB không có entry thì không có dòng.
    - `headToHead.left` luôn là chủ nhà.
    - Bảng màu được mở rộng lên 10 màu và quay vòng nhưng không dùng lại màu chủ nhà. Spec chỉ ghi "…".
13. **`tournamentClubId` trong cặp khách là chuỗi**, khớp `parseFriendlyPairKey` của F1. Map màu cũng dùng khóa chuỗi.
14. **Chưa làm (ngoài phạm vi được giao):**
    - `loadFriendlyContext`;
    - khối `friendly` của view setup, dù đã có `projectApprovedPairs` và `clubPalette` để dùng;
    - `publicSlug.js`, các route, migration 111, `f2-api-contract.test.js`, SQL tích hợp.
