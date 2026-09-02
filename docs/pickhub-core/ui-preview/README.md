# PickHub UI Preview

Đây là prototype tĩnh để duyệt hướng thương hiệu và hierarchy UI, không phải production route.

## Mở xem

Từ thư mục gốc repository:

```powershell
python -m http.server 4173 --directory docs/pickhub-core/ui-preview
```

Mở `http://127.0.0.1:4173/` rồi dùng thanh “Xem trước” để chuyển giữa:

- `?view=member` — dashboard thành viên.
- `?view=leader` — dashboard trưởng nhóm.
- `?view=public` — trang giải công khai.

Trong ngữ cảnh `member`, tab `Thông tin` mở hồ sơ cá nhân, PHR và lịch sử cập nhật; tab `BXH` đưa về bảng xếp hạng đóng góp.

Dữ liệu đều là minh họa. Prototype không cần Supabase, không ghi dữ liệu và không yêu cầu tài khoản.

## Tài sản

`assets/pickhub-court-hero.png` là asset nền được sinh cho mục đích preview bằng built-in image generation. Logo PickHub vẫn là inline SVG để giữ khả năng mở rộng vector và tránh phụ thuộc ảnh sinh.

`assets/pickhub-mark.svg` là bản mark vector riêng để có thể tái sử dụng khi chuyển token và component vào production.
