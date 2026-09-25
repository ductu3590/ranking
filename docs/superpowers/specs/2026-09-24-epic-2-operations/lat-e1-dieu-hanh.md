# Lát E1 — Shell 4 mục và mục Điều hành

Trạng thái: spec · Phụ thuộc: Epic 1 đã merge · Xem [README](README.md)
Thiết kế: `canonical/operations/01-control-center` (1280 + 390), `02-call-card`, `03-score-entry` (1280 + 390),
shell lấy từ `08-settings` (sidebar 4 mục).

## 1. Mục tiêu

BTC chạy trọn một ngày thi đấu chỉ trong mục **Điều hành**: nhìn sân, gọi cặp vào sân, bắt đầu, nhập tỉ số, chốt —
không phải nhảy menu. Đồng thời chặn mọi đường làm hỏng dữ liệu trận đã tìm thấy (README §Hiện trạng 1–3).

## 2. Shell console (D29)

- `ConsoleShell` viết lại: sidebar trái 16rem gồm khối giải (tên + chip trạng thái), **4 mục** có icon —
  `Điều hành` (key `control`, mặc định), `Trận đấu` (`matches`), `Sơ đồ & xếp hạng` (`bracket`), `Cài đặt` (`settings`)
  — và thẻ tiến độ `x/y trận` ở đáy. Không nhóm "Chuẩn bị", không số bước.
- < 768px: bỏ drawer, dùng **thanh tab đáy** 4 mục (`Điều hành · Trận đấu · Sơ đồ · Cài đặt`), cao 56px, có
  safe-area; nội dung chừa `padding-bottom`.
- Giải chưa có lịch: giữ hành vi hiện tại (admin được chuyển sang workspace setup). Bỏ `SettingsTab`/`CourtsStep`/
  `TeamsTab`/`DrawStep`/`LogStep` khỏi điều hướng console (E2 dọn phần còn cần sang Cài đặt).
- Link cũ không vỡ: `resolveStepKey` ánh xạ `step=control|courts → control`, `schedule → matches`,
  `standings → bracket`, `config|log|draw|athletes → settings`; `tab=overview → control` (giữ như hiện tại),
  `tab=results → matches`, `tab=standings|bracket → bracket`, `tab=settings|teams|openreg → settings`.
  Test khóa đủ bảng ánh xạ này (mọi khóa của `LEGACY_TAB_TO_STEP` cũ phải có đích).
- `OpenRegTab` (chỉ giải `organizer_mode = 'community'`) chuyển thành thẻ **"Đăng ký mở"** trong Cài đặt, chỉ hiện với
  giải cộng đồng; `tab=openreg` mở Cài đặt và cuộn tới thẻ đó. Danh sách cặp sau khi chốt (TeamsTab bản chỉ đọc) thành
  thẻ **"Cặp thi đấu"** chỉ đọc trong Cài đặt (E2).
- E1 chỉ làm đầy mục `control`; ba mục còn lại trong E1 hiển thị component hiện có (ResultsTab, Standings+Bracket,
  SettingsTab) bọc trong shell mới — E2 thay thế.

## 3. Nhãn trận dùng chung — `lib/tournament/matchLabels.js` (thuần, CommonJS như `doubleElimKeys.js`)

`matchLabel({ match, stage, stageMatches })` → `{ title, short, code }`:

| `match_key` | `title` |
|---|---|
| `GROUP-<L>-<n>`, stage có ≥ 2 giá trị `group_label` khác nhau | `Bảng <L> · Lượt <round>` |
| `GROUP-<L>-<n>`, stage chỉ có đúng một `group_label` (vòng tròn) | `Lượt <round>` (không phụ thuộc chữ `A`) |
| `QF<n>` / `SF<n>` / `F` / `BRONZE` | `Tứ kết <n>` / `Bán kết <n>` / `Chung kết` / `Tranh hạng ba` |
| `R<r>-<s>` | `Vòng 1/<2^k>` theo số trận của vòng (vd `Vòng 1/8 · trận 3`); vòng đầu khi không tròn: `Vòng <r> · trận <s>` |
| `W…/WF/L…/LF/GF` | theo `doubleElimRoundLabel` (D21), kèm `· trận <s>` khi vòng có > 1 trận |
| khác / NULL | `Lượt <round> · trận <match_order+1>` (không bao giờ "Trận #id") |

