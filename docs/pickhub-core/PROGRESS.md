# Sổ tiến độ PickHub Core

File này là bản đọc cho con người. Trạng thái chuẩn cho máy nằm tại `progress.json`; mọi thay đổi phải cập nhật cả hai trong cùng commit.

## Trạng thái

| Hạng mục | Trạng thái | Nhánh | Điều kiện tiếp theo |
|---|---|---|---|
| Core blueprint | `awaiting_approval` | `codex/pickhub-core-blueprint` | Người phụ trách sản phẩm duyệt và merge vào `main` |
| UI Brand & Preview track | `completed` | `codex/pickhub-ui-brand-preview` | Design baseline đã khóa; triển khai production theo lát cắt của Phase 1–6 |
| Phase 1 — Ổn định nền tảng | `not_started` | Chưa tạo | Blueprint đã merge vào `main` |
| Phase 2 — Danh tính VĐV và CLB | `not_started` | Chưa tạo | Phase 1 completed và merge |
| Phase 3 — MVP giải liên CLB | `not_started` | Chưa tạo | Phase 2 completed và merge |
| Phase 4 — Vận hành giải | `not_started` | Chưa tạo | Phase 3 completed và merge |
| Phase 5 — Trình độ và ghép cân bằng | `not_started` | Chưa tạo | Phase 4 completed và merge |
| Phase 6 — Mở rộng toàn quốc | `not_started` | Chưa tạo | Phase 5 completed và merge |

## Completion ledger

Chưa có phase core triển khai nào hoàn thành.

UI Brand & Preview là design-lock track đã hoàn thành sau khi người phụ trách
sản phẩm xác nhận visual ngày `2026-09-02`. Evidence nằm tại
[`evidence/ui-preview-review.md`](./evidence/ui-preview-review.md); các component
production sẽ được triển khai và nghiệm thu bên trong sáu phase, không ghi nhận
như một phase thứ bảy.

| Track | Thời gian | Nhánh | Completion commit | Merge commit | Người xác nhận | Evidence | Ghi chú |
|---|---|---|---|---|---|---|---|
| UI Brand & Preview | `2026-09-02` | `codex/pickhub-ui-brand-preview` | `e147885` | Chưa merge độc lập | `product-owner` | [`evidence/ui-preview-review.md`](./evidence/ui-preview-review.md) | Visual đã duyệt; rollout production nằm trong Phase 1–6 |

Mỗi completion record sau này phải chứa: phase, thời gian, branch, completion commit, merge commit, người xác nhận, test evidence và ghi chú migration/release.

## Quy tắc cập nhật

- Chỉ trạng thái sau được dùng: `not_started`, `in_progress`, `blocked`, `awaiting_approval`, `completed`.
- Chỉ một phase được `in_progress` hoặc `awaiting_approval` tại một thời điểm.
- `completed` không được ghi nếu thiếu test evidence hoặc xác nhận của người phụ trách sản phẩm.
- Không xóa completion record cũ; khi sửa thông tin phải ghi thêm correction note.
