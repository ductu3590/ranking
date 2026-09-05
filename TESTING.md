# TESTING — Kiểm thử UI Phase 3 (giải nội bộ, giao hữu, cộng đồng)

Tài liệu này hướng dẫn **người kiểm thử ngồi bấm trên giao diện**. Phần logic, migration và test tự động do agent lo và đã xanh; ở đây chỉ tập trung vào trải nghiệm thật mà máy không kiểm thay được.

- Thiết bị: điện thoại thật hoặc trình duyệt ở chế độ responsive, khung dọc khoảng **380px**.
- Đăng nhập bằng **Mã CLB + mật khẩu admin** của một CLB test. Đừng dùng CLB đang hoạt động thật cho các bước tạo/xoá.
- Mỗi mục có **Các bước**, **Kỳ vọng**, và ô **Kết quả** để bạn đánh dấu Đạt/Lỗi kèm ghi chú.
- Quy ước đọc kết quả: ✅ đúng như kỳ vọng, ❌ sai, ⚠️ đúng nhưng khó dùng.

---

## A. Tạo giải và chọn loại giải

### A1. Ba chế độ tổ chức
**Các bước:** Vào tạo giải mới. Ở bước "Thông tin", lần lượt chọn Nội bộ CLB, Giao hữu liên CLB, Cộng đồng.
**Kỳ vọng:**
- Ba chế độ hiện rõ, có mô tả ngắn phân biệt.
- Chọn Cộng đồng mà chưa có tài khoản nền tảng hoặc chưa cấu hình CLB hệ thống thì báo lỗi có chữ, không phải màn trắng (thông báo kiểu "Chưa cấu hình CLB hệ thống PickHub").
- Sau khi tạo xong, không đổi được chế độ tổ chức nữa (ô chọn bị khoá, có gợi ý).

**Kết quả:** ___

### A2. Thông tin giải và bản nháp
**Các bước:** Nhập tên, ngày, địa điểm. Lưu. Thoát ra rồi mở lại.
**Kỳ vọng:** Giải mới ở trạng thái nháp riêng tư; người ngoài chưa xem được. Thông tin lưu đúng.

**Kết quả:** ___

---

## B. Nội dung thi đấu (division)

### B1. Nhiều nội dung trong một giải
**Các bước:** Tạo ít nhất hai nội dung khác loại, ví dụ "Đôi nam 5.2" và "Đơn nữ".
**Kỳ vọng:** Một giải chứa được nhiều nội dung; mỗi nội dung cấu hình độc lập.

**Kết quả:** ___

### B2. Cấu hình từng nội dung
**Các bước:** Với một nội dung, đặt loại thi đấu (đơn/đôi/đội), cách tính thành tích (cá nhân/CLB), và trình độ (mở hoặc giới hạn PHR).
**Kỳ vọng:**
- Chọn **đơn** thì ô ghép cặp tự khoá về "không áp dụng".
- Chọn **đội** thì cách tính thành tích nghiêng về CLB.
- Chọn giới hạn PHR nhưng **bỏ trống mức giới hạn** thì báo lỗi, không cho lưu.

**Kết quả:** ___

### B3. Hai nội dung độc lập
**Các bước:** Sau khi sinh lịch cho cả hai nội dung, mở bảng xếp hạng của từng cái.
**Kỳ vọng:** Lịch và bảng xếp hạng của hai nội dung tách biệt, không lẫn VĐV hay cộng dồn điểm sang nhau.

**Kết quả:** ___

---

## C. CLB tham gia và đăng ký đội hình

### C1. Mời CLB trong và ngoài hệ thống
**Các bước:** Ở bước CLB tham gia, mời một CLB có trên PickHub và thêm một CLB ngoài hệ thống (nhập tên tự do).
**Kỳ vọng:** Cả hai xuất hiện trong danh sách CLB tham dự. CLB ngoài không cần tài khoản.

**Kết quả:** ___

