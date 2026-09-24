# Lát E2 — Trận đấu · Sơ đồ & xếp hạng · Cài đặt

Trạng thái: spec · Phụ thuộc: E1 · Xem [README](README.md)
Thiết kế: `canonical/operations/04-schedule-results`, `05-bracket/*`, `06-standings-finish`, `08-settings`.

## 1. Mục Trận đấu (OPS-04) — thay ResultsTab cho stage v4

- Danh sách mọi trận của giải, nhóm theo lượt/vòng (`matchLabel`), header nhóm `Lượt 3 · 6 trận · 2 đang đấu`;
  `Tranh hạng ba` là nhóm riêng, không nằm trong `Chung kết`.
- Lọc: giai đoạn (segmented), lượt, sân, trạng thái (`Chưa gọi`/`Đang đấu`/`Đã chốt`), ô tìm tên VĐV.
- Dòng: `code` phụ + `title`, hai cặp (ô chờ theo nguồn §E1-3), tỉ số từng ván `11–8, 9–11, 11–6`, chip luật chỉ đọc,
  sân, giờ, trạng thái. Chạm dòng → sheet nhập tỉ số của E1 (cùng component, cùng chặn).
- **Bỏ `RoundGroupHead` / ô BO1/BO3/BO5 theo vòng** với mọi stage có `config.scoring` (stage v4) — D8/D14. Stage
  legacy (không có `config.scoring`) giữ nguyên hành vi cũ; MLP giữ nguyên (Epic 5).
- **Sửa kết quả đã chốt:** sheet mở chế độ xem + `Sửa kết quả` → bắt buộc lý do, gửi `POST /games` (RPC hiện có cho
  phép lưu lại trận `finalized`). Nếu đổi người thắng mà trận sau đã có cặp → server trả `PLAYOFF_TARGET_CONFLICT`
  (E1 §6.2) → hiện hướng dẫn "Trận kế tiếp đã có cặp; chỉ sửa được tỉ số giữ nguyên người thắng." Ghi nhật ký
  `match_corrected` kèm lý do (dùng `correction.js` hiện có nếu khớp; không thì `writeOperationLog`).

## 2. Mục Sơ đồ & xếp hạng (OPS-05 + OPS-06)

Tab con `Sơ đồ | Xếp hạng`. Hai component **dùng chung với trang công khai** đặt ở `app/giai-dau/v2/shared/`
(chỉ đọc; nhận dữ liệu qua props, không tự fetch):

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
- Xếp hạng chung cuộc: bục 1–2–3 + danh sách `Hạng 4`, `Đồng hạng 5–6`… (từ `computeStageStandings` hiện có, nhãn
  `knockoutPlacementLabels` / D22). Chip `Tạm tính` khi giải chưa kết thúc.

### 2.3 Kết thúc giải (console)

Thẻ bên phải: số trận chưa chốt; nút `Kết thúc giải & chốt xếp hạng` chỉ bật khi 0 trận chưa chốt → hộp xác nhận →
gọi luồng `advance` hiện có (`advance_division_entry_stage`, next NULL). Sau khi kết thúc: khóa nhập tỉ số (route
`games` đã chặn qua trạng thái stage `completed` — kiểm lại; nếu chưa, thêm `STAGE_COMPLETED` 409).

## 3. Mục Cài đặt (OPS-08)

Các thẻ xếp chồng:

1. **Thông tin giải** — tên, ngày, địa điểm (API `tournaments` PATCH hiện có).
2. **Link công khai & chia sẻ** — chuyển phần chia sẻ từ `OverviewTab` (đang chết) + `ShareActions`: sao chép link,
   Chia sẻ Zalo, Xuất ảnh kết quả, QR (sinh client-side, không gọi dịch vụ ngoài). Không chip "Đang phát trực tiếp".
3. **Sân thi đấu** — từ `CourtsStep`: danh sách sân + toggle (lý do khi ngưng), `+ Thêm sân`, `Thời lượng trận ước
   tính`, `Khởi động` (lưu `tournaments.settings.operations.estimated_match_minutes|warmup_minutes`).
4. **Nhật ký thao tác** — 5 dòng mới nhất + `Xem toàn bộ`; mỗi dòng là **câu đọc được** do
   `lib/tournament/operationLogText.js` (thuần) sinh từ `action + before/after + tên trận/cặp/sân`
   ("14:32 · Admin chốt trận Bảng A · Lượt 2: Minh Tuấn + Hoàng Nam thắng 11–7"); không in JSON.
5. **Vùng nguy hiểm** (viền đỏ) — `Huỷ chốt lịch…` (luồng `unlockDraw` hiện có, lý do bắt buộc, hộp xác nhận nêu rõ
   xoá lịch + kết quả). **Không** có "Sinh lại lịch", "Số ván theo vòng", "Điều lệ MLP", "Kết thúc giải sớm".

Dọn code: gỡ `OverviewTab.js`, `steps/ControlStep.js`, `steps/CourtsStep.js`, `steps/LogStep.js`, `steps/DrawStep.js`
khỏi console khi phần dùng lại đã chuyển; `RoundScoringPanel` chỉ còn dùng cho stage legacy (nếu không còn chỗ dùng → gỡ).

## 4. Test

| File | Khóa |
|---|---|
| `bracket-view.test.js` | Render tĩnh (react-dom/server) K1/K2: đủ cột `LF`, khối Tranh hạng ba tách, `Miễn đấu`, không "Đội A", nhãn vòng từ `matchLabel` |
| `log-text.test.js` | Mọi `action` trong `ACTION_LABELS` → câu tiếng Việt, không chứa `{` |
| `ui-contract.test.js` (bổ sung) | Trận đấu không render ô BO cho stage v4; Cài đặt không có "Sinh lại lịch"/"Số ván theo vòng"; vùng nguy hiểm bắt lý do |

Test cũ `ui-results`, `ui-round-scoring`, `ui-standings` sửa theo → ghi ADR-006.
