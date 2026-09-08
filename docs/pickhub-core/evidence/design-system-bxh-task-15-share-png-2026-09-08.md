# Evidence — Task 15, thẻ chia sẻ BXH PNG

- Ngay: `2026-09-08`
- Task: Chuyển thẻ chia sẻ từ SVG sang PNG bằng ImageResponse

## Test

```text
$ node tests/bxh-share-image.render.test.js
bxh-share-image Vietnamese glyph coverage: PASS

$ node tests/bxh-share-image.contract.test.js
bxh-share-image: PASS

$ npm run build
Compiled successfully
Generating static pages (77/77)
```

Test cmap của cả `Montserrat-SemiBold.ttf` và `Montserrat-Bold.ttf` xác nhận đủ glyph cho `VŨ NGỌC HƯNG` và `ĐẶNG TIẾN ANH`.

## Thay đổi

- Route khai báo `runtime = 'nodejs'`, lấy group từ session, giữ validate period và `private, no-store`.
- Render bằng `ImageResponse` từ `next/og`, kích thước `1200x630`, trả `image/png` và tên file `.png`.
- Nạp tường minh hai font Montserrat subset tiếng Việt từ filesystem.
- Nâng Next trong major 14 lên `14.2.35` để dùng bản vá mới hơn cho `next/og`.

## Kiểm ảnh

Đã kiểm tra font glyph coverage bằng cmap. Không thể hoàn tất HTTP pixel smoke trên Windows/Node `25.3.0`: bundled `next/og` của Next 14 tạo đường dẫn font mặc định dạng `.\\file:\\...` và kết thúc response trước khi render (`Invalid URL`). Đây là giới hạn runtime địa phương; build và contract đều pass. Cần chạy endpoint trên Linux/Vercel để xác nhận ảnh PNG trực tiếp.

## Lech so voi ke hoach

Không cài `@vercel/og` vào dependency vì route dùng `next/og` theo contract. Không có thay đổi trong `app/giai-dau/`.