# Friendly Screens (Epic 3 — Giải giao hữu liên CLB)

Sinh trực tiếp qua Stitch connector ngày 2026-09-25, project `16224817196221939744`, design system
`Pro Court OS` (sáng, asset `ca3eeb22ca9e4f738817511ae0f13aae`, khớp `../DESIGN.md` — Plus Jakarta Sans, tím `#7c3aed`).
Brief: `_workspace/epic-3-friendly/01_stitch_brief.md`. Hash + screen ID: `manifest.json`.
Ghi chú lệch brief / chỗ Stitch không làm theo: `_workspace/epic-3-friendly/02_stitch_notes.md` (**đọc trước khi code**).

Tất cả màn là **bản 390px** (tên file `reference-390*`), vẽ thành một cột 390px chiều cao tự nhiên trên canvas Stitch.
Chưa có bản 1280px (xem ghi chú). Nhiều màn là "bộ sưu tập trạng thái": các khối có nhãn nhỏ viết hoa
(`ĐÃ DUYỆT`, `LỖI KHI MỜI`…) — nhãn đó là chú thích thiết kế, **không** render trong app.

CLB mẫu: chủ nhà `CLB Test 23.9.2026` (chip tím `#7c3aed`), khách `CLB Test Responsive UI` (chip xanh cổ vịt `#0e7490`,
theo D48 thay cho "CLB Cầu Giấy" trong brief). CLB thứ ba (chỉ ở biến thể 3 CLB): `CLB Hồ Tây` `#b45309`.

