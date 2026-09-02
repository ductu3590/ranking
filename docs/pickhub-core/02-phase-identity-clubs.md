# Phase 2 — Danh tính VĐV và CLB

## 1. Mục tiêu

Thay mô hình “mật khẩu dùng chung + row thành viên theo CLB” bằng danh tính cá nhân, hồ sơ VĐV toàn hệ thống và quyền theo phạm vi, đồng thời không ép toàn bộ VĐV phải tạo tài khoản ngay.

Nhánh: `codex/phase-2-identity-clubs`

## 2. Quyết định sản phẩm

- Người có quyền ghi quan trọng phải có tài khoản cá nhân.
- Trưởng CLB có thể tạo athlete chưa claim cho thành viên chưa onboard.
- Mã CLB là invitation/discovery code, không còn là credential trao quyền admin.
- Legacy shared-password flow chỉ tồn tại trong migration window có feature flag; bị tắt trước exit gate.
- Email magic link/OTP là phương án tài khoản đầu tiên. Phone OTP là adapter bổ sung khi chốt nhà cung cấp và chi phí; domain không phụ thuộc kênh OTP.

## 3. Mô hình dữ liệu

### 3.1 `profiles`

- `id uuid` liên kết `auth.users`.
- Tên hiển thị, locale, timezone, avatar storage key.
- Privacy preferences và account status.
- Không lưu secret xác thực do ứng dụng tự quản lý.

### 3.2 `athletes`

- ID toàn hệ thống, display name, normalized name hỗ trợ tìm kiếm.
- `claimed_by_profile_id` nullable và unique khi có giá trị.
- Trạng thái `unclaimed`, `claimed`, `merged`, `restricted`, `deleted`.
- Public profile preferences.
- Dữ liệu liên hệ không công khai và tách khỏi public projection.

### 3.3 `club_memberships`

- `club_id`, `athlete_id`, status, joined/left/effective dates.
- `primary_for_athlete` chỉ mang ý nghĩa hiển thị, không tự cấp quyền đại diện giải.
- Unique theo membership active policy; lưu lịch sử khi rời/đổi CLB.
- Alias/nickname là thuộc tính membership nếu chỉ có ý nghĩa trong CLB.

### 3.4 `role_assignments`

- `profile_id`, `role`, `scope_type`, `scope_id`, effective/expiry dates.
- Role không nằm trong localStorage hoặc JWT metadata như nguồn duy nhất.
- Permission resolver map role sang action, có test matrix.

### 3.5 `athlete_claims` và merge

- Claim request chứa athlete, profile, verification method, status và reviewer.
- Merge hai athlete là operation có audit, redirect ID và conflict report.
- Match history/rating không copy tùy tiện; merge service thực hiện atomic.

## 4. Migration từ `club_members`

1. Mỗi row hiện hữu tạo một athlete unclaimed và một club membership.
2. Lưu mapping `legacy_club_member_id → athlete_id` để tournament/quỹ còn truy nguyên.
3. Các bảng hiện tham chiếu member được backfill athlete/membership ID thích hợp.
4. Cung cấp compatibility repository hoặc view cho UI cũ trong thời gian chuyển đổi.
5. Sau khi mọi consumer chuyển sang model mới, khóa ghi vào bảng legacy rồi xóa compatibility path theo migration riêng.

Không tự động gộp hai người chỉ vì trùng tên. Candidate duplicate được đưa vào review queue.

## 5. Quyền và luồng chính

### 5.1 Onboard quản trị CLB

1. Chủ CLB hiện tại xác minh quyền qua migration flow một lần.
2. Đăng nhập tài khoản cá nhân.
3. Nhận `club_owner` hoặc `club_admin` assignment.
4. Mật khẩu admin chung bị vô hiệu hóa sau khi ít nhất một owner được xác minh.

### 5.2 Quản lý roster

