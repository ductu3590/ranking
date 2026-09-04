# Phase 2 — Danh tính VĐV và CLB, không bắt buộc tài khoản cá nhân

## 1. Mục tiêu

Củng cố mô hình athlete/membership để một VĐV có thể sinh hoạt nhiều CLB, mở
đúng CLB mặc định và dùng được dữ liệu PHR xuyên thời gian mà không tạo rào cản
onboarding. Phase này **giữ nguyên cách truy cập Mã CLB + mật khẩu** của PickHub
hiện tại; không bắt VĐV tạo tài khoản cá nhân.

Nhánh: `codex/phase-2-identity-clubs`

## 2. Quyết định sản phẩm

- Thành viên nhập `Mã CLB + member password` để xem dữ liệu được công khai trong
  CLB: quỹ, thành viên, BXH, lịch và kết quả giải.
- Trưởng nhóm/người vận hành nhập `Mã CLB + admin password` để quản lý quỹ,
  roster, PHR, giải nội bộ và cấu hình. Trước mắt CLB có một admin credential;
  nhiều người có thể dùng chung credential theo quyết định sản phẩm.
- Server phân biệt `member`/`admin` dựa trên password hash và tạo HTTP-only
  signed `group_session`. Không lấy role từ localStorage hoặc từ nút ẩn trên UI.
- Không triển khai magic link, OTP, email, phone hoặc Supabase Auth account như
  điều kiện của Phase 2. Account cá nhân/claim chỉ là adapter tùy chọn ở phase
  tương lai và không được chặn chức năng hiện tại.
- Athlete vẫn là bản ghi độc lập với session. Trưởng nhóm có thể tạo athlete
  chưa liên kết tài khoản (`unclaimed`) và membership tương ứng.
- Một athlete có thể có membership ở nhiều CLB. Nếu chưa đủ bằng chứng để liên
  kết hai bản ghi, giữ riêng và đưa vào hàng đợi review; không tự gộp chỉ vì
  trùng tên.
- CLB mặc định chỉ là access context mở đầu; nó không cấp quyền sang CLB khác.

## 3. Mô hình dữ liệu

### 3.1 `groups` và club access

- `id`, `code`, `name`, branding và các cờ trạng thái của CLB.
- `admin_password_hash` và `member_password_hash` dùng PBKDF2/thuật toán đã
  được core chốt; không lưu mật khẩu rõ.
- `access_version` hoặc cơ chế tương đương để đổi mật khẩu/regenerate code có
  thể vô hiệu session cũ.

### 3.2 `group_sessions`

Session ký server chứa `group_id`, `group_code`, `role`, `issued_at`, `expires_at`
và `session_version`. Cookie HTTP-only, same-site và secure ở production.

Audit không giả vờ biết tên cá nhân phía sau shared credential; actor type ghi
`club_member_session` hoặc `club_admin_session`, kèm CLB, thời gian, request
correlation ID và version mutation.

### 3.3 `athletes`

- ID toàn hệ thống, display name, normalized name và trạng thái
  `unclaimed|linked|merged|restricted|deleted`.
- Nickname công khai có thể được cấu hình theo membership hoặc theo policy của
  CLB; public giải snapshot tên hiển thị tại thời điểm chốt roster.
- Không lưu contact riêng trong public projection.

### 3.4 `club_memberships`

- `club_id`, `athlete_id`, status, joined/left/effective dates và alias trong
  CLB.
- `primary_for_athlete` chỉ quyết định CLB mặc định khi có bản ghi mapping; nó
  không tự cấp quyền và không cần account cá nhân.
- Unique/index theo policy membership active; giữ lịch sử rời/đổi CLB.

### 3.5 Lớp liên kết tài khoản tùy chọn

Có thể chừa `profiles`, `athlete_claims` hoặc mapping tương đương cho tương lai,
nhưng Phase 2 không tạo account, không gửi OTP và không yêu cầu các bảng này để
đọc/ghi dữ liệu CLB. Khi bật account sau này phải có ADR và migration riêng.

## 4. Migration từ `club_members`

1. Mỗi row hiện hữu tạo một `athlete` chưa liên kết và một `club_membership`.
2. Lưu mapping `legacy_club_member_id → athlete_id` để quỹ, giải và PHR còn
   truy nguyên.
3. Backfill các bảng đang tham chiếu member sang athlete/membership thích hợp;
   giữ compatibility view/repository trong thời gian chuyển đổi.
4. Bảo toàn `groups.code`, password hash và session flow hiện tại; không tạo
   owner account hoặc yêu cầu người dùng đặt email.
5. Duplicate candidate được đưa vào review queue. Liên kết VĐV thuộc nhiều CLB
   là thao tác có lý do và audit, không merge tự động.
6. Sau khi mọi consumer chuyển sang model mới, khóa ghi legacy theo migration
   riêng; không xóa lịch sử tài chính, trận đấu hoặc BXH.

## 5. Quyền và luồng chính

### 5.1 Vào CLB

1. Người dùng nhập Mã CLB và mật khẩu.
2. `JoinClubWithCode` chuẩn hóa code, so hash admin trước rồi member, trả role
   và redirect `/admin` hoặc `/quy`.
3. Server đặt signed `group_session` có expiry; đổi mật khẩu hoặc mã CLB có thể
   revoke các session cũ.
4. Sai code/password trả stable error, có rate limit và không tiết lộ CLB tồn tại
   hay không ngoài thông tin cần thiết.

### 5.2 Đổi CLB mặc định

- Thiết bị có thể ghi nhớ `default_club_id` không nhạy cảm để mở đúng CLB lần
  sau; dữ liệu không được coi là quyền.
