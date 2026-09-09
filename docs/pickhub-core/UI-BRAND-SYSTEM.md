# PickHub UI Brand System — baseline đã duyệt

## 1. Định vị

PickHub là không gian giúp các CLB pickleball vận hành minh bạch, kết nối với nhau và cùng nâng trình qua từng trận đấu.

**Tính cách:** thể thao, hiện đại, thông minh, khoa học và cởi mở.

**Nguyên tắc trải nghiệm:**

1. Nhìn nhanh hiểu ngay: số liệu và trạng thái phải đọc được trong vài giây.
2. Minh bạch có ngữ cảnh: mỗi con số quan trọng đều có thời điểm và nguồn.
3. Ít ma sát: thành viên xem bằng mã CLB; VĐV chưa cần tài khoản.
4. Công bằng có thể giải thích: PHR, ghép cặp, bốc thăm và xếp hạng đều có dấu vết.
5. Cộng đồng trước thành tích: giao diện khuyến khích tiến bộ và giao lưu, không tạo cảm giác phán xét.

## 2. Visual direction đã duyệt

### Màu thương hiệu nền tảng

| Token | Giá trị | Vai trò |
|---|---|---|
| `--ph-ink` | `#28243D` | Mực tím than cho chữ và icon; không dùng làm nền đặc |
| `--ph-ink-2` | `#514A72` | Chữ cấp hai và nội dung phụ cần độ tương phản |
| `--ph-indigo` | `#6F48C9` | Hành động chính, liên kết, trạng thái đang chọn |
| `--ph-lavender` | `#EEE9FF` | Accent nhẹ cho tab, hồ sơ và trạng thái nổi bật |
| `--ph-gold` | `#FFC95E` | Accent ấm cho huy hiệu, thành tích và dữ liệu nổi bật |
| `--ph-cyan` | `#A8DFE9` | Dữ liệu tích cực và biểu đồ |
| `--ph-coral` | `#FF8B83` | Cảnh báo nhẹ, trạng thái cần chú ý |
| `--ph-surface` | `#F5F6FB` | Nền ứng dụng |
| `--ph-card` | `#FFFFFF` | Bề mặt card |
| `--ph-line` | `#E4E9F2` | Viền và phân tách |
| `--ph-muted` | `#667085` | Chữ phụ |
| `--ph-positive` | `#1F7A52` | Số dương và trạng thái tích cực, tương phản 5.30:1 trên nền trắng |
| `--ph-negative` | `#C2453A` | Số âm và trạng thái lỗi, tương phản 5.08:1 trên nền trắng |

Màu CLB và màu giải được map vào các token accent, không được thay thế màu chữ, màu cảnh báo hoặc màu focus. Hệ thống kiểm tra tương phản trước khi lưu theme. Không dùng nền đen hoặc navy đặc trong các màn hình vận hành; `--ph-ink` chỉ dành cho chữ/icon cần độ tương phản.

> **Ngoại lệ đã duyệt — bàn điều hành giải (`.ops-shell`).** Màn hình này dùng
> nền đen ám tím `#0A0812`, trái với quy tắc không dùng nền đen hoặc navy đặc
> trong màn hình vận hành. Lý do: BTC nhìn liên tục nhiều giờ trong nhà thi đấu,
> cần tương phản cao và đọc được từ xa; nền sáng gây chói dưới đèn thi đấu.
> Ngoại lệ chỉ áp dụng cho console điều hành, không lan sang trang công khai hay
> các màn quản lý CLB.
>
> Trên nền tối, `--ph-cyan` và `--ph-coral` được phép dùng cho chữ vì phép đo
> khác hẳn nền trắng. Kết quả đo được ghi tại
> `evidence/spec2-contrast-2026-09-09.md`; mọi màn tối mới phải đo lại.

Các token `--ph-cyan` và `--ph-coral` chỉ dùng làm nền/accent, không dùng làm chữ. Nhóm tint bổ sung (`--ph-tint-indigo`, `--ph-tint-gold`, `--ph-tint-gold-text`, `--ph-tint-cyan`, `--ph-tint-coral`, `--ph-tint-positive`, `--ph-tint-negative`, `--ph-tint-neutral`, `--ph-tint-neutral-strong`, `--ph-backdrop`) là nền nhạt phái sinh từ bốn màu accent đã duyệt, dùng cho metric card, badge và skeleton; đây không phải màu mới và không đổi hệ màu.

