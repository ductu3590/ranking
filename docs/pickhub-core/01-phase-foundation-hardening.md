# Phase 1 — Ổn định nền tảng

## 1. Mục tiêu

Đưa codebase hiện tại về trạng thái an toàn để phát triển danh tính và giải liên CLB mà không kế thừa lỗi tenant, auth, transaction hoặc public access. Phase này không thêm tính năng cộng đồng mới.

Nhánh: `codex/phase-1-foundation-hardening`

## 2. Kết quả người dùng

- Tính năng CLB hiện tại tiếp tục hoạt động: quỹ, thành viên, sự kiện, cấu hình, giải nội bộ.
- Link giải công khai hoạt động độc lập với CLB đang đăng nhập.
- Không CLB nào đọc/ghi được dữ liệu riêng của CLB khác.
- Sinh lại lịch hoặc lưu tỉ số không thể làm dữ liệu ở trạng thái nửa chừng.
- Bộ test hiện tại xanh, bao gồm lỗi contract multi-tenant phase 6 đang tồn tại.

## 3. Phạm vi

### 3.1 Schema inventory và migration ledger

- Chụp schema thực tế production, không chỉ dựa vào file migration.
- Tạo migration ledger xác định migration nào đã áp dụng và checksum.
- Liệt kê bảng tenant-scoped, public, platform-scoped và legacy.
- Xác định orphan rows, null `group_id`, duplicate constraints và policy cũ còn sót.

### 3.2 Sửa tenant constraints

- Thay uniqueness toàn cục của `club_members.full_name` bằng constraint phù hợp phạm vi CLB; không coi tên là identity.
- Thêm `group_id` cho `ranking_snapshots` và mọi bảng dữ liệu CLB còn thiếu; backfill trước khi đặt `NOT NULL`.
- Unique/index phải bao gồm tenant ở nơi dữ liệu chỉ cần duy nhất trong CLB.
- Foreign key liên quan tenant phải ngăn row con trỏ sang parent thuộc CLB khác. Ưu tiên composite uniqueness/FK hoặc trigger invariant có test.
- `tournament_entrant_members.member_id` phải có FK hợp lệ hoặc được phân loại rõ là guest. Không để một số ID không có semantic.

### 3.3 Public tournament identity

- Tạo public identifier/slug duy nhất toàn hệ thống.
- Thêm `visibility` với ba giá trị `private`, `unlisted`, `public`.
- Public endpoint resolve trực tiếp tournament, sau đó lấy child rows theo parent IDs.
- Không dùng `getEffectiveGroupContext()` để tìm public tournament.
- Public response dùng allowlist field; không trả internal settings, actor IDs hoặc dữ liệu cá nhân không được công khai.

### 3.4 Authorization boundary tạm thời

- Chuẩn hóa interface `getActor`, `authorize` và `getClubScope` để Phase 2 thay nguồn auth mà không viết lại toàn bộ use case.
- Legacy signed group session vẫn được hỗ trợ trong Phase 1 nhưng tất cả mutation phải đi qua server authorization thống nhất.
- Không dùng localStorage role làm nguồn quyết định quyền.
- Session có expiry, version hoặc cơ chế revocation tối thiểu; secret rotation được tài liệu hóa.
- Rate limit login/join và các mutation nhạy cảm.

### 3.5 RLS hardening

- Drop/recreate policy theo danh sách chuẩn; không để policy public cũ vô tình cộng quyền với policy mới.
- Anonymous chỉ đọc public projection hoặc bảng được cho phép rõ.
- Tournament match/game draft không được đọc trực tiếp toàn bộ bằng anon.
- Service-role chỉ nằm server-side và không được dùng như lý do bỏ qua authorization.
- Có integration test chạy bằng anon, authenticated actor và service context.

### 3.6 Transaction và concurrency

Chuyển các luồng sau thành database function hoặc transaction application có rollback an toàn:

