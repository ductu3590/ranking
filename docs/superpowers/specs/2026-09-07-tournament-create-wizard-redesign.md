# Thiết kế lại Wizard tạo giải PickHub — Design

**Ngày:** 2026-09-07
**Trạng thái:** Spec, chờ duyệt trước khi viết plan.

## 1. Mục tiêu

Thay Wizard tạo giải 7 bước hiện tại (dồn cấu hình, đăng ký, ghép cặp vào một màn dài, quyền đọc từ localStorage, giao diện nút nhỏ) bằng một wizard **3 bước** gọn, hiện đại, có **xem trước sống**, mặc định thông minh theo loại giải, và mô hình cấu hình mạch lạc theo hai trục. Giữ nguyên lợi thế của PickHub so với công cụ vẽ bracket ngoài: gắn với thành viên, CLB và PHR thật.

Tham chiếu quá trình brainstorm và mockup đã duyệt (artifact `tao-giai-mockup`, nhiều vòng phản hồi với người dùng).

## 2. Phạm vi

**Trong spec này:** màn tạo giải của BTC — ba bước Thể thức → Thông tin giải → Đăng ký (phần thiết lập). Bao gồm cấu hình thể thức hai trục, thông tin giải và link chia sẻ, và **thiết lập** hình thức đăng ký (tự nhập hoặc mở link). Kèm cơ chế xem trước sống.

**Ngoài phạm vi, thuộc spec riêng:**
- **Đăng ký tham gia (mặt công khai)** — CLB/VĐV tự đăng ký qua link, hạn đăng ký, hàng chờ duyệt, waitlist. Spec: `tournament-open-registration`.
- **Điều hành giải** — bốc thăm, sinh lịch, nhập điểm, BXH, correction, audit, và **chỉnh BO/luật theo từng vòng**. Spec: `tournament-operations`.

**Phụ thuộc engine cần xây (ghi nhận, không thuộc UI spec này):**
- **Double elimination (loại trực tiếp 2 nhánh)** — engine hiện chỉ có single elimination. Cần bổ sung nhánh thua.
- **Trận đội cấu hình được số ván con** — engine MLP hiện cố định; cần cho phép số người mỗi đội và số ván con mỗi trận đội theo cấu hình.

## 3. Mô hình ba lớp

1. **Ai tạo — do quyền quyết định, không phải tab tự chọn.** Quản trị CLB tạo được giải *nội bộ* hoặc *giao hữu*. Quản trị cộng đồng tạo giải *cộng đồng*. UI phản ánh tư cách người đăng nhập; ô ngoài quyền bị khoá. Quyền lấy từ session server (`/api/groups/session` cho club, `platform_session` cho community), **không đọc role từ localStorage**.

2. **Cấu hình thể thức — hai trục độc lập + thể thức + số ván.**
   - **Đơn vị vào sân** (ai đấu một trận): `Cá nhân` (đơn) · `Cặp đôi` (đôi) · `Đội` (trận đội MLP).
   - **Tính thành tích** (ai được xếp hạng): `Cá nhân` · `Cộng điểm về CLB`. Chỉ hiện khi có nghĩa (giải giao hữu/cộng đồng, đơn/đôi). Đơn vị = Đội thì mặc định tính theo đội.
   - **Thể thức:** `Vòng tròn` · `Loại trực tiếp 1 nhánh` · `Loại trực tiếp 2 nhánh` · `Vòng bảng + CK`.
   - **Số ván mỗi trận** (trận thường): `1 ván` · `BO3` · `BO5`. Khi đơn vị = Đội, thay bằng **cấu hình trận đội**: số người mỗi đội, số ván con mỗi trận đội (mặc định 5 kiểu MLP).
   - **Không** đặt luật điểm/tie-break ở bước tạo. Đó là điều lệ, đặt theo từng vòng lúc bốc thăm (spec operations).

3. **Ai tham gia — hệ quả, hai hình thức đăng ký.**
   - **Hình thức A — tự nhập (tự tổ chức):** BTC nắm danh sách.
     - *Nội bộ:* admin nhập VĐV từ roster CLB, tạo VĐV khách, ghép cặp hoặc chia đội.
     - *Giao hữu:* mời đích danh CLB; mỗi CLB tự nộp danh sách trước hạn; BTC duyệt.
   - **Hình thức B — mở đăng ký (mở rộng):** tạo giải trước, mở link đăng ký có hạn, CLB/VĐV tự đăng ký, BTC duyệt.
     - *Cộng đồng:* dùng hình thức B.
   - Khác biệt cốt lõi giữa A và B: BTC đưa người vào, hay người chơi tự đăng ký vào. Bước 3 rẽ theo hình thức tương ứng phạm vi.

## 4. Luồng 3 bước

Thanh stepper trên đầu, bấm nhảy bước được. Nút Quay lại / Tiếp tục / Tạo giải ở chân.