### Typography

- Font chính: `Montserrat`, fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.
- Trọng lượng dùng trong sản phẩm: `400 / 500 / 600 / 700 / 800`. Không nạp thêm
  trọng lượng khác để giữ ngân sách font.
- Tiêu đề: `700–800`, tracking hơi âm (`-0.03em` đến `-0.05em`), dùng để tạo nhịp thể thao.
- Số liệu: tabular numerals (`font-variant-numeric: tabular-nums`) để cột tiền,
  điểm và thứ hạng thẳng hàng.
- Nội dung tiếng Việt: câu ngắn, động từ rõ, tránh thuật ngữ kỹ thuật không cần thiết.
  Montserrat có đủ dấu tiếng Việt; không được thay bằng biến thể thiếu dấu.

> **Đổi so với baseline 02/09/2026:** font chính chuyển từ `Inter` sang
> `Montserrat` theo chỉ đạo sản phẩm ngày `2026-09-07`. Lý do và phạm vi ảnh
> hưởng ghi tại [`ADR-006`](./decisions/ADR-006-montserrat-va-hop-nhat-token-ui.md).
> Mọi quy tắc màu, nhịp, hình khối và component của baseline giữ nguyên.

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
- **Share card:** ảnh chia sẻ ra ngoài sản phẩm (Zalo, Facebook, nhóm chat CLB)
  dùng nền gradient `--ph-indigo`, huy hiệu `--ph-gold`, chữ trắng. Không dùng
  nền `--ph-ink` hoặc nền tối đặc — thẻ chia sẻ là bề mặt nhận diện thương hiệu,
  phải cùng ngôn ngữ màu với sản phẩm. Mỗi thẻ luôn có: tên CLB, kỳ đang xem,
  top 1 nêu rõ, hai hạng kế tiếp, một chỉ số tổng, và dấu hiệu PickHub.
- **Skeleton:** mọi vùng tải dữ liệu phải có skeleton theo đúng hình khối của nội
  dung thật; không dùng chữ “Đang tải…” làm trạng thái tải duy nhất.
- **Chuông thông báo:** không gian quản trị CLB có một chuông ở header, hiển thị
  số việc **cần người xử lý** — không dùng cho tin tức hay quảng cáo. Mỗi thông báo
  phải nêu rõ việc cần làm và dẫn thẳng tới nơi làm được việc đó. Badge số chỉ đếm
  thông báo chưa xử lý; đã xem không có nghĩa là đã xong.

## 6. UI content rules

- Thành viên: “Quỹ”, “Thành viên”, “BXH” ở vị trí trung tâm, “Giải”, “Thông tin”; nội dung chính ưu tiên “BXH đóng quỹ”, “Tổng quan quỹ”, “Phân bổ trình độ” và PHR cá nhân.
- Trưởng nhóm: “Thu–chi”, “Thành viên”, “Cần xử lý”.
- Ban tổ chức: “Đăng ký”, “Bốc thăm”, “Lịch thi đấu”, “Kết quả”.
- Public tournament: ưu tiên biệt danh đã cấu hình; nếu chưa có thì dùng tên trong CLB chủ quản.
- PHR công khai gồm nhãn và điểm tại thời điểm chốt danh sách; lịch sử cập nhật vẫn thuộc không gian quản trị.

### BXH đóng góp

- **Một bảng duy nhất**, xếp hạng theo **tổng số tiền thành viên đã đóng** vào tài
  khoản quỹ, không phân biệt loại khoản. Tài khoản quỹ thu mọi loại — quỹ định kỳ,
  phí sự kiện, tiền phạt — và mỗi CLB một quy chế, nên không bắt CLB cấu hình nhãn
  cho từng khoản.
