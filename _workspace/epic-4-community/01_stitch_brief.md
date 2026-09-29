# Epic 4 — Brief thiết kế Stitch: Giải cộng đồng

Ngày: 2026-09-29 · Bước thiết kế của Epic 4 (D44/D16: UI mới làm Stitch trước). Spec:
`docs/superpowers/specs/2026-09-29-epic-4-community/` (README + C1/C2/C3). Quyết định: ADR-007 D19, D54–D64.
Màn được xuất về `_workspace/stitch-internal-setup/canonical/community/<key>/` với **hai biến thể mỗi màn**:
`reference-desktop.{html,png}` (1280px) và `reference-mobile.{html,png}` (390px). Lát UI chỉ bắt đầu code sau khi có đủ hai biến thể.

## 0. Yêu cầu bắt buộc (người dùng, 2026-09-29)

**Mỗi màn thiết kế CẢ Desktop 1280px VÀ Mobile 390px.** Các giải trước chỉ có mobile; người dùng điều hành trên PC thường tiện hơn.
- Màn **admin** (PLA-*): bố cục **PC làm chuẩn** — sidebar 16rem, bảng nhiều cột, thanh lọc trên đầu bảng; mobile chuyển thành thẻ xếp dọc.
- Màn **VĐV/công khai** (PLC-*): mobile-first, nhưng PC không được là "mobile phóng to": dùng lưới 2–3 cột / hai cột (nội dung + khối đăng ký dính bên phải).
- Không tràn ngang ở cả hai kích thước; nút chạm ≥ 44px trên mobile; PC có trạng thái hover/focus rõ.

## 1. Người dùng

- **VĐV ngoài CLB:** người chơi phong trào, mở link giải từ Zalo/Facebook trên **điện thoại**, chưa có tài khoản PickHub; muốn đăng ký nhanh, rủ bạn đánh cùng.
- **Admin hệ thống (BTC cộng đồng):** người vận hành PickHub; duyệt đơn, xếp giải; **chủ yếu trên laptop/PC**, thỉnh thoảng điện thoại.
- **Khán giả:** xem trang giải công khai (danh sách cặp đã duyệt) — không có dữ liệu cá nhân.

## 2. Chuẩn thị giác

- Token: `_workspace/stitch-internal-setup/canonical/DESIGN.md` (Plus Jakarta Sans, tím `brand-600 #7c3aed`, nền `slate-50`, thẻ trắng viền `slate-200`, badge emerald/amber).
- Shell admin: sidebar trái 16rem + thanh trên (cùng shell `canonical/setup/*` và `canonical/operations/*`). Shell VĐV: thanh trên gọn (logo PickHub, "Giải cộng đồng", nút Đăng nhập/avatar chữ cái), không sidebar.
- Chữ tiếng Việt có dấu; không tiếng Anh ("pending", "waitlist", "invite"…). Tên người Việt thật ("Nguyễn Minh", "Trần Tuấn"). Không ảnh đại diện giả: avatar = chữ cái cuối của tên trên nền `brand-50`.
- Trạng thái đơn = badge: `Chờ bạn ghép` (amber), `Chờ duyệt` (slate), `Đã duyệt` (emerald), `Danh sách chờ #n` (amber nhạt), `Bị từ chối` (đỏ nhạt), `Đã rút` (xám). Phí: chip `Chưa thu` / `Đã xác nhận thu` / `Miễn phí`.

## 3. Sự thật dữ liệu (thiết kế không được hứa quá)

| Có thật | Ghi chú |
|---|---|
| Tài khoản VĐV: **SĐT + mật khẩu + tên hiển thị**; tùy chọn giới tính, ngày sinh, PHR tự khai | Không email, không đăng nhập mạng xã hội, **không OTP**, **không quên mật khẩu** ở bản đầu (ghi chú "Quên mật khẩu? Liên hệ ban tổ chức") |
| Nội dung thi đấu: Đơn hoặc Đôi; có thể Nam-Nữ (cần giới tính), có PHR tối đa (cần PHR), có tuổi | Chỉ hỏi trường mà nội dung yêu cầu |
| Đăng ký đôi: **đã có bạn** (nhập SĐT bạn → lời mời) hoặc **cần tìm bạn** (thành đơn lẻ) | Bạn ghép **phải có tài khoản**; nếu SĐT chưa có tài khoản: thông báo chung, không nói "SĐT này chưa đăng ký" (chống dò SĐT) |
| Rủ ghép cặp: **link rủ** (sao chép/chia sẻ, hết hạn 7 ngày, tạo lại làm link cũ mất hiệu lực); **lời mời đến/đi**; **bảng tìm bạn ghép** | Bảng tìm bạn chỉ hiện tên hiển thị (+ giới tính/PHR nếu nội dung cần), **không SĐT**; chỉ VĐV đã đăng nhập có đơn lẻ mới xem được |
| "Đơn của tôi": trạng thái, hạng chờ, phí, nút Rút | Không thấy đơn người khác |
| Hạn mức số cặp mỗi nội dung; **danh sách chờ** khi đủ; hạn chót đăng ký tùy chọn | Bộ đếm `X/Y cặp` = số **đã duyệt**/hạn mức; `Y` là mức tối đa, không ngụ ý phải đủ |
| Trang công khai: thông tin giải + phí + **danh sách tên cặp đã duyệt** + nút đăng ký | **Không** SĐT, ngày sinh, đơn chờ, danh sách chờ |
| Admin: duyệt / từ chối (lý do) / khôi phục / **ghép hộ hai VĐV lẻ** / rút / **đánh dấu đã thu phí** (thủ công) | Admin thấy SĐT VĐV (chỉ trong bảng duyệt); cảnh báo trùng tên |
| Admin tạo giải cộng đồng: tên, ngày, địa điểm, nội dung (đơn/đôi, giới tính, cap PHR), hạn mức, phí (số tiền hiển thị), hạn chót, mở/đóng đăng ký | Phí chỉ **hiển thị**; không QR thanh toán, không thu online |
| Sau khi đủ đơn: admin vào workspace setup 4 bước đã có; **Bước 2** hiển thị cặp đã duyệt (không chọn thành viên CLB, không thêm khách) | Bước 1/3/4 và bàn điều hành giữ nguyên giao diện hiện tại |

