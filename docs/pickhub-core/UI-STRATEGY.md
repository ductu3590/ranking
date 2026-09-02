# Chiến lược giao diện PickHub

## Quyết định đã chốt

Hướng giao diện PickHub đã được duyệt ngày `2026-09-02` trên nhánh
`codex/pickhub-ui-brand-preview`, commit `e147885`. Đây là design baseline bắt
buộc cho các màn hình production tiếp theo:

- Nền sáng, card gọn, phân cấp rõ và cảm giác thể thao hiện đại.
- Tím/indigo làm màu hành động chính; lavender, vàng pastel, coral và cyan là
  accent theo ngữ cảnh.
- Không dùng bề mặt nền đen hoặc navy đặc. `--ph-ink` chỉ dùng cho chữ và
  icon cần tương phản.
- Thành viên dùng năm tab `Quỹ | Thành viên | BXH | Giải | Thông tin`; `BXH`
  nằm ở vị trí trung tâm. Trưởng nhóm dùng `Cấu hình` thay cho `Thông tin`.
- Thành viên ưu tiên xem CLB mặc định; VĐV có thể sinh hoạt nhiều CLB và có
  thể đổi không gian bằng club switcher.
- PHR luôn hiển thị cùng nhãn và điểm; public tournament ưu tiên biệt danh đã
  cấu hình, nếu chưa có thì dùng tên trong CLB chủ quản.

Bộ token, typography, component principles và quy tắc theme chuẩn nằm trong
[`UI-BRAND-SYSTEM.md`](./UI-BRAND-SYSTEM.md). Prototype duyệt hướng được lưu
trong [`ui-preview/`](./ui-preview/) và không thay đổi route hay dữ liệu thật.

## Cách đưa UI vào sáu phase

Không tạo một nhánh redesign dài hạn tách khỏi roadmap. Sau khi design baseline
được duyệt, mỗi phase đưa đúng lát cắt UI của mình vào chính nhánh phase đó.
Như vậy UI được kiểm chứng cùng API, quyền và dữ liệu, nhưng không kéo visual
polish của phase sau vào phase trước.

| Phase | Lát cắt UI phải triển khai | Thiết bị ưu tiên |
|---|---|---|
| 1 — Ổn định nền tảng | App shell, token, trạng thái tải/rỗng/lỗi/quyền, focus, route guard và public-link fallback. Chỉ sửa giao diện cần cho an toàn và regression. | Mobile và desktop smoke |
| 2 — Danh tính VĐV và CLB | Club switcher/CLB mặc định, roster claimed/unclaimed, quyền theo vai trò, tab `Thông tin` của thành viên (hồ sơ, PHR cá nhân, lịch sử, CLB đang sinh hoạt) và `Cấu hình` của trưởng nhóm. | Mobile-first, leader responsive |
| 3 — MVP giải liên CLB | Tạo giải, cấu hình nội dung, mời CLB, captain đăng ký VĐV, duyệt roster, ON/OFF ghép ngẫu nhiên cân bằng theo nội dung, bốc thăm, public link và kết quả. | Desktop cho BTC, mobile cho captain/người xem |
| 4 — Vận hành giải | Bàn điều hành BTC, lịch sân, check-in, trận đang diễn ra, nhập/sửa điểm, xử thua, offline queue và public court board. | Desktop tại bàn BTC; mobile ngoài sân |
| 5 — Trình độ và ghép cân bằng | Captain nhập đánh giá, timeline PHR, snapshot khi chốt roster, preview phương án ghép, fairness score, cảnh báo và explanation. | Mobile cho captain; desktop cho director |
| 6 — Mở rộng toàn quốc | Onboarding CLB/community, danh bạ và lịch giải, public profile/privacy, moderation, entitlement, export, performance và theme theo cấp nền tảng/CLB/giải. | Responsive, accessibility và hiệu năng ở quy mô lớn |

Chi tiết triển khai, file dự kiến, test matrix và gate của từng lát cắt được
ghi trong
[`2026-09-02-pickhub-ui-six-phase-integration.md`](../superpowers/plans/2026-09-02-pickhub-ui-six-phase-integration.md).

## Nguyên tắc thực thi theo phase

1. Chỉ tạo nhánh phase từ `main` sau khi phase trước đã merge và smoke test
   xanh.
2. Bắt đầu bằng contract/view-model và test thất bại cho luồng UI mới; không
   lấy Supabase rows làm props trực tiếp cho domain component.
3. Giữ quyết định quyền, tính hợp lệ đăng ký, bốc thăm, xếp hạng và finalize
   ở server/domain. UI chỉ hiển thị action được phép và chuyển error code thành
   thông điệp dễ hiểu.
4. Với mọi mutation có thể retry, UI phải thể hiện `pending`, `synced`,
   `conflict`, `failed` và dùng idempotency/version do core trả về.
5. Mỗi phase chạy unit, integration/RLS, API contract, E2E, concurrency khi
   cần và visual regression trên viewport liên quan. Evidence phải nằm tại
   `docs/pickhub-core/evidence/phase-N-test-report.md`.
6. Khi đạt gate, phase chuyển `awaiting_approval`; chỉ sau xác nhận của người
   phụ trách sản phẩm mới ghi `completed`, merge vào `main` và smoke test lại.

## Information architecture

```text
Public
  ├─ Trang chủ cộng đồng
  ├─ Danh bạ CLB
  ├─ Lịch/chi tiết giải
  └─ Kết quả và hồ sơ công khai

Authenticated / club access
  ├─ Không gian CLB mặc định
  │   ├─ Quỹ
  │   ├─ Thành viên
  │   ├─ BXH đóng quỹ
  │   ├─ Giải
  │   └─ Thông tin (thành viên) / Cấu hình (trưởng nhóm)
  ├─ Chuyển CLB
  ├─ Hồ sơ VĐV và PHR
  └─ Quản trị theo quyền
```

## Ranh giới giữa core và UI

Core chịu trách nhiệm authorization, state transition, invariant, eligibility,
draw, standings, rating, audit, transaction, API/view model ổn định và error
code có ý nghĩa.

UI chịu trách nhiệm trình bày, điều hướng, nhập liệu, phản hồi tức thời,
loading/empty/error/offline presentation và accessibility. UI không được tự
quyết định một registration hợp lệ, một người có quyền, hoặc match đã đủ điều
kiện finalize.

## Tiêu chí sẵn sàng cho mỗi lát cắt UI

- View-model và API contract đã được phase đó chốt.
- Desktop/mobile breakpoint, keyboard/focus và touch target đã được định nghĩa.
- Loading, empty, error, forbidden, stale, offline và conflict có thiết kế.
- Không có surface nền đen/navy đặc; theme override vẫn giữ contrast và ý
  nghĩa trạng thái.
- Có test contract/E2E và screenshot review phù hợp vai trò.
- Có copy tiếng Việt rõ ràng, không dùng màu hoặc icon làm tín hiệu duy nhất.

## Quyết định không làm

- Không big-bang redesign sau Phase 3 và không duy trì hai design system song
  song.
- Không đưa chat, payment hay social feed vào các lát cắt UI khi core phase
  chưa có phạm vi tương ứng.
- Không để màu CLB/giải thay thế màu trạng thái hệ thống hoặc làm lộ dữ liệu
  riêng tư.
