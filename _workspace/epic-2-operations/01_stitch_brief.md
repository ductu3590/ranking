# Epic 2 — Brief thiết kế Stitch: Bàn điều hành giải

Ngày: 2026-09-24 · Bước 0 của Epic 2 (roadmap `docs/superpowers/plans/2026-09-24-tournament-roadmap.md`, D16).
Người dùng làm màn trên Stitch theo brief này; agent chỉ chia lát code sau khi màn được xuất về
`_workspace/stitch-internal-setup/canonical/operations/<key>/reference.{html,png}`.

Chốt với người dùng (AskUserQuestion 2026-09-24): thiết kế Stitch trước · lát đầu là **trung tâm điều hành
theo sân/lượt** (gom sửa nợ vào cùng) · deploy qua nhánh + PR nháp như D24 · nợ = danh sách đã ghi trong roadmap.

## 1. Người dùng và bối cảnh

Một BTC ngồi laptop (hoặc cầm điện thoại) chạy giải CLB phong trào trong ngày: gọi cặp vào sân qua mic,
theo dõi sân nào trống, nhập tỉ số sau mỗi trận, nhìn BXH/sơ đồ để biết ai đi tiếp. VĐV xem trang công khai
trên điện thoại. Giải 4–32 cặp đôi, 2–8 sân, 3 thể thức lịch: vòng bảng → loại trực tiếp, vòng tròn, loại
trực tiếp, loại kép (nhánh thắng/thua/chung kết tổng).

## 2. Chuẩn thị giác

- Token: `_workspace/stitch-internal-setup/canonical/DESIGN.md` (Plus Jakarta Sans, tím `brand-600 #7c3aed`,
  nền `slate-50`, thẻ trắng viền `slate-200`, badge emerald/amber).
- Cùng shell với 4 màn setup đã duyệt (`canonical/setup/*/reference.png`): sidebar trái 16rem trên desktop,
  thanh trên + menu trượt trên mobile. Sidebar giữ nhóm "Chuẩn bị" (4 bước) / "Trung tâm điều hành" /
  "Trong & sau giải" như hiện nay.
- Mobile-first: mỗi màn cần bản **390px** và **1280px**. Không tràn ngang. Nút chạm ≥ 44px.
- Toàn bộ chữ tiếng Việt có dấu. Không tiếng Anh trên giao diện (không "live", "pending", "Match #123").

## 3. Sự thật dữ liệu (thiết kế không được hứa quá)

| Có thật | Ghi chú |
|---|---|
| Trạng thái trận | `Chưa gọi` → `Khởi động` → `Đang đấu` ⇄ `Tạm dừng` → `Đã chốt`. Từ Khởi động có thể **hủy gọi** (cần lý do) hoặc **thắng W.O.** (cần lý do). Từ Tạm dừng có thể **bỏ cuộc** (cần lý do). Không đi thẳng Chưa gọi → Đang đấu. |
| Sân | Danh sách sân (nhãn "Sân 01"…), bật/ngưng dùng kèm lý do. Trạng thái sân: trống chờ gọi / khởi động / đang đấu / tạm dừng / ngưng dùng. |
| Hàng đợi | Các trận `Chưa gọi` theo thứ tự lịch; mỗi trận có giờ dự kiến (hoặc giờ ghim). Chỉ đổi sân được cho trận chưa gọi. |
| Tiến độ | `x/y trận đã chốt`, giờ ước tính hoàn tất, thời lượng trận trung bình, đồng hồ trận, đếm ngược khởi động (mặc định 4 phút). |
| Nhãn trận | Vòng bảng: `Bảng A · Lượt 2`. Vòng tròn: `Lượt 3`. Loại trực tiếp: `Vòng 1/8`, `Tứ kết`, `Bán kết`, `Chung kết`, `Tranh hạng ba`. Loại kép (D21): `Nhánh thắng · Vòng 1`, `Bán kết nhánh thắng`, `Chung kết nhánh thắng`, `Nhánh thua · Vòng 2`, `Chung kết nhánh thua`, `Chung kết tổng`. |
| Ô chờ đối thủ | Trận nhánh sau chưa có cặp: hiện **nguồn** — `Thắng trận Tứ kết 1`, `Thua trận W1-2` (mã nội bộ có thể đổi thành nhãn đọc được). **Không** hiện "Đội A / Đội B". |
| Luật điểm | Mỗi trận có luật cố định từ lúc chốt giải: mặc định **BO1 · tới 11 · cách 2**. Chỉ **Chung kết** (và **Chung kết tổng** của loại kép) có thể là BO3/BO5. **Không có ô chọn BO theo vòng/lượt** (D8/D14). Luật hiện dạng chip chỉ đọc trên thẻ trận. |
| Tỉ số | Nhập theo **ván** (ván 1, 2, 3…), số ván tối đa = BO. Máy tự xác định thắng khi đủ ván. |
| Tiến cấp | Chốt trận → cặp thắng/thua tự điền vào trận nhánh sau (có thể làm thay đổi trận khác ngay lập tức). |
| Xếp hạng | BXH vòng bảng/vòng tròn (thắng, thua, hiệu số); xếp hạng cuối cho loại trực tiếp/loại kép (hạng 1, 2, 3, 4, đồng hạng 5–6, 7–8…). Nút "Kết thúc giải & chốt xếp hạng". |
| Link trọng tài | API cấp link nhập điểm cho từng trận/sân đã có, **chưa có giao diện** — xem màn OPS-08 (tùy chọn). |

