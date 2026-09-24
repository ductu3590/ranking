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
  `standings → bracket`, `config|log|draw|athletes → settings`; `tab=results → matches`, `tab=standings|bracket → bracket`,
  `tab=settings|teams|overview → settings`.
- E1 chỉ làm đầy mục `control`; ba mục còn lại trong E1 hiển thị component hiện có (ResultsTab, Standings+Bracket,
  SettingsTab) bọc trong shell mới — E2 thay thế.

## 3. Nhãn trận dùng chung — `lib/tournament/matchLabels.js` (thuần, CommonJS như `doubleElimKeys.js`)

`matchLabel({ match, stage, stageMatches })` → `{ title, short, code }`:

| `match_key` | `title` |
|---|---|
| `GROUP-<L>-<n>` (stage ≥ 2 bảng) | `Bảng <L> · Lượt <round>` |
| `GROUP-A-<n>` (vòng tròn một bảng) | `Lượt <round>` |
| `QF<n>` / `SF<n>` / `F` / `BRONZE` | `Tứ kết <n>` / `Bán kết <n>` / `Chung kết` / `Tranh hạng ba` |
| `R<r>-<s>` | `Vòng 1/<2^k>` theo số trận của vòng (vd `Vòng 1/8 · trận 3`); vòng đầu khi không tròn: `Vòng <r> · trận <s>` |
| `W…/WF/L…/LF/GF` | theo `doubleElimRoundLabel` (D21), kèm `· trận <s>` khi vòng có > 1 trận |
| khác / NULL | `Lượt <round> · trận <match_order+1>` (không bao giờ "Trận #id") |

`code` = `match_key` (hiện phụ, chữ nhỏ). `slotSourceLabel(edge, labelsByMatchKey)` cho ô chờ:
`match_outcome/winner` → `Thắng <title nguồn>`; `loser` → `Thua <title nguồn>`; `group_rank` → `Nhất|Nhì|Ba bảng <L>`
(hạng > 3: `Hạng <k> bảng <L>`); `pool` → `Suất đi tiếp <k>`. **Không** dùng "Đội A / Đội B" ở bất kỳ đâu.

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

## 5. UI mục Điều hành (OPS-01)

Desktop: dải tiến độ; lưới thẻ sân (2 cột ≥ 1024px, 3–4 cột ≥ 1440px); cột phải "Hàng chờ theo lượt"; dưới là
"Trận vừa chốt" (nút `Sửa` → mở sheet OPS-03 chế độ sửa, E2 hoàn thiện luồng sửa có lý do).
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

Làm mới: tải lại view model sau mọi thao tác thành công; poll 10 giây khi tab hiển thị + làm mới khi focus
(như trang công khai); đồng hồ đếm từ `warmup_started_at`/`started_at` phía client mỗi giây.

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
- **Chặn rời khi chưa lưu:** đóng sheet, bấm mục sidebar/tab đáy, `popstate` (nút Back — đẩy một history entry khi
  mở sheet) và `beforeunload` → hộp `Bạn có tỉ số chưa lưu` · `Ở lại` / `Bỏ thay đổi`.

### 6.2 Route `POST /games` — chặn mới (không đổi RPC)

Thêm helper thuần `lib/tournament/scoreEntry.js#assertScoreSavable({ match, games, mode })` và gọi trước RPC:

| Điều kiện | Mã | HTTP | Thông báo |
|---|---|---|---|
| Thiếu `entry_a_id` hoặc `entry_b_id` | `MATCH_NOT_READY` | 409 | `Trận chưa đủ hai cặp — chờ kết quả trận trước.` |
| `games` rỗng | `GAMES_REQUIRED` | 400 | `Nhập ít nhất một ván.` |
| Lưu nháp (chưa đủ thắng) khi trận `pending|warmup` | `MATCH_NOT_STARTED` | 409 | `Bấm "Bắt đầu đấu" trước khi lưu tỉ số dở.` |

Lưu đủ thắng khi trận đang `pending|warmup|live|paused` vẫn cho phép (BTC nhập bù kết quả sau). Lỗi RPC
`PLAYOFF_TARGET_CONFLICT` tách khỏi lỗi phiên bản: `code: 'PLAYOFF_TARGET_CONFLICT'`, thông báo
`Trận kế tiếp đã bắt đầu hoặc đã có cặp khác — không thể điền kết quả này.`; lỗi phiên bản giữ
`code: 'MATCH_VERSION_CONFLICT'`.

### 6.3 Mốc giờ