`code` = `match_key` (hiện phụ, chữ nhỏ). `slotSourceLabel(edge, labelsByMatchKey)` cho ô chờ:
`match_outcome/winner` → `Thắng <title nguồn>`; `loser` → `Thua <title nguồn>`; `group_rank` → `Nhất|Nhì|Ba bảng <L>`
(hạng > 3: `Hạng <k> bảng <L>`); `pool` → `Suất đi tiếp <k>`. **Không** dùng "Đội A / Đội B" ở bất kỳ đâu.

`matchGroupKey(match)` — khóa **nhóm** hiển thị, tính theo `match_key` (không theo chuỗi `title`): `BRONZE` → nhóm
`third_place` riêng; `F` → `final`; `GF` → `grand_final`; `SF*`/`QF*`/`R<r>-*` → theo vòng; `W*`/`L*` → theo nhánh + vòng;
`GROUP-*` → theo `round`. E2 (Trận đấu, Sơ đồ) và E3 dùng chung hàm này.

## 4. View model bàn điều hành — `lib/tournament/operationsBoard.js` + `GET /api/tournament-v2/operations`

Route: `requireTournamentAccess({ need: 'read' })`, scope `group_id`, tải courts, stages (`id, name, division_id,
schedule_format, config`), matches (thêm `match_key, winner_entry_id, result_type, group_label`), assignments,
entries (tên cặp như `listEntrants`), transitions `source_kind` của các trận, games của trận `live|paused|finalized`
gần nhất. Builder thuần `buildOperationsBoard(input, { now })` trả:

```js
{
  progress: { total, finalized, finishAt, averageMatchMinutes, activeCourts },
  courts: [{ id, label, active, reason, state: 'idle'|'warmup'|'live'|'paused'|'off',
             match: MatchVM|null, clock: { kind: 'countdown'|'elapsed', seconds }, suggestion: MatchVM|null }],
  queue: [{ round, label: 'Lượt 3', matches: [MatchVM & { readiness: 'ready'|'waiting'|'busy', busyCourt, projectedStart, lockedStart }] }],
  recent: [MatchVM & { endedAt, scoreText }],       // 5 trận chốt gần nhất (ended_at desc, rồi version)
}
MatchVM = { id, version, status, stageId, title, code, rule: { bestOf, pointsTo, winBy, cap },
            a: { entryId, name } | { source: 'Thắng Tứ kết 1' }, b: …, court }
```

- `readiness`: `waiting` khi thiếu một bên (hiện nguồn); `busy` khi một trong hai cặp đang ở trận `warmup|live|paused`
  (hiện `Cặp đang đấu ở Sân 02`); còn lại `ready`.
- `suggestion` cho sân trống = trận `ready` đầu tiên của hàng chờ (theo `match_order`), không trùng gợi ý sân khác.
- `rule` từ `resolveMatchScoring` (cùng hàm route `games` dùng) → chip `BO1 · 11` chỉ đọc.
- Giờ dự kiến: dùng lại `projectSchedule` / `averageMatchMinutes` của `courtBoard.js`.
- Không trả lineup/giới tính/rating. Route `GET /assignments` giữ nguyên (còn dùng ở chỗ khác).
- **Quyền:** `GET /operations` là route đọc (`need: 'read'`, như mọi route đọc khác), chỉ trả tên cặp đang hiển thị ở
  console/trang công khai + id/version cần cho thao tác; không trả số điện thoại, member id, token. Mọi thao tác ghi
  (`POST /games`, `POST /withdraw`, `POST /match-transition`, `POST /corrections`, sân) giữ `need: 'write'`. UI ẩn nút
  thao tác khi phiên không phải admin, nhưng quyền chặn ở server.