### C2. Phân biệt VĐV thành viên và VĐV khách  ← điểm mới
**Các bước:** Thêm một VĐV chọn từ danh sách thành viên CLB, và tạo thêm một VĐV khách bằng cách gõ tên.
**Kỳ vọng:**
- VĐV lấy từ roster mang nhãn **"Thành viên CLB"**.
- VĐV gõ tay mang nhãn **"Khách"**.
- Nhãn hiển thị ngay cạnh tên trong danh sách chọn đội hình, màu khác nhau.
- Một thành viên roster **chưa có hồ sơ VĐV** vẫn phải mang nhãn Thành viên CLB, không bị coi nhầm là khách.

**Kết quả:** ___

### C3. BTC nhập hộ đội hình
**Các bước:** Với giải giao hữu, thử để BTC nhập hộ đội hình cho một CLB được mời. Thử nhập mà bỏ trống ô lý do.
**Kỳ vọng:**
- Thiếu lý do thì form chặn, không cho gửi.
- Nhập đủ thì đội hình ở trạng thái chờ CLB xác nhận, và có ghi dấu là BTC nhập hộ.

**Kết quả:** ___

---

## D. Ghép cặp (nội dung đôi)

### D1. Ghép tự động và thủ công
**Các bước:** Với nội dung đôi, chọn ghép tự động (xem trước), rồi thử ghép thủ công.
**Kỳ vọng:** Xem trước hiện các cặp; ghép tự động cân bằng trình độ khi có PHR. Cùng dữ liệu, xem trước lại cho kết quả giống nhau.

**Kết quả:** ___

### D2. Chống trùng VĐV
**Các bước:** Cố đưa cùng một người vào hai cặp khác nhau trong cùng nội dung.
**Kỳ vọng:** Hệ thống báo trùng, không cho khoá cặp.

**Kết quả:** ___

### D3. Cảnh báo trình độ không chặn
**Các bước:** Tạo một cặp có tổng PHR vượt giới hạn của nội dung, hoặc thiếu PHR.
**Kỳ vọng:**
- Cảnh báo hiện rõ (vượt giới hạn / thiếu / chờ xác nhận).
- **Nút chốt cặp vẫn bấm được.** Cảnh báo tuyệt đối không được chặn đăng ký hay chặn BTC duyệt.
- Số lẻ VĐV ở nội dung đôi thì hiện người dư kèm cảnh báo, không văng lỗi chặn cả màn.

**Kết quả:** ___

---

## E. Luật điểm số và tie-break

### E1. Chọn preset và override
**Các bước:** Ở bước "Luật điểm & Tie-break", chọn một preset cho cả giải, rồi override cho một nội dung.
**Kỳ vọng:** Xem được bảng luật hiệu lực của từng vòng (giá trị đến từ giải, nội dung, hay vòng).

**Kết quả:** ___

### E2. Khoá luật sau khi sinh lịch
**Các bước:** Sinh lịch cho một vòng, rồi quay lại thử sửa luật của vòng đó.
**Kỳ vọng:** Luật của vòng đã sinh lịch bị khoá; chỉ sửa được vòng chưa bắt đầu.

**Kết quả:** ___

### E3. Nhập tỉ số sai luật
**Các bước:** Ở tab Kết quả, nhập một tỉ số vi phạm luật, ví dụ 11-10 khi yêu cầu cách 2, hoặc quá điểm chết.
**Kỳ vọng:** Bị từ chối với thông báo rõ, không lưu tỉ số sai.

**Kết quả:** ___

---

## F. Sinh lịch và bảng xếp hạng

### F1. Sinh lịch theo nội dung
**Các bước:** Sinh lịch cho từng nội dung. Xem lịch và sơ đồ.
**Kỳ vọng:** Lịch sinh theo từng vòng của từng nội dung; nhánh loại trực tiếp hiển thị đúng.

**Kết quả:** ___

### F2. Bảng xếp hạng và tie-break
**Các bước:** Nhập đủ kết quả một bảng vòng tròn có hai đội bằng điểm. Xem bảng xếp hạng.
**Kỳ vọng:** Thứ tự đúng theo preset tie-break đã chọn; có phần giải thích tiêu chí nào tách được hai đội.

**Kết quả:** ___

### F3. Vòng bảng lên playoff
**Các bước:** Với giải nhiều vòng, hoàn tất vòng bảng rồi chuyển sang vòng sau.
**Kỳ vọng:** Đội đi tiếp được đưa đúng vào vòng playoff; không mất seed, không lẫn nội dung.