| KHÔNG có (không vẽ) |
|---|
| Chấm điểm từng pha (point-by-point), phát sóng/video, check-in QR, thông báo SMS/Zalo, lệ phí/thanh toán, DUPR/rating, seed/hash công khai, danh sách dự bị, ảnh đại diện VĐV giả, dữ liệu mẫu tiếng Anh. |

## 4. Các màn cần thiết kế

Mã màn → thư mục lưu `canonical/operations/<key>/`.

### OPS-01 `ops/01-control-center` — Trung tâm điều hành theo sân (màn chính, ưu tiên cao nhất)

Desktop 1280:
- **Dải tiến độ** trên cùng: `18/31 trận đã chốt` (thanh tiến độ), `Dự kiến xong 16:40`, `TB 21 phút/trận`,
  chip `Đang diễn ra`. Bộ lọc nội dung/giai đoạn nếu giải nhiều stage.
- **Lưới thẻ sân** (2–4 cột). Mỗi thẻ sân:
  - Tên sân + trạng thái màu (trống = xám/tím nhạt "Chờ gọi trận", khởi động = amber + đếm ngược,
    đang đấu = emerald + đồng hồ, tạm dừng = amber đậm, ngưng dùng = gạch chéo xám + lý do).
  - Nhãn trận (`Bán kết nhánh thắng`), chip luật (`BO1 · 11`), hai cặp **tên VĐV thật** ("Minh + Tuấn").
  - Hành động chính một nút theo trạng thái: `Gọi trận kế tiếp` / `Bắt đầu đấu` / `Nhập tỉ số` /
    `Đấu tiếp`; hành động phụ trong menu ⋯: `Hủy gọi`, `Xử thắng W.O.`, `Bỏ cuộc`, `Tạm dừng`.
- **Cột phải "Hàng chờ theo lượt"**: nhóm theo lượt/vòng (`Lượt 3 · 4 trận`), mỗi dòng: nhãn trận, hai cặp,
  giờ dự kiến, sân gợi ý. Trạng thái dòng: `Sẵn sàng`, `Chờ đối thủ` (ô chờ theo nguồn), `Cặp đang đấu ở Sân 2`
  (VĐV bận — không gọi được). Kéo/nút "Gọi vào Sân…" cho trận sẵn sàng.
- **Trận vừa chốt** (3–5 dòng gần nhất) có nút `Sửa` → mở OPS-03.

Mobile 390: danh sách thẻ sân dọc (thẻ gọn), thanh chuyển đoạn trên cùng `Sân · Hàng chờ · Vừa chốt`,
nút hành động chính full-width trong thẻ.

Trạng thái cần vẽ: giải chưa có sân nào (CTA "Khai báo sân"), mọi sân bận + hàng chờ dài, hết trận (chúc mừng
+ CTA "Xem xếp hạng & kết thúc giải").

### OPS-02 `ops/02-call-card` — Thẻ gọi sân (đọc mic)

Sheet/dialog to chữ để đọc: `Mời Minh + Tuấn và Hùng + Nam vào Sân 03` · `Tứ kết 2 · BO1 · khởi động 4 phút`.
Nút `Đã gọi — bắt đầu khởi động`, `Đổi sân`, `Để sau`. Bản mobile full-screen.

### OPS-03 `ops/03-score-entry` — Nhập tỉ số một trận

