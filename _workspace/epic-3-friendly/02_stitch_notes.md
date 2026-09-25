# Epic 3 — Ghi chú sinh màn Stitch FRD-01…08

Ngày 2026-09-25. Agent sinh màn qua Stitch connector (D25, D44), project `16224817196221939744`, design system
`Pro Court OS` sáng (`assets/ca3eeb22ca9e4f738817511ae0f13aae`). Kết quả + screen ID:
`_workspace/stitch-internal-setup/canonical/friendly/README.md`, hash: `.../friendly/manifest.json`.

**Lần chạy lại:** `list_screens` đầu phiên không có màn giao hữu nào từ lần chạy bị ngắt → toàn bộ 27 màn là sinh mới,
không tái dùng màn nào. Không sửa/xoá màn setup/operations cũ.

## 1. Chỗ Stitch không làm theo / giới hạn công cụ

1. **Chỉ có bản 390px.** Nhiệm vụ lần này yêu cầu Mobile 390px; brief §2 còn muốn bản 1280px cho màn chủ nhà
   (FRD-01/02/03/07) và bản 1280 cho FRD-04/06/08. **Chưa sinh bản 1280** — cần một lượt sau nếu F3 cần desktop.
2. **`deviceType: MOBILE` bị Stitch bỏ qua**: mọi màn trả về `DESKTOP`, canvas 2560px; màn hình 390px được vẽ thành cột
   giữa canvas. Lần sinh đầu (FRD-01) còn dựng khung điện thoại cao cố định nên ảnh bị cắt → đã sửa bằng prompt "cột 390px
   chiều cao tự nhiên, không khung, không cuộn trong" và dùng câu đó cho mọi màn sau.
3. **PNG là ảnh thu nhỏ** (rộng 780px, tải bằng hậu tố `=w780` trên URL `lh3.googleusercontent.com` của Stitch, giống
   Epic 2). HTML là bản đầy đủ — khi đối chiếu chi tiết, mở `reference-390*.html`.
4. **Sửa chữ nhỏ bằng `edit_screens` không vào file export**: Stitch áp thành thao tác DOM trên canvas (giống Epic 2 đã ghi);
   URL HTML/PNG không đổi. Gặp ở `01-host-invite/reference-390-link` (vòng sửa 2): trang nền **bị làm mờ** phía sau dialog
   vẫn còn chữ `Tournament Manager`, `DUPR: 3.85/3.50`, tên "Nguyễn Hoàng Nam (Đội trưởng)", chip "Chờ duyệt", "0/8 vđv".
   Đã hết 2 vòng sửa → giữ bản này; **bỏ qua toàn bộ trang nền mờ** khi code (chỉ lấy dialog + panel lỗi).
5. **Icon font Material Symbols** đôi khi chưa tải khi Stitch chụp ảnh → ảnh hiện chữ thô (`emoji_events`…). Gặp ở chuông
   FRD-04; đã sinh lại bằng SVG inline (`960dc6e5…`). Các màn sau đều yêu cầu SVG inline.
6. **Màn nhiều trạng thái** được vẽ thành "bộ sưu tập" xếp dọc có nhãn nhỏ viết hoa (`LỖI KHI MỜI`, `ĐÃ DUYỆT`…) vì mỗi
   lần sinh là một canvas; nhãn đó không phải UI.
7. Không cập nhật `canonical/stitch-source-manifest.json` (brief §6.2 có nhắc) — nhiệm vụ chỉ giao `friendly/manifest.json`
   + mục trong `canonical/README.md`.

## 2. Chữ/chi tiết Stitch tự thêm — bỏ khi code