- Generate/regenerate schedule.
- Replace toàn bộ games của một match.
- Finalize/correct result.
- Tạo group cùng cấu hình mặc định nếu có nhiều bước.
- Webhook tài chính chống ghi trùng.

Mutation có nguy cơ retry nhận `idempotency_key`. Record thường xuyên bị sửa có `version` hoặc `updated_at` precondition để phát hiện lost update.

### 3.7 Realtime và public refresh

- Subscription lọc theo tournament/match khi nền tảng cho phép.
- Refetch debounce và polling fallback có backoff.
- Page không refetch vì thay đổi của giải không liên quan.
- Subscription không làm lộ payload không thuộc public projection.

### 3.8 Technical baseline

- Chốt phiên bản runtime/framework được hỗ trợ; nâng dependency theo migration nhỏ, không rewrite.
- Chuẩn hóa lint, build, test scripts và CI command duy nhất.
- Structured error response có stable `code`, message thân thiện và correlation ID.
- Bổ sung staging config, error tracking và backup verification tối thiểu.

## 4. Ngoài phạm vi

- Không tạo tài khoản cá nhân hoặc hồ sơ athlete mới.
- Không tạo giải liên CLB.
- Không xây rating hoặc ghép cân bằng.
- Không xây màn hình nghiệp vụ mới ngoài app shell, token, route guard, public
  fallback và các sửa giao diện cần thiết cho bảo mật/regression. Các màn hình
  còn lại triển khai theo lát cắt UI của phase tương ứng.

## 5. Migration strategy

1. Preflight query đo null, duplicate, orphan và policy hiện có.
2. Thêm column/index nullable hoặc concurrent-safe trước.
3. Backfill theo batch và xác minh count/checksum.
4. Deploy code đọc được cả schema cũ/mới nếu cần compatibility window.
5. Bật constraint/RLS mới.
6. Deploy code chỉ dùng schema mới.
7. Xóa compatibility path trong cùng phase khi production verification đã đạt.

Không drop dữ liệu giải/quỹ hiện hữu để “làm sạch”. Mọi thay đổi phá vỡ cần backup và xác nhận riêng.

## 6. Test matrix bắt buộc

### Unit

- Session signature/expiry/revocation.
- Permission mapping tạm thời.
- Public field projection.
- Idempotency/version conflict helpers.

### Database/integration

- Hai CLB có thành viên trùng tên vẫn tạo được.
- Duplicate trong cùng CLB được xử lý theo policy đã chốt.
- Cross-tenant read/write bị chặn ở API và RLS.
- Anonymous không đọc private/unlisted data ngoài link hợp lệ.
- Public slug resolve không cần cookie.
- Regenerate schedule fail giữa chừng không mất lịch cũ.
- Replace games fail validation không xóa games đã lưu.
- Webhook retry không tạo giao dịch trùng.

### E2E

- Tạo/join CLB bằng legacy flow.
- Admin quản lý thành viên/quỹ/cấu hình.
- Thành viên đọc dữ liệu đúng quyền.
- Tạo giải nội bộ, nhập kết quả và mở public link ở browser sạch.

### Regression

- `npm run test:tournament` xanh.
- Toàn bộ test multi-tenant, admin auth, fund và navigation xanh.
- Production build xanh.

## 7. Exit gate

Phase 1 chỉ được `completed` khi:

- Schema audit và migration đã chạy thành công trên staging/prod theo release plan.
- Không còn test hiện hữu bị đỏ.
- Báo cáo RLS chứng minh tenant isolation và public visibility.
- Atomicity test cho schedule/games/webhook đạt.
- Public link dùng được ở chế độ ẩn danh.
- Có evidence tại `evidence/phase-1-test-report.md` với kết luận PASS.
- Người phụ trách sản phẩm xác nhận các chức năng cũ không bị mất.

## 8. Điều kiện mở Phase 2

`main` chứa merge Phase 1, smoke test sau merge xanh, `progress.json` ghi Phase 1 `completed` và không còn migration đang dở.
