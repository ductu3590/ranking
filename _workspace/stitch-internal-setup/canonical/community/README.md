# Epic 4 — Màn Stitch Giải cộng đồng (PC 1280px + Mobile 390px)

Brief: `_workspace/epic-4-community/01_stitch_brief.md`. Spec: `docs/superpowers/specs/2026-09-29-epic-4-community/`.
Người dùng duyệt trực tiếp trên Stitch (D64: mọi màn có cả PC và mobile).

**Project chính:** `projects/11027657519607899722` — "PickHub — Giải cộng đồng (Epic 4)" (design system "Pro Court OS" sáng, `assets/52dcf6b888b94a97937324f3c7aabd43`).
**Project cũ (Epic 3):** `projects/16224817196221939744` — có 2 màn Epic 4 sinh trước khi đổi project (do project cũ quá 100 màn nên `list_screens` không liệt kê được màn mới).

## Nhật ký sinh màn (screen ID) — tất cả ở project mới `11027657519607899722`

| Mã | PC (1280) | Mobile (390) |
|---|---|---|
| PLC-01 Danh sách giải đang mở | `597fd839ad014032a2104122e6f05911` | `70a1d6c2043048e5b71b44a759dae351` |
| PLC-02 Tạo tài khoản | `b2fab8ce1722417292269cb9be104b96` | `854fd161c09c4eee988820b4623c784e` |
| PLC-03 Đăng nhập VĐV | `54e68075950e432581e487fa9ba1f068` | `4c426127795243fcad35917282f6763b` |
| PLC-04 Đăng ký giải | `ef79f30dfac34859bfb257d8485a166f` | `3960230f0c754adeb0983f35e6beb981` |
| PLC-05 Rủ ghép cặp | `55578e83045d49aba5d6d96a1f397085` | `8412298ab03c4b209d777e64cba4f28a` |
| PLC-06 Đơn của tôi | `0e0ba5e380324e1eaca575e60952657f` | `74709c16097840519327c4eeeffdd0b4` |
| PLC-07 Trang giải công khai | `ccb0d6d83db7408c91faca59e4672b03` | `a282064c7da3410e9d4b5980a1bc13e3` |
| PLA-01 Đăng nhập admin hệ thống | `cb1d57a1a4c841c2898aa0fb5657504c` | `e5ecf2ec5d654c9faa211b8ba721b88f` |
| PLA-02 Duyệt đăng ký | `ca46e38afc5e40ddbe5cf1b7b9b7c056` | `e42b132a927549709866f4e0e4453581` |
| PLA-03 Giải cộng đồng (danh sách + tạo giải) | `380936fa863f4980a17bb087b03ba5c6` | `e703c241d7154f89aa1ffc59c19d6eee` |

| PLA-04 Bước 2 setup cộng đồng | `6af14c1a576e44e9abd65a72de7d79c1` | `f3ff8ecca0264453b62b894fef5bdca5` |

**Đủ 11 màn × 2 kích thước = 22 màn (2026-09-29).** Người dùng duyệt trực tiếp trên Stitch (project trên).

## Chỗ Stitch tự thêm / sai — bỏ khi code

| Màn | Chi tiết | Xử lý |
|---|---|---|
| PLC-02 (bản sinh sớm, project cũ) | nhãn "Hiện trên sơ đồ giải", ô PHR dạng dropdown 2.0–5.0 | Bỏ; mã dùng ô số |
| PLA-01 (bản sinh sớm, project cũ) | huy hiệu "Cổng điều hành an toàn" | Bỏ |
| PLC-07 mobile | số thứ tự và nhãn "Đã duyệt" cạnh mỗi cặp | Bỏ số thứ tự dạng badge (dễ hiểu nhầm hạt giống); trang công khai chỉ liệt kê cặp đã duyệt |
| PLA-03 (PC + mobile) | dữ liệu mẫu ghi "Giải Pickleball Cộng đồng **Hà Nam** – Mùa Thu" | Lỗi gõ prompt, chỉ là dữ liệu mẫu; tên giải lấy từ dữ liệu thật |
| PLC-02/03 PC | thanh trên có huy hiệu tròn, chân trang bản quyền (PLC-02 PC) | Bỏ chân trang |
| Nhiều màn | email mẫu `admin@pickhub.vn` ở chân sidebar (PLA-03) | Không có email admin trong dữ liệu — bỏ |

Bản sinh sớm ở project Epic 3 (`16224817196221939744`), đã có bản thay thế ở project mới: PLA-01 PC `bd302dcf…`, PLC-02 mobile `dd63912a…`.

## Ghi chú kỹ thuật khi dùng Stitch
- Gọi **tuần tự từng màn**; gọi song song nhiều lệnh thì hầu hết hết thời gian chờ mà không lấy lại được ID.
- `deviceType: MOBILE` bị bỏ qua: mô tả "cột 390px, chiều cao tự nhiên, không khung điện thoại" trong prompt.
- Icon: SVG inline (font icon đôi khi không tải kịp khi chụp).

## Đối chiếu UI thật với Stitch (2026-09-29)
Ảnh chụp tham chiếu của cả 22 màn nằm trong thư mục `<mã màn>/reference-desktop` và `<mã màn>/reference-mobile` (`screenshot.jpg`; PLC-01..03 có thêm `screen.html`). Kết quả đối chiếu từng màn: `_workspace/epic-4-community/evidence.md` mục "Đối chiếu giao diện với Stitch". Lấy ảnh đủ kích thước: thêm `=w1280` vào URL ảnh `lh3` của `get_screen`.
