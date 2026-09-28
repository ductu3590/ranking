# Epic 3 — Brief thiết kế Stitch: Giải giao hữu liên CLB

Ngày: 2026-09-25 · Bước thiết kế của Epic 3 (D44: UI mới làm Stitch trước). Spec:
`docs/superpowers/specs/2026-09-25-epic-3-friendly/` (README + F1/F2/F3). Quyết định: ADR-007 D38–D47.
Người dùng (hoặc agent qua Stitch connector, nếu người dùng yêu cầu) làm màn theo brief này; lát F3 chỉ bắt đầu code sau
khi màn được xuất về `_workspace/stitch-internal-setup/canonical/friendly/<key>/reference.{html,png}` (bản mobile tách màn
thì thêm `reference-390.png`).

## 1. Người dùng và bối cảnh

- **Chủ nhà:** admin một CLB phong trào tổ chức giải giao lưu với **một CLB khác** (tài khoản thường mời tối đa 1 CLB
  khách mỗi giải; nhiều hơn là gói trả phí sắp ra mắt). Làm trên laptop hoặc điện thoại, trong luồng tạo giải 4 bước đã
  quen (Thông tin → Người tham gia → Thể thức & ghép cặp → Bốc thăm & chốt).
- **Admin CLB khách:** nhận lời mời qua **chuông thông báo trong PickHub** hoặc **link** chủ nhà gửi qua Zalo; chủ yếu
  dùng **điện thoại**; tự chọn thành viên CLB mình, tự ghép cặp, gửi; chủ nhà duyệt hoặc yêu cầu sửa.
- **VĐV/khán giả:** xem trang công khai trên điện thoại; muốn biết "CLB nào đang thắng".
- Quy mô: 2 CLB, mỗi bên 3–6 cặp đôi; 1–4 sân; thể thức như giải nội bộ (vòng bảng → loại trực tiếp, vòng tròn, loại
  trực tiếp, loại kép).

## 2. Chuẩn thị giác

- Token: `_workspace/stitch-internal-setup/canonical/DESIGN.md` (Plus Jakarta Sans, tím `brand-600 #7c3aed`, nền `slate-50`,
  thẻ trắng viền `slate-200`, badge emerald/amber).
- Cùng shell với 4 màn setup (`canonical/setup/*`) và bộ điều hành (`canonical/operations/*`): sidebar trái 16rem trên
  desktop, thanh trên + menu trượt trên mobile.
- **Mobile-first:** mỗi màn cần bản **390px**; màn của chủ nhà thêm bản **1280px**. Không tràn ngang. Nút chạm ≥ 44px.
- **Màu CLB:** CLB chủ nhà luôn tím brand `#7c3aed`; CLB khách lấy màu thứ hai của bảng `#0e7490` (xanh cổ vịt), nếu có
  CLB thứ ba: `#b45309`, `#be185d`. Chip CLB = chấm tròn 8px màu CLB + tên CLB rút gọn (≤ 14 ký tự), nền trắng viền
  `slate-200`, chữ `caption-bold`.
- Toàn bộ chữ tiếng Việt có dấu, không tiếng Anh ("pending", "invite", "roster", "live"…). Tên người thật kiểu Việt
  ("Nguyễn Minh", "Trần Tuấn"). Không ảnh đại diện giả: avatar = chữ cái cuối của tên trên nền `brand-50`.
- Tên cặp thắng: đậm + xanh emerald; trận chưa đấu: chữ thường (giống OPS-05/06).

## 3. Sự thật dữ liệu (thiết kế không được hứa quá)

