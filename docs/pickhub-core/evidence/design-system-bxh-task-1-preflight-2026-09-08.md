# Evidence — Task 1 Preflight, hợp nhất design system và BXH đóng góp

- Ngày đo: `2026-09-08`
- Kế hoạch: [`2026-09-08-pickhub-design-system-va-bxh.md`](../../superpowers/plans/2026-09-08-pickhub-design-system-va-bxh.md)
- Người chạy: IDE thực thi; số liệu được kiểm chứng lại độc lập trong session thiết kế.
- Kết luận: **đủ điều kiện sang Task 2.**

## 1. Tham chiếu token khai tử

Tổng: **301**.

| Vị trí | Số tham chiếu |
|---|---:|
| `app/quy` | 196 |
| `app/admin` | 36 |
| `components` | 26 |
| `app/page.css` | 24 |
| `app/globals.css` | 16 |
| `app/giai-dau` | 3 |
| `app/dk` | 0 |

Lệnh đo:

```bash
grep -rho "var(--\(court\|pickle\|live-cyan\|rally\|surface-court\|gradient-court\|gradient-live\)[a-z-]*)" \
  app components --include=*.css --include=*.js | wc -l
```

**Đính chính:** kế hoạch bản đầu ghi con số kỳ vọng "khoảng 291". Đó là lỗi cộng nhẩm
khi soạn kế hoạch, không phải codebase thay đổi. Giá trị đúng là 301 và kế hoạch đã
được sửa. Không có hệ quả nào tới thiết kế — con số này chỉ dùng để theo dõi tiến độ
gỡ alias.

**Ghi nhận có ích:** chỉ **3** tham chiếu nằm trong `app/giai-dau/`, nên ràng buộc
"không đụng module giải đấu" gần như không tốn chi phí. Ngược lại `app/quy` chiếm 196
tham chiếu — đó là khối lượng thật của các spec tiếp theo.

## 2. Rule class trong `globals.css`

Kiểm `.app-background`, `.card-container`, `.card-header`, `.mobile-hidden`,
`.desktop-hidden` trong toàn bộ `app/` và `components/`: **không file `.js` nào tham
chiếu**. Xác nhận đây là rule chết, xoá được theo spec mục 3.6.

## 3. Trần số hàng Supabase

| Nguồn | Số giao dịch |
|---|---:|
| SQL `select count(*) from quy_pickleball where group_id = 1` | 688 |
| `GET /api/club/transactions` | 688 |

Hai con số bằng nhau ⇒ **trần 1.000 hàng chưa bị chạm**, Task 8 giữ nguyên vị trí
trong thứ tự thi công.

Spec mục 1.1 và 6.6 ghi 686 giao dịch (đo `2026-09-07`). Chênh 2 giao dịch là do CLB
vẫn đang nhận chuyển khoản thật trong thời gian soạn tài liệu — đây là bằng chứng hệ
thống đang sống, không phải sai lệch. Ước tính "chạm trần trong ~4 tháng" giữ nguyên.

## 4. Số hiệu migration

Cao nhất hiện có: `042_open_registration.sql`. Migration mới là **`043`**, đúng như
kế hoạch.

## 5. Regression trước khi sửa

`npm run test:regression`: **PASS**.

Đây là mốc so sánh. Mọi lỗi đỏ xuất hiện từ Task 2 trở đi là do thay đổi của đợt này,
không phải lỗi có sẵn.

## 6. Trạng thái

Không sửa file, không chạy migration, không commit code trong Task 1.
