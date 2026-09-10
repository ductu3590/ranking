# Pickhub — Hệ thống quản lý CLB Pickleball

Next.js 14 (App Router, JavaScript thuần) + Supabase. Multi-tenant theo `group_id`, auth bằng cookie `group_session` (code + password, role admin/member — KHÔNG dùng Supabase Auth). Quy ước kỹ thuật chi tiết: skill `pickhub-engineering`.

## Môi trường dữ liệu và vận hành

- Đây là dự án PickHub đang vận hành thực tế, làm trực tiếp trên project hiện hữu và database Supabase hiện hữu.
- Database hiện có ít nhất một CLB đang hoạt động thực tế; có thể tạo thêm CLB/roster/tournament test ngay trên database này.
- Migration, seed và hướng dẫn kiểm thử tích hợp được phép chạy trực tiếp trên database Supabase hiện hữu khi cần.
- Agent có quyền dùng Supabase MCP để đọc schema/dữ liệu cần thiết, chạy SQL kiểm tra và apply migration trực tiếp; không yêu cầu user copy chạy từng câu SQL thủ công.
- Khi kiểm tra hoặc sửa database, agent phải tự xác định project từ cấu hình hiện tại, scope dữ liệu test rõ ràng và báo cáo kết quả truy vấn/migration.
- Ưu tiên tuyệt đối là không mất dữ liệu: không dùng `DROP`, `TRUNCATE`, reset database hoặc thao tác phá huỷ dữ liệu nếu chưa có yêu cầu rõ ràng.
- Khi cần kiểm thử dữ liệu thật, dùng tên/CLB/giải test riêng, scope đúng `group_id`, và dọn dữ liệu test bằng thao tác an toàn sau khi xác nhận không ảnh hưởng dữ liệu hoạt động.
- Không mặc định yêu cầu database rehearsal riêng; chỉ dùng môi trường riêng nếu thao tác có nguy cơ phá dữ liệu hoặc user yêu cầu.

## 하네스: Module Giải đấu (Tournament)

**목표:** Xây & quản lý module giải đấu Pickleball cho CLB phong trào — hỗ trợ MLP, vòng tròn tính điểm, loại trực tiếp, và mix đa giai đoạn; trên nền tảng engine thể thức tổng quát, clean-slate.

**트리거:** Mọi yêu cầu liên quan module giải đấu (xây/sửa/thêm thể thức, sinh lịch, bảng xếp hạng, bracket, trang quản lý giải, dọn code giải đấu cũ, và các yêu cầu tiếp nối) → dùng skill `tournament-orchestrator`. Câu hỏi đơn giản về luật một thể thức có thể trả lời trực tiếp.

**Đội hình:** `tournament-architect`, `tournament-engine-dev`, `tournament-api-dev`, `tournament-ui-dev`, `tournament-qa` (xem `.claude/agents/`). Skill: `tournament-orchestrator`, `pickleball-formats`, `pickhub-engineering` (xem `.claude/skills/`).

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-15 | Khởi tạo harness module giải đấu (5 agent + 3 skill + orchestrator) | 전체 | Build module giải đấu 4 thể thức, dọn code MLP cũ (clean-slate) |
| 2026-09-05 | Xác nhận triển khai trực tiếp trên PickHub/Supabase hiện hữu; cho phép tạo dữ liệu test, ưu tiên không mất dữ liệu | 프로젝트 운영 | Phù hợp database đang có CLB hoạt động thực tế |
