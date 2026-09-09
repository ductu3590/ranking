# Prompt chuẩn giao Codex thực thi Phase 3

Dán nguyên khối dưới đây vào Codex. Mỗi lần chạy tiếp chỉ cần đổi số task ở mục "Task cần làm lần này".

---

Bạn là kỹ sư triển khai Phase 3 của PickHub (Next.js 14 App Router, JavaScript thuần, Supabase). Đây là dự án đang vận hành thật với dữ liệu CLB thật. Nhiệm vụ của bạn là thực thi kế hoạch Phase 3 **đúng thứ tự, đúng thiết kế đã chốt**, không tự ý đổi hướng kiến trúc.

## 1. Nguồn sự thật, đọc hết trước khi viết dòng code đầu tiên

Đọc theo đúng thứ tự này. Khi hai tài liệu mâu thuẫn, tài liệu đứng trước thắng:

1. `docs/superpowers/plans/2026-09-04-phase-3-interclub-tournament-mvp.md` — kế hoạch thực thi, là mệnh lệnh trực tiếp.
2. `docs/superpowers/specs/2026-09-04-phase-3-interclub-tournament-mvp-design.md` — quyết định thiết kế và interface.
3. `docs/pickhub-core/03-phase-interclub-tournament-mvp.md` — phạm vi Phase 3, mô hình dữ liệu, test matrix, exit gate.
4. `docs/pickhub-core/TOURNAMENT-MANAGEMENT-ARCHITECTURE.md` — mô hình nghiệp vụ tổng thể; **mục 14, 15, 16, 17 là ràng buộc bắt buộc**.
5. `docs/pickhub-core/00-core-architecture.md` — nguyên tắc lõi và danh sách anti-pattern bị cấm.
6. `docs/pickhub-core/04-phase-tournament-operations.md` — chỉ để biết cái gì thuộc Phase 4, **không triển khai trong lần này**.
7. `CLAUDE.md` và skill `pickhub-engineering` — quy ước kỹ thuật bắt buộc của dự án.

Nếu bạn thấy tài liệu mâu thuẫn nhau ở điểm ảnh hưởng tới code: **dừng lại, báo cáo mâu thuẫn kèm trích dẫn hai nguồn, hỏi trước khi chọn**. Không tự phân xử.

## 2. Ràng buộc kiến trúc tuyệt đối

Vi phạm bất kỳ điểm nào dưới đây là lệch hướng, phải sửa chứ không được biện minh:

- **Mô hình thi đấu hội tụ:** `tournament → division → entry → stage → match → game`. Stage và match bắt buộc có `division_id`. Luồng mới chỉ đọc `tournament_entries`. `tournament_entrants` chỉ còn là adapter đọc dữ liệu cũ, không phải mô hình chính, không xây tính năng mới trên nó.
- **Migration forward-only:** migration `030` đã được apply trên Supabase project `uhhlelemewilgsdijwja` (Ranking 246). **Không sửa file `030` hay bất kỳ migration đã apply nào.** Mọi thay đổi schema là file migration mới, đánh số tăng dần, additive, có preflight và verification query.
- **Không phá dữ liệu:** cấm `DROP TABLE`, `TRUNCATE`, `DELETE` không điều kiện, reset database. Backfill phải kiểm tra trước và abort khi dữ liệu nhập nhằng.
- **Danh tính tách bạch:** `community_admin` dùng `platform_accounts` + cookie `platform_session` riêng. Không bao giờ giả lập quyền hệ thống bằng `group_session`.
- **`group_id` là technical tenant tạm thời**, không phải mô hình sở hữu. Quyền thật đến từ `organizer_type`, `organizer_club_id`, platform actor và `tournament_id`.
- **Domain thuần:** `lib/tournament/**` và `lib/domain/**` không import React, Next.js hay Supabase client. Không có I/O trong validator.
- **Route mỏng:** `app/api/**` chỉ parse, authorize, gọi use case, map response. Không chứa thuật toán ghép cặp, tính BXH hay state transition.
- **Policy chứ không hard-code:** luật điểm số (`scoring`) và thứ tự tie-break (`tiebreak`) là dữ liệu có version, resolve theo tournament default → division override → snapshot vào `tournament_stages.config` khi commit draw. Engine nhận policy làm input. Thứ tự xếp hạng đang hard-code trong `roundRobin.computeStandings` trở thành preset `legacy_v2` và **phải tái lập đúng kết quả cũ** trên fixture hiện có.
- **Duplicate CLB trong pool là policy** `unique_per_pool | spread_if_possible | allow_multiple`, mặc định rải đều và cảnh báo. Không hard-block toàn cục.
- **Zalo:** không tích hợp Zalo OA/ZNS API. "Kênh Zalo" = Open Graph preview + xuất ảnh PNG từ public projection + copy text. Hệ thống không gửi tin thay người dùng.
- **Public projection dùng allowlist tường minh:** không trả ghi chú nội bộ, liên hệ, trạng thái xét duyệt chi tiết hay PHR khi BTC chưa bật công khai. Public lookup dùng slug toàn hệ thống, không lọc `group_id`.
- **Mọi mutation** kiểm tra transition hợp lệ và `expected_version`; thao tác nhiều bước chạy atomic; có idempotency key nơi kế hoạch yêu cầu.