- **Bước 1 — Thể thức.** Toàn bộ cấu hình lớp 2, dạng thẻ chọn có mô tả và dấu tích. Kèm khung **Xem trước sống** (mục 5). Phạm vi chọn ở đây quyết định bước 3.
- **Bước 2 — Thông tin giải.** Tên giải; **link chia sẻ riêng** (slug tự sinh từ tên, sửa được, unique toàn hệ thống — dùng cho Open Graph và chia sẻ Zalo); mô tả; poster (ảnh dùng khi chia sẻ).
- **Bước 3 — Đăng ký.** Rẽ theo hình thức:
  - *Nội bộ:* người chơi + ghép cặp/chia đội.
  - *Giao hữu:* hạn nộp danh sách + danh sách CLB được mời với trạng thái/duyệt.
  - *Cộng đồng:* block link đăng ký (copy được) + hạn + ai được đăng ký (CLB/VĐV/cả hai) + hàng chờ duyệt.

Bốc thăm và sinh lịch **không** nằm trong wizard; chúng chạy sau khi đóng đăng ký (spec operations).

## 5. Xem trước sống

Cần một đường **preview lịch không ghi database**: chạy engine sinh lịch trong bộ nhớ theo cấu hình hiện tại và trả về các trận/sơ đồ. Engine sinh lịch vốn thuần nên đây là bổ sung sạch, không sửa logic cũ.

- Đổi đơn vị → thứ thi đấu đổi (người / cặp / trận đội với ghi chú số ván con).
- Đổi tính thành tích → dòng BXH đổi (cá nhân / CLB / đội).
- Đổi thể thức → bảng lịch (vòng tròn) hoặc sơ đồ nhánh (loại trực tiếp, 2 nhánh có nhánh thua) hoặc bảng + playoff.
- Đổi số ván → ghi chú luật đổi.

Preview đọc số lượng entrant hiện có (kể cả danh sách đang nhập dở ở bước 3) hoặc số ước lượng khi chưa có đăng ký.

## 6. Giao diện và responsive

- **Responsive:** máy tính/iPad hiển thị hai khung ở bước 1 (cấu hình trái, xem trước phải luôn hiện). Điện thoại xếp dọc, có hai tab Cấu hình / Xem trước. Bước 2–3 là form một cột.
- **Khung rộng:** wizard chiếm phần lớn màn hình (tối đa ~1440px, cao gần full viewport), tránh phí không gian như công cụ ngoài.
- **Thẻ chọn:** mỗi lựa chọn chính là thẻ có tiêu đề, một dòng mô tả, dấu tích khi chọn, viền accent. Lựa chọn đơn giản (phạm vi, số ván) dùng nút gạt.
- **Nhận diện:** font Be Vietnam Pro (hỗ trợ tiếng Việt), token màu tím-xanh của PickHub, tự đổi sáng/tối theo máy. Không bê nguyên màu/tông của công cụ ngoài.
- **Không tin localStorage:** quyền và group lấy từ session server.

## 7. Ranh giới code

- Component: dựng lại `app/giai-dau/v2/TournamentWizard.js` thành wizard 3 bước; tách các khối con (config cards, live preview pane, participation panes) thành component có ranh giới rõ, mỗi cái một trách nhiệm.
- Domain thuần: cấu hình → payload; validate ở `lib/tournament/interclub.js` và view-model `lib/tournament/wizardModel.js` (đã có, mở rộng).
- Preview: route/hàm mới chạy engine không ghi DB.
- Fetch qua `lib/tournamentV2Client.js`; component không gọi Supabase trực tiếp.
- Dùng lại schema Phase 3 (migration 030–037). Thuộc tính đã có: `play_type`, `scoring_scope`, `rating_policy`, `pairing_mode`, `default_scoring`, `tiebreak_policy`, `share_settings`, `tournament_athletes.source`. Bổ sung nếu cần: cột lưu `best_of`/cấu hình trận đội ở stage config, cột hạn đăng ký cho hình thức B (có thể để spec operations/registration).

## 8. Mặc định thông minh theo loại giải

- Nội bộ: đơn vị = Cặp đôi, tính thành tích = Cá nhân, thể thức = Vòng tròn, BO1.
- Giao hữu: gợi ý tính thành tích = Cộng điểm về CLB hoặc đơn vị = Đội tuỳ chọn.
- Cộng đồng: mở đăng ký, mặc định duyệt thủ công.

## 9. Kiểm thử

- Test view-model và component contract theo kiểu đã dùng ở Phase 3: lấy dữ liệu từ hàm thật, viết đỏ trước.
- Test preview: cùng cấu hình + seed cho cùng lịch; đổi cấu hình đổi đúng preview.
- Test phân quyền: club admin không thấy ô cộng đồng bật; quyền lấy từ session server.
- Không sửa test cũ trong `tests/tournament/`; test mới ở `tests/phase3/` hoặc thư mục wizard mới, nối vào script regression.

## 10. Spec liên quan (việc kế tiếp)

- `tournament-open-registration` — mặt công khai của hình thức B: form đăng ký, hạn, duyệt, waitlist, chống trùng VĐV giữa CLB.
- `tournament-operations` — bốc thăm, sinh lịch, nhập điểm, BXH, correction, audit. **Yêu cầu bắt buộc:** BTC chỉnh được **BO theo từng vòng** trong lúc điều hành — ví dụ vòng bảng BO1 nhưng chung kết BO3. Đây là thói quen phổ biến ở giải phong trào Việt Nam; luật điểm/BO là điều lệ theo vòng, không cố định lúc tạo. Kèm double elimination và trận đội cấu hình được ván con ở engine.
