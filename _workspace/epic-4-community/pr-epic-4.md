# Epic 4 — Giải cộng đồng (C1 danh tính · C2 đăng ký/ghép cặp/duyệt/phí/công khai · C3 dựng & chốt giải)

## Tóm tắt
- VĐV tạo tài khoản riêng (SĐT + mật khẩu, không thuộc CLB), đăng ký giải cộng đồng, ghép cặp (theo SĐT / link / bảng tìm bạn), theo dõi đơn.
- Admin hệ thống duyệt, ghép hộ, xác nhận thu phí (thu ngoài hệ thống), rồi dựng giải bằng **cùng workspace setup 4 bước** của giải CLB; Bước 2 lấy các cặp đã duyệt.
- Chốt qua `finalize_internal_setup_v4` (migration 114, thêm nhánh cộng đồng); điều hành và trang công khai như mọi giải v4. Trang công khai chỉ hiện tên cặp đã duyệt.

## Migration (đã apply lên DB hiện hữu, additive, không DROP dữ liệu)
112 `player_accounts` · 113 đăng ký cộng đồng (13 hàm, md5 khớp) · 114 nhánh cộng đồng của finalize (md5 `38a93a4b…`, mở CHECK `tournament_athletes.source`). Mỗi migration chạy ROLLBACK trước rồi mới apply.

## Việc người dùng làm khi triển khai
1. Vercel: `PLATFORM_SESSION_SECRET` (ngẫu nhiên, ≥32 ký tự), `PICKHUB_SYSTEM_GROUP_ID=8`.
2. Tạo admin hệ thống đầu tiên: `scripts/seed-platform-account.js` (tự đặt mật khẩu qua biến môi trường).
3. Tự chạy trình duyệt trên bản deploy rồi merge (quy ước D63).

## Bằng chứng
`_workspace/epic-4-community/evidence.md` (C1, C2, C3 + Ca G chạy thật tới hết giải).

## Lệch spec
Xem mục "Lệch so với spec" ở evidence C3 (khóa cặp không dùng `version`; nhận diện cộng đồng theo `organizer_type`).
