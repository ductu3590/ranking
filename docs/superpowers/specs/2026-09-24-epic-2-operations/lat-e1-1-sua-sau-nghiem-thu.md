# Lát E1.1 — Sửa sau nghiệm thu E1

Ngày: 2026-09-24 · Quyết định: ADR-007 D34–D36 · Nối tiếp [lat-e1-dieu-hanh.md](lat-e1-dieu-hanh.md). Không migration.

## Kết quả nghiệm thu E1 (người dùng, CLB 59, giải 220 "Giải mới 24.9")

Vòng bảng → loại trực tiếp, 3 sân, chạy tới Chung kết BO3: **quy trình hoàn tất 100%**, giao diện chưa đạt.
Người dùng nêu: (1) không nhập được điểm lớn hơn trần 15; (2) hết vòng bảng phải sang "Sơ đồ & xếp hạng" mới tiến
được vòng sau; (3) giao diện 4 mục khác xa Stitch. Agent soi ảnh chụp thấy thêm:

| # | Hiện trạng | Thuộc |
|---|---|---|
| a | Chốt chặng cuối xong giải vẫn `live` ("Đang diễn ra") trong khi trang Sơ đồ báo "Giải đã kết thúc" (banner màu lỗi) | E1.1 |
| b | "Trận vừa chốt" in tỉ số theo A–B: "X thắng 14–15, 13–15" khi X là B → đọc ngược | E1.1 |
| c | "Sân đang dùng 3" khi cả 3 sân trống (đếm sân bật, không đếm sân có trận) | E1.1 |
| d | Khi hết trận, 3 thẻ sân trống chiếm gần hết màn hình | E1.1 |
| e | Mục "Trận đấu": trận đã chốt vẫn có ô sửa điểm + nút "Lưu tỉ số" to; ô "BO1 🔒" theo lượt | E2 |
| f | Mục "Cài đặt": "2 trận · 2 đang đấu", "đã khoá vì vòng đang có trận diễn ra" cho trận đã chốt; khối "Số ván theo vòng" (trái D8); "Giải chưa có slug công khai" | E2 |

Giải thích (3): Epic 2 có ba lát — E1 (Điều hành) đã code; **E2 (Trận đấu · Sơ đồ & xếp hạng · Cài đặt) và E3
(trang công khai) chưa làm**, ba mục kia vẫn là component cũ đặt trong khung 4 mục. Thứ tự người dùng chọn: E1.1 → nghiệm
thu → E2 → E3.

## Phạm vi E1.1

1. **Luật điểm (D34)** — `validateGameScore` chỉ chặn hoà / âm / lẻ. Sheet nhập tỉ số hiện "BO n · bên nhiều điểm hơn
   thắng ván"; thông báo lỗi server không còn nhắc mốc tới / cách / trần. Chip luật trên thẻ sân chỉ còn `BO n`.
2. **Thẻ việc tiếp theo (D35)** — `buildOperationsBoard` trả `stageAction`:
   - `advance`: chặng chưa `completed`, mọi trận `finalized`, có chặng sau cùng division, định dạng `round_robin`;
   - `finish`: chặng cuối, `round_robin` hoặc `knockout`/`double_elim` v4;
   - `complete`: mọi chặng `completed` mà giải chưa `completed`;
   - không có hành động khi giải `draft` / `completed` / `archived`.
   Cùng điều kiện với nút ở `StandingsTab`. `NextStepCard` tải `/standings` (cột suất đi tiếp `outlook`) để tóm tắt BXH
   (vòng bảng) hoặc 4 hạng đầu (chặng cuối); bấm lần hai để xác nhận.
3. **Kết thúc giải (D36)** — `stageAction.js`: `finish` = `POST /advance` rồi `PATCH /tournaments {status: 'completed'}`
   (giải còn `scheduled` đi qua `live` trước); `complete` = chỉ PATCH. `StandingsTab` dùng chung; banner "Giải đã kết
   thúc" chỉ hiện khi giải thật sự `completed` và dùng màu thành công.
4. **Trận vừa chốt** — điểm cặp thắng đứng trước, thêm "trước <cặp thua>", nút "Xem", link "Xem toàn bộ N trận →"
   sang mục Trận đấu.
5. **KPI** — "Sân đang dùng" = `busyCourts/activeCourts`.
6. **Giao diện sát Stitch OPS-01** — dải tiến độ một hàng + bộ lọc giai đoạn (Tất cả · Vòng bảng · Loại trực tiếp; lọc
   hàng chờ và vừa chốt); tiêu đề "Sân thi đấu trực tiếp · N sân"; tên cặp canh giữa với viên "vs"; cột trái = sân +
   vừa chốt (không còn khoảng trống khi hàng chờ dài), hàng chờ bám dính bên phải; hết trận thì thu lưới sân thành
   một dòng. Sửa độ ưu tiên CSS: `.v2-console-shell button { font: inherit; color: inherit }` đè class một cấp.

## Kiểm thử

- `tests/stitch-setup/epic-2/e1-1-acceptance.test.js` — 7 ca (luật điểm, stageAction advance/finish/complete, tỉ số
  người thắng trước, KPI, nối UI).
- Sửa test cũ: xem ADR-006 mục "Epic 2 lát E1.1".
- Xem trước tạm (dựng từ `buildSetupPlan` + `buildOperationsBoard` thật, fetch giả lập; đã xoá): 1280 và 390, trạng
  thái giữa giải và "vòng bảng xong".

## Để lại cho E2

Mục (e), (f) ở bảng trên; component sơ đồ dùng chung; Tranh hạng ba tách khỏi Chung kết.
