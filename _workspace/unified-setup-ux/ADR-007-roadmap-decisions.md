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

## Bổ sung — Epic 1 (loại kép), brainstorm 2026-09-24

Chốt bằng AskUserQuestion (người dùng chọn cả bốn phương án đề xuất). Spec: `docs/superpowers/specs/2026-09-24-epic-1-double-elim/`.

| Mã | Quyết định | Lý do |
|---|---|---|
| D21 | Tên vòng: `Nhánh thắng · Vòng r` / `Bán kết nhánh thắng` / `Chung kết nhánh thắng`; `Nhánh thua · Vòng r` / `Chung kết nhánh thua`; `Chung kết tổng`. Mã nội bộ `W<r>-<ô>`, `WF`, `L<r>-<ô>`, `LF`, `GF` | Dễ hiểu với VĐV phong trào; mã ngắn chỉ dùng nội bộ |
| D22 | Không trận tranh hạng ba. Hạng 3 = thua `LF`; hạng 4 = thua trận nhánh thua ngay trước `LF`; còn lại đồng hạng theo vòng bị loại ở nhánh thua (5–6, 7–8, 9–12…) | `LF` đã phân hạng 3 tự nhiên; không thêm trận/nhánh bất biến |
| D23 | Chống gặp lại sớm: người thua nhánh thắng từ vòng 2 được thả sang nửa đối diện nhánh thua (bảng hoán vị cố định theo số trận vòng nhận) | Engine thả 1:1 nên có thể tái đấu ngay đối thủ vừa gặp |
| D24 | Epic 1 deploy qua nhánh + PR nháp: agent apply migration (ROLLBACK trước, md5 sau) và kiểm thử tích hợp; người dùng chạy browser CLB 59 rồi merge | Người dùng giữ quyền quyết định lên production |

## Bổ sung — Epic 2 (tối ưu điều hành), brainstorm 2026-09-24

Chốt bằng AskUserQuestion. Brief thiết kế: `_workspace/epic-2-operations/01_stitch_brief.md`.

| Mã | Quyết định | Lý do |
|---|---|---|
| D25 | Giữ D16: màn điều hành làm trên **Stitch** theo brief (không mockup HTML tự dựng); chỉ chia lát code sau khi màn có ở `canonical/operations/`. Cập nhật cùng ngày: người dùng kết nối Stitch connector và yêu cầu agent tương tác trực tiếp → agent sinh OPS-01…07 | Nhất quán với bộ setup đã duyệt |
| D26 | Lát đầu Epic 2 là **trung tâm điều hành theo sân/lượt**, gom luôn các nợ liên quan (ô chờ theo nguồn, bỏ ô BO theo lượt, lỗi phiên bản trận sau tiến cấp, chặn Back khi chưa lưu) | Người dùng ưu tiên màn chạy giải trong ngày |
| D27 | Deploy Epic 2 như D24: nhánh + PR nháp, agent apply migration (nếu có) và kiểm thử tích hợp; người dùng chạy browser CLB 59 rồi merge | Người dùng giữ quyền lên production |
| D28 | Phạm vi nợ = danh sách đã ghi trong roadmap mục Epic 2; không thêm lỗi mới ở vòng này | Người dùng xác nhận |
