# Prompt Task 15 — Chuyển thẻ chia sẻ BXH từ SVG sang PNG qua @vercel/og

Dán nguyên khối dưới đây. Đây là task đơn lẻ nối tiếp sau batch Task 6–14 đã xong.

---

Bạn là kỹ sư triển khai PickHub (Next.js 14 App Router, JavaScript thuần, Supabase).
Task 6–14 đã hoàn tất. Route `app/api/club/bxh/share-image/route.js` hiện trả
`image/svg+xml` như một giải pháp tạm. Nhiệm vụ: **chuyển sang trả PNG thật qua
`@vercel/og`**, để preview hiển thị đúng trên Zalo/Messenger và người dùng lưu được ảnh.

## Đọc trước

- `app/api/club/bxh/share-image/route.js` — route hiện tại, giữ nguyên phần bảo mật.
- `docs/superpowers/specs/2026-09-08-pickhub-design-system-va-bxh-design.md` mục 6.8 — contract thẻ chia sẻ.
- `docs/pickhub-core/UI-BRAND-SYSTEM.md` mục 5 "Share card".

## Giữ nguyên tuyệt đối (đã verify đúng, KHÔNG được đổi)

- `group_id` lấy từ phiên bằng `getGroupIdForDatabase()`, **không nhận từ tham số URL**.
- Không có phiên → `403`. `period` ngoài {week,month,year,all} → `400`.
- `Cache-Control: private, no-store`.
- Dùng chung `loadContributionInputs` + `buildContributionLeaderboard` với giao diện.
- Nội dung thẻ: tên CLB, kỳ đang xem, top 1 nêu rõ, hai hạng kế tiếp, tổng đóng góp, dấu hiệu PickHub.
- Nền gradient `--ph-indigo #6F48C9 → #8A63E0`, huy hiệu `--ph-gold #FFC95E`, chữ trắng.

## HAI cạm bẫy kỹ thuật — làm sai là ship ra ảnh hỏng

1. **Runtime phải là `nodejs`, không phải `edge`.** `@vercel/og` mặc định gợi ý edge,
   nhưng route này đọc database bằng `supabaseAdmin` (service role, chỉ chạy được ở
   node). Khai báo `export const runtime = 'nodejs';` và import `ImageResponse` từ
   `next/og` (không phải `@vercel/og` cho edge). Nếu để edge, `supabaseAdmin` sẽ lỗi.

2. **Font tiếng Việt phải nạp tường minh, nếu không dấu tiếng Việt ra ô vuông.**
   `ImageResponse` mặc định dùng font hệ thống không đủ glyph tiếng Việt —
   "ĐÓNG GÓP", "VŨ DUY TÙNG" sẽ thành tofu (□). Phải:
   - Đặt file `Montserrat-Bold.ttf` và `Montserrat-SemiBold.ttf` (subset latin +
     vietnamese) vào `app/api/club/bxh/share-image/` hoặc `public/fonts/`.
   - Đọc bằng `fs.readFileSync` (node runtime cho phép) và truyền vào `fonts:` của
     `ImageResponse`.
   - **Bắt buộc test một tên có dấu đầy đủ** (ví dụ "VŨ NGỌC HƯNG", "ĐẶNG TIẾN ANH")
     render đúng, không phải ô vuông. Đây là tiêu chí PASS, không bỏ qua.

   Nếu không tìm được file font Montserrat có sẵn trong repo, **DỪNG và báo cáo** —
   đừng ship với font mặc định làm hỏng tiếng Việt. Có thể tải Montserrat từ Google
   Fonts (OFL, được phép nhúng) và commit file .ttf vào repo.

## Việc cần làm

1. `npm install @vercel/og` (hoặc xác nhận `next/og` đã có sẵn trong Next 14 — thử
   import trước, nhiều bản Next 14 đã bundle sẵn `next/og`, khi đó không cần cài thêm).
2. Chuẩn bị file font Montserrat (Bold + SemiBold, subset vietnamese) trong repo.
3. Viết lại thân route: giữ nguyên khối bảo mật + validate + đọc dữ liệu, thay
   `renderShareCardSvg` bằng JSX dựng `ImageResponse` (1200×630), nạp font tường minh,
   trả `image/png`, `Content-Disposition: attachment; filename="bxh-<period>.png"`,
   `Cache-Control: private, no-store`.
4. Cập nhật `tests/bxh-share-image.contract.test.js`: đổi assert `image/svg` thành
   `image/png`, giữ các assert bảo mật (không `searchParams.get('group')`, có `no-store`,
   có `runtime = 'nodejs'`, period sai → 400).
5. `node tests/bxh-share-image.contract.test.js` → PASS. `npm run build` → PASS.
6. **Kiểm ảnh thật:** chạy dev server, gọi route với một phiên CLB hợp lệ (hoặc test
   thủ công), mở file PNG trả về, xác nhận: gradient indigo, huy hiệu vàng, và **tên
   tiếng Việt có dấu hiển thị đúng, không ô vuông**. Dán mô tả hoặc ảnh vào báo cáo.
7. Một commit: `feat(bxh): tra PNG that qua @vercel/og, nap font Montserrat tieng Viet`.

Báo cáo theo mẫu đã dùng: test viết trước (nếu sửa test) → thay đổi → kết quả chạy →
**xác nhận tiếng Việt render đúng** → lệch kế hoạch → message commit (không hash trong
file evidence). Dừng lại chờ xác nhận sau khi xong.
