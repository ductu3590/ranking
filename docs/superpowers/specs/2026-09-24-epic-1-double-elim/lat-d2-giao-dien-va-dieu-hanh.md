# Lát D2 — Giao diện, bàn điều hành và kết thúc giải

Trạng thái: spec · Phụ thuộc: Lát D1 xanh test, migration 108 đã apply · Xem [README](README.md)

## 1. Mục tiêu

Người dùng tạo được giải loại kép qua luồng 4 bước, điều hành tới hết giải trên bàn điều hành (sơ đồ W/L/GF, nhập tỉ số, BXH, kết thúc giải) và xem trang công khai. (Registry đã bật ở D1; D2 hoàn thiện giao diện để deploy chung.)

## 2. Bước 3 — Thể thức (`app/giai-dau/v2/setup-v3/steps/`)

- Thẻ `Loại kép` xuất hiện qua `listFormats()`; mô tả `FORMAT_BLURB.double_elimination`: *Thua hai trận mới bị loại: nhánh thắng, nhánh thua và chung kết tổng.*
- Component mới `DoubleElimConfig.js` (mẫu `KnockoutConfig.js`), thẻ `C · Cấu hình nhánh & số ván`:
  - Tóm tắt: `n cặp → nhánh B · 2n−2 trận (nhánh thắng n−1, nhánh thua n−2, chung kết tổng 1).` + `k cặp được vào thẳng vòng 2 nhánh thắng theo bốc thăm.` khi có bye. n < 4 → `Cần ít nhất 4 cặp.`; n > 32 → `Tối đa 32 cặp.`
  - Bảng số ván: `Các trận trước chung kết tổng` → `BO1 (cố định)`; `Chung kết tổng` → chọn BO1/BO3/BO5.
  - Ghi chú: `Không đá lại chung kết tổng: thắng trận này là vô địch, kể cả khi cặp từ nhánh thua thắng.`
- Blocker `PAIR_COUNT_ABOVE_MAXIMUM` hiện như blocker Bước 3 khác.

## 3. Bước 4 — Bốc thăm & xem trước (`StepDraw.js`)

- Lời dẫn: `Bốc thăm xếp n cặp vào nhánh loại kép.`
- Thẻ kết quả bốc thăm dùng lại `KnockoutDraw` (tổng quát hóa chữ): `n cặp · nhánh B · 2n−2 trận`; `Cặp được vào thẳng vòng 2 nhánh thắng: …`.
- Sơ đồ: **ba khung** `Nhánh thắng`, `Nhánh thua`, `Chung kết tổng`; mỗi khung cuộn ngang, cột theo `bracketRound`, tiêu đề cột theo `roundLabel`. Thẻ trận hiện `title` + BO + hai ô (tên cặp hoặc nhãn chờ `Thắng trận 5` / `Thua trận 3`).
- Lịch dự kiến: cột "Vòng" = `roundLabel · title` (trận có tên riêng chỉ hiện tên). `setupSchedule` xếp theo lượt (`round`) như nhánh loại trực tiếp; `GF` dùng BO đã chọn.
- Tiêu chí xếp hạng (chỉ đọc): *Thắng chung kết tổng: vô địch; thua: á quân. Thua chung kết nhánh thua: hạng 3; thua trận nhánh thua ngay trước đó: hạng 4. Các cặp còn lại đồng hạng theo vòng bị loại ở nhánh thua.*
- Cảnh báo `DOUBLE_ELIM_BYE`: *Số cặp chưa tròn nhánh (8, 16, 32) nên một số cặp được vào thẳng vòng 2 nhánh thắng theo bốc thăm; nhánh thua được rút gọn tương ứng, không có trận thiếu đối thủ. Vẫn chốt được.*
- Hộp thoại bốc lại: `Vị trí các cặp trong nhánh hiện tại sẽ được thay bằng lần bốc mới.` (như loại trực tiếp).

## 4. Bàn điều hành

Dùng chung một bộ đọc khóa: `lib/tournament/doubleElimKeys.js` (thuần, chạy cả client) — `parseDoubleElimKey(matchKey) → { bracket, bracketRound }` (`WF` = vòng W lớn nhất, `LF` = vòng L lớn nhất, suy từ tập trận), `doubleElimRoundLabel`, `doubleElimMatchTitle`. Console và trang công khai **không** tự suy nhánh từ `round`.

- **Tab Sơ đồ (`BracketTab.js`):** nhận `schedule_format === 'double_elim'`; render `DoubleElimBracketView` (trong `bracketRender.js`) = ba khung W/L/GF, mỗi khung tái dùng cột/ô của `BracketView` (tên cặp, tỉ số, người thắng, ô chờ). Ô chờ ở trận chưa có cặp hiện `chờ` như hiện nay (nợ Epic 2 đã ghi: nhãn nguồn chính xác cho ô chờ).
- **Tab Kết quả (`ResultsTab`):** nhóm theo `round` (lượt) như hiện nay; `describeRound` cho stage `double_elim` trả `Lượt r` thay vì `Vòng r`. Không đổi luật BO theo vòng (Epic 2).
- **Tab BXH (`StandingsTab` + `standingsRender`):** `double_elim` dùng danh sách thứ bậc (`KnockoutStandings`) với nhãn từ engine; hạng `null` hiện `–`. Nút **Kết thúc giải** hiện cho stage `double_elim` v4 là chặng cuối (cùng điều kiện với `knockout` v4) → `advance` route → `advance_division_entry_stage(next NULL)`.
- **Tên thể thức ở danh sách/thiết lập:** `TournamentV2DashboardClient` và `SettingsTab` hiện `Loại kép` cho `double_elim`.

## 5. Trang công khai

`app/giai-dau/v2/[slug]/page.js` và `noi-dung/[division]/DivisionPublicView.js`: stage `double_elim` hiện sơ đồ ba khung + lịch + BXH như loại trực tiếp. API `tournaments/route.js` trả `final_standings` từ `finalStandingsFrom` (nhánh D1 §7).

## 6. Test Lát D2

| Nhóm | Ca |
|---|---|
| `ui-contract.test.js` | `StepFormatPairing` render `DoubleElimConfig`; `StepDraw` có ba khung W/L/GF và `data-testid` ổn định; `BracketTab`, `StandingsTab`, trang công khai nhận `double_elim`; `setupSchedule` BO cho `GF` |
| `keys.test.js` | `parseDoubleElimKey` cho `W1-3`, `WF`, `L2-1`, `LF`, `GF`; khóa lạ → `null` |
| Hồi quy | `npm run test:stitch-setup` toàn bộ + `npm run build` |
| Browser (người dùng, CLB 59) | Hành trình 4 bước với 7 cặp (1 bye) và 5 cặp; 390px / tablet / desktop; chốt; nhập hết tỉ số tới GF; BXH đúng D22; Kết thúc giải; trang công khai |

## 7. Deploy Epic 1 (D24)

1. Migration 108 đã apply ở D1 (ghi `_workspace/epic-1-double-elim/evidence.md`: md5, kết quả tích hợp).
2. Push nhánh `claude/epic-1-double-elimination-prnbda`, PR nháp.
3. Người dùng chạy thật trên browser (CLB 59) theo §6, giữ lại giải test; merge → Vercel deploy.
4. Cập nhật bằng chứng sau khi người dùng xác nhận.