| Màn | Chi tiết thừa / sai | Cách xử lý |
|---|---|---|
| 01-type | Stepper ghi "Người dự", "Thể thức", "Bốc thăm" (rút gọn) | Dùng nhãn 4 bước đã có của setup |
| 01-link | Trang nền mờ có DUPR, tiếng Anh (xem §1.4) | Bỏ trang nền |
| 01-link | Nút `Đã sao chép` màu emerald đặc | Theo token: emerald nhạt (badge-emerald) hoặc giữ, tuỳ component nút hiện có |
| 02 (chờ duyệt) | Nhãn "Chính thức" cạnh mỗi cặp; teal `#0d9488` (không phải `#0e7490`) ở chữ "Cặp 1…" | Bỏ nhãn; màu CLB luôn `#0e7490` |
| 03-step3, 06, 06-changes, 06-conflict | Huy hiệu số `01/02/03` cạnh cặp; "2 VĐV CLB (đã chọn)"; "BO1 (tới 11)" | Bỏ số thứ tự dạng badge (dễ hiểu nhầm hạt giống); dùng "Cặp 1 · …"; cấu hình ván lấy từ dữ liệu thật |
| 03-step4 | Lịch xem trước có 2 trận cùng "Lượt 1 · Sân 1" (Bảng A và Bảng B) — dữ liệu mẫu sai; nhãn "Khung giờ sáng"; bước 4 ghi "4. Lịch đấu" | Lịch lấy từ engine; nhãn bước giữ "Bốc thăm & chốt" |
| 04-bell | Nút "Đánh dấu đã đọc", "Cài đặt thông báo", "Tự động đồng bộ với hệ thống CLB" | Không có tính năng → bỏ (chỉ có `Bỏ qua` từng mục) |
| 04-inbox | Nút `Sửa danh sách` màu cam đặc | Dùng nút chính tím như các nút hành động khác |
| 05-login | Nhãn "Cổng CLB", "Bảo mật"; ô "Mã CLB" | "Mã CLB" là hộp đăng nhập CLB **hiện có** (code + mật khẩu), không phải "mã mời để gõ" (brief §3 cấm) — giữ hộp hiện có, bỏ nhãn thừa |
| 06-submitted-approved | Nhãn "Đã gửi" / "Chính thức" trên từng cặp | Bỏ |
| 07, 08-standings | Nhãn "Chủ nhà" / **"Khách mời"** dưới chip CLB | "Khách mời" dễ lẫn với khách mời cá nhân (D49 cấm) → dùng "CLB khách" hoặc bỏ nhãn |
| 07-3clubs | "PLAYOFF" (tiếng Anh), "3 đơn vị" | Bỏ / "Loại trực tiếp" |
| 07-bracket | "Vào chung kết tranh cúp", "Tranh Vô địch", "Chọn 2 cặp vào chung kết" | Nhãn vòng theo D21 |
| 08 (trực tiếp) | **Điểm đang đấu 8–6, 9–10** trên thẻ sân; "Cập nhật trực tiếp"; "Hệ thống tự động cập nhật kết quả từ trọng tài sân" | Không có chấm điểm từng pha (Epic 2): chỉ hiện ván đã lưu; bỏ câu "trọng tài"; "Tự động cập nhật" chỉ khi có polling thật |
| 08-standings | Nhãn "Khán giả", "Tiêu chí: Số trận thắng → Đối đầu → Hiệu số", "…ngay khi trọng tài chốt kết quả tại sân" | Tie-break lấy theo engine; bỏ câu "trọng tài" |
| Nhiều màn | Dòng chân trang "PickHub · Nền tảng/Cổng … Pickleball" | Bỏ (không có footer này trong app) |

## 3. Brief mơ hồ / quyết định của agent

1. **CLB khách mẫu**: brief dùng "CLB Cầu Giấy"; nhiệm vụ + D48 dùng "CLB Test Responsive UI" → dùng tên này ở mọi màn
   (câu dialog link: "CLB Test Responsive UI đã nhận thông báo…"). "CLB Cầu Giấy" chỉ còn là một dòng trong danh sách mời.
2. **Tên CLB rút gọn ≤ 14 ký tự**: "CLB Test 23.9.2026" (18) và "CLB Test Responsive UI" (22) đều dài hơn → dùng cắt
   có dấu `…`: `CLB Test 23.9…`, `CLB Test Resp…` (tên đầy đủ trong `title`, đúng lat-f3 §5). Brief §4 lại viết câu cảnh
   báo "CLB Test 23.9 có 4 cặp…" không có dấu `…` — giữ nguyên câu brief ở thẻ cảnh báo.
3. **Sheet "Mời CLB" với hạn mức 1**: brief yêu cầu một dòng "Đã mời · Chờ phản hồi" không chọn được, nhưng khi tài khoản
   thường đã mời 1 CLB thì nút `Mời CLB` khoá và sheet không mở được. Dòng này chỉ xuất hiện thực tế khi hạn mức > 1
   (gói trả phí) hoặc khi CLB đó ở trạng thái đã mời nhưng không chiếm suất (sẽ không xảy ra với "Chờ phản hồi").
   Đã vẽ theo brief (dòng "CLB Mỹ Đình") để có mẫu hiển thị — **cần chốt**: với tài khoản thường, dòng này có thể không bao
   giờ hiện.
4. **Avatar chữ cái**: brief §2 nói "chữ cái cuối của tên" (Nguyễn Minh → M). Stitch làm đúng ở danh sách thành viên;
   CLB dùng chữ cái đầu (lat-f3 §3.2) — "CLB Test Responsive UI" → `C` (khó phân biệt các CLB bắt đầu bằng "CLB"; F3 có thể
   bỏ tiền tố "CLB" khi lấy chữ cái).
5. **Chuông FRD-04** gộp cả mục của CLB khách (lời mời, yêu cầu sửa) và của chủ nhà (danh sách cần duyệt) trong một panel —
   đúng brief ("để thấy hai loại sống chung"), dù thực tế một CLB hiếm khi thấy cả hai cùng lúc.
6. **Hạn chót** vẽ "11/10/2026 · 23:59" với giải ngày 12/10; "còn 2 ngày" tính từ 09/10 — số mẫu, không phải quy tắc.
