# ADR-006 — Montserrat và hợp nhất token UI về `--ph-*`

- Trạng thái: `accepted`
- Ngày: 2026-09-07
- Phạm vi: toàn bộ UI production của PickHub

## Bối cảnh

Baseline thương hiệu được duyệt ngày `2026-09-02` quy định bộ token `--ph-*`
(indigo `#6F48C9` làm hành động chính, lavender/gold/cyan/coral làm accent, nền
`#F5F6FB`) và font `Inter`. Prototype tại `docs/pickhub-core/ui-preview/` là
hiện thực tham chiếu của baseline đó.

Code production đi theo hướng khác. `app/globals.css` khai báo `--ph-*` ở đầu
file rồi ghi đè bằng bảng màu sân xanh (`--court-green`, `--pickle-lime`,
`--surface-court`) và font `Outfit`. Kết quả:

- Hai design system song song, trái với quyết định “không duy trì hai design
  system song song” trong `UI-STRATEGY.md`.
- 25 file CSS rời rạc (~8.6k dòng) với 5 bộ nút, 4 bộ modal, 4 bộ badge khác
  nhau; không có component dùng chung và không có skeleton.
- Mỗi màn hình có ngôn ngữ thị giác riêng, khiến trải nghiệm rời rạc và chi phí
  sửa đổi cao.

Người phụ trách sản phẩm đồng thời yêu cầu dùng `Montserrat` cho toàn bộ website.

## Quyết định

1. **Font chính là `Montserrat`**, thay cho `Inter` trong baseline. Trọng lượng
   dùng: `400 / 500 / 600 / 700 / 800`. Số liệu dùng tabular numerals.
2. **`--ph-*` là bộ token duy nhất.** Bảng màu sân xanh (`--court-*`,
   `--pickle-*`, `--surface-court`, `--live-cyan`, `--rally-coral`) và font
   `Outfit` bị gỡ khỏi sản phẩm.
3. **Prototype `ui-preview/` là nguồn tham chiếu để chuyển hoá**, không phải để
   sao chép nguyên trạng: token, primitive và cấu trúc component được rút ra
   thành lớp dùng chung của production.
4. **Ảnh chia sẻ dùng nền gradient indigo**, không dùng nền tối. Thẻ chia sẻ là
   bề mặt nhận diện thương hiệu nên phải cùng ngôn ngữ màu với sản phẩm; phương
   án nền `--ph-ink` đã được cân nhắc và bị loại.
5. **Việc gỡ bỏ được làm theo kế hoạch tập trung**, không sửa rải rác từng màn
   hình, để tránh giai đoạn nửa vời có cả hai bảng màu trên cùng một phiên.

## Hệ quả

- Mọi màn hình production sẽ đổi màu chủ đạo từ xanh sân sang indigo. Đây là
  thay đổi nhìn thấy được với thành viên CLB đang dùng thật; cần thông báo trước.
- Cần một lớp primitive dùng chung (nút, thẻ, modal, bảng, badge, empty state,
  skeleton) trước khi redesign từng màn hình, nếu không sẽ lại sinh bộ class thứ sáu.
- `UI-BRAND-SYSTEM.md` mục Typography và mục 8 đã được sửa theo quyết định này.
- Tài liệu và code sẽ khớp nhau trở lại; các phase sau lấy `--ph-*` làm mặc định
  thay vì tự chọn màu.

## Quan hệ với ADR-004

[`ADR-004`](./ADR-004-ui-core-separation.md) (`proposed`) ghi rằng visual redesign
đầy đủ chỉ bắt đầu **sau khi Phase 3 được pilot và merge**. Theo `PROGRESS.md`
ngày `2026-09-07`, Phase 3 vẫn ở trạng thái `not_started`.

Người phụ trách sản phẩm chủ động đảo thứ tự: cụm quản lý CLB (quỹ, thu chi
SePay, BXH đóng quỹ) là thứ thu hút người dùng thật, nên được redesign trước
module giải đấu. ADR-006 vì vậy **thu hẹp phạm vi ADR-004**: điều kiện “sau
Phase 3” chỉ còn áp dụng cho redesign của các màn hình thuộc Phase 3–6 (giải
đấu, vận hành giải, rating). Cụm CLB core được redesign ngay.

Ràng buộc của ADR-004 vẫn giữ nguyên và bắt buộc: redesign **không thay đổi
business rule**, không đổi API contract, không đổi quyết định quyền.

Phân biệt cần thiết để ràng buộc này dùng được trong thực tế:

- **Quy tắc nghiệp vụ** là thứ quyết định dữ liệu được ghi ra sao và ai được làm
  gì: cách parser gán `nguoi_nop`, cách phân loại giao dịch, cách tính số dư,
  quyết định quyền. Redesign **không được đụng**.
- **Quy tắc trình bày** là thứ chỉ quyết định cách đọc dữ liệu đã có: gom nhóm,
  xếp hạng, streak, huy hiệu, mốc thời gian. Redesign **được phép thêm**, với
  điều kiện là hàm thuần, không ghi gì xuống database, không đổi số dư quỹ.
- **API contract** được phép **mở rộng cộng thêm** — thêm trường mới, thêm route
  mới — nhưng không được đổi kiểu, bỏ trường hay đổi mã lỗi của thứ đang có.

Mỗi spec phải liệt kê hết phần mở rộng của mình theo ba loại trên.

## Phương án đã cân nhắc và loại

- **Giữ bảng màu sân xanh, sửa lại baseline theo code.** Loại: baseline đã được
  duyệt có lý do (nền sáng, tương phản, theme CLB map vào accent), và bảng màu
  sân xanh chưa từng qua bước duyệt tương đương.
- **Chạy song song hai theme, cho CLB chọn.** Loại: nhân đôi chi phí kiểm thử và
  trái nguyên tắc màu CLB không được thay màu trạng thái hệ thống.
