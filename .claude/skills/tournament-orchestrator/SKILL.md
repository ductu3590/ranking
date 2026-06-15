---
name: tournament-orchestrator
description: Điều phối team xây & quản lý module giải đấu Pickleball cho Pickhub (thể thức MLP, vòng tròn tính điểm, loại trực tiếp, mix đa giai đoạn). Dùng khi có yêu cầu liên quan module giải đấu — "xây/sửa module giải đấu", "thêm thể thức", "sinh lịch/bảng xếp hạng/bracket", "trang quản lý giải", "dọn code giải đấu cũ", và cả các yêu cầu TIẾP NỐI như "chạy lại", "làm tiếp", "cập nhật", "sửa phần ...", "chỉ làm lại engine/API/UI", "cải thiện kết quả trước". Câu hỏi đơn giản (vd luật một thể thức) có thể trả lời trực tiếp không cần cả team.
---

# Tournament Orchestrator

Điều phối 5 agent chuyên trách để thiết kế và xây module giải đấu Pickleball theo pipeline generation → validation, có supervisor (bạn) giám sát.

**Thực thi: Agent Team** (mặc định). Team tự điều phối qua SendMessage + TaskCreate; supervisor giám sát và tổng hợp. Truyền dữ liệu qua **file** (`_workspace/`) + **task** + **message**. Mọi Agent gọi với `model: "opus"`.

## Đội hình
| Agent | Vai trò | Skill |
|-------|---------|-------|
| `tournament-architect` | Domain + data model clean-slate + interface engine + spec | pickleball-formats, pickhub-engineering |
| `tournament-engine-dev` | Format engine JS thuần (lib/tournament/engines) | pickleball-formats, pickhub-engineering |
| `tournament-api-dev` | API routes + Supabase + migration | pickhub-engineering |
| `tournament-ui-dev` | Trang/component mobile-first tiếng Việt | pickhub-engineering |
| `tournament-qa` | QA so khớp biên + node contract test (incremental) | pickhub-engineering |

## Phase 0 — Kiểm context (LÀM ĐẦU TIÊN)
Xác định chế độ chạy:
- `_workspace/` CHƯA có → **chạy initial** (toàn pipeline).
- `_workspace/` đã có + user yêu cầu sửa một phần ("chỉ làm lại engine") → **partial**: chỉ gọi lại agent liên quan, đọc lại spec/contract cũ.
- `_workspace/` đã có + user đưa input mới/đổi hướng → **new run**: chuyển `_workspace/` → `_workspace_prev/` rồi chạy lại.

Chưa có spec thiết kế (chưa brainstorm) và đây là yêu cầu xây mới → **gợi ý brainstorm trước** (skill `superpowers:brainstorming`) để chốt thiết kế, rồi mới chạy pipeline.

## Pipeline (chế độ initial)
1. **Thiết kế (architect)** → `_workspace/01_architect_*.md`: data model + interface engine + danh sách endpoint + thứ tự triển khai. Supervisor + user duyệt spec trước khi sang bước build.
2. **Engine (engine-dev)** → `lib/tournament/engines/*` + `_workspace/02_engine_api.md` + test engine. → **QA incremental** ngay sau.
3. **API (api-dev)** → `app/api/...` + migration + `_workspace/03_api_contract.md`. → **QA so khớp engine↔API**.
4. **UI (ui-dev)** → `app/giai-dau/...` + `_workspace/04_ui_map.md`. → **QA so khớp API↔UI**.
5. **QA tổng hợp** → `_workspace/05_qa_report.md`; bug gửi đúng dev, lặp đến khi xanh.

Engine ↔ API ↔ UI build tuần tự vì có phụ thuộc shape; QA chạy xen kẽ (không dồn cuối).

## Điều phối team
- `TeamCreate` team `tournament-build` gồm 5 agent (3–5 người là vừa cho quy mô này).
- `TaskCreate` từng task với phụ thuộc (engine trước API trước UI; QA gắn sau mỗi build).
- Agent dùng SendMessage tự trao đổi shape/mâu thuẫn; supervisor theo dõi, không micro-manage.
- Sản phẩm trung gian ở `_workspace/` (giữ lại để audit), file cuối ở đúng vị trí dự án.
- Quy ước tên file workspace: `{phase}_{agent}_{artifact}.md` (vd `01_architect_datamodel.md`).

## Error handling
- Agent fail một task → thử lại 1 lần; vẫn fail → ghi thiếu vào `_workspace/05_qa_report.md`, tiếp tục phần khác, báo user rõ phần chưa xong.
- Dữ liệu mâu thuẫn giữa các lớp → KHÔNG xóa bên nào; ghi cả hai nguồn, để architect phân xử shape chuẩn.
- Migration phá vỡ → KHÔNG tự apply lên prod; chỉ tạo file migration + hướng dẫn user apply/deploy (xem pickhub-engineering).

## Test scenario
- **Luồng đúng**: yêu cầu "tạo giải vòng tròn 6 đội" → architect spec → engine sinh đủ 15 trận + standings tie-break → API lưu/đọc scope group_id → UI hiện bảng xếp hạng mobile → QA pass (shape khớp 3 lớp, node test xanh).
- **Luồng lỗi**: engine trả field `scoreA` nhưng API lưu `score_a` còn UI đọc `score_team_a` → QA bắt lệch ở `_workspace/05_qa_report.md`, gửi 3 dev thống nhất tên field theo contract architect, sửa, QA re-test xanh.

## Sau khi xong
Hỏi user phản hồi (Phase 7 của harness): cần chỉnh kết quả/đội hình/luồng nào không. Phản hồi lặp lại 2 lần cùng loại → đề xuất tiến hóa harness (sửa skill/agent tương ứng) và ghi vào CLAUDE.md "변경 이력".
