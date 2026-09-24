# ADR-007 — Quyết định roadmap module giải đấu sau đợt Stitch

Ngày: 2026-09-24 · Trạng thái: đã chốt với người dùng (AskUserQuestion, 2 vòng) · Tiếp nối ADR-005 (D1–D12)

Bối cảnh: Lát 0/A/B/C (vòng bảng → loại trực tiếp, vòng tròn, loại trực tiếp) đã lên production và người dùng
đã duyệt. Roadmap chi tiết: `docs/superpowers/plans/2026-09-24-tournament-roadmap.md`.

| Mã | Quyết định | Lý do |
|---|---|---|
| D13 | Thứ tự: **Double elimination → Tối ưu điều hành → Giao hữu liên CLB → Giải cộng đồng → MLP** | DE nhỏ nhất, dùng lại toàn bộ pipeline v4 và cho biết màn điều hành cần gì (nhánh W/L/GF). MLP đổi đơn vị thi đấu sang đội ở mọi tầng và hợp với giải liên CLB, nên làm sau khi mô hình nhiều CLB ổn định |
| D14 | DE **không đá lại** chung kết tổng (không bracket reset). Chung kết tổng chọn BO như `F` hiện nay; mọi trận khác BO1 (giữ D8) | Tránh trận kích hoạt theo điều kiện và hàm SQL mới |
| D15 | DE nhận **4–32 cặp, có bye** | Linh hoạt như loại trực tiếp. Hệ quả: phải thu gọn nhánh thua khi nguồn là bye — không được sinh trận chỉ có một bên (giữ D12) |
| D16 | Điều hành: **thiết kế Stitch trước**, rồi mới chia lát code. Phần thiết kế được làm song song khi đang code DE | Đợt setup cho thấy có thiết kế chuẩn thì code ít lệch |
| D17 | Giao hữu: **chỉ ghép cặp trong cùng CLB** | Mỗi cặp đại diện một CLB; xếp hạng theo CLB rõ ràng |
| D18 | Giao hữu: **admin CLB khách tự đăng ký** thành viên của mình trong hạn mức; CLB chủ nhà duyệt | Đúng ranh giới dữ liệu giữa các CLB (multi-tenant) |
| D19 | Giải cộng đồng: VĐV **bắt buộc có tài khoản VĐV PickHub** (`athlete_accounts`); chỉ admin cấp hệ thống (`platform_accounts`) tạo giải | Danh tính sạch, tính được xếp hạng. Lưu ý: `platform_accounts` hiện 0 dòng — cần quy trình cấp tài khoản admin hệ thống |
| D20 | MLP bản đầu **không ràng buộc giới tính**: đội tự xếp cặp từng ván con, có dreambreaker | `club_members`/`athletes` chưa có cột giới tính; engine `match/mlp.js` đã hỗ trợ kiểu "vòng/cặp" |

Các câu hỏi còn để ngỏ, chốt ở vòng brainstorm của từng việc: xem mục "Câu hỏi mở" của từng epic trong roadmap.
