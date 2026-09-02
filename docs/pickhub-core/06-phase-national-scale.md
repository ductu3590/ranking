# Phase 6 — Mở rộng toàn quốc

## 1. Mục tiêu

Đưa PickHub từ mạng lưới pilot do đội ngũ trực tiếp vận hành thành nền tảng self-service cho nhiều cộng đồng và CLB trên toàn quốc, có kiểm duyệt, vận hành, bảo mật, hỗ trợ và mô hình kinh doanh bền vững.

Nhánh: `codex/phase-6-national-scale`

## 2. Điều kiện tiền đề

Phase 6 không bắt đầu chỉ vì muốn tăng người dùng. Cần có:

- Retention và nhu cầu từ pilot được chứng minh.
- Quy trình onboarding/giải/rating đủ ổn định.
- Support burden và failure modes đã đo được.
- Tenant isolation, audit, backup và privacy đạt gate production.
- Quyết định rõ tính năng miễn phí/trả phí; không bắt buộc triển khai payment ngay đầu phase.

## 3. Community và tổ chức

### 3.1 `communities`

- Đại diện mạng lưới địa lý/tổ chức như PickHub Lào Cai.
- Community có admin/moderator, danh sách CLB, lịch và rules riêng trong giới hạn platform policy.
- CLB có thể thuộc nhiều community nếu policy cho phép.
- Community có thể tổ chức giải liên CLB và public landing page.

### 3.2 Club self-service

- Đăng ký CLB, xác minh owner, chống duplicate và abuse.
- Trạng thái `pending_verification`, `verified`, `restricted`, `suspended`.
- Import roster có preview, validation, duplicate candidate và rollback.
- Template cấu hình giúp CLB tự vận hành nhưng không chỉnh sâu core policy nguy hiểm.

### 3.3 Tournament self-service

- Verified club/community admin được tạo giải theo template được platform cho phép.
- Quota, rate limit và approval policy tùy trust tier.
- Custom rules phải versioned và hiển thị rõ cho người tham gia.
- Platform có quyền moderation nhưng mọi action có audit và appeal.

## 4. Discovery và community features

Ưu tiên công cụ tạo hoạt động thật, không xây social feed chung trước:

- Danh bạ CLB có location, lịch sinh hoạt, contact policy và verification badge.
- Calendar giải/giao lưu theo khu vực, level và thời gian.
- Open play/challenge invitation có capacity và eligibility.
- Follow/bookmark và notification preferences.
- Athlete/club/tournament public profile theo privacy.
- Search có moderation, rate limit và anti-scraping phù hợp.

Chat realtime không thuộc core; có thể dùng deep link tới kênh liên lạc hiện hữu cho đến khi có bằng chứng cần chat trong app.

## 5. Platform administration

- Admin console cho verification, duplicate merge, abuse report, suspension và data request.
- Support tooling có impersonation an toàn hoặc support session có consent/audit; không dùng shared admin account.
- Feature flags theo community/club/cohort.
- Template/ruleset registry có version và deprecation policy.
- Announcement/status page cho sự cố diện rộng.

## 6. Billing và entitlement

Thiết kế entitlement trước khi tích hợp thanh toán:

- Plan/feature/limit tách khỏi payment provider.
- Free core cho CLB pilot; paid candidates: advanced tournament ops, custom branding/domain, analytics, bulk notification, API/export nâng cao.
- Entitlement check ở server, không chỉ ẩn UI.
- Subscription/payment/refund ledger có idempotency và audit nếu được triển khai.
- Không khóa dữ liệu người dùng khi hết gói; giữ export/read policy rõ.

## 7. Hạ tầng và hiệu năng

### 7.1 SLO ban đầu

Chốt SLO dựa trên dữ liệu Phase 3–5 cho:

- API availability và latency.
- Score submission success/latency.
- Notification delivery.
- Recovery point/time objective.

Không ghi con số giả trước khi có baseline; SLO được phê duyệt bằng ADR đầu Phase 6.