Bottom sheet (mobile) / dialog 560px (desktop):
- Đầu: nhãn trận, sân, hai cặp đối diện, chip luật chỉ đọc `BO3 · tới 11 · cách 2` (với Chung kết).
- Các dòng ván: `Ván 1  [11] – [7]` với ô số lớn (inputmode số) + nút −/+; ván kế hiện dần; chỉ tới BO.
- Kết quả suy ra: `Minh + Tuấn thắng 2–1`; cảnh báo hợp lệ inline (`Ván 2: phải cách 2 điểm`,
  `Đã đủ ván thắng, ván 3 không cần nhập`).
- Thanh lưu dính đáy: `Lưu & chốt trận` (chính), `Lưu nháp` (phụ). Trạng thái: `Chưa lưu thay đổi` (chấm amber),
  `Đang lưu…`, `Đã chốt · cặp thắng đã vào Bán kết 1` (thông báo tiến cấp).
- **Xung đột**: banner `Trận vừa được cập nhật ở máy khác` + so sánh tỉ số của bạn / trên máy chủ, nút
  `Dùng bản mới nhất` / `Ghi đè bằng tỉ số của tôi`.
- **Rời trang khi chưa lưu**: hộp xác nhận `Bạn có tỉ số chưa lưu. Rời đi sẽ mất.` `Ở lại` / `Bỏ thay đổi`.
- Trận đã chốt: chế độ xem + nút `Sửa kết quả` (cần lý do, cảnh báo sẽ tính lại nhánh sau).
- W.O./bỏ cuộc: chọn cặp thắng + ô lý do bắt buộc.

### OPS-04 `ops/04-schedule-results` — Lịch & kết quả theo lượt

Thay tab "Kết quả" hiện tại. Lọc: giai đoạn · vòng/lượt · sân · trạng thái (`Chưa gọi`, `Đang đấu`, `Đã chốt`).
Danh sách nhóm theo lượt; mỗi dòng: nhãn trận, hai cặp (ô chờ theo nguồn), tỉ số tóm tắt `11–7, 9–11, 11–5`,
sân, trạng thái. Chạm dòng → OPS-03. **Không có** khối "Số ván theo vòng BO1/BO3/BO5".

### OPS-05 `ops/05-bracket` — Sơ đồ nhánh dùng chung

Một component cho ba kiểu:
1. **Loại trực tiếp**: các cột vòng → `Chung kết`; khối **`Tranh hạng ba` tách riêng** dưới/bên cạnh, không gộp
   vào cột Chung kết.
2. **Loại kép**: ba khung `Nhánh thắng` / `Nhánh thua` / `Chung kết tổng` (D21).
3. **Playoff sau vòng bảng**: như (1), ô có nguồn `Nhất bảng A`, `Nhì bảng B`.

Ô trận: hai dòng cặp + tỉ số, cặp thắng đậm, ô chờ hiện nguồn (`Thắng Tứ kết 1`), bye hiện `Miễn đấu`.
Trạng thái ô: chưa đấu / đang đấu (viền emerald + sân) / đã chốt. Mobile: cuộn ngang trong khung, có thanh
chọn vòng; desktop: toàn cảnh.

### OPS-06 `ops/06-standings-finish` — Xếp hạng & kết thúc giải

- BXH bảng/vòng tròn: hạng, cặp, trận, thắng–thua, hiệu số ván/điểm, dấu `Đi tiếp` cho suất đi tiếp.
- Xếp hạng cuối (loại trực tiếp/loại kép): bục 1–2–3, dưới là `Hạng 4`, `Đồng hạng 5–6`…
- Nút `Kết thúc giải & chốt xếp hạng` + hộp xác nhận; trạng thái sau khi kết thúc (khóa nhập tỉ số).

### OPS-07 `ops/07-public-live` — Trang công khai cho VĐV (mobile trước)

Tên giải, trạng thái, `Đang đấu` theo sân (sân nào, cặp nào, ván mấy nếu đã lưu), `Sắp tới` (giờ dự kiến),
`Kết quả`, tab `Bảng xếp hạng` và `Sơ đồ` (dùng OPS-05 chế độ chỉ xem). Nút chia sẻ. Không có nút quản trị.

### OPS-08 `ops/08-scorekeeper` — Link trọng tài nhập điểm (tùy chọn)

Chỉ vẽ nếu muốn đưa vào Epic 2. BTC bấm `Tạo link nhập điểm` trên thẻ sân → QR + link (hết hạn sau 2 giờ,
thu hồi được). Trọng tài mở link trên điện thoại → chỉ thấy trận của sân đó và màn OPS-03 rút gọn.

## 5. Nợ đã biết mà thiết kế phải giải quyết