## 4. Danh sách màn (mỗi màn: Desktop + Mobile)

| Mã | Màn | Người dùng | Trọng tâm bố cục |
|---|---|---|---|
| PLC-01 | Danh sách giải cộng đồng đang mở: thẻ giải (tên, ngày, địa điểm, các nội dung, `X/Y cặp`, phí, hạn chót) + lọc theo ngày | VĐV | Mobile một cột; PC lưới 3 cột |
| PLC-02 | Tạo tài khoản VĐV (họ tên hiển thị, SĐT, mật khẩu, xác nhận; tùy chọn giới tính/ngày sinh/PHR) | VĐV | Thẻ căn giữa 440px; mobile toàn chiều ngang |
| PLC-03 | Đăng nhập VĐV (SĐT + mật khẩu; lỗi đồng nhất; "Quên mật khẩu" = hướng dẫn liên hệ) — cùng khung với PLC-02 dạng 2 tab | VĐV | như trên |
| PLC-04 | Đăng ký nội dung: chọn nội dung, xác nhận hồ sơ, đôi → "Đã có bạn ghép" / "Cần tìm bạn", hiển thị phí + hạn mức còn lại | VĐV | Mobile stepper gọn; PC hai cột (form + tóm tắt giải dính) |
| PLC-05 | Rủ ghép cặp: khối link rủ (sao chép/chia sẻ Zalo), mời theo SĐT, bảng tìm bạn ghép, lời mời đến (Nhận/Từ chối) | VĐV | Mobile tab; PC ba khối cạnh nhau |
| PLC-06 | Đơn của tôi: thẻ đơn (nội dung, cặp, trạng thái, hạng chờ, phí, Rút) + trạng thái "Giải đã chốt danh sách" | VĐV | Mobile danh sách thẻ; PC bảng gọn |
| PLC-07 | Trang giải công khai: hero (tên, ngày, địa điểm, phí), danh sách **tên cặp đã duyệt** theo nội dung, `X/Y`, nút Đăng ký | Mọi người | Mobile một cột; PC hai cột (danh sách + khối đăng ký dính) |
| PLA-01 | Đăng nhập admin hệ thống (email/tên đăng nhập + mật khẩu; không có nút đăng ký) | Admin | Thẻ căn giữa |
| PLA-02 | **Bảng duyệt đăng ký** một nội dung: bảng (cặp, hai tên, SĐT, PHR, trạng thái, phí, hạng chờ, thời điểm), lọc theo trạng thái/tìm tên, thanh hành động (Duyệt, Từ chối, Ghép hộ, Đánh dấu đã thu), khối "VĐV lẻ đang tìm bạn", bộ đếm hạn mức | Admin | **PC là chuẩn** (bảng 8–9 cột, chọn nhiều dòng); mobile thẻ + thanh hành động dưới |
| PLA-03 | Danh sách giải cộng đồng của admin + form tạo/sửa giải & nội dung (hạn mức, phí, hạn chót, mở/đóng đăng ký, link công khai) | Admin | **PC là chuẩn** (form hai cột + bảng nội dung); mobile một cột |
| PLA-04 | **Bước 2 setup cộng đồng**: thay hộp chọn thành viên bằng danh sách cặp đã duyệt (tên cặp, PHR, chip phí), bộ đếm `N cặp · M chờ duyệt · K đang tìm bạn`, nút "Mở bảng duyệt", cảnh báo phí chưa thu | Admin | **PC là chuẩn** trong shell workspace setup; mobile theo shell hiện có |

Các trạng thái cần vẽ: rỗng (chưa có giải/đơn), đang tải, lỗi 429 "Thử lại sau N giây", đầy hạn mức → vào danh sách chờ, đã quá hạn/đã khoá đăng ký, link rủ hết hạn, đã ở cặp khác.

## 5. Ngoài phạm vi thiết kế

Thanh toán/QR, quên mật khẩu, OTP, thông báo email/Zalo, hồ sơ công khai của VĐV, xếp hạng cá nhân toàn hệ thống, MLP. Không thiết kế lại Bước 1/3/4 và bàn điều hành (chỉ PLA-04 thay Bước 2 và khối "Đăng ký" nhỏ ở Bước 1).

## 6. Cách làm và nghiệm thu thiết kế

- Agent sinh màn qua Stitch connector (project mới "PickHub — Giải cộng đồng", áp dụng design system của bộ setup), mỗi màn gọi hai lần: Desktop 1280 và Mobile 390.
- Xuất về `canonical/community/<key>/` (giữ tên `reference-desktop`/`reference-mobile`), ghi `stitch-source-manifest.json`.
- Người dùng duyệt trực tiếp trên Stitch (như D52). Chỉ sau khi duyệt mới code UI C2/C3; C1 (đăng nhập) làm trước theo token DESIGN.md rồi đối chiếu PLC-02/03.