| Key | Stitch screen ID | Mục đích | FRD |
|---|---|---|---|
| `01-host-invite/reference-390` | `c77f104dfbe44b31bb9cfa58f017cc1e` | Bước 2: khối "CLB tham dự · Đã mời 1/1", CLB khách `Chờ phản hồi`, menu ⋯ mở, nút `Mời CLB` **khoá** + câu gói trả phí, thẻ "Đăng ký của CLB khách" `Đang mở · còn 2 ngày` + `Khoá đăng ký` | FRD-01 (b)(e) |
| `01-host-invite/reference-390-type` | `95079ea9a490462089cfdd1165a1d8d0` | Bước 1: ô "Loại giải" (Nội bộ CLB / Giao hữu liên CLB) + trạng thái chỉ đọc "Không đổi được loại giải sau khi đã tạo" | FRD-01 (a) |
| `01-host-invite/reference-390-sheet` | `31088db2b8f24da59bbf58f8a520284b` | Bottom sheet "Mời CLB": tìm theo tên, danh sách CLB (chữ cái đầu), CLB đã mời khoá, CLB được chọn + stepper hạn mức 4 + lời nhắn 0/500 | FRD-01 (c) |
| `01-host-invite/reference-390-link` | `233bad25a5cc46c3a7b867179aa90644` | Dialog "Link mời" (trạng thái `Đã sao chép`, ghi chú link một lần) + lỗi sheet "Đã đủ hạn mức CLB khách" | FRD-01 (c)(d) |
| `01-host-invite/reference-390-states` | `811f8b1971a54811b1eadd6210774fde` | Trạng thái: chưa mời CLB nào (nút `Mời CLB` mở), CLB `Chờ duyệt` + `Xem & duyệt`, đăng ký `Đã khoá lúc 20:15` / `Đã qua hạn` + `Mở lại đăng ký`, xác nhận `Khoá đăng ký?` | FRD-01 (b)(e) |
| `02-host-review/reference-390` | `02680fbf584a499e914eb2a00cb63dd8` | Sheet duyệt danh sách: `Chờ duyệt`, "3/3 cặp trong hạn mức", `Duyệt` / `Yêu cầu sửa` / `Đổi hạn mức` | FRD-02 |
| `02-host-review/reference-390-request` | `22dfa01316954918a3781bcdc7ff481b` | Yêu cầu sửa: lý do bắt buộc + bộ đếm 23/300 + `Gửi yêu cầu`; xung đột "CLB vừa cập nhật danh sách" + `Tải lại` | FRD-02 |
| `02-host-review/reference-390-approved` | `14d0077087d2487e970ecbcefaa4cc1d` | Đã duyệt: cảnh báo "Sẽ phải bốc thăm lại nếu đã bốc", `Yêu cầu sửa`, `Đổi hạn mức`, `Rút CLB` | FRD-02 |
| `03-host-pairs-draw/reference-390-step3` | `a0d1286def99416cb90c4d1979a9546e` | Bước 3: cặp chủ nhà (Tách) + nhóm "Cặp CLB khách" chỉ đọc, "7 cặp (4 của bạn + 3 của CLB Test Responsive UI)" | FRD-03 |
| `03-host-pairs-draw/reference-390-step3-blocked` | `6420f81be8a34b459bdc600c63e8a982` | Bước 3 bị chặn: "Còn CLB chưa được duyệt danh sách: …" + `Tới danh sách CLB`, `Tiếp tục` khoá | FRD-03 |
| `03-host-pairs-draw/reference-390-step4` | `4ce65d95aac44a58a23a9b806438397d` | Bước 4: Bảng A 2 tím + 2 xanh, Bảng B 2 tím + 1 xanh, cảnh báo rải CLB (amber), khối chốt có dòng link xem không liệt kê | FRD-03 |
| `04-notifications-inbox/reference-390-bell` | `960dc6e5765541a38d56000c6e7f2e90` | Chuông "Việc cần xử lý": lời mời, yêu cầu sửa, danh sách cần duyệt (chủ nhà), giao dịch chưa gán (cũ) | FRD-04 |
| `04-notifications-inbox/reference-390-inbox` | `d17937ad83d04baa97492303791814ae` | Trang "Lời mời giải giao hữu": nhóm Cần bạn xử lý / Đang diễn ra / Đã xong, trạng thái trống, thẻ lối vào dashboard "Lời mời giải giao hữu (1)" | FRD-04 |
| `05-invite-link/reference-390-login` | `e2981b7d65f54d5ca805ae14c1fc2afe` | Link mời khi chưa đăng nhập: hộp đăng nhập CLB + "Đăng nhập CLB để mở lời mời giải"; khung xương "Đang mở lời mời…" | FRD-05 (1) + trạng thái đang kiểm |
| `05-invite-link/reference-390-wrong-club` | `06583d50156e4960adf84f610c3ba38a` | Sai CLB: khoá, "Link mời này dành cho một CLB khác", chỉ tên CLB đang đăng nhập | FRD-05 (2) |
| `05-invite-link/reference-390-states` | `b70d6341f73c497b82c66e406ad09294` | Cần quyền quản trị / Link không hợp lệ hoặc đã thu hồi / Đăng ký đã đóng | FRD-05 (3)(4)(5) |
| `06-guest-registration/reference-390` | `428b32bc28fa4f82b98b97e15168c2de` | Đang đăng ký: chọn thành viên (Chọn toàn bộ, "Chưa có hồ sơ thi đấu" mờ), chạm 2 chip → `Ghép cặp`, cặp có `Tách`, 2/3 cặp, thanh đáy `Lưu nháp` · `Gửi danh sách` + "Chưa lưu thay đổi" | FRD-06 |
| `06-guest-registration/reference-390-invited` | `57d0bf47c95d499692567ac9577f076d` | Chờ phản hồi: đầu trang đầy đủ + lời nhắn; `Nhận lời` / `Từ chối` + hộp xác nhận từ chối | FRD-06 |
| `06-guest-registration/reference-390-changes-requested` | `5850d8cb3ea144e2b2f5124b6786f6cf` | Cần sửa: banner lý do; vượt hạn mức 4/3 (đỏ); blocker người lẻ + `Chọn thêm một người` / `Bỏ chọn người lẻ`; `Gửi danh sách` khoá | FRD-06 |
| `06-guest-registration/reference-390-submitted-approved` | `9cbe84b84cc342d1889e0079d08a81e8` | Chờ duyệt (chỉ đọc + `Rút lại để sửa`) và Đã duyệt (emerald + `Rút khỏi giải` có xác nhận) | FRD-06 |
| `06-guest-registration/reference-390-closed-finalized` | `6ad857ccac5445ea90ee7293419c4353` | Đăng ký đã đóng (banner xám, mọi nút khoá) và Đã chốt (`Xem trang giải`) | FRD-06 |
| `06-guest-registration/reference-390-conflict` | `b58d1a7ed6714a378fc15d4e124026c7` | Xung đột "Danh sách vừa được lưu ở máy khác" + `Tải bản mới nhất`; hộp "Rời trang khi chưa lưu?" | FRD-06 |
| `07-club-standings/reference-390` | `847b4f7619e8448cb3a1e62c48057dce` | Bàn điều hành › Sơ đồ & xếp hạng: thẻ đối đầu "5 – 4", BXH cặp có chip CLB, trận thắng đậm/xanh, chưa đấu chữ thường | FRD-07 |
| `07-club-standings/reference-390-3clubs` | `71cf270326ef48a0881a7365d2783c3f` | Biến thể 3 CLB (gói trả phí sau này): bảng hạng/CLB/trận/T–B/HS + sơ đồ mini có chip | FRD-07 |
| `07-club-standings/reference-390-bracket` | `1bb7648053fa449c9a70b0674bcf1f75` | Sơ đồ loại trực tiếp có chip CLB trong ô cặp | FRD-07 |
| `08-public-friendly/reference-390` | `6cda1e543469444cab47357ab1f5e3d1` | Trang công khai, tab Trực tiếp: nhãn "Giao hữu liên CLB", hai chip CLB + "5 – 4", chip cạnh cặp ở Đang đấu / Sắp tới / Vừa xong | FRD-08 |
| `08-public-friendly/reference-390-standings` | `6f3470c4833c48ee8f506581e85986c6` | Trang công khai, tab Xếp hạng: đoạn chuyển `Cặp · CLB`, thẻ đối đầu chỉ đọc, BXH cặp có chip | FRD-08 |

## Lưu ý khi code (thiết kế ≠ nghiệp vụ; spec/ADR thắng)

- Quy tắc chung của `../README.md` vẫn áp dụng: không chép Tailwind/CDN, dữ liệu thật, tiếng Việt.
- Bỏ các nhãn/câu Stitch tự thêm mà hệ thống không có — danh sách cụ thể trong `02_stitch_notes.md` §2
  (vd "Chính thức", "2 VĐV CLB", số thứ tự `01/02`, "PLAYOFF", "Khách mời" cho CLB khách, điểm đang đấu 8–6, "trọng tài").
- Nhãn trạng thái, câu lỗi lấy từ API (`statusLabel`, `error`), không chép cứng từ ảnh.
- Các bản trung gian (trước khi sửa) vẫn còn trong project Stitch; bản chuẩn là các ID ở bảng trên.
