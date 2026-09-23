# ADR-001 — Nhãn bốn bước và assertion console

## Quyết định

- Đưa nhãn bốn bước về đúng contract T0.1 và plan §1: `Thông tin & người tham gia`, `Thể thức & ghép cặp`, `Bốc thăm & xem trước lịch`, `Kiểm tra và chốt`.
- Giữ `shortLabel` cho stepper mobile 390px; desktop dùng nhãn đầy đủ.
- Thay assertion console đếm từ khóa bằng kiểm tra console không render `DivisionSetupPanel` và `TeamsTab` là read-only cho nội dung đôi.

## Lý do

T2.A đã dùng nhãn rút gọn ngoài contract. Assertion cũ đo sự xuất hiện từ khóa nên không xác minh được console có hai editor cùng ghi hay không.

## Hệ quả

Contract không đổi. Chỉ sửa code hiển thị và đường đọc/assertion của test để kiểm đúng hành vi đã khóa.