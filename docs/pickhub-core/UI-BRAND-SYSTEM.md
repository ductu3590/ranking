# PickHub UI Brand System — bản nháp để duyệt

## 1. Định vị

PickHub là không gian giúp các CLB pickleball vận hành minh bạch, kết nối với nhau và cùng nâng trình qua từng trận đấu.

**Tính cách:** thể thao, hiện đại, thông minh, khoa học và cởi mở.

**Nguyên tắc trải nghiệm:**

1. Nhìn nhanh hiểu ngay: số liệu và trạng thái phải đọc được trong vài giây.
2. Minh bạch có ngữ cảnh: mỗi con số quan trọng đều có thời điểm và nguồn.
3. Ít ma sát: thành viên xem bằng mã CLB; VĐV chưa cần tài khoản.
4. Công bằng có thể giải thích: PHR, ghép cặp, bốc thăm và xếp hạng đều có dấu vết.
5. Cộng đồng trước thành tích: giao diện khuyến khích tiến bộ và giao lưu, không tạo cảm giác phán xét.

## 2. Draft visual direction

### Màu thương hiệu nền tảng

| Token | Giá trị | Vai trò |
|---|---|---|
| `--ph-ink` | `#121326` | Mực tím than, chữ mạnh và nền vận hành |
| `--ph-indigo` | `#6F48C9` | Hành động chính, liên kết, trạng thái đang chọn |
| `--ph-lime` | `#B8EB37` | Điểm nhấn thể thao và trạng thái tích cực |
| `--ph-cyan` | `#56C7D6` | Dữ liệu tích cực và biểu đồ |
| `--ph-coral` | `#F48772` | Cảnh báo nhẹ, trạng thái cần chú ý |
| `--ph-surface` | `#F4F6FA` | Nền ứng dụng |
| `--ph-card` | `#FFFFFF` | Bề mặt card |
| `--ph-line` | `#E4E9F2` | Viền và phân tách |
| `--ph-muted` | `#667085` | Chữ phụ |

Màu CLB và màu giải được map vào các token accent, không được thay thế màu chữ, màu cảnh báo hoặc màu focus. Hệ thống kiểm tra tương phản trước khi lưu theme.

### Typography

- Font chính: `Inter`, fallback `ui-sans-serif, system-ui, sans-serif`.
- Tiêu đề: đậm, tracking hơi âm, dùng để tạo nhịp thể thao.
- Số liệu: tabular numerals để cột tiền, điểm và thứ hạng thẳng hàng.
- Nội dung tiếng Việt: câu ngắn, động từ rõ, tránh thuật ngữ kỹ thuật không cần thiết.

### Nhịp và hình khối

- Spacing cơ sở: `4px`; nhịp phổ biến `8 / 12 / 16 / 24 / 32`.
- Radius: `12px` cho control, `20px` cho card lớn, `28px` cho hero.
- Shadow: nhẹ, ưu tiên viền và tương phản bề mặt thay vì đổ bóng nặng.
- Icon: nét đơn, đầu bo tròn; icon chỉ hỗ trợ nhãn, không thay thế nhãn trong thao tác quan trọng.

## 3. Mark concept

Logo prototype dùng chữ **P** cách điệu bằng một quỹ đạo cong và chấm tròn gợi quả bóng. Mark phải hoạt động tốt ở một màu, không phụ thuộc gradient và không dùng ảnh sinh làm logo sản phẩm.

## 4. Theme hierarchy

1. PickHub cung cấp màu nền, màu chữ, trạng thái và accessibility.
2. CLB cấu hình logo, ảnh đại diện và accent trong không gian CLB.
3. Ban tổ chức cấu hình logo, ảnh bìa và accent cho từng giải công khai.
4. Nội dung dữ liệu không được dùng màu theme để che mất trạng thái hoặc cảnh báo.

## 5. Component principles

- **Metric card:** một chỉ số chính, một nhãn nguồn/thời điểm, một hành động phụ.
- **Status badge:** luôn có chữ; màu chỉ là tín hiệu phụ.
- **Table:** desktop ưu tiên mật độ; mobile chuyển thành card có hàng quan trọng ở trên.
- **Bracket:** desktop hiển thị toàn cảnh; mobile ưu tiên trận hiện tại và cho phép cuộn ngang.
- **Toast/notice:** chỉ dùng cho kết quả thao tác; việc cần xử lý lâu dài nằm trong inbox thông báo.
- **Form:** label luôn hiển thị; lỗi đặt cạnh trường; không dùng placeholder làm label.

## 6. UI content rules

- Thành viên: “Quỹ”, “Thành viên”, “BXH” ở vị trí trung tâm, “Giải”, “Cấu hình”; nội dung chính ưu tiên “BXH đóng quỹ”, “Tổng quan quỹ”, “Phân bổ trình độ”.
- Trưởng nhóm: “Thu–chi”, “Thành viên”, “Cần xử lý”.
- Ban tổ chức: “Đăng ký”, “Bốc thăm”, “Lịch thi đấu”, “Kết quả”.
- Public tournament: ưu tiên biệt danh đã cấu hình; nếu chưa có thì dùng tên trong CLB chủ quản.
- PHR công khai gồm nhãn và điểm tại thời điểm chốt danh sách; lịch sử cập nhật vẫn thuộc không gian quản trị.

## 7. Accessibility baseline

- Body text đạt tương phản WCAG AA.
- Focus ring rõ ràng, không chỉ dựa vào màu.
- Touch target tối thiểu `44px`.
- Hỗ trợ `prefers-reduced-motion`.
- Biểu đồ và BXH có bảng dữ liệu thay thế cho người dùng không phân biệt được màu.

## 8. Review status

Đây là định hướng thương hiệu và UI draft. Prototype trong cùng thư mục là vật liệu để duyệt hướng hình ảnh trước khi đưa token vào production components. Chưa đánh dấu là bộ nhận diện cuối cùng.