| Có thật | Ghi chú |
|---|---|
| Danh sách **mọi CLB** trên PickHub (chỉ **tên**) để chủ nhà chọn mời; tìm theo tên | Không có logo trong danh sách (dùng chữ cái đầu), không mã CLB, không số thành viên, không liên hệ |
| Hạn mức **CLB khách**: tài khoản thường 1 CLB/giải | Khi đã mời đủ: nút "Mời CLB" **khoá** + câu "Tài khoản CLB thường mời được tối đa 1 CLB khách cho mỗi giải. Mời nhiều CLB hơn là quyền lợi của gói trả phí (sắp ra mắt)." CLB đã từ chối/đã rút không chiếm suất |
| Hạn mức **cặp** cho CLB khách (1–32, mặc định 4); lời nhắn khi mời (tùy chọn) | — |
| Hạn chót đăng ký **tùy chọn** (ngày + giờ); nút "Khoá đăng ký" / "Mở lại đăng ký" | Qua hạn hoặc khoá → CLB khách không sửa được |
| Link mời: hiện **một lần** sau khi mời; "Tạo link mới" làm link cũ hết hiệu lực | Link chỉ mở được khi đăng nhập **đúng CLB được mời** bằng quyền quản trị |
| Trạng thái lời mời (7): `Chờ phản hồi`, `Đang đăng ký`, `Chờ duyệt`, `Cần sửa`, `Đã duyệt`, `Từ chối`, `Đã rút` / `Đã huỷ mời` | — |
| Chủ nhà: Duyệt / Yêu cầu sửa (lý do bắt buộc) / Đổi hạn mức / Rút CLB. **Không sửa hộ** danh sách khách | — |
| CLB khách: Nhận lời / Từ chối; chọn thành viên; ghép cặp **chạm đúng hai người rồi bấm "Ghép cặp"** (không kéo-thả); Lưu nháp; Gửi danh sách; Rút lại để sửa; Rút khỏi giải | **Không có khách mời** trong đội CLB khách; không dự bị; người thiếu hồ sơ thi đấu không chọn được |
| Chuông "Việc cần xử lý" đã có (hiện chỉ có giao dịch quỹ chưa gán) | Thêm hai loại mục: lời mời giải (CLB khách), danh sách cần duyệt (chủ nhà) |
| Bốc thăm tự rải cặp cùng CLB ra các bảng / nửa nhánh; không đủ chỗ → **cảnh báo**, không chặn | Ví dụ 4 + 3 cặp, 2 bảng: Bảng A 2 + 2, Bảng B 2 + 1 |
| BXH cặp giữ nguyên + **BXH tổng CLB**: số trận thắng liên CLB, hiệu số điểm; trận giữa hai cặp cùng CLB **không tính** | Với 2 CLB là thẻ đối đầu "5 – 4" |
| Kết quả giải giao hữu **không** tính vào xếp hạng CLB | Ghi chú nhỏ dưới BXH CLB |

| KHÔNG có (không vẽ) |
|---|
| Mã CLB / mã mời để gõ, QR mời, danh bạ có logo/số thành viên, chat giữa CLB, thanh toán/lệ phí, trang nâng cấp gói (chỉ câu gợi ý), thông báo Zalo/SMS/đẩy, CLB ngoài PickHub, khách mời trong đội CLB khách, chủ nhà sửa hộ danh sách khách, điểm CLB tùy biến, huy chương CLB, ảnh VĐV. |

## 4. Các màn cần thiết kế

Mã màn → thư mục `canonical/friendly/<key>/`.

### FRD-01 `friendly/01-host-invite` — Chủ nhà: loại giải, mời CLB, link, hạn chót (desktop 1280 + mobile 390)

(a) **Bước 1 — ô "Loại giải"**: hai thẻ chọn "Nội bộ CLB — thành viên CLB mình" / "Giao hữu liên CLB — mời CLB khác gửi
cặp"; trạng thái sau khi đã tạo: chỉ đọc + "Không đổi được loại giải sau khi đã tạo".

(b) **Bước 2 — khối "CLB tham dự"** dưới danh sách thành viên: tiêu đề "CLB tham dự · Đã mời 1/1 CLB khách"; dòng CLB
chủ nhà cố định ("CLB của bạn · 8 người đã chọn", chip tím); dòng CLB khách: tên, chip trạng thái, "Hạn mức 3 cặp · đã gửi
2", nút theo trạng thái (`Xem & duyệt`), menu ⋯ (`Lấy link mời mới`, `Đổi hạn mức`, `Rút CLB`, `Mời lại`). Nút **"Mời
CLB"** ở hai trạng thái: *mở* (tím) và **khoá khi đủ hạn mức** (xám, biểu tượng khoá, câu gói trả phí ngay dưới). Trạng
thái trống: "Chưa mời CLB nào. Mời một CLB để họ tự gửi danh sách cặp."

(c) **Sheet "Mời CLB"** (bottom sheet mobile / dialog 560px desktop): ô "Tìm CLB theo tên"; danh sách CLB (chữ cái đầu +
tên; CLB đã mời có nhãn "Đã mời · Chờ phản hồi" và không chọn được); chọn một CLB → ô "Hạn mức cặp" (stepper, mặc định 4),
"Lời nhắn cho CLB (tùy chọn)" → `Gửi lời mời`. Vẽ thêm trạng thái lỗi "đã đủ hạn mức" (vừa có tab khác mời).