### 7.2 Scaling

- Query/index review theo production traces.
- Public projection/cache và CDN cho trang giải đông người xem.
- Background job/queue cho notification, export, rating recompute và import.
- Connection pooling và rate limits.
- Object storage/CDN cho media.
- Load test theo tournament concurrency, không chỉ tổng user count.

### 7.3 Điều kiện tách service

Chỉ tách module khi ít nhất một điều đúng:

- Cần scale/deploy độc lập có số liệu.
- Một module có failure domain cần cô lập.
- Đội riêng sở hữu và contract đã ổn định.
- Compliance/data residency yêu cầu.

Tách service phải có ADR, API/event contract, migration và observability plan.

## 8. Security, privacy và compliance

- Data inventory/classification và retention schedule.
- Consent, public visibility, export, correction và deletion workflows.
- Process xử lý data breach và support request.
- Encryption in transit/at rest, secret rotation, least privilege.
- Periodic access review cho platform/community admins.
- Audit retention và tamper detection.
- Vendor/subprocessor registry cho auth, email, analytics, payment và storage.
- Đánh giá nghĩa vụ pháp lý trước khi xử lý dữ liệu trẻ em hoặc dữ liệu nhạy cảm.

## 9. Observability và support

- Structured logs không chứa secret/PII không cần thiết.
- Metrics theo tenant/community/tournament nhưng dashboard platform không làm lộ dữ liệu chéo.
- Distributed correlation ID cho API/job/notification.
- Alert có runbook, severity và owner.
- Backup restore drill định kỳ; backup không được coi là hợp lệ nếu chưa thử restore.
- Status incident và postmortem không đổ lỗi cá nhân.

## 10. Data portability và integrations

- Export roster, match history, tournament result và finance theo quyền.
- Import có dry-run, mapping, duplicate detection và audit.
- API/webhook versioned, scoped token và rate limit.
- Integration rating/bank/payment chỉ qua adapter; domain không phụ thuộc provider.
- Deprecation window và migration guide cho external consumers.

## 11. Test matrix bắt buộc

### Multi-tenant/security

- Nhiều community và hàng trăm club synthetic tenants.
- RLS/authorization/property tests cho mọi role/scope.
- Admin/support session audit.
- Rate limit, invitation abuse, enumeration và public scraping scenarios.

### Performance/resilience

- Load test public live tournament, score submission và registration opening.
- Queue retry/dead-letter và provider outage.
- Database failover/backup restore rehearsal theo khả năng hạ tầng.
- Cache invalidation sau result correction.

### Billing/entitlement nếu bật

- Provider retry/webhook reorder/duplicate.
- Upgrade/downgrade/cancel/refund/grace period.
- Không vượt entitlement bằng direct API.

### E2E

- CLB mới đăng ký → xác minh → import roster → tạo giải → mời CLB → hoàn thành giải.
- Community tạo calendar/giải và moderation đúng scope.
- Athlete claim profile, export privacy data và thay visibility.
- Platform xử lý report/restriction/appeal có audit.

## 12. Exit gate

Phase 6 là một release program lớn nhưng vẫn có gate kết thúc rõ:

- Self-service onboarding và tournament flow chạy được không cần can thiệp database thủ công.
- Security/load/restore tests đạt SLO được phê duyệt.
- Support/moderation/privacy workflows có owner và runbook.
- Ít nhất một cohort ngoài pilot ban đầu onboard thành công.
- Evidence `evidence/phase-6-test-report.md` PASS.
- Người phụ trách sản phẩm xác nhận mô hình self-service và chi phí vận hành chấp nhận được.

## 13. Sau Phase 6

Roadmap tiếp theo dựa trên dữ liệu sử dụng, không tự động mở thêm phase. Các ứng viên gồm league season, API ecosystem, advanced analytics, partner marketplace hoặc service extraction; mỗi mục cần discovery và ADR/spec riêng.