Sau RPC thành công, route cập nhật **không tăng `version`** (chỉ cột thời gian):
lần lưu đầu của trận `live` mà `started_at IS NULL` → `started_at = now()`; khi `finalized` → `ended_at = now()`
(và `started_at` nếu vẫn NULL thì để NULL — không bịa). Trả `match` mới (`version` sau RPC) để client dùng tiếp.

### 6.4 `match-transition` — chặn mới

- `*→finalized` qua route này **bị bỏ** (`USE_SCORE_ENTRY`, 400): chốt trận chỉ qua `POST /games`. `matchLifecycle`
  giữ bảng cạnh nhưng route từ chối đích `finalized`. ControlStep cũ bỏ nút "Ghi điểm / Chốt".
- **W.O. / bỏ cuộc** chuyển sang `POST /games` với `{ outcome: 'walkover'|'retired', winner_entry_id, reason }`:
  W.O. chỉ khi trận `warmup` (bỏ cuộc: `live|paused`), lý do bắt buộc. `scoreEntry.buildForfeitGames({ rule, games,
  winnerSide })` giữ các ván đã chốt, thêm các ván `points_to–0` cho bên thắng tới khi đủ thắng → RPC `finalized` với
  người thắng → tiến cấp chạy như trận thường. Sau RPC cập nhật `result_type` (`walkover|retired`, không tăng version) +
  ghi nhật ký `match_walkover|match_retired` với lý do. BXH vòng tròn đã loại W.O. khỏi hiệu số (engine hiện có);
  thêm `retired` vào cùng nhánh loại trừ hiệu số.
- `pending→warmup` (gọi sân): server kiểm đủ hai cặp (`MATCH_NOT_READY`) và không cặp nào đang ở trận
  `warmup|live|paused` (`ENTRY_BUSY`, kèm tên sân) và sân không bận (`COURT_BUSY`).

### 6.5 Xung đột phiên bản (K4)

Client gửi `expected_version`. Khi nhận `MATCH_VERSION_CONFLICT`: tải lại trận + games, hiện banner amber
"Trận vừa được cập nhật ở máy khác" với hai cột `Tỉ số của bạn` / `Trên máy chủ`; `Tải bản mới nhất` (thay form) hoặc
`Giữ tỉ số của tôi và lưu` (gửi lại với `version` mới). Không tự động ghi đè.

### 6.6 Sửa dữ liệu hỏng đã có

Trận `GF` id 1469 (group 1, giải "Nhanhthangthua") đang `live` một bên, 0 ván. Sửa bằng một câu `UPDATE` đơn lẻ
(`status='pending'`, không đổi cặp/version logic khác) **chỉ khi người dùng đồng ý** vì là CLB thật; ghi vào file
bằng chứng. Không có migration.

## 7. Test (node, `tests/stitch-setup/epic-2/`, thêm vào `run-all.js`)

| File | Khóa |
|---|---|
| `labels.test.js` | Mọi dạng `match_key` ở §3 → `title`; không chuỗi "Đội A"/"Trận #"; nguồn ô chờ winner/loser/group_rank/pool |
| `board.test.js` | Fixture K1/K2/K3: `state` sân, `readiness` ready/waiting/busy, `suggestion` không trùng, `recent` sắp đúng, `rule` BO3 cho F/GF |
| `score-entry.test.js` | `assertScoreSavable` đủ 3 mã; `buildForfeitGames` BO1/BO3 giữ ván cũ; W.O. chỉ từ warmup, bỏ cuộc từ live/paused |
| `api-contract.test.js` | Route `games` gọi `assertScoreSavable` trước RPC, tách mã `PLAYOFF_TARGET_CONFLICT`, cập nhật mốc giờ không đụng `version`; `match-transition` từ chối `finalized` và kiểm `ENTRY_BUSY`; route `operations` scope `group_id` + `need: 'read'` |
| `ui-contract.test.js` | Shell đúng 4 mục + tab đáy; không còn "Trung tâm điều hành", "Trận #", "needs_call", "Ghi điểm / Chốt"; sheet có `beforeunload` + `popstate`; không render ô BO |

Sửa test cũ khóa chuỗi (`ui-shell`, `ui-control-step`, `ui-courts-step`) → ghi ADR-006. `npx next build` xanh.

## 8. Ngoài phạm vi E1

Mục Trận đấu/Sơ đồ/Cài đặt hoàn chỉnh (E2), trang công khai (E3), sửa kết quả đã chốt đổi người thắng khi trận sau
đã có cặp (giữ chặn như 068), link trọng tài (D32), kéo-thả (D33), Nhánh Bạc (D31), MLP (Epic 5).
