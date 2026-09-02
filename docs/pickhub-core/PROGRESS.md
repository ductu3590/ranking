# Sổ tiến độ PickHub Core

File này là bản đọc cho con người. Trạng thái chuẩn cho máy nằm tại `progress.json`; mọi thay đổi phải cập nhật cả hai trong cùng commit.

## Trạng thái

| Hạng mục | Trạng thái | Nhánh | Điều kiện tiếp theo |
|---|---|---|---|
| Core blueprint | `completed` | `codex/pickhub-core-blueprint` | Đã được product owner duyệt ngày 2026-09-02; chờ ghi merge commit vào sổ máy đọc |
| Phase 1 — Ổn định nền tảng | `not_started` | Chưa tạo | Tạo nhánh sau khi blueprint merge vào `main` |
| Phase 2 — Danh tính VĐV và CLB | `not_started` | Chưa tạo | Phase 1 completed và merge |
| Phase 3 — MVP giải liên CLB | `not_started` | Chưa tạo | Phase 2 completed và merge |
| Phase 4 — Vận hành giải | `not_started` | Chưa tạo | Phase 3 completed và merge |
| Phase 5 — Trình độ và ghép cân bằng | `not_started` | Chưa tạo | Phase 4 completed và merge |
| Phase 6 — Mở rộng toàn quốc | `not_started` | Chưa tạo | Phase 5 completed và merge |

## Completion ledger

Chưa có phase triển khai nào hoàn thành.

Mỗi completion record sau này phải chứa: phase, thời gian, branch, completion commit, merge commit, người xác nhận, test evidence và ghi chú migration/release.

## Quy tắc cập nhật

- Chỉ trạng thái sau được dùng: `not_started`, `in_progress`, `blocked`, `awaiting_approval`, `completed`.
- Chỉ một phase được `in_progress` hoặc `awaiting_approval` tại một thời điểm.
- `completed` không được ghi nếu thiếu test evidence hoặc xác nhận của người phụ trách sản phẩm.
- Không xóa completion record cũ; khi sửa thông tin phải ghi thêm correction note.
