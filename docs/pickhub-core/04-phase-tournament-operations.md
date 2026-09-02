# Phase 4 — Vận hành giải

## 1. Mục tiêu

Biến MVP liên CLB thành công cụ vận hành giải ngoài sân đáng tin cậy: đăng ký có capacity/waitlist, check-in, thay người, điều phối sân/giờ, phân quyền nhập điểm, thông báo, xử lý mạng yếu và correction/audit đầy đủ.

Nhánh: `codex/phase-4-tournament-operations`

## 2. Kết quả người dùng

- BTC biết ai đã đăng ký, được duyệt, chờ, rút, đến sân hoặc vắng mặt.
- Captain thay người đúng quy trình mà không làm mất lịch sử.
- Trận được gán sân, khung giờ và scorekeeper; xung đột lịch được cảnh báo.
- Nhập điểm trên mạng chập chờn không tạo kết quả trùng hoặc ghi đè âm thầm.
- Mọi sửa kết quả đã chốt có lý do và dấu vết.
- VĐV/CLB nhận thông báo thay đổi quan trọng.

## 3. State machines mở rộng

### 3.1 Registration

`draft → submitted → eligibility_review → approved|waitlisted|rejected → checked_in|withdrawn|no_show`

- Capacity release có thể promote waitlist theo policy.
- Team/cặp chỉ complete khi đủ member đã duyệt theo rules.
- Withdraw và substitution lưu reason/time/actor.

### 3.2 Match

`pending → assigned → ready → live → submitted → finalized`

- `submitted` là kết quả chờ director/referee chốt nếu rules yêu cầu.
- Sau `finalized`, sửa bằng correction request: `requested → approved|rejected → applied`.

### 3.3 Schedule publication

`draft → published → revised → frozen`

- Mỗi lần publish/revise tăng version.
- Người dùng biết mình đang xem version nào.
- Sửa sân/giờ không thay đổi kết quả hoặc entry identity.

## 4. Mô hình dữ liệu

### 4.1 Venue và court

- `venues`: địa chỉ, timezone, contact, map link.
- `courts`: venue, label, surface/availability, active status.
- `time_slots`: tournament/division, start/end, court capacity.
- `match_assignments`: match, court, scheduled time, version, status.

### 4.2 Check-in

- `check_ins`: athlete/entry, tournament/division, status, method, actor, timestamp.
- QR token là short-lived/signed, không chứa private data.
- Captain/director có thể check-in hộ với audit.

### 4.3 Waitlist và substitution

- Waitlist position không dùng số cố định đơn thuần; lưu priority basis và created_at.
- Promotion là use case atomic, gửi notification và có deadline accept.
- Substitution tạo version mới của entry roster và giữ snapshot trước.
- Eligibility được chạy lại cho người thay.

### 4.4 Score submission và correction

- `score_submissions`: payload, client mutation ID, actor, device timestamp, server timestamp, version.
- `result_corrections`: before/after, reason, requester, approver, applied_at.
- Final match projection lấy bản được chấp nhận mới nhất, audit ledger giữ đầy đủ.

### 4.5 Announcements/notifications

- `announcements`: scope, severity, publish/expiry, author.
- `notification_deliveries`: recipient/channel/template, status, provider ID, retries.
- Domain phát event; adapter gửi email/Zalo/push. Provider failure không rollback nghiệp vụ chính.

## 5. Scheduling

Phase 4 cần scheduler có thể:

- Gán match vào court/time dựa trên availability.
- Không xếp một athlete vào hai match chồng thời gian.
- Tôn trọng rest interval tối thiểu cấu hình.
- Ưu tiên stage dependency và court capability.
- Trả conflict report nếu không thể xếp, không tự bỏ trận.
- Cho director chỉnh tay và khóa assignment.

Scheduler deterministic với cùng input/seed. Optimization nâng cao chỉ là đề xuất; director giữ quyền quyết định.

## 6. Offline và concurrency

- Score UI tạo client mutation ID và lưu queue cục bộ khi offline.
- Server idempotent theo mutation ID.
- Submit kèm expected match version.
- Nếu server đã có version mới, client hiển thị conflict; không last-write-wins.
- Queue retry có backoff và hiển thị trạng thái `pending`, `synced`, `conflict`, `failed`.
- Dữ liệu nhạy cảm trong local storage được tối thiểu hóa và xóa sau sync/logout.

## 7. Tài chính giải cơ bản

Phase 4 hỗ trợ ledger vận hành, chưa cần payment gateway:

- Registration fee obligation theo athlete/entry/club.
- Manual paid/unpaid/waived/refunded status có actor và chứng từ note.
- Settlement rule như tiền thua/tiền ăn là template-specific ledger.
- Không trộn ledger giải liên CLB với quỹ riêng của một CLB. Chuyển tiền giữa hai hệ phải là transaction liên kết rõ.

## 8. Reference UI

- Operations dashboard theo thời gian thật: check-in, sân, trận live, delay, conflict.
- Court board cho BTC và public board cho người xem.
- Captain substitution/waitlist actions.
- Scorekeeper “trận của tôi”, offline queue và conflict resolution.
- Director correction review và audit timeline.
- Announcement composer và delivery status.

Nếu design system mới đã vượt gate riêng, UI Phase 4 dùng nó; nếu chưa, vẫn dùng reference components ổn định, không chờ redesign.

## 9. Ngoài phạm vi

- Thu tiền online/payment gateway và kế toán thuế đầy đủ.
- AI tự quyết định scheduling.
- Rating chính thức từ kết quả; thuộc Phase 5.
- Self-service national onboarding; thuộc Phase 6.

## 10. Test matrix bắt buộc

### Unit/domain

- Registration/waitlist/check-in/match/correction state machines.
- Capacity và waitlist promotion.
- Substitution eligibility và roster version.
- Scheduler conflict/rest/dependency rules.
- Finance ledger totals và reversal.

### Integration/concurrency

- Hai thiết bị submit cùng match: một thành công, một conflict rõ.
- Retry cùng mutation ID không tạo submission trùng.
- Offline queue sync đúng thứ tự và không bỏ mutation.
- Waitlist promotion atomic khi hai slot được giải phóng đồng thời.
- Correction applied tạo audit và projection đúng.
- Notification provider fail không làm mất registration/result.

### Security

- Scorekeeper không sửa match ngoài assignment/scope.
- Captain không tự approve substitution hoặc correction.
- Public không đọc internal notes, finance hoặc delivery data.
- QR check-in token sai/hết hạn/replay bị chặn.

### E2E/rehearsal

- Registration đầy → waitlist → withdraw → promote → accept.
- Check-in nhiều CLB, xử lý no-show và substitute.
- Generate/publish/revise/freeze schedule.
- Nhập điểm với mô phỏng offline và conflict.
- Finalize rồi correction có phê duyệt.
- Xuất lịch/kết quả/roster cơ bản.

## 11. Exit gate

- Rehearsal toàn ngày thi đấu hoàn thành với dữ liệu gần quy mô thật.
- Không có lost update trong concurrency tests.
- Offline score flow được kiểm tra trên thiết bị/browser thật.
- Scheduler không tạo conflict athlete/court trong test corpus.
- Correction, audit và notification evidence đầy đủ.
- Evidence `evidence/phase-4-test-report.md` PASS.
- BTC pilot xác nhận operations dashboard đủ dùng tại sân.

## 12. Điều kiện mở Phase 5

Kết quả finalized có provenance rõ và có thể replay thành match history. Chỉ dữ liệu đạt chuẩn này mới được phép đưa vào rating.
