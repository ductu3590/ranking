# Quy trình giao hàng, quality gates và Git

## 1. Mô hình tuần tự

Sáu phase được thực hiện tuần tự. Tại một thời điểm chỉ có tối đa một phase mang trạng thái `in_progress` hoặc `awaiting_approval`.

Không bắt đầu Phase N+1 khi Phase N chưa:

1. Hoàn thành phạm vi và migration.
2. Vượt qua toàn bộ quality gate.
3. Có test evidence được lưu trong repository.
4. Được người phụ trách sản phẩm xác nhận hoàn thành.
5. Được merge vào `main` và kiểm tra lại trên `main`.

## 2. Nhánh Git

| Phase | Nhánh bắt buộc |
|---|---|
| 1 | `codex/phase-1-foundation-hardening` |
| 2 | `codex/phase-2-identity-clubs` |
| 3 | `codex/phase-3-interclub-tournament-mvp` |
| 4 | `codex/phase-4-tournament-operations` |
| 5 | `codex/phase-5-player-rating` |
| 6 | `codex/phase-6-national-scale` |

Quy trình nhánh:

1. Xác nhận `main` sạch, test xanh và đã chứa completion record của phase trước.
2. Tạo nhánh phase từ `main` mới nhất.
3. Mọi code, migration, test, tài liệu và evidence của phase nằm trên nhánh này.
4. Không merge chéo phase và không đưa tính năng phase sau vào sớm.
5. Khi code xong, chuyển trạng thái thành `awaiting_approval`; chưa được merge.
6. Sau xác nhận của người phụ trách sản phẩm, cập nhật trạng thái `completed`, commit và merge về `main` bằng merge commit.
7. Chạy smoke test bắt buộc trên `main`. Nếu lỗi, revert merge hoặc tạo hotfix; không âm thầm sửa tiếp trên phase sau.

Không tạo sẵn cả sáu nhánh vì chúng sẽ lệch khỏi `main` và tạo xung đột không cần thiết.

## 3. Definition of Done chung

Một phase chỉ được xem là hoàn thành khi đạt đủ tất cả điều kiện:

- Phạm vi in-scope được triển khai; out-of-scope không bị lén đưa vào.
- Migration có preflight, apply path, verification và rollback/recovery note.
- Không có lỗi test, lint hoặc build được chấp nhận bằng cách bỏ qua.
- Unit test bao phủ domain rules mới và edge cases chính.
- Integration test bao phủ repository/API/database transaction mới.
- RLS/authorization test có ít nhất: đúng quyền, sai quyền, khác tenant, public/anonymous.
- E2E test bao phủ happy path trọng yếu của phase.
- Test concurrency/idempotency cho mutation có nguy cơ ghi đè hoặc chạy trùng.
- Dữ liệu production hiện hữu được bảo toàn hoặc có migration được phê duyệt rõ ràng.
- Audit/privacy/observability được cập nhật tương ứng với dữ liệu mới.
- Tài liệu PickHub Core và ADR không mâu thuẫn với code.
- `PROGRESS.md` và `progress.json` khớp nhau.
- Có test evidence và người phụ trách sản phẩm xác nhận.

## 4. Quality gate theo tầng

### Gate A — Thiết kế

- Design/spec được duyệt trước khi code.
- Data model, state machine, API contract, security boundary và migration strategy đã rõ.
- Có danh sách giả định và phạm vi không làm.

### Gate B — Domain

- Rule thuần có test deterministic.
- Không import framework/database trong domain.
- Error types và invariant được định nghĩa rõ.

### Gate C — Data và security

- Constraint ngăn trạng thái dữ liệu không hợp lệ.
- RLS và server authorization nhất quán.
- Không có đường client trực tiếp vượt qua policy.
- Migration chạy được trên bản sao schema/dữ liệu gần production.

### Gate D — API và integration

- Contract test dựa trên behavior, không chỉ kiểm tra chuỗi source.
- Mutation atomic và idempotent khi cần.
- Error response không lộ secret hoặc dữ liệu tenant khác.

### Gate E — Trải nghiệm thật

- Reference UI hoàn thành luồng từ đầu đến cuối.
- Mobile viewport và mạng chậm được kiểm tra với các luồng ngoài sân.
- Có accessibility smoke test và trạng thái loading/error/empty.

### Gate F — Release

- Full test suite, production build và migration verification đều xanh.
- Staging smoke test xanh.
- Có rollback trigger và người chịu trách nhiệm theo dõi sau release.
- Người phụ trách sản phẩm xác nhận kết quả.

## 5. Test evidence

Mỗi phase khi chuyển sang `awaiting_approval` phải tạo:

`docs/pickhub-core/evidence/phase-N-test-report.md`

Báo cáo phải ghi:

- Branch và commit được kiểm tra.
- Ngày/giờ và môi trường.
- Danh sách lệnh test cùng exit code.
- Migration preflight/apply/verification đã chạy ở đâu.
- Luồng E2E đã xác minh.
- Kết quả security/RLS/concurrency.
- Known limitations còn lại nhưng thuộc out-of-scope.
- Link hoặc path đến screenshot/log cần thiết.
- Kết luận `PASS` hoặc `FAIL`; không dùng trạng thái mơ hồ.

## 6. Xác nhận hoàn thành và bộ nhớ

Trình tự bắt buộc:

1. Agent/implementer hoàn thành công việc, chạy test và tạo evidence.
2. Cập nhật phase thành `awaiting_approval` trong hai sổ tiến độ.
3. Người phụ trách sản phẩm xem evidence và xác nhận hoặc yêu cầu sửa.
4. Sau xác nhận, cập nhật `completed_at`, `completion_commit`, `approved_by` và ghi completion record.
5. Merge vào `main`.
6. Chạy smoke test trên `main`, rồi cập nhật `merge_commit` trong completion ledger nếu cần.

Sổ tiến độ trong repository là bộ nhớ bền vững qua các phiên làm việc. Không dựa vào trí nhớ hội thoại của agent.

## 7. Sự cố và rollback

- Nếu staging fail: sửa trên cùng phase branch, chạy lại toàn bộ gate bị ảnh hưởng.
- Nếu production migration fail: dừng release, thực hiện recovery note; không tiếp tục chạy migration sau.
- Nếu lỗi nghiêm trọng sau merge: ưu tiên revert merge có thể phục hồi. Hotfix chỉ dùng khi revert gây mất dữ liệu hoặc nguy hiểm hơn.
- Phase sau bị khóa cho đến khi `main` trở lại xanh.

## 8. Thay đổi phạm vi

Yêu cầu mới thuộc phase sau được ghi vào tài liệu phase tương ứng, không chen vào phase đang làm. Chỉ ngoại lệ khi thiếu nó làm phase hiện tại không thể an toàn hoặc không thể dùng được; trường hợp đó cần ADR và xác nhận phạm vi mới.