(d) **Dialog "Link mời"** sau khi gửi: "CLB Cầu Giấy đã nhận thông báo trong PickHub. Gửi thêm link này qua Zalo nếu cần."
Ô link chỉ đọc (`https://…/giai-dau/moi/Xk3…`), nút `Sao chép link` (trạng thái "Đã sao chép"), ghi chú "Link chỉ mở được
khi đăng nhập đúng CLB được mời. Link chỉ hiện một lần — cần lại thì tạo link mới (link cũ hết hiệu lực)."

(e) **Thẻ "Đăng ký của CLB khách"**: "Hạn chót (tùy chọn)" ngày + giờ (gợi ý 23:59), trạng thái `Đang mở · còn 2 ngày` /
`Đã khoá lúc 20:15` / `Đã qua hạn`; nút `Khoá đăng ký` (xác nhận "CLB khách sẽ không sửa được danh sách") / `Mở lại đăng ký`.

### FRD-02 `friendly/02-host-review` — Chủ nhà: xem & duyệt danh sách một CLB (390 + 1280)

Sheet/dialog: tiêu đề "CLB Cầu Giấy · gửi lúc 21:04", "3/3 cặp trong hạn mức", danh sách "Cặp 1 · Nguyễn Minh + Trần
Tuấn"… Nút `Duyệt` (chính), `Yêu cầu sửa` → ô lý do bắt buộc (2–300 ký tự, bộ đếm) → `Gửi yêu cầu`; `Đổi hạn mức`. Trạng
thái cần vẽ: chờ duyệt; đã duyệt (nút `Yêu cầu sửa` + cảnh báo "Sẽ phải bốc thăm lại nếu đã bốc"); xung đột ("CLB vừa cập
nhật danh sách" + `Tải lại`).

### FRD-03 `friendly/03-host-pairs-draw` — Chủ nhà: Bước 3 và Bước 4 của giải giao hữu (1280 + 390)

- Bước 3: vùng ghép cặp của chủ nhà như `canonical/setup/03-format-pairing`; dưới là nhóm **"Cặp CLB khách"** theo CLB
  (chip màu, "3 cặp · đã duyệt"), thẻ cặp chỉ đọc; tổng "7 cặp (4 của bạn + 3 của CLB Cầu Giấy)". Blocker "Còn CLB chưa
  được duyệt danh sách: CLB Cầu Giấy" + nút `Tới danh sách CLB`.
- Bước 4: như `canonical/setup/04-draw-preview-finalize`, mỗi cặp trong bảng có chip CLB; Bảng A: 2 cặp tím + 2 cặp xanh,
  Bảng B: 2 tím + 1 xanh; thẻ cảnh báo amber "CLB Test 23.9 có 4 cặp cho 2 bảng: có cặp cùng CLB gặp nhau ở vòng bảng";
  khối chốt có dòng "Giải giao hữu sẽ có link xem không liệt kê để CLB khách theo dõi".

### FRD-04 `friendly/04-notifications-inbox` — Chuông và hộp lời mời (390 trước, thêm 1280)

- Panel chuông "Việc cần xử lý" (panel hiện có): mục lời mời (biểu tượng cúp, "CLB Test 23.9.2026 mời CLB bạn dự giải",
  "Giao hữu Thu 2026 · 12/10", nút `Xem lời mời`, `Bỏ qua`); mục "Chủ nhà yêu cầu sửa danh sách cặp" (`Sửa danh sách`);
  mục của chủ nhà "CLB Cầu Giấy gửi 3 cặp · cần duyệt" (`Duyệt`); một mục giao dịch cũ để thấy hai loại sống chung.
- Trang **"Lời mời giải giao hữu"** (`/giai-dau/loi-moi`): nhóm "Cần bạn xử lý" / "Đang diễn ra" / "Đã xong"; thẻ lời mời:
  tên giải, CLB chủ nhà, ngày · giờ · địa điểm, chip trạng thái, "Hạn mức 3 cặp · đã gửi 0", "Hạn chót còn 2 ngày", nút
  theo trạng thái (`Trả lời`, `Đăng ký cặp`, `Sửa danh sách`, `Xem trang giải`). Trạng thái trống.
- Thẻ lối vào trên dashboard Giải đấu: "Lời mời giải giao hữu (1)".

### FRD-05 `friendly/05-invite-link` — Mở link mời (390)

Một màn, **5 trạng thái** (vẽ đủ):
1. **Chưa đăng nhập** → hộp đăng nhập CLB hiện có, dòng trên cùng "Đăng nhập CLB để mở lời mời giải" (không tên giải).
2. **Sai CLB**: biểu tượng khoá, "Link mời này dành cho một CLB khác", "Bạn đang đăng nhập: CLB Test 23.9.2026"; **không**
   tên giải, **không** CLB chủ nhà; nút `Đăng xuất & đăng nhập CLB khác`, `Về trang chủ`.
3. **Cần quyền quản trị**: "Cần tài khoản quản trị CLB để trả lời lời mời" + `Đăng nhập bằng quyền quản trị`.
4. **Link không hợp lệ / đã thu hồi**: "Link mời không hợp lệ hoặc đã bị thu hồi" + `Mở hộp lời mời`.
5. **Hết hạn** (đúng CLB): "Đăng ký của giải này đã đóng" + `Xem lời mời`.
(Hợp lệ → chuyển thẳng sang FRD-06, không cần màn riêng; vẽ khung xương "Đang mở lời mời…".)

### FRD-06 `friendly/06-guest-registration` — CLB khách: chi tiết lời mời + đăng ký cặp (390 ưu tiên, thêm 1280)

- Đầu trang: "Giao hữu Thu 2026", "CLB Test 23.9.2026 mời CLB bạn", ngày/giờ/địa điểm, thể thức "Vòng bảng → Loại trực
  tiếp", "Hạn mức 3 cặp", "Hạn chót 23:59 · 11/10", lời nhắn của chủ nhà (trích dẫn).
- Trạng thái **Chờ phản hồi**: `Nhận lời` / `Từ chối` (xác nhận).
- Trạng thái **Đang đăng ký**: khối "Chọn thành viên" (tìm theo tên, ô chọn, "Chọn toàn bộ", người thiếu hồ sơ có nhãn
  "Chưa có hồ sơ thi đấu" mờ); khối "Ghép cặp": danh sách người chưa ghép dạng chip chạm (đã chạm = viền tím), nút
  `Ghép cặp` bật khi đúng 2 người; thẻ cặp "Cặp 1 · Nguyễn Minh + Trần Tuấn" có `Tách`; bộ đếm "2/3 cặp"; blocker người lẻ
  với hai nút `Chọn thêm một người` / `Bỏ chọn người lẻ`; vượt hạn mức (đỏ, "Vượt hạn mức 3 cặp — bỏ bớt trước khi gửi").
  Thanh dính đáy: `Lưu nháp` · `Gửi danh sách` + chấm "Chưa lưu thay đổi".
- **Cần sửa**: banner amber "Chủ nhà yêu cầu sửa: Đổi cặp 2 cho cân trình" trên cùng; phần còn lại như Đang đăng ký.
- **Chờ duyệt**: danh sách chỉ đọc "Đã gửi 3 cặp · chờ chủ nhà duyệt" + `Rút lại để sửa`.
- **Đã duyệt**: "Đã duyệt · 3 cặp" (emerald) + `Rút khỏi giải` (xác nhận).
- **Đăng ký đã đóng** (khoá/qua hạn): banner xám, mọi nút sửa khoá.
- **Đã chốt**: "Giải đã chốt lịch" + `Xem trang giải`.
- Xung đột: banner "Danh sách vừa được lưu ở máy khác" + `Tải bản mới nhất`; hộp "Rời trang khi chưa lưu".

### FRD-07 `friendly/07-club-standings` — BXH tổng CLB ở bàn điều hành (1280 + 390)

Trong mục "Sơ đồ & xếp hạng" (như `canonical/operations/06-standings-finish`): **thẻ đối đầu** phía trên BXH cặp — hai
cột CLB (chip màu + tên), số lớn "5 – 4" (trận thắng liên CLB), dòng phụ "Hiệu số điểm +12 · 9/9 trận liên CLB đã đấu",
chú thích "Chỉ tính trận giữa hai CLB khác nhau. Không tính vào xếp hạng CLB." BXH cặp bên dưới có chip CLB cạnh cặp. Vẽ
thêm biến thể **3 CLB** (bảng: hạng, CLB, trận, thắng–thua, hiệu số) cho gói trả phí sau này. Sơ đồ nhánh (OPS-05) có chip
CLB trong ô cặp.

### FRD-08 `friendly/08-public-friendly` — Trang công khai giải giao hữu (390 trước, thêm 1280)

Như `canonical/operations/07-public-live`, thay đổi: đầu trang nhãn "Giao hữu liên CLB" + "CLB Test 23.9.2026 × CLB Cầu
Giấy" (hai chip màu) + tỉ số đối đầu nhỏ "5 – 4"; chip CLB cạnh cặp ở Đang đấu / Sắp tới / Kết quả / Sơ đồ; tab "Xếp
hạng" có đoạn chuyển **"Cặp · CLB"** (CLB = thẻ đối đầu FRD-07 chỉ đọc). Không nút quản trị.

## 5. Prompt dán vào Stitch (gợi ý; mỗi màn một prompt, thêm "use the existing design system")

> **FRD-01**: "Tournament setup step 2 for a friendly match between two pickleball clubs (Vietnamese UI), same shell and
> style as the existing setup screens. Below the member list, a card 'CLB tham dự · Đã mời 1/1 CLB khách': fixed host row
> with purple chip, one guest club row with status chip 'Chờ phản hồi', 'Hạn mức 3 cặp', a ⋯ menu. A disabled 'Mời CLB'
> button with a lock icon and the helper text 'Tài khoản CLB thường mời được tối đa 1 CLB khách cho mỗi giải. Mời nhiều
> CLB hơn là quyền lợi của gói trả phí (sắp ra mắt).' Also draw: the invite bottom sheet with a name search over all clubs
> (initial-letter avatars, no logos), quota stepper default 4, optional message; the one-time invite link dialog with copy
> button; a registration window card with optional deadline and 'Khoá đăng ký'. Mobile 390 and desktop 1280. No English."
>
> **FRD-05**: "Mobile 390 screen for opening a club invitation link, five states: login required (existing club login
> box with the line 'Đăng nhập CLB để mở lời mời giải'), wrong club ('Link mời này dành cho một CLB khác', shows only the
> currently logged-in club name, never the tournament or host club), admin required, invalid or revoked link, and
> registration closed with a 'Xem lời mời' button. Lock/illustration icons, Vietnamese text, brand purple."
>
> **FRD-06**: "Mobile-first page for a guest club admin to answer an invitation and register doubles pairs. Header with
> tournament name, host club, date/time/venue, format, 'Hạn mức 3 cặp', deadline, host message. States: waiting for
> answer (Nhận lời / Từ chối), registering (member picker with search and 'Chọn toàn bộ', tap exactly two unpaired people
> then 'Ghép cặp', pair cards with 'Tách', counter '2/3 cặp', odd-person blocker with two options, over-quota error),
> changes requested (amber banner with host reason), submitted (read-only, 'Rút lại để sửa'), approved (emerald),
> registration closed, finalized ('Xem trang giải'). Sticky footer 'Lưu nháp' / 'Gửi danh sách' with unsaved dot. No
> drag-and-drop, no guest players, no avatars."
>
> **FRD-07**: "Club head-to-head card for a friendly tournament standings page: two clubs with colored dots (purple host,
> teal guest), big score '5 – 4' of inter-club match wins, subline 'Hiệu số điểm +12 · 9/9 trận liên CLB đã đấu',
> footnote that intra-club matches do not count and results do not affect club rankings. Below, the existing pair
> standings table with a small club chip next to each pair. Also a 3-club table variant. Desktop 1280 and mobile 390."

(FRD-02, 03, 04, 08: viết prompt tương tự từ mô tả §4.)

## 6. Bàn giao sau khi thiết kế xong

1. Xuất từng màn (HTML + PNG) vào `_workspace/stitch-internal-setup/canonical/friendly/<key>/`.
2. Thêm bảng "Friendly Screens" (key + Stitch screen ID) vào `canonical/README.md` và `stitch-source-manifest.json`; ghi
   lệch so với brief (nếu có) vào `canonical/friendly/README.md`.
3. Báo agent "Stitch Epic 3 xong" → agent đối chiếu reference với spec F3 (ghi lệch vào mục "Lệch spec" của F3, hỏi người
   dùng nếu lệch sự thật dữ liệu §3), rồi mới code F3.

Tối thiểu để bắt đầu F3: **FRD-01, FRD-05, FRD-06** (mời, link, đăng ký cặp — đường găng của nghiệm thu). Các màn còn lại
làm song song khi F3 đang code.
