# Evidence — PickHub UI preview

## Review branch

- Branch: `codex/pickhub-ui-brand-preview`
- Worktree: `C:\Users\ductu\ranking\.worktrees\pickhub-ui-brand-preview`
- Scope: brand system + static member/leader/public tournament preview.
- Status: `completed` — visual direction đã được người phụ trách sản phẩm xác
  nhận ngày `2026-09-02`. Đây là design-lock track, không phải một phase core;
  preview chưa được dùng để bypass migration, authorization hoặc quality gate.
- Completion commit: `e147885`.

## Artifacts

- [Brand system](../UI-BRAND-SYSTEM.md)
- [Preview specification](../UI-PREVIEW-SPEC.md)
- [Openable prototype](../ui-preview/index.html)
- [Desktop member screenshot](../../../output/playwright/pickhub-ui-member-1440.png)
- [Desktop leader screenshot](../../../output/playwright/pickhub-ui-leader-1440.png)
- [Desktop public tournament screenshot](../../../output/playwright/pickhub-ui-public-1440.png)
- [Mobile member screenshot](../../../output/playwright/pickhub-ui-member-390.png)
- [Desktop member information screenshot](../../../output/playwright/pickhub-ui-member-info-1440.png)
- [Mobile member information screenshot](../../../output/playwright/pickhub-ui-member-info-390.png)
- [Mobile public tournament screenshot](../../../output/playwright/pickhub-ui-public-390.png)

## Verification

- `node --check docs/pickhub-core/ui-preview/app.js` — pass.
- `npm run test:ui-preview` — pass: 3 contexts, brand tokens, local asset, no production API calls.
- `npm run test:tournament` — pass: migration, engines, API contracts và UI contracts hiện có.
- `git diff --check` — pass.
- Bundled Playwright + installed Chrome: member, leader và public đều render được heading; mobile member kiểm tra `scrollWidth - clientWidth = 0`; chuyển context sang trang giải và chọn tab “Bảng đấu” trả `aria-selected=true`.
- Chrome headless đã chụp 7 ảnh review ở desktop `1440px` và mobile `390px`, gồm cả luồng `Thông tin` cá nhân.

## Review notes

- Hero public dùng ảnh nền trừu tượng sân pickleball với overlay sáng, giữ copy dễ đọc mà không tạo bề mặt đen.
- Member dashboard đã chuyển thành màn hình ranking-first: BXH nộp phạt/đóng quỹ là nội dung chính, có bộ chuyển loại bảng, podium và danh sách xếp hạng.
- Mobile member giữ đúng 5 tab `Quỹ | Thành viên | BXH | Giải | Thông tin`; `BXH` nằm ở vị trí trung tâm và có trạng thái nổi bật.
- Mobile member đã đổi tab thứ năm thành `Thông tin`; màn hình này có hồ sơ cá nhân, PHR cá nhân, lịch sử cập nhật và tùy chọn tên hiển thị. Trưởng nhóm vẫn giữ `Cấu hình`.
- Visual direction lấy cấu trúc tham chiếu từ ảnh fitness app được cung cấp: nền sáng, card gọn, phân cấp rõ, màu tím làm accent; không sao chép layout hay nội dung.
- Bản màu mới dùng tím/lavender, vàng pastel, coral và cyan nhạt; các surface nền đen/navy đã được thay bằng nền sáng.
- Leader dashboard đưa thu–chi, thành viên và việc cần xử lý lên trung tâm.
- Bracket public là bản minh họa double elimination với scroll ngang ở mobile.
- Visual direction đã được duyệt: nền sáng, palette tím/lavender làm chủ đạo,
  vàng pastel/coral/cyan làm accent; không dùng surface nền đen hoặc navy đặc.
- Wording và hierarchy đã được duyệt cho các màn hình preview. Component
  production sẽ được tách theo lát cắt UI của Phase 1–6 và nghiệm thu ở nhánh
  phase tương ứng.