## 5. UI mục Điều hành (OPS-01)

Desktop: dải tiến độ; lưới thẻ sân (2 cột ≥ 1024px, 3–4 cột ≥ 1440px); cột phải "Hàng chờ theo lượt"; dưới là
"Trận vừa chốt" (chạm → sheet OPS-03 ở chế độ xem; nút `Sửa kết quả` đi route `corrections`, làm ở E2).
Mobile: segmented `Sân (n) · Hàng chờ (n) · Vừa chốt`, thẻ sân dọc.

Thẻ sân theo `state` — một nút chính + menu `⋯`:

| state | Nút chính | Menu ⋯ | Transition gọi |
|---|---|---|---|
| idle (có `suggestion`) | `Gọi vào sân` → mở thẻ gọi (OPS-02) | — | — |
| warmup | `Bắt đầu đấu` | `Hủy gọi` (lý do), `Xử thắng W.O.` (§6.4) | `warmup→live`, `warmup→pending` |
| live | `Nhập tỉ số` → sheet OPS-03 | `Tạm dừng` | `live→paused` |
| paused | `Đấu tiếp` | `Nhập tỉ số`, `Bỏ cuộc` (§6.4) | `paused→live` |
| off | `Bật lại sân` | — | `setCourtActive` |

Hàng chờ: dòng `ready` có nút **`Gọi vào sân…`** mở thẻ gọi với bộ chọn sân trống (D33); `busy`/`waiting` không có nút.
Không kéo-thả.

Thẻ gọi sân (OPS-02): chữ lớn "Mời cặp X và cặp Y vào Sân NN"; `Đã gọi — bắt đầu khởi động` =
`transitionMatch({ to: 'warmup', court_id, expected_version })`; `Đổi sân` (chỉ sân `idle`); `Để sau`.

Làm mới: tải lại view model sau mọi thao tác thành công; poll bằng **cùng helper `nextPollingDelay`
(`lib/pollingBackoff.js`) như trang công khai** (giãn khi không đổi, dừng khi tab ẩn, làm mới khi focus/visible);
đồng hồ đếm từ `warmup_started_at`/`started_at` phía client mỗi giây.

## 6. Nhập tỉ số và các chặn dữ liệu

### 6.1 Sheet nhập tỉ số (OPS-03)

- Mở từ thẻ sân / hàng "Trận vừa chốt"; bottom sheet < 768px, dialog 600px desktop. Tải `GET /matches` + games của
  trận (đã có) để lấy `version` mới nhất lúc mở.
- Đầu sheet: `title`, sân, hai cặp, chip luật chỉ đọc (`BO3 · tới 11 · cách 2`). Không có ô chọn BO.
- Dòng ván: ô số lớn `inputmode="numeric"` + nút −/+ (≥ 44px). Hiện ván 1; ván kế hiện khi ván trước hợp lệ và trận
  chưa đủ thắng; tối đa `bestOf`. Kiểm hợp lệ tại chỗ bằng `validateGameScore` (cùng hàm server) → lỗi inline
  ("Ván 3: phải thắng cách 2 điểm"); tính người thắng bằng engine `simple` phía client để hiện
  "X thắng 2–1 · sẽ vào Bán kết 1" (đích lấy từ transitions trong view model).
- Nút: `Lưu & chốt trận` (chỉ bật khi đủ ván thắng và hợp lệ), `Lưu nháp` (khi có ≥ 1 ván hợp lệ và trận đang
  `live|paused`). Chỉ báo `Chưa lưu thay đổi` khi có sửa chưa lưu.
