# ADR-002 — Tách tài khoản, VĐV và membership

- Trạng thái: `proposed`
- Ngày: 2026-09-02

> Phạm vi hiện hành: ADR này mô tả data model dài hạn, không yêu cầu triển khai
> profile/account để truy cập PickHub. Cách đăng nhập hiện tại được quyết định
> riêng tại [ADR-003](./ADR-003-club-code-password-first-access.md).

## Bối cảnh

Nhiều VĐV địa phương chưa muốn tạo tài khoản; đồng thời một VĐV có thể sinh hoạt tại nhiều CLB. Dùng row thành viên CLB làm danh tính toàn hệ thống sẽ tạo hồ sơ trùng và mất lịch sử.

## Quyết định về data model

Tách `profile`, `athlete` và `club_membership`. Athlete có thể chưa được claim. Profile sau khi xác minh có thể claim đúng một athlete. Membership nối athlete với CLB theo thời gian.

Trong Phase 2, `profile` và claim là lớp tùy chọn chưa bật. Access session vẫn là
Mã CLB + mật khẩu; athlete/membership phải hoạt động bình thường ở trạng thái
`unclaimed`.

## Hệ quả

- Trưởng CLB vẫn nhập roster mà không ép VĐV onboard.
- Cần quy trình chống trùng và claim/merge có audit.
- Lịch sử thi đấu và rating đi theo athlete, không đi theo tên hoặc CLB.