## 3. Thứ tự thực thi, không được đảo

```
Task 1  Inventory, compatibility và preflight
Task 2  Platform identity và organizer authorization
Task 3  Hội tụ division, entry, stage, match          ← gate kiến trúc, không được bỏ qua
Task 4  Schema Phase 3: division options, CLB khách, VĐV khách
Task 5  Ghép cặp và draw theo ruleset
Task 5b Luật điểm số và tie-break policy
Task 6  Token scorekeeper và public projection an toàn
Task 6b Link chia sẻ, xuất ảnh và copy text
Task 7  Dựng lại Wizard trên mô hình đã hội tụ
Task 8  Test runner và runbook Phase 3
```

Task 3 là cửa chặn. Không được bắt đầu Task 4 trở đi khi Task 3 chưa xanh, vì mọi thứ sau đó đều giả định stage/match đã gắn division.

## 4. Quy trình bắt buộc cho từng task

1. Đọc lại mục tương ứng trong plan và spec.
2. **Viết test trước, chạy và quan sát nó fail thật.** Dán output fail vào báo cáo. Không viết implementation trước test.
3. Viết implementation tối thiểu để test xanh.
4. Chạy test focused của task, rồi chạy regression liên quan:
   - `npm run test:t-engines` sau mọi thay đổi engine hoặc standings.
   - `npm run test:t-api` sau mọi thay đổi API route.
   - `npm run test:t-ui` sau mọi thay đổi Wizard/console/public page.
   - `npm run test:phase3-interclub` sau mỗi task Phase 3.
5. Migration: viết file, chạy preflight query, apply qua Supabase MCP trên project `uhhlelemewilgsdijwja`, chạy verification query, dán kết quả thật vào báo cáo. Không báo "đã apply" khi chưa chạy.
6. Commit một task một commit, message tiếng Việt mô tả thay đổi.
7. **Dừng lại và báo cáo.** Không tự động chạy sang task tiếp theo.

## 5. Báo cáo cuối mỗi task

Báo cáo phải có đủ:

- Task số mấy, đã xong hay chưa xong.
- Danh sách file tạo/sửa.
- Lệnh test đã chạy và output thật, cả lần fail trước lẫn lần pass sau.
- Nếu có migration: câu preflight, câu verification và kết quả trả về.
- Điểm nào trong plan bạn **không** làm được và lý do.
- Giả định bạn đã tự đặt, nếu có.

Cấm báo "đã hoàn thành" khi test chưa chạy hoặc còn đỏ. Nếu bị chặn, nói rõ chặn ở đâu thay vì đi vòng bằng cách hạ phạm vi.

## 6. Lưu ý về tên script test

Repo **đã có** `test:phase3` (trỏ `tests/multitenant-phase3.test.js`) và `test:phase3-interclub`. Ở Task 8, **không ghi đè hai script này**. Thêm script mới với tên khác, ví dụ `test:phase3-core`, gộp toàn bộ file trong `tests/phase3/`, và cập nhật `test:regression` nếu phù hợp. Evidence ghi vào `evidence/phase-3-test-report.md` đã tồn tại, ghi bổ sung chứ không xóa nội dung cũ.

## 7. Task cần làm lần này

**Task 1.** Chỉ làm Task 1. Làm xong thì dừng và báo cáo theo mục 5.

---

## Prompt ngắn cho các lần tiếp theo

> Tiếp tục Phase 3 theo `docs/superpowers/plans/2026-09-04-phase-3-interclub-tournament-mvp.md`. Giữ nguyên toàn bộ ràng buộc kiến trúc và quy trình đã thống nhất ở lần trước: mô hình hội tụ division-entry-stage-match, migration forward-only không sửa file đã apply, platform session riêng cho `community_admin`, scoring/tiebreak là policy có version, Zalo chỉ là Open Graph + xuất ảnh + copy text. Lần này làm **Task N**. Viết test trước và cho tôi xem nó fail, sau đó mới implement. Xong Task N thì dừng và báo cáo đầy đủ.
