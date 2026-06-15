# Pickhub — Hệ thống quản lý CLB Pickleball

Next.js 14 (App Router, JavaScript thuần) + Supabase. Multi-tenant theo `group_id`, auth bằng cookie `group_session` (code + password, role admin/member — KHÔNG dùng Supabase Auth). Quy ước kỹ thuật chi tiết: skill `pickhub-engineering`.

## 하네스: Module Giải đấu (Tournament)

**목표:** Xây & quản lý module giải đấu Pickleball cho CLB phong trào — hỗ trợ MLP, vòng tròn tính điểm, loại trực tiếp, và mix đa giai đoạn; trên nền tảng engine thể thức tổng quát, clean-slate.

**트리거:** Mọi yêu cầu liên quan module giải đấu (xây/sửa/thêm thể thức, sinh lịch, bảng xếp hạng, bracket, trang quản lý giải, dọn code giải đấu cũ, và các yêu cầu tiếp nối) → dùng skill `tournament-orchestrator`. Câu hỏi đơn giản về luật một thể thức có thể trả lời trực tiếp.

**Đội hình:** `tournament-architect`, `tournament-engine-dev`, `tournament-api-dev`, `tournament-ui-dev`, `tournament-qa` (xem `.claude/agents/`). Skill: `tournament-orchestrator`, `pickleball-formats`, `pickhub-engineering` (xem `.claude/skills/`).

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-15 | Khởi tạo harness module giải đấu (5 agent + 3 skill + orchestrator) | 전체 | Build module giải đấu 4 thể thức, dọn code MLP cũ (clean-slate) |
