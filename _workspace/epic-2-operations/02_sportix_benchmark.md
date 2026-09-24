# Epic 2 — So sánh Sportix vs PickHub: trang điều hành & trang VĐV/khán giả

Ngày 2026-09-24. Nguồn Sportix: giải "Rally Cup 2026" (đã kết thúc), xem công khai không đăng nhập — **không thấy
được phần quản trị của Sportix**, nên phần điều hành chỉ so với PickHub. PickHub: code hiện tại
(`app/giai-dau/v2/console/*`, `app/giai-dau/v2/[slug]/*`) + 10 màn Stitch `canonical/operations/`.
Chỉ phân tích, chưa sửa Stitch/code.

## 1. Sportix — cấu trúc quan sát được

Tab trên cùng (6): Tổng quan · Kết quả · Nhánh đấu · Vận động viên · Thông báo từ BTC · Stream/Video.
Trong "Nhánh đấu": `Sơ đồ nhánh | Danh sách trận` → nội dung (`Đôi Nam Nữ`) → giai đoạn (`Vòng bảng | Vòng loại
trực tiếp`) → nhánh (`Nhánh Vàng | Nhánh Bạc`) → ô tìm VĐV/cặp. Vòng bảng có thêm `Bảng xếp hạng | Lịch thi đấu |
Bảng trận`. Sơ đồ có `Xuất ảnh` và zoom `100%`.

### Điểm mạnh (nên học)
1. **Một chỗ duy nhất để theo dõi**: "Nhánh đấu" gom sơ đồ, danh sách trận, BXH bảng — cùng dữ liệu, chỉ đổi cách nhìn.
2. **Thẻ trận dễ đọc**: `Trận #1.1 - BO1` + chip trạng thái; cặp thắng có vạch xanh trái + ô điểm xanh; cặp thua mờ.
3. **Ô chờ ghi nguồn**: `Thắng 2.1`, `Thắng 1.2` — không có "Đội A/Đội B".
4. **Mobile**: sơ đồ cuộn ngang, mỗi màn ~1 vòng, thẻ to, chữ lớn — đọc được bằng một tay.
5. **BXH có chú giải** cột (TR/T/B/±VÁN/±ĐIỂM/ĐIỂM) và cách tính điểm ngay dưới bảng.
6. **Tìm theo tên VĐV/cặp** ngay trên sơ đồ và danh sách.
7. `Bảng trận` có giờ kế hoạch / bắt đầu / kết thúc, sân, tỉ số, lọc theo bảng/sân/vòng/trạng thái.
8. **Nhánh Bạc** (nhánh an ủi cho đội bị loại ở vòng bảng) — thêm trận cho CLB phong trào.

### Điểm yếu (tránh)
1. Mobile: poster + khối thông tin chiếm ~1,5 màn trước khi thấy nội dung; tới sơ đồ phải qua 4 tầng chọn.
2. **Nhãn không thống nhất**: sơ đồ ghi `Bán kết/Chung kết` nhưng danh sách ghi `Vòng 1/2/3`; mã `#1.1` là nhãn chính.
3. **Bye xử lý kém**: ô `BYE` hiện như một trận "Chờ" (danh sách lại ghi `TBD`); Nhánh Bạc vẫn "Chờ" dù giải đã kết thúc.
4. **Mâu thuẫn**: đầu trang "Đã xác định nhà vô địch" nhưng tab Kết quả "Chưa có kết quả" — không có bục/xếp hạng cuối.
5. **Không có góc nhìn trực tiếp**: Tổng quan không có "đang đấu / sắp tới"; mọi trận "Chưa xếp sân" → khán giả
   không theo được sân nào đang đá gì.
6. Vòng bảng có 3 view trùng dữ liệu (BXH / Lịch thi đấu / Bảng trận); BXH dùng thang 3-1-0 có "Hòa" (pickleball không hòa).

## 2. PickHub — hiện trạng

### Bàn điều hành (console) — 8 mục sidebar
Chuẩn bị: `1 Cấu hình giải & số ván` · `2 Sân & sơ đồ sân` · `3 VĐV & cặp đấu` · `4 Bốc thăm & chốt lịch`;
`5 Trung tâm điều hành`; Trong & sau giải: `6 Lịch thi đấu & kết quả` · `7 Bảng đấu & xếp hạng` · `8 Nhật ký thao tác`.
Cộng thêm thanh chọn giai đoạn, và bộ setup 4 bước riêng (`setup-v3`) trước khi chốt.

Điểm mạnh:
- Vòng đời trận theo sân thật (gọi → khởi động → đấu ⇄ tạm dừng → chốt), đồng hồ, giờ dự kiến xong, W.O./bỏ cuộc có lý do.
- Tiến cấp tự động theo cạnh (068), luật trận cố định (D8/D14), khoá phiên bản chống ghi đè, nhật ký thao tác.
- Hỗ trợ loại kép với nhãn tiếng Việt chuẩn (D21), xếp hạng cuối theo D22, nút kết thúc giải.

Điểm yếu (cần tối ưu):
1. **Trộn hai giai đoạn trong một menu**: bước 1/3/4 là việc *trước* khi chốt (đã có workspace setup 4 bước) nhưng vẫn
   nằm trên sidebar lúc đang đá → 8 mục, BTC phải lướt qua 4 mục "đã xong".
2. **Mục nguy hiểm lộ giữa giải**: `Huỷ chốt` (xoá toàn bộ lịch) ở bước 4, `Sinh lại lịch thi đấu` và `Số ván theo vòng`
   (trái D8) ở bước 1, sửa đội/cặp ở bước 3 sau khi đã chốt.
