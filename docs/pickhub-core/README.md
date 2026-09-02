# PickHub Core

Thư mục này là nguồn sự thật kiến trúc và quy trình phát triển dài hạn của PickHub. Mục tiêu là giữ sản phẩm đi đúng hướng khi nhiều tính năng, CLB và người phát triển được bổ sung theo thời gian.

## Hiệu lực

Các quyết định trong thư mục này có mức ưu tiên cao hơn tài liệu tính năng cũ khi hai bên mâu thuẫn. Code hiện hữu chưa phù hợp được coi là nợ kỹ thuật cần xử lý theo lộ trình, không phải lý do để thay đổi kiến trúc đích.

Một thay đổi làm khác đi ranh giới module, mô hình sở hữu dữ liệu, quyền truy cập, thứ tự giai đoạn hoặc quality gate phải:

1. Tạo ADR trong `decisions/`.
2. Cập nhật tài liệu bị ảnh hưởng trong cùng nhánh.
3. Được người phụ trách sản phẩm xác nhận trước khi merge.

## Thứ tự đọc

1. [Kiến trúc lõi](./00-core-architecture.md)
2. [Quy trình giao hàng và quality gates](./DELIVERY-GOVERNANCE.md)
3. [Sổ tiến độ](./PROGRESS.md) và [trạng thái máy đọc](./progress.json)
4. Sáu thiết kế giai đoạn:
   - [Phase 1 — Ổn định nền tảng](./01-phase-foundation-hardening.md)
   - [Phase 2 — Danh tính VĐV và CLB](./02-phase-identity-clubs.md)
   - [Phase 3 — MVP giải liên CLB](./03-phase-interclub-tournament-mvp.md)
   - [Phase 4 — Vận hành giải](./04-phase-tournament-operations.md)
   - [Phase 5 — Trình độ và ghép cân bằng](./05-phase-player-rating.md)
   - [Phase 6 — Mở rộng toàn quốc](./06-phase-national-scale.md)
5. [Chiến lược giao diện](./UI-STRATEGY.md)
6. [Nhật ký quyết định kiến trúc](./decisions/README.md)

## Trạng thái hiện tại

Blueprint đang ở trạng thái `awaiting_approval`. Chưa giai đoạn triển khai nào được phép bắt đầu cho đến khi bộ tài liệu này được duyệt và merge vào `main`.

## Quy tắc bất biến

- Mỗi giai đoạn có đúng một nhánh chính, chỉ tạo sau khi giai đoạn trước đã hoàn thành và merge.
- Không được tự đánh dấu hoàn thành. Hoàn thành cần bằng chứng test và xác nhận của người phụ trách sản phẩm.
- `progress.json` là bộ nhớ trạng thái máy đọc; `PROGRESS.md` là bản giải thích cho con người. Hai file phải được cập nhật cùng nhau.
- Business logic nằm trong domain/service thuần, không nằm trong React component hoặc route handler.
- Quyền truy cập được kiểm tra ở server và database; ẩn nút trên giao diện không phải là bảo mật.
- Mọi dữ liệu liên CLB phải có mô hình sở hữu và ACL rõ ràng, không mượn `group_id` của một CLB làm chủ giả.
- Kết quả đã chốt, lịch sử đánh giá trình độ, tài chính và audit log không bị ghi đè không dấu vết.
- Giao diện có thể thay đổi toàn bộ mà không buộc thay đổi domain model hoặc API contract.