| Nợ | Màn |
|---|---|
| Ô chờ hiện "Đội A / Đội B" | OPS-01, 04, 05 (hiện nguồn) |
| `Tranh hạng ba` bị gộp vào nhóm "Chung kết" | OPS-05 |
| Nhãn vòng loại trực tiếp sai khi dữ liệu thiếu `label` | OPS-04, 05 (nhãn chuẩn §3) |
| Ô chọn BO theo "Lượt" ở tab Kết quả (trái D8/D14) | OPS-03, 04 (chip luật chỉ đọc) |
| "Dữ liệu trận đã thay đổi, hãy tải lại" khi lưu tỉ số sau tiến cấp | OPS-03 (trạng thái xung đột rõ ràng; phía code sẽ tải lại trận sau định tuyến) |
| Mất tỉ số khi bấm Back | OPS-03 (xác nhận rời trang) |
| Bàn điều hành hiện "Trận #123", "live", "needs_call" | OPS-01 (nhãn + tên VĐV thật) |

## 6. Prompt dán vào Stitch (gợi ý, mỗi màn một prompt, thêm "use the existing design system")

> **OPS-01**: "Tournament operations control center for a pickleball club (Vietnamese UI). Same shell as the
> setup screens: left sidebar 16rem with steps. Top progress strip: '18/31 trận đã chốt', 'Dự kiến xong 16:40',
> 'TB 21 phút/trận'. Grid of court cards: each card shows court name 'Sân 03', status color (idle / warmup with
> countdown / playing with timer / paused / disabled), match label 'Bán kết nhánh thắng', read-only rule chip
> 'BO1 · 11', two doubles pairs with real Vietnamese names, one primary action button ('Gọi trận kế tiếp',
> 'Bắt đầu đấu', 'Nhập tỉ số') and a ⋯ menu. Right column 'Hàng chờ theo lượt' grouped by round with rows marked
> 'Sẵn sàng', 'Chờ đối thủ: Thắng Tứ kết 1', 'Cặp đang đấu ở Sân 2'. Bottom: 'Trận vừa chốt' with 'Sửa'.
> Desktop 1280 and mobile 390 (segmented control 'Sân · Hàng chờ · Vừa chốt'). No English words, no avatars."
>
> **OPS-03**: "Score entry bottom sheet (mobile) / dialog (desktop) for one doubles match, Vietnamese. Header
> with match label, court, two pairs facing each other, read-only chip 'BO3 · tới 11 · cách 2'. Game rows
> 'Ván 1 [11] – [7]' with large numeric inputs and −/+ steppers, inferred result 'Minh + Tuấn thắng 2–1',
> inline validation. Sticky footer 'Lưu & chốt trận' / 'Lưu nháp', unsaved-changes dot. Also draw: conflict
> banner comparing my score vs server score, leave-page confirmation, walkover with required reason."
>
> **OPS-05**: "Reusable tournament bracket component, Vietnamese labels: (1) single elimination with a
> separate 'Tranh hạng ba' block not merged into 'Chung kết'; (2) double elimination with three frames
> 'Nhánh thắng', 'Nhánh thua', 'Chung kết tổng'. Match boxes show two pairs + game scores, winner bold, pending
> slots show their source ('Thắng Tứ kết 1'), byes show 'Miễn đấu', live match outlined in emerald with court.
> Mobile 390 horizontal scroll with round selector; desktop full view."

(OPS-02, 04, 06, 07, 08: viết prompt tương tự từ mô tả §4.)

## 7. Bàn giao sau khi thiết kế xong

**Trạng thái 2026-09-24:** agent đã sinh đủ OPS-01…07 qua Stitch connector (theo yêu cầu người dùng) và lưu vào
`canonical/operations/` — xem `canonical/operations/README.md` (screen ID, lưu ý lệch). OPS-08 chưa làm.


1. Xuất từng màn Stitch (HTML + PNG) vào `_workspace/stitch-internal-setup/canonical/operations/<key>/`
   (`reference.html`, `reference.png`; bản mobile đặt `reference-390.png` nếu tách màn).
2. Bổ sung bảng "Operations Screens" (key + Stitch screen ID) vào `canonical/README.md` và file manifest.
3. Báo agent: "Stitch Epic 2 xong" → agent brainstorm các chi tiết còn lại, viết spec chia lát vào
   `docs/superpowers/specs/2026-09-2x-epic-2-operations/` (lát E1 = trung tâm điều hành theo sân/lượt + sửa nợ,
   rồi tới sơ đồ dùng chung, BXH/trang công khai), rồi mới code.

Tối thiểu để bắt đầu lát E1: **OPS-01 + OPS-02 + OPS-03** (desktop + mobile). Các màn còn lại có thể làm song
song khi E1 đang code.
