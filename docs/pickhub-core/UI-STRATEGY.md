# Chiến lược giao diện PickHub

## Quyết định

Lên kế hoạch giao diện ngay, nhưng không thực hiện một cuộc redesign toàn bộ trước khi các luồng lõi được chứng minh. Cũng không chờ hoàn thành cả sáu phase mới làm giao diện.

Hướng thực hiện:

1. Ngay bây giờ chốt information architecture, route map, design tokens, accessibility, responsive rules và ranh giới component/API.
2. Phase 1–2 chỉ làm reference UI tối thiểu cho auth, quyền và migration; tránh polish lớn.
3. Phase 3 xây UI chức năng trọn luồng và dùng nó trong pilot ba CLB.
4. Sau khi Phase 3 hoàn thành, bắt đầu chương trình visual redesign trên nhánh riêng. Lúc đó workflow và API chính đã được kiểm chứng.
5. Phase 4 trở đi dùng design system mới khi nó đã ổn định; không tạo hai hệ thống UI song song kéo dài.

Prototype duyệt hướng hình ảnh trước khi production redesign nằm ở [`UI-BRAND-SYSTEM.md`](./UI-BRAND-SYSTEM.md), [`UI-PREVIEW-SPEC.md`](./UI-PREVIEW-SPEC.md) và [`ui-preview/`](./ui-preview/). Prototype không thay đổi route hay dữ liệu thật.

## Vì sao không làm UI cuối cùng ngay

- Auth, role và mô hình tournament sẽ thay đổi cấu trúc điều hướng.
- Division, đăng ký đoàn, duyệt roster và scorekeeping chưa có trong UI hiện tại.
- Làm đẹp trên luồng chưa đúng sẽ khiến phải làm lại.
- Redesign lớn dễ vô tình kéo logic nghiệp vụ vào component và làm chậm core.

## Vì sao không đợi hết Phase 6

- Core không thể được xác minh nếu người thật không sử dụng được end-to-end.
- Phase 5 rating và Phase 6 scale phụ thuộc phản hồi UX từ pilot.
- Một “backend hoàn chỉnh” không có reference UI thường chứa API khó dùng và trạng thái thiếu.

## Ranh giới giữa core và UI

Core chịu trách nhiệm:

- Authorization, state transition và invariant.
- Eligibility, draw, standings, rating, audit và transaction.
- API/view model ổn định.
- Error code có ý nghĩa và idempotency.

UI chịu trách nhiệm:

- Trình bày, điều hướng, nhập liệu và phản hồi tức thời.
- Chuyển error code thành thông điệp rõ ràng.
- Optimistic UX chỉ khi core hỗ trợ version/idempotency.
- Mobile, accessibility và offline queue presentation.

UI không được tự quyết định một registration có hợp lệ, một người có quyền, hoặc match đã đủ điều kiện finalize.

## Kế hoạch giao diện cần chốt sớm

### Information architecture

```text
Public
  ├─ Trang chủ cộng đồng
  ├─ Danh bạ CLB
  ├─ Lịch/chi tiết giải
  └─ Kết quả và hồ sơ công khai

Authenticated
  ├─ Không gian của tôi
  ├─ CLB của tôi
  ├─ Giải đấu
  ├─ Hồ sơ VĐV
  └─ Quản trị theo quyền
```

### Design system foundation

- Semantic tokens cho màu, spacing, typography, radius, elevation và state.
- Bộ token và quy tắc nhận diện bản nháp được ghi trong [`UI-BRAND-SYSTEM.md`](./UI-BRAND-SYSTEM.md); chỉ đưa vào production sau review visual.
- Component primitives không biết business domain.
- Domain components nhận view model, không nhận Supabase rows.
- Mobile-first; score entry và check-in ưu tiên thao tác một tay.
- WCAG-oriented contrast, focus, keyboard và screen-reader labels.
- Loading, empty, partial, stale, offline, conflict và permission-denied là trạng thái thiết kế bắt buộc.

### API contract cho UI

- ID là opaque string ở UI.
- Date/time có timezone rõ.
- Money dùng integer minor unit hoặc numeric chuẩn, không dùng float.
- Enum và transition actions được server trả rõ; UI không suy luận từ text.
- Public và admin view model tách riêng.

## Nhánh redesign

Chỉ tạo sau Phase 3 gate:

`codex/ui-redesign-foundation`

Nhánh redesign không thay đổi schema, auth rule, tournament calculation hoặc financial logic. Nếu phát hiện core contract thiếu, tạo issue/ADR và sửa trên nhánh core phù hợp thay vì lách trong UI.

## Tiêu chí bắt đầu redesign

- Phase 3 đã merge vào `main`.
- Pilot liên CLB hoàn thành ít nhất một lần.
- Route map và workflow chính không còn thay đổi lớn.
- API view model có contract test.
- Có danh sách pain point UX từ người tổ chức, trưởng CLB và người xem.

## Review gate cho visual redesign

Prototype phải được xem trên desktop và mobile trước khi chọn hướng final. Các màn hình review đại diện là thành viên, trưởng nhóm và trang giải công khai. Chỉ sau khi người dùng xác nhận hướng thương hiệu và hierarchy chính mới tách component production vào nhánh `codex/ui-redesign-foundation`.
