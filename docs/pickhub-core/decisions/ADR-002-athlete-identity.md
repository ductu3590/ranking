# ADR-002 — Tách tài khoản, VĐV và membership

- Trạng thái: `proposed`
- Ngày: 2026-09-02

## Bối cảnh

Nhiều VĐV địa phương chưa muốn tạo tài khoản; đồng thời một VĐV có thể sinh hoạt tại nhiều CLB. Dùng row thành viên CLB làm danh tính toàn hệ thống sẽ tạo hồ sơ trùng và mất lịch sử.

## Quyết định

Tách `profile`, `athlete` và `club_membership`. Athlete có thể chưa được claim. Profile sau khi xác minh có thể claim đúng một athlete. Membership nối athlete với CLB theo thời gian.

## Hệ quả

- Trưởng CLB vẫn nhập roster mà không ép VĐV onboard.
- Cần quy trình chống trùng và claim/merge có audit.
- Lịch sử thi đấu và rating đi theo athlete, không đi theo tên hoặc CLB.