- Trận đã `finalized`: sheet ở **chế độ xem**, không có nút lưu; nút `Sửa kết quả` thuộc E2 và đi route
  `corrections` (không bao giờ gửi `POST /games` cho trận đã chốt).
- **Chặn rời khi chưa lưu:** đóng sheet, bấm mục sidebar/tab đáy, `popstate` (nút Back — đẩy một history entry khi
  mở sheet) và `beforeunload` → hộp `Bạn có tỉ số chưa lưu` · `Ở lại` / `Bỏ thay đổi`.

### 6.2 Route `POST /games` — chặn mới (không đổi RPC)

Thêm helper thuần `lib/tournament/scoreEntry.js#assertScoreSavable({ match, games, complete })` và gọi **trước** RPC:

| Điều kiện | Mã | HTTP | Thông báo |
|---|---|---|---|
| Trận `finalized` | `USE_CORRECTION` | 409 | `Trận đã chốt — dùng "Sửa kết quả".` (sửa đi route `corrections`, E2) |
| Thiếu `entry_a_id` hoặc `entry_b_id` | `MATCH_NOT_READY` | 409 | `Trận chưa đủ hai cặp — chờ kết quả trận trước.` |
| `games` rỗng | `GAMES_REQUIRED` | 400 | `Nhập ít nhất một ván.` |
| Lưu nháp (chưa đủ thắng) khi trận `pending|warmup` | `MATCH_NOT_STARTED` | 409 | `Bấm "Bắt đầu đấu" trước khi lưu tỉ số dở.` |

- **Lưu nháp giữ nguyên trạng thái hiện tại** (`live` hoặc `paused`) khi truyền `p_status` cho RPC — không còn đẩy mọi
  lần lưu dở sang `live` (trận đang `paused` không bị "đấu tiếp" ngầm).
- **Chốt đủ thắng được phép từ `pending|warmup|live|paused` khi đủ hai cặp** — giải trình ở §6.7. Trường hợp gây
  hỏng trận 1469 (lưu khi thiếu cặp / lưu dở từ `pending`) đã bị hai dòng giữa bảng chặn.
- **Phân loại lỗi RPC theo thông điệp exception, không theo SQLSTATE.** Sau migration 078 mọi xung đột nghiệp vụ trên
  production đều là `PH409` (đã kiểm `pg_get_functiondef` ngày 2026-09-24: 050, 068, 069/070, 096 không còn `40001`).
  Helper `classifyRpcConflict(error)`: message chứa `match version conflict` → `MATCH_VERSION_CONFLICT`
  (`Trận vừa được cập nhật ở máy khác.`); `PLAYOFF_TARGET_CONFLICT` → `PLAYOFF_TARGET_CONFLICT`
  (`Trận kế tiếp đã bắt đầu hoặc đã có cặp khác — không thể điền kết quả này.`); `PH409`/`40001` khác →
  `CONFLICT` chung. Giữ `40001` trong danh sách mã 409 chỉ để tương thích ngược, không dựa vào nó để phân biệt.

### 6.3 Mốc giờ

Quy tắc duy nhất: **`warmup_started_at` / `started_at` chỉ do `match-transition` ghi** (`timestampsFor`, đã có);
route `games`/`withdraw` **không ghi `started_at`**. Riêng `ended_at` (RPC 050/068/096 không ghi; epic này không sửa
SQL): sau khi RPC trả `finalized`, route chạy **một UPDATE có điều kiện, idempotent**:

```sql
UPDATE tournament_matches SET ended_at = now()
WHERE id = :match AND group_id = :group AND status = 'finalized'
  AND version = :version_returned_by_rpc AND ended_at IS NULL
```

Không tăng `version`, không ghi đè giá trị đã có, là no-op nếu máy khác đã đổi trận. Lỗi ở bước này chỉ ghi log (tỉ số
và tiến cấp đã commit trong RPC); hậu quả tối đa là thiếu một mốc cho thống kê. Trận nhập bù từ `pending` không có
`started_at` (đúng sự thật) → không tính vào "TB phút/trận". Chip "Đang đấu · x phút" (E1/E3) chỉ hiện cho trận
`live|paused`, mà trận đó luôn đã qua `warmup→live` nên luôn có `started_at`.