**Kết quả:** ___

---

## G. Nhập điểm bằng token (không cần tài khoản)

### G1. Cấp và dùng token
**Các bước:** Cấp token cho một trận. Mở link/token bằng **trình duyệt khác hoặc cửa sổ ẩn danh**, không đăng nhập. Nhập tỉ số.
**Kỳ vọng:** Người cầm điểm nhập được mà không cần đăng nhập CLB.

**Kết quả:** ___

### G2. Lưu nhiều lần trong một trận  ← dễ sai
**Các bước:** Với cùng một token, lưu sau ván 1, lưu tiếp sau ván 2, rồi sửa một tỉ số gõ nhầm và lưu lại.
**Kỳ vọng:** **Cả ba lần đều lưu được.** Nếu lần thứ hai trở đi bị từ chối là lỗi (token không được dùng một lần).

**Kết quả:** ___

### G3. Hết hạn, thu hồi, sai phạm vi
**Các bước:** Thu hồi token rồi thử lưu. Dùng token của trận này nhập cho trận khác.
**Kỳ vọng:** Cả hai đều bị từ chối với thông báo rõ.

**Kết quả:** ___

---

## H. Trang công khai và chia sẻ Zalo

### H1. Mở bằng trình duyệt sạch
**Các bước:** Copy link công khai, mở bằng trình duyệt **không có cookie CLB**.
**Kỳ vọng:** Trang hiện được: tên giải, nội dung, lịch, kết quả, bảng xếp hạng.

**Kết quả:** ___

### H2. Không lộ dữ liệu riêng tư  ← quan trọng
**Các bước:** Soi kỹ trang công khai và mọi ảnh xuất ra.
**Kỳ vọng:** **Không** thấy số điện thoại, email, ghi chú nội bộ, trạng thái xét duyệt, nhãn nguồn VĐV (thành viên/khách), hay trình độ khi BTC chưa bật công khai.

**Kết quả:** ___

### H3. Card khi dán vào Zalo
**Các bước:** Dán link giải vào một nhóm Zalo hoặc khung chat có preview.
**Kỳ vọng:** Hiện card có ảnh và tên giải, thay vì link trần.

**Kết quả:** ___

### H4. Xuất ảnh và sao chép thông báo
**Các bước:** Ở trang công khai hoặc console (tab Tổng quan), bấm Sao chép link, Xuất ảnh (bảng xếp hạng/lịch), và Sao chép thông báo. Dán thử vào Zalo.
**Kỳ vọng:**
- Ảnh PNG cỡ dọc điện thoại, có tên giải và thời điểm xuất, đọc rõ trên màn hình nhỏ.
- Thông báo là văn bản thuần, sửa được trước khi copy.
- Giải ở chế độ **riêng tư** thì không xuất được ảnh và không mở được link công khai.

**Kết quả:** ___

---

## I. Quyền và cách ly dữ liệu

### I1. CLB khách không thấy dữ liệu CLB khác
**Các bước:** Với giải giao hữu nhiều CLB, đăng nhập bằng một CLB khách và xem đội hình.
**Kỳ vọng:** Chỉ thao tác được đội hình của CLB mình; không xem được ghi chú riêng của CLB khác.

**Kết quả:** ___

### I2. Người nhập điểm giới hạn phạm vi
**Các bước:** Dùng token của một trận, thử can thiệp trận ngoài phạm vi được cấp.
**Kỳ vọng:** Bị chặn.

**Kết quả:** ___

---

## Ghi chú cuối buổi test

- Phiên bản/nhánh đã test: ___
- Thiết bị và trình duyệt: ___
- Các lỗi ❌ và ⚠️ tổng hợp: ___
- Việc cần làm lại: ___

Những mục dưới đây **chưa** thuộc Phase 3, thấy thiếu là bình thường, không tính lỗi: sửa kết quả đã chốt (correction), danh sách chờ, check-in, thay người, xếp sân theo giờ, thu phí, rating tự động, tính tiền thua/tiền ăn của thể thức giao hữu.
