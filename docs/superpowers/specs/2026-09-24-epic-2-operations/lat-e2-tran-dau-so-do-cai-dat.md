# Lát E2 — Trận đấu · Sơ đồ & xếp hạng · Cài đặt

Trạng thái: spec · Phụ thuộc: E1 · Xem [README](README.md)
Thiết kế: `canonical/operations/04-schedule-results`, `05-bracket/*`, `06-standings-finish`, `08-settings`.

## 1. Mục Trận đấu (OPS-04) — thay ResultsTab cho stage v4

- Danh sách mọi trận của giải, nhóm bằng `matchGroupKey` (E1 §3 — theo `match_key`, không theo `title`), tiêu đề
  nhóm từ `matchLabel`, header `Lượt 3 · 6 trận · 2 đang đấu`; `BRONZE` luôn là nhóm `Tranh hạng ba` riêng, không nằm
  trong `Chung kết`.
- Lọc: giai đoạn (segmented), lượt, sân, trạng thái (`Chưa gọi`/`Đang đấu`/`Đã chốt`), ô tìm tên VĐV.
- Dòng: `code` phụ + `title`, hai cặp (ô chờ theo nguồn §E1-3), tỉ số từng ván `11–8, 9–11, 11–6`, chip luật chỉ đọc,
  sân, giờ, trạng thái. Chạm dòng → sheet nhập tỉ số của E1 (cùng component, cùng chặn).
- **Bỏ `RoundGroupHead` / ô BO1/BO3/BO5 theo vòng** với mọi stage có `config.scoring` (stage v4) — D8/D14. Stage
  legacy (không có `config.scoring`) giữ nguyên hành vi cũ; MLP giữ nguyên (Epic 5).
- **Sửa kết quả đã chốt đi route `POST /api/tournament-v2/corrections`** (đã có) → RPC
  `apply_tournament_result_correction_graph_aware` (069/070): một transaction, xử lý đổi người thắng theo đồ thị tiến cấp,
  lý do bắt buộc, `need: 'write'`, nhật ký action **`result_corrected`**. Sheet ở chế độ xem có `Sửa kết quả` → form
  ván + ô lý do → gọi corrections (không bao giờ `POST /games` cho trận `finalized`; E1 đã chặn bằng `USE_CORRECTION`).
  - Route đã tính `impact` trước khi ghi; khi bị chặn (trận sau đã bắt đầu — RPC ném `CORRECTION_BLOCKED_DOWNSTREAM`,
    `PH409`), hiện nguyên `block_reason` và hướng dẫn "Trận kế tiếp đã bắt đầu; không thể đổi kết quả này."
  - Phân loại lỗi bằng `classifyRpcConflict` của E1 (theo message), thêm nhánh `CORRECTION_BLOCKED_DOWNSTREAM`.
  - Xung đột phiên bản dùng cùng banner K4 (E1 §6.5).

## 2. Mục Sơ đồ & xếp hạng (OPS-05 + OPS-06)

Tab con `Sơ đồ | Xếp hạng`. Hai component **dùng chung với trang công khai** đặt ở `app/giai-dau/v2/shared/`
(nhận dữ liệu qua props, không tự fetch, không import client API ghi). Tương tác chỉ qua prop tùy chọn
`onSelectMatch(matchId)`: console truyền để mở sheet (xem/sửa theo quyền); trang công khai **không truyền** → ô trận
render không có handler/`role="button"`, không có đường vào nhập tỉ số.

### 2.1 `BracketView` (viết lại `bracketRender.js`)

- Loại trực tiếp: cột theo vòng với `matchLabel` (bỏ `roundLabel(round, maxRound)` tự suy — nguồn của lỗi
  `koLabel` fallback); khối **Tranh hạng ba tách riêng** dưới cột Chung kết.
- Playoff sau vòng bảng: như trên, ô chờ `Nhất bảng A` / `Nhì bảng B`.
- Loại kép: ba khung Nhánh thắng / Nhánh thua / Chung kết tổng (giữ `annotateDoubleElim`); **đủ cột `LF`**.
- Ô trận: header `title · Sân · BO` + mã phụ; hai dòng cặp + tỉ số, cặp thắng đậm có vạch xanh, cặp thua mờ;
  ô chờ = nguồn (in nghiêng); bye = `Miễn đấu` (không hiện như một trận "Chờ"); đang đấu = viền emerald + sân.
- Mobile < 768px: cuộn ngang theo vòng (scroll-snap), header vòng dính; desktop: toàn cảnh, cuộn ngang khi tràn.

### 2.2 `StandingsView`

- Vòng bảng / vòng tròn: bảng `Hạng · Cặp · Trận · Thắng–Thua · Hiệu số ván · Hiệu số điểm`, chip `Đi tiếp`; dưới bảng
  chú giải cột + tiêu chí xếp hạng lấy từ `tiebreak_policy` (không có "Hòa").
- Xếp hạng chung cuộc: bục 1–2–3 + danh sách hạng tiếp theo, **lấy nguyên nhãn từ `computeStageStandings`, không tự
  gắn lại**: loại trực tiếp → nhãn `knockoutPlacementLabels` (`standingsService.js:183`, chỉ áp cho
  `schedule_format === 'knockout'`); loại kép → nhãn của engine `doubleElim.computeStandings` (D22: hạng 3 = thua `LF`,
  hạng 4 = thua trận L ngay trước `LF`, đồng hạng theo vòng bị loại), chỉ hiện bục khi `GF` đã chốt, trước đó hiện
  "Chưa xác định". `StandingsView` không gọi `knockoutPlacementLabels`. Chip `Tạm tính` khi giải chưa kết thúc.