### 6.4 `match-transition` — chặn mới; W.O./bỏ cuộc đi RPC 096

- `*→finalized` qua route này **bị bỏ** (`USE_SCORE_ENTRY`, 400): chốt trận chỉ qua `POST /games` hoặc `POST /withdraw`.
  `matchLifecycle` giữ bảng cạnh, route từ chối đích `finalized`. Bỏ nút "Ghi điểm / Chốt" của ControlStep.
- **W.O. và bỏ cuộc dùng `POST /api/tournament-v2/withdraw` → RPC `withdraw_tournament_match_walkover` (096)** — đã có,
  một transaction: thay ván bằng W.O. BO tối thiểu, chốt, tiến cấp người thắng, đặt `result_type = 'walkover'`, có
  idempotency key, `need: 'write'`, lý do bắt buộc. **Cấm** UPDATE `result_type` ngoài RPC.
  - `Xử thắng W.O.` chỉ hiện khi trận `warmup`; `Bỏ cuộc` khi `live|paused`. Route kiểm trạng thái này trước khi gọi RPC
    (`WITHDRAW_STATUS_INVALID`), vì 096 chỉ chặn `finalized`.
  - Bỏ cuộc cũng ghi `result_type = 'walkover'` (ván đấu dở bị thay bằng W.O.; BXH vòng tròn đã loại W.O. khỏi hiệu số).
    Phân biệt trong nhật ký bằng `action`: route nhận `kind: 'walkover'|'retired'` và ghi `match_walkover` hoặc
    `match_retired` (đã có trong `ACTION_LABELS`). Không thêm nhánh `retired` vào engine.
  - Sau RPC: cùng UPDATE `ended_at` có điều kiện như §6.3.
- `pending→warmup` (gọi sân): server kiểm đủ hai cặp (`MATCH_NOT_READY`), không cặp nào đang ở trận `warmup|live|paused`
  (`ENTRY_BUSY`, kèm tên sân), sân không bận (`COURT_BUSY`).

### 6.5 Xung đột phiên bản (K4)

Client gửi `expected_version`. Khi nhận `MATCH_VERSION_CONFLICT`: tải lại trận + games, hiện banner amber
"Trận vừa được cập nhật ở máy khác" với hai cột `Tỉ số của bạn` / `Trên máy chủ`:
- `Tải bản mới nhất` — thay form bằng dữ liệu máy chủ.
- `Sửa tiếp từ tỉ số của tôi` — giữ form của người dùng, nạp `version` mới và **không tự lưu**; banner đổi thành
  "Bạn đang sửa đè lên tỉ số trên máy chủ (hiện bên cạnh)". Người dùng phải bấm `Lưu` thêm một lần sau khi đã thấy tỉ số
  máy chủ. Không có nút lưu một chạm.
- Nếu trận trên máy chủ đã `finalized`: không cho sửa đè; sheet chuyển chế độ xem + gợi ý `Sửa kết quả` (E2).

### 6.6 Sửa dữ liệu hỏng đã có

Trận `GF` id 1469 (giải "Nhanhthangthua", group 1) đang `live` một bên, 0 ván. **Chỉ khi người dùng đồng ý**, chạy đúng
một câu, điều kiện chặt để không kéo nhầm trận hợp lệ:

```sql
UPDATE tournament_matches SET status = 'pending'
WHERE id = 1469 AND group_id = 1 AND match_key = 'GF' AND status = 'live'
  AND entry_b_id IS NULL AND started_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM tournament_games g WHERE g.match_id = 1469)
RETURNING id, status, version;
```

Kỳ vọng đúng 1 dòng; khác 1 → dừng, báo lại. Không đổi `version`, không migration. Ghi kết quả vào file bằng chứng.