- `ClubSwitcher` hiển thị CLB đã đăng nhập trên thiết bị. Thêm hoặc đổi CLB
  mới luôn yêu cầu nhập Mã CLB + mật khẩu của CLB đó.
- Session và query luôn mang đúng `group_id`; không suy ra CLB từ tên VĐV.

### 5.3 Quản lý roster và PHR

- Admin session tạo/sửa/kết thúc membership, nhập nickname và cập nhật đánh giá
  trình theo quyền.
- Member session chỉ đọc roster, BXH, quỹ, PHR và lịch sử được CLB cho phép.
- Tab `Thông tin` của member trong chế độ chưa có account là thông tin athlete/
  membership được chọn trong CLB, không tuyên bố đã xác thực danh tính riêng tư.
  Dữ liệu nhạy cảm không hiển thị qua shared session.

## 6. API/application services

- `JoinClubWithCode`
- `RotateClubSession`
- `RevokeClubSessions`
- `SetDefaultClubContext`
- `CreateUnclaimedAthlete`
- `CreateClubMembership`
- `UpdateMembershipAlias`
- `EndClubMembership`
- `SearchPotentialDuplicateAthletes`
- `ReviewAthleteLink`

API route chỉ là adapter; use case kiểm tra session role, group scope, version,
audit metadata và stable error code. `profiles`/claim services không nằm trong
acceptance criteria của Phase 2.

## 7. Security và privacy

- Password hash dùng salt/iteration chuẩn; secret không rời server.
- Cookie session HTTP-only, same-site, secure production, expiry và revocation.
- Đổi admin/member password hoặc regenerate code làm session cũ hết hiệu lực
  theo `access_version`.
- Rate limit login/join và mutation nhạy cảm; có correlation ID và audit event.
- Member không thể gọi mutation admin bằng cách tự sửa request hoặc URL.
- RLS/constraint/service boundary vẫn bắt buộc; shared credential không phải lý
  do dùng anon client hoặc bỏ qua authorization.
- Vì không biết cá nhân sau shared password, audit hiển thị rõ mức truy vết
  `club_admin_session`; không gắn trách nhiệm cho một người cụ thể nếu chưa có
  account adapter.
- Public projection chỉ trả display data được phép; không trả contact/private
  note hoặc dữ liệu của CLB khác.

## 8. Reference UI

- Màn hình vào CLB chỉ có Mã CLB + mật khẩu, không có form tạo tài khoản.
- Member vào CLB mặc định, có club switcher và năm tab
  `Quỹ | Thành viên | BXH | Giải | Thông tin`.
- Leader vào `/admin`, có `Cấu hình`, thu–chi, roster, thông báo cần xử lý và
  cập nhật PHR.
- Roster hiển thị athlete/membership, trạng thái active/inactive và nickname;
  không ép claim account.
- Forbidden, session hết hạn, đổi CLB và lỗi mật khẩu có thông điệp rõ.
- Dùng design baseline sáng, palette tím/lavender và không có surface nền
  đen/navy đặc.

## 9. Ngoài phạm vi

- Không bắt buộc profile cá nhân, email/phone OTP, magic link hoặc Supabase Auth.
- Không xây account claim/merge tự động; chỉ chuẩn bị interface review thủ công.
- Chưa có giải liên CLB, rating tự động hay ghép cân bằng; thuộc Phase 3–5.
- Không biến club code thành quyền truy cập dữ liệu CLB khác.

## 10. Test matrix bắt buộc

### Unit

- Code normalization, password hash/verify và session expiry/revocation.
- Permission resolver cho `member`/`admin` và group scope.
- Membership effective-date và duplicate candidate review.
- Default club context không tự cấp quyền.

### Integration/RLS

- Code + member password chỉ đọc; code + admin password ghi đúng CLB.
- Sai password, session hết hạn, access version cũ và rate limit bị chặn.
- Club A không đọc/ghi athlete, membership, quỹ hoặc roster riêng của Club B.
- Hai CLB có member trùng tên vẫn tạo được; không merge tự động.
- Migration bảo toàn count và mapping của `club_members`.
- Public projection không lộ private fields hoặc internal session data.

### E2E

- Member nhập Mã CLB + member password, vào CLB mặc định và xem đúng 5 tab.
- Leader nhập Mã CLB + admin password, quản lý roster/quỹ/cấu hình.
- Đổi/thêm CLB bằng code + password, context và session không lẫn dữ liệu.
- Trưởng nhóm tạo athlete chưa liên kết, cập nhật nickname/PHR và member đọc được.
- Regenerate code/đổi password làm session cũ bị thu hồi.

## 11. Exit gate

- 100% luồng pilot dùng được bằng Mã CLB + mật khẩu; không có bước tạo account.
- Member read-only và leader write scope được chứng minh bằng API/RLS/E2E.
- Session expiry, rotation, revoke và rate-limit test xanh.
- Roster legacy được migrate, count/mapping đối soát và dữ liệu cũ bảo toàn.
- Multi-club/default-club context hoạt động mà không cấp quyền chéo.
- Evidence `evidence/phase-2-test-report.md` có kết luận `PASS`.
- Người phụ trách sản phẩm xác nhận CLB pilot không gặp rào cản account.

## 12. Điều kiện mở Phase 3

Phase 2 đã merge; các CLB pilot dùng ổn định club session, roster đã có athlete
ID/membership đủ để captain đăng ký VĐV vào giải mà không nhập tên rời. Account
linking chỉ được đưa vào phase sau nếu có ADR và nhu cầu đã được xác nhận.