### 2.3 Kết thúc giải (console)

Thẻ bên phải: số trận chưa chốt; nút `Kết thúc giải & chốt xếp hạng` chỉ bật khi 0 trận chưa chốt → hộp xác nhận →
gọi luồng `advance` hiện có (`advance_division_entry_stage`, next NULL). Sau khi kết thúc: khóa nhập tỉ số (route
`games` đã chặn qua trạng thái stage `completed` — kiểm lại; nếu chưa, thêm `STAGE_COMPLETED` 409).

## 3. Mục Cài đặt (OPS-08)

**Quyền:** đọc `need: 'read'`; mọi thẻ có thao tác ghi (lưu thông tin giải, sân, thời lượng, đăng ký mở, huỷ chốt)
gọi route `need: 'write'` (admin CLB) — kiểm lại từng route đang dùng (`tournaments` PATCH, `courts`, `venues`,
`draw` unlock, `registrations`) và bổ sung nếu route nào chưa đòi `write`. Member thấy Cài đặt ở chế độ chỉ đọc
(không thấy vùng nguy hiểm).

Các thẻ xếp chồng:

1. **Thông tin giải** — tên, ngày, địa điểm (API `tournaments` PATCH hiện có).
2. **Link công khai & chia sẻ** — chuyển phần chia sẻ từ `OverviewTab` (đang chết) + `ShareActions`: sao chép link,
   Chia sẻ Zalo, Xuất ảnh kết quả, QR (sinh client-side, không gọi dịch vụ ngoài). Không chip "Đang phát trực tiếp".
3. **Sân thi đấu** — từ `CourtsStep`: danh sách sân + toggle (lý do khi ngưng), `+ Thêm sân`, `Thời lượng trận ước
   tính`, `Khởi động` (lưu `tournaments.settings.operations.estimated_match_minutes|warmup_minutes`).
4. **Nhật ký thao tác** — 5 dòng mới nhất + `Xem toàn bộ`; mỗi dòng là **câu đọc được** do
   `lib/tournament/operationLogText.js` (thuần) sinh từ `action + before/after + tên trận/cặp/sân`
   ("14:32 · Admin chốt trận Bảng A · Lượt 2: Minh Tuấn + Hoàng Nam thắng 11–7"); không in JSON. Bảng action phủ
   **mọi action đang được ghi** — lấy danh sách bằng grep `action:` trong `app/api/tournament-v2/**` (tối thiểu:
   các khóa `ACTION_LABELS` hiện có + `result_corrected` của route corrections + action của draw/court/withdraw);
   action lạ rơi về câu chung "Admin thực hiện <action>" chứ không in JSON.
5. **Cặp thi đấu** (chỉ đọc) — danh sách cặp đã chốt (thay TeamsTab chỉ đọc sau chốt).
6. **Đăng ký mở** — chỉ hiện với giải `organizer_mode = 'community'`, nội dung `OpenRegTab` hiện có; đích của
   `tab=openreg`.
7. **Vùng nguy hiểm** (viền đỏ, chỉ admin) — `Huỷ chốt lịch…` (luồng `unlockDraw` hiện có, lý do bắt buộc, hộp xác
   nhận nêu rõ xoá lịch + kết quả). **Không** có "Sinh lại lịch", "Số ván theo vòng", "Điều lệ MLP", "Kết thúc giải sớm".

Dọn code: gỡ `OverviewTab.js`, `steps/ControlStep.js`, `steps/CourtsStep.js`, `steps/LogStep.js`, `steps/DrawStep.js`
khỏi console khi phần dùng lại đã chuyển; `RoundScoringPanel` chỉ còn dùng cho stage legacy (nếu không còn chỗ dùng → gỡ).

## 4. Test

| File | Khóa |
|---|---|
| `bracket-view.test.js` | Render tĩnh (react-dom/server) K1/K2: đủ cột `LF`, khối Tranh hạng ba tách (nhóm theo `match_key`), `Miễn đấu`, không "Đội A", nhãn vòng từ `matchLabel`; không truyền `onSelectMatch` → không có handler/`role="button"` |
| `standings-view.test.js` | Loại trực tiếp dùng nhãn `knockoutPlacementLabels`; loại kép dùng nhãn engine, không gọi `knockoutPlacementLabels`, chưa có bục khi `GF` chưa chốt |
| `log-text.test.js` | Mọi action tìm được bằng grep trong route (gồm `result_corrected`, `match_walkover`, `match_retired`) → câu tiếng Việt, không chứa `{`; action lạ → câu chung |
| `api-contract.test.js` (bổ sung) | "Sửa kết quả" gọi `corrections` (không `games`); hiển thị `CORRECTION_BLOCKED_DOWNSTREAM`; route ghi của Cài đặt đòi `need: 'write'` |
| `ui-contract.test.js` (bổ sung) | Trận đấu không render ô BO cho stage v4; Cài đặt không có "Sinh lại lịch"/"Số ván theo vòng"; vùng nguy hiểm bắt lý do, ẩn với member; thẻ "Đăng ký mở" chỉ với giải cộng đồng |

Test cũ `ui-results`, `ui-round-scoring`, `ui-standings` sửa theo → ghi ADR-006.
