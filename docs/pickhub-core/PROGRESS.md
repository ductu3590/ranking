# Sổ tiến độ PickHub Core

File này là bản đọc cho con người. Trạng thái chuẩn cho máy nằm tại `progress.json`; mọi thay đổi phải cập nhật cả hai trong cùng commit.

## Trạng thái

| Hạng mục | Trạng thái | Nhánh | Điều kiện tiếp theo |
|---|---|---|---|
| Core blueprint | `completed` | `codex/pickhub-core-blueprint` | Đã được product owner duyệt ngày 2026-09-02 và merge vào `main` (`c210c358`) |
| UI Brand & Preview track | `completed` | `codex/pickhub-ui-brand-preview` | Design baseline đã khóa; triển khai production theo lát cắt của Phase 1–6 |
| Phase 1 — Ổn định nền tảng | `completed` | `codex/phase-1-foundation-hardening` | Đã merge vào `main` (`bc68e05`) và smoke production xanh ngày 2026-09-03 |
| Phase 2 — Danh tính VĐV và CLB | `not_started` | Chưa tạo | Phase 1 completed và merge |
| Phase 3 — MVP giải liên CLB | `not_started` | Chưa tạo | Phase 2 completed và merge |
| Phase 4 — Vận hành giải | `not_started` | Chưa tạo | Phase 3 completed và merge |
| Phase 5 — Trình độ và ghép cân bằng | `not_started` | Chưa tạo | Phase 4 completed và merge |
| Phase 6 — Mở rộng toàn quốc | `not_started` | Chưa tạo | Phase 5 completed và merge |

## Completion ledger

UI Brand & Preview là design-lock track đã hoàn thành sau khi người phụ trách
sản phẩm xác nhận visual ngày `2026-09-02`. Evidence nằm tại
[`evidence/ui-preview-review.md`](./evidence/ui-preview-review.md); các component
production sẽ được triển khai và nghiệm thu bên trong sáu phase, không ghi nhận
như một phase thứ bảy.

| Track | Thời gian | Nhánh | Completion commit | Merge commit | Người xác nhận | Evidence | Ghi chú |
|---|---|---|---|---|---|---|---|
| UI Brand & Preview | `2026-09-02` | `codex/pickhub-ui-brand-preview` | `e147885` | Chưa merge độc lập | `product-owner` | [`evidence/ui-preview-review.md`](./evidence/ui-preview-review.md) | Visual đã duyệt; rollout production nằm trong Phase 1–6 |

Phase 1 đã được merge vào `main`, deploy production và xác nhận smoke sau deploy.
Phase 1 được ghi `completed` theo completion record trong `progress.json`.

Completion record của Phase 1:

- Thời gian: 2026-09-03.
- Completion commit: `bdc2d0081490d62ab126cabb4429da42a3d6cb27`.
- Merge commit: `bc68e05c01a3c0a812151888f96fe28fa26ee73c`.
- Production deployment: `dpl_9W34rhQFyGQetvKkPU1MvGGWRzWw` (`READY`).
- Migration/release: production ledger 017–027 đã khớp checksum; không chạy lại migration khi deploy.
- Test evidence: `evidence/phase-1-test-report.md`, `evidence/phase-1-test-ci-main.txt`, `evidence/phase-1-test-isolation-production.txt`.

## Correction notes

- `2026-09-03`: Xác nhận lại access contract theo ADR-003. Phase 2 không yêu
  cầu tài khoản cá nhân, email/OTP hoặc Supabase Auth; member và trưởng nhóm
  dùng Mã CLB + mật khẩu, còn profile/claim chỉ là mở rộng tùy chọn trong tương
  lai.

## Quy tắc cập nhật

- Chỉ trạng thái sau được dùng: `not_started`, `in_progress`, `blocked`, `awaiting_approval`, `completed`.
- Chỉ một phase được `in_progress` hoặc `awaiting_approval` tại một thời điểm.
- `completed` không được ghi nếu thiếu test evidence hoặc xác nhận của người phụ trách sản phẩm.
- Không xóa completion record cũ; khi sửa thông tin phải ghi thêm correction note.
