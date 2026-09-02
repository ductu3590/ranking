# Evidence — PickHub UI preview

## Review branch

- Branch: `codex/pickhub-ui-brand-preview`
- Worktree: `C:\Users\ductu\ranking\.worktrees\pickhub-ui-brand-preview`
- Scope: brand system + static member/leader/public tournament preview.
- Status: `awaiting_approval`; chưa merge vào `main` và chưa đánh dấu phase core completed.

## Artifacts

- [Brand system](../UI-BRAND-SYSTEM.md)
- [Preview specification](../UI-PREVIEW-SPEC.md)
- [Openable prototype](../ui-preview/index.html)
- [Desktop member screenshot](../../../output/playwright/pickhub-ui-member-1440.png)
- [Desktop leader screenshot](../../../output/playwright/pickhub-ui-leader-1440.png)
- [Desktop public tournament screenshot](../../../output/playwright/pickhub-ui-public-1440.png)
- [Mobile member screenshot](../../../output/playwright/pickhub-ui-member-390.png)
- [Mobile public tournament screenshot](../../../output/playwright/pickhub-ui-public-390.png)

## Verification

- `node --check docs/pickhub-core/ui-preview/app.js` — pass.
- `npm run test:ui-preview` — pass: 3 contexts, brand tokens, local asset, no production API calls.
- `npm run test:tournament` — pass: migration, engines, API contracts và UI contracts hiện có.
- `git diff --check` — pass.
- Bundled Playwright + installed Chrome: member, leader và public đều render được heading; mobile member kiểm tra `scrollWidth - clientWidth = 0`; chuyển context sang trang giải và chọn tab “Bảng đấu” trả `aria-selected=true`.
- Chrome headless đã chụp 5 ảnh review ở desktop `1440px` và mobile `390px`.

## Review notes

- Hero public dùng ảnh nền trừu tượng sân pickleball, giữ vùng tối cho copy.
- Member dashboard đã chuyển thành màn hình ranking-first: BXH nộp phạt/đóng quỹ là nội dung chính, có bộ chuyển loại bảng, podium và danh sách xếp hạng.
- Mobile member giữ đúng 5 tab `Quỹ | Thành viên | BXH | Giải | Cấu hình`; `BXH` nằm ở vị trí trung tâm và có trạng thái nổi bật.
- Visual direction lấy cấu trúc tham chiếu từ ảnh fitness app được cung cấp: nền sáng, card gọn, phân cấp rõ, màu tím làm accent; không sao chép layout hay nội dung.
- Leader dashboard đưa thu–chi, thành viên và việc cần xử lý lên trung tâm.
- Bracket public là bản minh họa double elimination với scroll ngang ở mobile.
- Cần người phụ trách sản phẩm duyệt màu, mức độ thể thao, wording và ưu tiên thông tin trước khi tách component production.