3. **Gọi sân và nhập tỉ số ở hai mục khác nhau**: bước 5 gọi/khởi động; ô nhập tỉ số thật nằm ở bước 6 → mỗi trận phải
   nhảy 2 menu. Sân (bật/tắt) lại ở bước 2.
4. Bước 7 xếp chồng BXH + sơ đồ trong một trang dài; bước 8 in JSON thô (`{...} → {...}`).
5. `OverviewTab` (chia sẻ Zalo, chuyển giai đoạn) **không còn được mount** — chức năng chia sẻ cho BTC bị mất khỏi console.
6. Bàn điều hành hiện "Trận #id", "live", "needs_call"; ô chờ "Đội A/Đội B" (nợ Epic 2).

### Trang công khai (VĐV + khán giả)
Điểm mạnh: tự cập nhật (poll + khi quay lại tab), chia sẻ Zalo/xuất ảnh/OG image, trang riêng từng nội dung.
Điểm yếu:
1. Một trang dài: Sơ đồ → Lịch → BXH xếp chồng, không tab; mobile phải cuộn rất xa.
2. Không có góc **"Đang đấu theo sân / Sắp tới / Vừa xong"** — thứ khán giả tại sân cần nhất.
3. Không tìm được "trận của tôi"; không có "trận kế tiếp của bạn: Sân 03 · dự kiến 15:05".
4. Sơ đồ chưa tối ưu mobile theo vòng; Tranh hạng ba gộp vào Chung kết; ô chờ "Đội A/Đội B".
5. Nhiều nội dung → chuyển trang riêng, không có bộ chọn nội dung ngay trên trang.

## 3. Đề xuất cấu trúc

### 3.1 Trang điều hành (BTC) — từ 8 mục xuống 4 mục sau khi chốt
Trước khi chốt: chỉ workspace setup 4 bước (đã có, console đã tự chuyển hướng) — bỏ bước 1/3/4 khỏi sidebar console.

| Mục mới | Gộp từ | Nội dung |
|---|---|---|
| **Điều hành** (mặc định) | 5 + 2 + phần nhập tỉ số của 6 | Thẻ sân + hàng chờ theo lượt + thẻ gọi sân + sheet nhập tỉ số (OPS-01/02/03). Bật/tắt sân, thêm sân ngay trên thẻ sân/trạng thái rỗng |
| **Trận đấu** | 6 | Danh sách theo lượt, lọc giai đoạn/lượt/sân/trạng thái/tên (OPS-04); chạm → cùng sheet OPS-03; sửa kết quả đã chốt có lý do |
| **Sơ đồ & xếp hạng** | 7 | Dùng **chung component** với trang công khai (OPS-05/06) + nút "Kết thúc giải"; tab con Sơ đồ / Xếp hạng |
| **Cài đặt** | 1 + 8 + OverviewTab | Thông tin giải, link công khai & chia sẻ Zalo, danh sách sân, **vùng nguy hiểm** (huỷ chốt / sinh lại — cần lý do), nhật ký dạng câu đọc được |

Bỏ hẳn: ô "Số ván theo vòng" cho stage v4 (D8); "Điều lệ MLP" để Epic 5.
Mobile BTC: 4 mục thành thanh tab đáy thay vì drawer 8 mục.

### 3.2 Trang VĐV + khán giả — học Sportix, tránh lỗi của Sportix
Header gọn 1 dòng (tên giải, trạng thái, tiến độ, Chia sẻ); bộ chọn nội dung ngay dưới (không chuyển trang).
3 tab, mặc định theo trạng thái giải:

| Tab | Nội dung |
|---|---|
| **Trực tiếp** (mặc định khi đang diễn ra) | Đang đấu theo sân · Sắp tới (giờ dự kiến, sân) · Vừa xong (OPS-07) |
| **Sơ đồ & BXH** (mặc định khi đã kết thúc: bục 1-2-3 ở đầu) | Vòng bảng: BXH có chú giải + dấu "Đi tiếp"; loại trực tiếp/loại kép: sơ đồ, mobile mỗi màn một vòng (cuộn ngang như Sportix) |
| **Lịch** | Danh sách trận theo lượt, cùng nhãn với sơ đồ |

Thêm: ô **"Tìm tên bạn"** (ghim vào máy) → tô sáng trận của mình trên cả 3 tab + thẻ "Trận kế tiếp của bạn".
Nhất quán nhãn: tên vòng tiếng Việt là nhãn chính ở mọi view (mã trận chỉ phụ), bye tự đi tiếp và hiện `Miễn đấu`
(không thành một trận "Chờ"), đã kết thúc thì có xếp hạng cuối — tránh 3 lỗi của Sportix.

### 3.3 Hệ quả với bộ Stitch vừa làm
- OPS-01/02/03 giữ nguyên hướng, chỉ đổi shell: sidebar 4 mục thay 8 mục.
- OPS-04 thành mục "Trận đấu"; OPS-05 + OPS-06 gộp thành "Sơ đồ & xếp hạng" có tab con (đã có sẵn tab trên thiết kế).
- OPS-07 cần thêm: tab "Sơ đồ & BXH" bản mobile theo vòng, ô "Tìm tên bạn", trạng thái giải đã kết thúc (bục).
- Cần thêm 1 màn "Cài đặt" (có vùng nguy hiểm).

## 4. Câu hỏi để chốt trước khi sửa Stitch
1. Đồng ý rút console còn 4 mục (Điều hành · Trận đấu · Sơ đồ & xếp hạng · Cài đặt) và bỏ bước 1/3/4 khỏi sidebar?
2. Trang công khai: 3 tab (Trực tiếp · Sơ đồ & BXH · Lịch) + tìm tên — hay giữ 4 tab như OPS-07?
3. "Nhánh Bạc" (nhánh an ủi) — ghi vào backlog hay bỏ?