- **Từ vựng bắt buộc: “đóng góp”, “nộp tiền”, “đóng quỹ”.** Không dùng “nộp phạt”
  ở bất kỳ nhãn, tiêu đề, huy hiệu hay copy nào trong sản phẩm — nó chỉ đúng với
  quy chế của một số CLB và sai với phần lớn còn lại. Tên trang là **“BXH đóng góp”**.
- Bốn mốc thời gian, chọn bằng segmented control: **Tuần này**, **Tháng này**,
  **Năm nay**, **Tất cả**. Kỳ đang xem phải hiện rõ khoảng ngày, không để người đọc
  tự suy.
- Chỉ xếp hạng giao dịch **khớp được với thành viên trong roster**. Tiền chưa xác
  định được người nộp không lên bảng và phải được nêu tường minh, kèm lối xử lý.
- Podium ba hạng đầu giữ cấu trúc đã duyệt trong prototype; hạng 4 trở đi là danh
  sách hàng.
- **Streak** hiển thị dưới dạng badge phụ cạnh tên (số kỳ liên tiếp có đóng), không
  thay thế số tiền. Streak chỉ hiện khi ≥ 2 kỳ liên tiếp để tránh nhiễu khi dữ liệu thưa.
- **Huy hiệu** là nhãn có chữ, không phải chỉ icon hay chỉ màu; luôn nêu kỳ áp dụng
  (ví dụ “Quán quân tháng trước”). Không dùng từ “phạt” trong bất kỳ nhãn huy hiệu nào.
- Bảng phải có nút chia sẻ tạo ảnh theo quy tắc **Share card** ở mục 5.
- Tuân thủ mục 7: BXH luôn có bảng dữ liệu đọc được, không dùng màu làm tín hiệu duy nhất.

## 7. Accessibility baseline

- Body text đạt tương phản WCAG AA.
- Focus ring rõ ràng, không chỉ dựa vào màu.
- Touch target tối thiểu `44px`.
- Hỗ trợ `prefers-reduced-motion`.
- Biểu đồ và BXH có bảng dữ liệu thay thế cho người dùng không phân biệt được màu.

## 8. Trạng thái và phạm vi hiệu lực

Hướng hình ảnh được người phụ trách sản phẩm xác nhận ngày `2026-09-02` trên
nhánh `codex/pickhub-ui-brand-preview`, commit `e147885`. Các token và quy tắc
trong tài liệu này là baseline bắt buộc cho UI production của sáu phase.

### Bản sửa đổi

| Ngày | Nội dung | Nguồn |
|---|---|---|
| 2026-09-07 | Font chính `Inter` → `Montserrat`. Bổ sung quy tắc **Share card** (nền indigo, cấm nền tối), quy tắc **Skeleton**, và mục **BXH đóng quỹ** trong UI content rules. | Chỉ đạo sản phẩm; [`ADR-006`](./decisions/ADR-006-montserrat-va-hop-nhat-token-ui.md) |

### Khoảng cách với code production (tính đến 2026-09-07)

`app/globals.css` hiện khai báo bộ token `--ph-*` ở đầu file nhưng ghi đè ngay
bên dưới bằng một bảng màu khác (`--court-green #0D7565`, `--pickle-lime #CAFF28`,
nền `--surface-court`) và font `Outfit`. Toàn bộ màn hình production đang chạy
bảng màu này, tức đang tồn tại hai design system song song — điều mà
[`UI-STRATEGY.md`](./UI-STRATEGY.md) đã ghi là không được làm.

Bảng màu sân xanh và font `Outfit` phải được gỡ bỏ; `--ph-*` là nguồn duy nhất.
Việc gỡ bỏ được lập kế hoạch riêng, không thực hiện rải rác từng màn hình.

Prototype trong cùng thư mục là reference artifact đã được kiểm thử; nó không
phải production route và không được gọi API thật. Mỗi phase sẽ đưa đúng lát
cắt UI vào nhánh phase tương ứng, chạy test/evidence, chờ xác nhận rồi mới
merge `main`. Chi tiết nằm trong
[`UI-STRATEGY.md`](./UI-STRATEGY.md) và
[`2026-09-02-pickhub-ui-six-phase-integration.md`](../superpowers/plans/2026-09-02-pickhub-ui-six-phase-integration.md).