- `club_admin/captain` tạo athlete unclaimed và membership.
- Có thể mời athlete claim bằng link có expiry và one-time token.
- Athlete claim chỉ sửa hồ sơ cá nhân được phép, không tự cấp role CLB.
- Rời CLB kết thúc membership, không xóa athlete hoặc lịch sử.

### 5.3 Delegated roles

- Owner mời admin, captain hoặc treasurer.
- Lời mời có trạng thái, expiry và audit.
- Người nhận phải đăng nhập đúng identity trước khi accept.
- Thu hồi role có hiệu lực ngay với mutation mới.

## 6. API/application services

- `CreateUnclaimedAthlete`
- `InviteAthleteToClaim`
- `ClaimAthleteProfile`
- `CreateClubMembership`
- `EndClubMembership`
- `InviteClubRole`
- `AcceptClubRole`
- `RevokeRole`
- `SearchPotentialDuplicateAthletes`
- `MergeAthletes` dành cho quyền platform review

API route chỉ là adapter. Mọi use case trả audit metadata và stable error code.

## 7. Security và privacy

- RLS dựa trên `auth.uid()`/profile và scope assignments.
- Admin CLB không tự đọc contact/private fields của athlete nếu không có consent cần thiết.
- Claim token hash trong DB, one-time, có expiry.
- Brute-force/rate-limit cho invite, claim và login.
- Account deletion không làm mất kết quả lịch sử; public identity được ẩn danh/pseudonymize theo policy pháp lý.
- Có export hồ sơ cá nhân và privacy settings nền.

## 8. Reference UI

- Login/magic link và logout.
- Switcher giữa các CLB/phạm vi người dùng có quyền.
- Roster: claimed/unclaimed/inactive, mời claim, kết thúc membership.
- Role management cho owner.
- Athlete “Hồ sơ của tôi” tối thiểu.
- Trạng thái forbidden và request-access rõ ràng.

Đây là UI chức năng, chưa phải visual redesign.

## 9. Ngoài phạm vi

- Chưa có giải liên CLB.
- Chưa tính rating từ kết quả.
- Chưa có social feed/chat.
- Chưa hỗ trợ automated merge không review.
- Chưa bắt buộc mọi athlete claim tài khoản.

## 10. Test matrix bắt buộc

### Unit

- Permission resolver cho từng role/scope.
- Claim state machine và token expiry.
- Membership effective-date rules.
- Duplicate candidate scoring không tự merge.

### Integration/RLS

- Club A không sửa athlete/membership riêng của Club B nếu không có scope.
- Một profile có role khác nhau ở hai CLB.
- Revoked role mất quyền mutation ngay.
- Unclaimed athlete không thể tự nhận nếu token sai/hết hạn/đã dùng.
- Một profile không claim hai athlete và một athlete không bị hai profile claim.
- Migration bảo toàn count và mapping của `club_members`.

### E2E

- Owner migrate account, mời captain và captain accept.
- Captain tạo athlete unclaimed, gửi invite, athlete claim.
- Athlete rời CLB nhưng lịch sử vẫn còn.
- Người dùng switch CLB và chỉ thấy action đúng quyền.
- Legacy shared admin/member credential không còn cấp quyền ghi sau cutoff.

## 11. Exit gate

- 100% club hiện hữu có ít nhất một owner account cá nhân đã xác minh.
- Roster legacy được migrate, count và mapping đạt verification.
- Shared credential write path bị vô hiệu hóa.
- Permission/RLS/E2E suite xanh.
- Claim và revoke flow được kiểm tra trên staging.
- Evidence `evidence/phase-2-test-report.md` PASS.
- Người phụ trách sản phẩm xác nhận roster và quyền của các CLB thử nghiệm đúng.

## 12. Điều kiện mở Phase 3

Phase 2 đã merge; các trưởng CLB pilot có tài khoản và athlete roster đủ dùng để đăng ký giải mà không nhập tên rời.