### 6.7 Giải trình: vì sao vẫn cho chốt đủ thắng từ `pending|warmup`

Review đề xuất cấm mọi lần lưu khi trận chưa `live|paused`. Không áp dụng, vì:
- Dữ liệu thật: toàn bộ 12 trận đã chốt của giải "Nhanhthangthua" đều **chưa từng qua `warmup`/`live`**
  (`warmup_started_at`, `started_at` NULL) — người dùng nhập tỉ số thẳng và đã nghiệm thu Epic 1 theo cách này.
- Giải chưa khai báo sân vẫn phải chạy được; buộc "Gọi sân → Bắt đầu" cho từng trận là thêm 2 thao tác/trận cho CLB
  không dùng điều hành theo sân.
- Hỏng dữ liệu kiểu 1469 cần *thiếu cặp* **hoặc** *lưu dở từ pending*; cả hai đã bị chặn ở §6.2. Chốt đủ thắng khi đủ
  hai cặp đi qua đúng RPC 068 (khóa trận nguồn + đích, kiểm đích `pending|warmup`), nên không tạo trạng thái "live một bên".

## 7. Test (node, `tests/stitch-setup/epic-2/`, thêm vào `run-all.js`)

| File | Khóa |
|---|---|
| `labels.test.js` | Mọi dạng `match_key` ở §3 → `title`; vòng tròn một `group_label` bất kỳ → `Lượt n`; `matchGroupKey`: `BRONZE` ≠ `F`; không chuỗi "Đội A"/"Trận #"; `slotSourceLabel` đủ winner/loser/group_rank/pool (fixture có transitions thật) |
| `board.test.js` | Fixture K1/K2/K3: `state` sân, `readiness` ready/waiting/busy, `suggestion` không trùng, `recent` sắp đúng, `rule` BO3 cho F/GF; view model không chứa khóa `phone`/`member_id`/`token` |
| `score-entry.test.js` | `assertScoreSavable` đủ 4 mã (`USE_CORRECTION`, `MATCH_NOT_READY`, `GAMES_REQUIRED`, `MATCH_NOT_STARTED`); chốt đủ thắng từ `pending` hợp lệ khi đủ cặp; lưu nháp giữ `paused`; `classifyRpcConflict` phân biệt theo message với mã `PH409` |
| `api-contract.test.js` | `games`: gọi `assertScoreSavable` trước RPC, dùng `classifyRpcConflict`, UPDATE `ended_at` đủ điều kiện (`version`, `ended_at IS NULL`, `status='finalized'`), không ghi `started_at`, không ghi `result_type`; `withdraw`: W.O. chỉ từ `warmup`, bỏ cuộc từ `live|paused`, gọi RPC 096, action theo `kind`; `match-transition`: từ chối đích `finalized`, kiểm `ENTRY_BUSY`/`COURT_BUSY`; `operations`: `need: 'read'` + scope `group_id`; mọi route ghi `need: 'write'` |
| `ui-contract.test.js` | Shell đúng 4 mục + tab đáy; bảng ánh xạ link cũ đủ mọi khóa (`overview→control`, `openreg→settings`); không còn "Trung tâm điều hành", "Trận #", "needs_call", "Ghi điểm / Chốt"; sheet có `beforeunload` + `popstate`; không render ô BO; trận `finalized` không có nút lưu; nút xung đột không lưu một chạm |

Sửa test cũ khóa chuỗi (`ui-shell`, `ui-control-step`, `ui-courts-step`) → ghi ADR-006. `npx next build` xanh.

## 8. Ngoài phạm vi E1

Mục Trận đấu/Sơ đồ/Cài đặt hoàn chỉnh (E2, gồm `Sửa kết quả` qua route `corrections`), trang công khai (E3), link trọng tài (D32), kéo-thả (D33), Nhánh Bạc (D31), MLP (Epic 5).
