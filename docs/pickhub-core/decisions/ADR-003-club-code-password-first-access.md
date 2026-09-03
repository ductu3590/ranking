# ADR-003 — Truy cập PickHub bằng Mã CLB + mật khẩu trước

- Trạng thái: `accepted`
- Ngày: 2026-09-03
- Phạm vi: Phase 1–5 và các CLB pilot trước khi có quyết định thay thế

## Bối cảnh

Đối tượng sử dụng PickHub là các VĐV địa phương, nhiều người không muốn hoặc
chưa sẵn sàng tạo tài khoản cá nhân. Nếu bắt đăng ký email/OTP ngay lần đầu,
việc xem quỹ, thành viên, BXH hoặc tham gia giải sẽ tạo rào cản và đi ngược mô
hình vận hành hiện tại của PickHub.

Một VĐV cũng có thể sinh hoạt nhiều CLB. Khi chưa có account cá nhân, hệ thống
phải coi CLB đang mở là access context; không được giả định đã biết chắc danh
tính người đang cầm thiết bị.

## Quyết định

1. **Baseline đăng nhập:** người dùng nhập `Mã CLB` và một mật khẩu của CLB.
   Server kiểm tra hash và tạo HTTP-only signed `group_session`.
2. **Hai phạm vi dùng chung:**
   - `member_password_hash` cho thành viên: chỉ đọc dữ liệu được CLB cho phép.
   - `admin_password_hash` cho trưởng nhóm/người vận hành: được ghi quỹ,
     roster, PHR, giải nội bộ và các action admin trong phạm vi CLB.
3. **Một trưởng nhóm logic:** trước mắt CLB có một admin credential; nhiều người
   có thể vận hành bằng credential đó theo quyết định sản phẩm. Audit ghi
   `club_admin_session`, thời gian, CLB và mutation/version, không bịa danh
   tính cá nhân.
4. **Không bắt buộc tài khoản VĐV:** không magic link, OTP, email, phone hay
   Supabase Auth account nào là điều kiện để xem dữ liệu CLB hoặc đăng ký VĐV
   vào giải.
5. **Danh tính dữ liệu tách khỏi xác thực:** vẫn duy trì `athletes` và
   `club_memberships`; athlete có thể `unclaimed`. Trưởng nhóm tạo tên, biệt
   danh, PHR và membership theo CLB. Liên kết cùng một VĐV ở nhiều CLB do quy
   trình review thủ công/được ủy quyền xử lý, không suy luận chỉ từ tên.
6. **Mở rộng không phá baseline:** sau này có thể thêm profile/claim/account
   làm adapter tùy chọn cho người muốn xem hồ sơ riêng, nhận thông báo hoặc
   xác nhận danh tính. Account đó không được biến thành điều kiện mặc định nếu
   chưa có ADR mới và product approval.

## Quy tắc an toàn bắt buộc

- Mật khẩu chỉ lưu dạng hash; không trả secret về client và không đặt role trong
  localStorage.
- Session có expiry, version/revocation và bị vô hiệu khi đổi mật khẩu hoặc
  regenerate mã CLB theo policy.
- Login/join và mutation nhạy cảm có rate limit, audit event và stable error
  code.
- `member` không được gọi mutation admin dù có biết URL; server authorization,
  RLS/constraint và service boundary là lớp bảo vệ thật.
- Khi cần trách nhiệm cá nhân cho thao tác tài chính hoặc giải, hệ thống ghi
  chú/audit tại thời điểm thao tác; việc bật account cá nhân là quyết định
  product riêng, không tự động triển khai trong Phase 2.

## Hệ quả UX

- Màn hình đầu vào chỉ cần Mã CLB + mật khẩu, có nút chọn vai trò ngầm qua
  password result; không hiển thị form tạo tài khoản.
- CLB mặc định là context cuối cùng đã truy cập an toàn trên thiết bị. Đổi CLB
  hoặc thêm CLB yêu cầu nhập Mã CLB + mật khẩu của CLB đó.
- Tab `Thông tin` của member trong baseline là thông tin của athlete/membership
  được chọn trong CLB, không tuyên bố đây là vùng riêng tư đã xác thực danh
  tính. Dữ liệu nhạy cảm không hiển thị qua shared session.
- Trưởng nhóm nhìn thấy `Cấu hình`; member nhìn thấy `Thông tin`; cùng một
  design system và không có surface nền đen/navy đặc.

## Phạm vi không thuộc quyết định này

- Không giải quyết toàn bộ account linking, duplicate merge hoặc social identity.
- Không cho phép một captain CLB tự truy cập dữ liệu CLB khác chỉ vì cùng tham
  gia một giải.
- Không dùng shared credential làm lý do bỏ qua RLS, server authorization,
  audit hoặc kiểm soát concurrency.

## Liên kết

- [ADR-002 — Tách tài khoản, VĐV và membership](./ADR-002-athlete-identity.md)
  mô tả data model dài hạn; ADR này quyết định cách truy cập trong giai đoạn
  hiện tại.
- [Phase 2 — Danh tính VĐV và CLB](../02-phase-identity-clubs.md)
- [Quy trình giao hàng và quality gates](../DELIVERY-GOVERNANCE.md)
