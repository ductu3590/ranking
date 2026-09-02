# PickHub UI Preview Specification

## Mục đích

Prototype này giúp xem trước một hệ thống giao diện thống nhất trước khi bắt đầu visual redesign production. Nó dùng dữ liệu giả lập, không gọi Supabase và không thay đổi route hiện có.

## Ba ngữ cảnh cần xem

### Thành viên — mobile-first

- Mở vào CLB mặc định.
- Hiển thị mã truy cập ở trạng thái read-only.
- Ba ưu tiên trên màn hình đầu: BXH đóng quỹ, tổng quan quỹ, tổng số thành viên và phân bổ PHR.
- Có danh sách thông báo chỉ trong PickHub.
- Có thể xem lịch/kết quả giải ở điều hướng phụ.

### Trưởng nhóm — responsive

- Đăng nhập bằng mã CLB và mật khẩu (được mô phỏng trong prototype).
- Dashboard ưu tiên thu–chi, thành viên và thông báo cần xử lý.
- Có lối tắt cập nhật PHR trực tiếp theo thang 1,0–5,0.
- Có thể truy cập quản lý giải nội bộ bằng cùng bộ máy giải đấu.

### Trang giải công khai — desktop-first khi vận hành, responsive khi xem

- Logo, ảnh bìa và màu giải riêng.
- Hiển thị biệt danh nếu VĐV đã cấu hình; nếu chưa, dùng tên từ CLB chủ quản.
- Hiển thị PHR snapshot tại thời điểm chốt danh sách.
- Có tổng quan, lịch, bảng đấu, kết quả và nhánh thắng/nhánh thua.
- Public page không hiển thị dữ liệu quỹ hoặc thông tin liên hệ riêng.

## Tương tác review

- Nút “Xem vai trò” chuyển giữa `Thành viên`, `Trưởng nhóm` và `Trang giải`.
- Nút “Đổi CLB” mô phỏng chuyển CLB mặc định.
- Tab giải chuyển giữa bảng xếp hạng, lịch và bracket.
- Nút “Xem trên mobile” không dùng thư viện; layout tự responsive theo viewport.

## Dữ liệu giả lập

- CLB: Skyline Pickleball Club.
- Quỹ: số dư, thu–chi gần đây và BXH đóng quỹ.
- PHR: nhãn + điểm, ví dụ `Khá · 3,2`.
- Giải: PickHub Community Open, hai nội dung, vòng bảng và nhánh thắng/nhánh thua.
- Kết quả: điểm trận có thể là 15–12; xử thua hiển thị 15–0 theo luật vòng.

## Tiêu chí duyệt visual

1. Không gian CLB, leader và public tournament nhận ra là cùng một sản phẩm.
2. Ba chỉ số chính của thành viên đọc được trong vòng vài giây trên màn hình điện thoại.
3. Trưởng nhóm tìm được thu–chi, thành viên và việc cần xử lý mà không cần mở menu sâu.
4. Trang giải có thể dùng để xem trên điện thoại và trình chiếu trên desktop.
5. Màu CLB/giải thay đổi được nhưng không làm mất tương phản hoặc ý nghĩa trạng thái.
6. Bracket có thể đọc được trên desktop; mobile ưu tiên trận hiện tại và cuộn ngang.
7. Prototype không yêu cầu tài khoản VĐV, không gọi API và không tạo dữ liệu thật.

## Câu hỏi sau preview

- Màu và mức độ “thể thao” đã đủ mạnh nhưng vẫn khoa học chưa?
- Thành viên có nhìn thấy đúng ba nội dung minh bạch ưu tiên không?
- Dashboard trưởng nhóm có làm nổi bật việc cần xử lý không?
- Trang giải có phù hợp vừa xem công khai vừa trình chiếu tại sân không?

