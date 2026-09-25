# Lát F3 — Giao diện giải giao hữu và nghiệm thu browser

Trạng thái: spec · Phụ thuộc: F1 + F2 (API, 110, 111), màn Stitch FRD-01…08 đã xuất về
`_workspace/stitch-internal-setup/canonical/friendly/<key>/reference.{html,png}` (D44) · Xem [README](README.md)
Brief Stitch: `_workspace/epic-3-friendly/01_stitch_brief.md`. **Không code UI trước khi có reference** (bộ nhớ dự án: UI
phải khớp Stitch đã chốt — so reference HTML, đúng font, tên cặp thắng đậm/xanh, chưa đấu chữ thường).

## 1. Mục tiêu

Chủ nhà làm trọn giải giao hữu trong setup 4 bước quen thuộc (chọn loại giải → mời CLB từ danh sách, thấy hạn mức →
duyệt danh sách CLB khách → ghép cặp mình, thấy cặp khách chỉ đọc → bốc thăm có chip CLB → chốt). Admin CLB khách nhận
lời mời qua chuông hoặc link, đăng ký cặp trên điện thoại 390px. Sau chốt, bàn điều hành và trang công khai hiện chip CLB
cạnh cặp và BXH tổng CLB (đối đầu hai CLB). Giải nội bộ không đổi giao diện.

## 2. File (ownership của lát)

| File | Việc | Màn |
|---|---|---|
| `app/giai-dau/v2/TournamentV2DashboardClient.js` (integrator) | `?create=friendly` mở studio chế độ giao hữu; thẻ "Lời mời giải giao hữu (n)" cho admin khi có lời mời cần xử lý | FRD-01, FRD-04 |
| `app/giai-dau/v2/TournamentWizard.js` | Đọc `create` → truyền `organizerMode` cho `SetupStudio` khi tạo mới | — |
| `app/giai-dau/v2/setup-v3/SetupStudio.js`, `useSetupStudio.js` | Mang `organizerMode` vào bản nháp lần lưu đầu; giữ khối `friendly` từ view setup; tải lại khối này khi quay lại Bước 2–4 | — |
| `app/giai-dau/v2/setup-v3/steps/StepInfo.js` | Ô "Loại giải": Nội bộ CLB / Giao hữu liên CLB (chỉ chọn được trước lần lưu đầu; sau đó chỉ đọc) | FRD-01 |
| `app/giai-dau/v2/setup-v3/steps/StepParticipants.js` | Giải friendly: thêm `FriendlyClubsPanel` dưới danh sách thành viên | FRD-01, FRD-02 |
| `app/giai-dau/v2/setup-v3/friendly/FriendlyClubsPanel.js` (mới) | Danh sách CLB đã mời + trạng thái + hạn mức CLB khách + nút "Mời CLB" (khoá khi đạt hạn mức) | FRD-01 |
| `app/giai-dau/v2/setup-v3/friendly/InviteClubSheet.js` (mới) | Sheet chọn CLB từ danh sách mọi CLB (tìm theo tên) + hạn mức cặp + ghi chú | FRD-01 |
| `app/giai-dau/v2/setup-v3/friendly/InviteLinkDialog.js` (mới) | Hiện link một lần, "Sao chép link", "Tạo link mới" (xác nhận: link cũ hết hiệu lực) | FRD-01 |
| `app/giai-dau/v2/setup-v3/friendly/RegistrationWindowCard.js` (mới) | Hạn chót (ngày + giờ, mặc định 23:59) + "Khoá đăng ký" / "Mở lại" | FRD-01 |
| `app/giai-dau/v2/setup-v3/friendly/ClubReviewSheet.js` (mới) | Ảnh chụp danh sách đã gửi của một CLB, "Duyệt", "Yêu cầu sửa" (lý do bắt buộc), "Đổi hạn mức", "Rút CLB" | FRD-02 |
| `app/giai-dau/v2/setup-v3/friendly/friendly.css` (mới) | Style theo token DESIGN.md; tiền tố `fr-` | — |
| `app/giai-dau/v2/setup-v3/steps/StepFormatPairing.js` | Giải friendly: nhóm "Cặp CLB khách" chỉ đọc (chip CLB, không ghép/tách/khoá); tổng số cặp = mình + đã duyệt; blocker `FRIENDLY_CLUB_NOT_READY` có nút "Tới danh sách CLB" | FRD-03 |
| `app/giai-dau/v2/setup-v3/steps/StepDraw.js` | Chip CLB trên từng cặp trong bảng/nhánh; cảnh báo `FRIENDLY_CLUB_SPREAD_LIMITED` có tên CLB; ghi chú "Giải giao hữu sẽ có link xem không liệt kê" (README §11 câu 3) | FRD-03 |
| `components/pickhub/PhNotificationBell.js` | Rẽ nhánh theo `kind`: mục giải đấu hiện `display.title/body`, nút `display.actionLabel` → `href`, "Bỏ qua"; mục giao dịch giữ nguyên | FRD-04 |
| `app/giai-dau/moi/[token]/page.js` (mới, server) + `InviteLinkClient.js` (mới) | Chưa có phiên CLB → `redirect('/?dang-nhap=clb&next=' + encodeURIComponent(path))`; có phiên → client gọi `resolveInviteLink` và hiện trạng thái | FRD-05 |
| `app/giai-dau/loi-moi/page.js` (mới, server gate admin) + `InvitationsClient.js` | Hộp lời mời của CLB khách | FRD-04 |
| `app/giai-dau/loi-moi/[id]/page.js` (mới) + `InvitationDetailClient.js` + `GuestRosterEditor.js` | Chi tiết lời mời, nhận/từ chối, chọn thành viên, ghép cặp, lưu nháp, gửi, rút | FRD-06 |
| `app/giai-dau/loi-moi/loi-moi.css` (mới) | Style; tiền tố `li-` | — |
| `app/page.js` | `?dang-nhap=clb` mở hộp đăng nhập CLB; sau khi đăng nhập thành công đi tới `safeNextPath(next)` nếu hợp lệ, ngược lại `redirectTo` như cũ | FRD-05 |
| `app/giai-dau/v2/console/friendly/ClubChip.js`, `ClubStandingsCard.js` (mới) | Chip CLB (chấm màu + tên rút gọn) dùng chung; thẻ BXH CLB | FRD-07 |
| Mục "Sơ đồ & xếp hạng" của console (E2: `StandingsView`, `BracketView`) + mục Trận đấu | Chip CLB cạnh tên cặp; thẻ BXH CLB phía trên BXH cặp khi giải friendly | FRD-07 |
| `app/giai-dau/v2/[slug]/PublicLive.js`, `public-live.css` | Tiêu đề đối đầu CLB, chip CLB, tab Xếp hạng có đoạn chuyển "Cặp · CLB" | FRD-08 |
| `tests/stitch-setup/epic-3/f3-ui-contract.test.js` (mới) | §8 | — |

Mọi gọi API qua `lib/tournamentV2Client.js` (F1/F2 đã thêm hàm). Component không gọi Supabase. Không sửa `draw.js`,
`wizardModel.js`. Chỉ `PhNotificationBell.js` là file ngoài module giải đấu — sửa tối thiểu, test giữ nguyên hành vi giao dịch.

## 3. Luồng chủ nhà

### 3.1 Bước 1 — Loại giải (FRD-01, phần đầu)

Ô chọn hai lựa chọn có mô tả một dòng: "Nội bộ CLB — thành viên CLB mình" / "Giao hữu liên CLB — mời CLB khác gửi cặp".
Mặc định theo `?create=` (nút "Tạo giải giao hữu" trên dashboard mở `?create=friendly`). Sau lần lưu đầu: chỉ đọc, kèm
dòng "Không đổi được loại giải sau khi đã tạo" (`ORGANIZER_MODE_LOCKED`).

### 3.2 Bước 2 — Khối "CLB tham dự" (FRD-01)

- Đầu khối: "CLB tham dự · Đã mời {used}/{max} CLB khách". Dòng CLB chủ nhà cố định ở trên ("CLB của bạn · {n} người đã chọn").
- Mỗi CLB đã mời: tên, chip trạng thái (`Chờ phản hồi` xám, `Đang đăng ký` tím nhạt, `Chờ duyệt` amber, `Cần sửa` amber
  đậm, `Đã duyệt` emerald, `Từ chối`/`Đã rút` gạch mờ), "Hạn mức 3 cặp", số cặp đã gửi, hành động theo trạng thái:
  `Xem & duyệt` (Chờ duyệt) → ClubReviewSheet; menu ⋯: `Lấy link mời mới`, `Đổi hạn mức`, `Rút CLB` (xác nhận),
  `Mời lại` (Từ chối/Đã rút — bị khoá nếu đạt hạn mức).
- Nút **"Mời CLB"**: `limit.reached` → nút khoá, ngay dưới là câu của `FRIENDLY_CLUB_LIMIT_REACHED` (có `{max}`), biểu
  tượng khoá; không ẩn nút (người dùng phải hiểu vì sao). Chưa đạt → mở InviteClubSheet.
- **InviteClubSheet**: ô tìm "Tìm CLB theo tên", danh sách mọi CLB (`listAvailableTournamentClubs({ tournamentId, q })`),
  mỗi dòng: chữ cái đầu làm avatar, tên, trạng thái nếu đã mời ("Đã mời · Chờ phản hồi"). Chọn một CLB → ô "Hạn mức cặp"
  (số, mặc định 4, 1–32), "Lời nhắn" (tùy chọn, ≤ 500) → "Gửi lời mời". Lỗi 409 hạn mức (đua với tab khác) → đóng sheet,
  tải lại khối, hiện câu lỗi.
- **InviteLinkDialog** (mở ngay sau khi mời thành công hoặc sau "Lấy link mời mới"): "CLB Test Responsive UI đã nhận
  thông báo trong PickHub. Gửi thêm link này qua Zalo nếu cần." Ô link chỉ đọc + "Sao chép link"; ghi chú: "Link chỉ
  mở được khi đăng nhập đúng CLB được mời. Link chỉ hiện một lần — cần lại thì tạo link mới (link cũ hết hiệu lực)."
- **RegistrationWindowCard**: "Hạn chót đăng ký (tùy chọn)" ngày + giờ; trạng thái "Đang mở" / "Đã khoá lúc …" / "Đã qua
  hạn"; nút "Khoá đăng ký" (xác nhận: "CLB khách sẽ không sửa được danh sách") / "Mở lại đăng ký".

### 3.3 Duyệt danh sách (FRD-02)

ClubReviewSheet: tiêu đề CLB + "Gửi lúc …"; danh sách cặp "Cặp 1 · Nguyễn Văn A + Trần B"; "3/3 cặp trong hạn mức".
Hành động: `Duyệt` (chính) · `Yêu cầu sửa` → ô lý do bắt buộc 2–300 ký tự → `Gửi yêu cầu` · `Đổi hạn mức`. Lỗi
`FRIENDLY_CLUB_VERSION_CONFLICT` → banner "CLB vừa cập nhật danh sách" + "Tải lại". CLB đã duyệt: nút `Yêu cầu sửa` vẫn
có (sẽ làm bốc thăm hết hạn nếu đã bốc — câu cảnh báo).

### 3.4 Bước 3 và Bước 4 (FRD-03)

- Bước 3: dưới vùng ghép cặp của chủ nhà, nhóm "Cặp CLB khách" theo CLB (tiêu đề có chip màu CLB, "3 cặp · đã duyệt"),
  mỗi cặp dạng thẻ chỉ đọc (không nút tách/khoá). Tổng "7 cặp (4 của bạn + 3 của CLB khách)". Blocker
  `FRIENDLY_CLUB_NOT_READY` / `FRIENDLY_CLUBS_TOO_FEW` / `FRIENDLY_CLUB_LIMIT_REACHED` hiện như blocker hiện có + nút
  "Tới danh sách CLB" (về Bước 2, cuộn tới khối).
- Bước 4: trong bảng/nhánh, mỗi cặp có `ClubChip`; cảnh báo rải CLB dạng thẻ amber với câu `FRIENDLY_CLUB_SPREAD_LIMITED`
  từng CLB; `DRAW_STALE` do CLB khách đổi hiện câu "Danh sách CLB khách đã thay đổi sau khi bốc thăm". Khối xác nhận chốt
  có dòng về link công khai.

## 4. Luồng CLB khách

### 4.1 Chuông "Việc cần xử lý" (FRD-04)

Mục `tournament_invitation`: biểu tượng cúp, `display.title` đậm, `display.body`, nút chính `display.actionLabel`
("Xem lời mời" / "Sửa danh sách") → `href`, nút "Bỏ qua". Mục `tournament_roster_review` (chủ nhà): "Duyệt" → setup Bước 2.
Mục giao dịch giữ nguyên. Badge đếm gồm mọi mục đang mở.

### 4.2 Trang link `/giai-dau/moi/[token]` (FRD-05)

| Trạng thái | Nội dung | Hành động |
|---|---|---|
| Chưa đăng nhập | (server redirect) trang đăng nhập CLB, dòng "Đăng nhập CLB để mở lời mời giải" | Sau đăng nhập quay lại link |
| Đang kiểm | Khung xương | — |
| Sai CLB (403) | "Link mời này dành cho một CLB khác" + "Bạn đang đăng nhập: {currentClubName}". **Không** tên giải, không CLB chủ nhà | `Đăng xuất & đăng nhập CLB khác` (xoá phiên rồi về đăng nhập với `next`), `Về trang chủ` |
| Không phải quản trị (403) | "Cần tài khoản quản trị CLB để trả lời lời mời" | `Đăng nhập bằng quyền quản trị` |
| Link hỏng / thu hồi (404) | "Link mời không hợp lệ hoặc đã bị thu hồi" | `Mở hộp lời mời` |
| Hết hạn (410) | "Đăng ký của giải này đã đóng" | `Xem lời mời` → `/giai-dau/loi-moi/{invitationId}` (chỉ đọc) |
| Hợp lệ | — | `router.replace('/giai-dau/loi-moi/{invitationId}')` |

### 4.3 Hộp lời mời `/giai-dau/loi-moi` (FRD-04)

Thẻ mỗi lời mời: tên giải, CLB chủ nhà, ngày + giờ + địa điểm, chip trạng thái, "Hạn mức 3 cặp · đã gửi 0", hạn chót còn
lại ("Còn 2 ngày"), nút theo trạng thái (`Trả lời`, `Đăng ký cặp`, `Sửa danh sách`, `Xem`, `Xem trang giải` khi đã chốt
và có `publicUrl`). Nhóm: "Cần bạn xử lý" / "Đang diễn ra" / "Đã xong". Trống: "Chưa có lời mời nào. Khi CLB khác mời, lời
mời sẽ hiện ở đây và trong chuông thông báo."

### 4.4 Chi tiết + đăng ký cặp `/giai-dau/loi-moi/[id]` (FRD-06, ưu tiên 390px)

- Đầu trang: tên giải, "CLB Test 23.9.2026 mời CLB bạn", ngày/giờ/địa điểm, thể thức ("Vòng bảng → Loại trực tiếp"),
  "Hạn mức 3 cặp", hạn chót, lời nhắn của chủ nhà.
- `invited`: hai nút `Nhận lời` / `Từ chối` (xác nhận).
- `accepted` / `changes_requested`: banner lý do (Cần sửa, amber) nếu có; **Chọn thành viên** (danh sách thành viên đang
  hoạt động của CLB mình, tìm theo tên, người thiếu hồ sơ thi đấu hiện nhãn "Chưa có hồ sơ" và không chọn được);
  **Ghép cặp** — chạm đúng hai người chưa ghép rồi "Ghép cặp" (bất biến §3.3, không kéo-thả); cặp có nút "Tách"; bộ đếm
  "2/3 cặp" (vượt hạn mức: đỏ, vẫn lưu nháp được); người lẻ: blocker kèm hai lựa chọn "Chọn thêm một người" / "Bỏ chọn
  người lẻ" (không dự bị). Thanh dính đáy: `Lưu nháp` · `Gửi danh sách` (khoá khi còn blocker). Không có ô "khách mời".
- `roster_submitted`: danh sách chỉ đọc "Chờ chủ nhà duyệt" + `Rút lại để sửa`.
- `approved`: "Đã duyệt · 3 cặp" + `Rút khỏi giải` (xác nhận) khi cửa sổ mở.
- Cửa sổ đóng: banner "Đăng ký đã đóng (…)", mọi nút sửa khoá. Đã chốt: "Giải đã chốt lịch" + `Xem trang giải`.
- Xung đột version: banner "Danh sách vừa được lưu ở máy khác" + `Tải bản mới nhất`. Rời trang khi chưa lưu: hộp xác nhận
  như OPS-03.

### 4.5 Đăng nhập quay lại (`app/page.js`)

`?dang-nhap=clb` mở hộp "Tham gia/đăng nhập CLB" (hộp `join` hiện có). Có `next` hợp lệ (`safeNextPath`) → sau khi đăng
nhập `router.push(next)` thay `redirectTo`; dòng phụ trong hộp: "Đăng nhập để mở lời mời giải". `next` sai → bỏ qua, hành
vi cũ. Đã đăng nhập sẵn và vào `/?dang-nhap=clb&next=…` → hiện hộp đăng nhập (để đổi CLB), không tự chuyển.

## 5. Bàn điều hành (FRD-07)

- `ClubChip` cạnh tên cặp ở BXH cặp, sơ đồ nhánh, danh sách trận và thẻ sân (một chấm màu + tên CLB rút gọn ≤ 14 ký tự,
  tên đầy đủ trong `title`). Giải nội bộ: không render chip.
- `ClubStandingsCard` phía trên BXH cặp khi giải friendly: 2 CLB → khối đối đầu lớn "CLB Test 23.9.2026 **5 – 4** CLB
  Test Responsive UI" (số trận thắng liên CLB) + dòng phụ "Hiệu số điểm +12 · 9/9 trận liên CLB đã đấu"; ≥ 3 CLB → bảng
  hạng, CLB, trận, thắng–thua, hiệu số. Chú thích: "Chỉ tính trận giữa hai CLB khác nhau. Không tính vào xếp hạng CLB."
- Dữ liệu: `getFriendlyStandings(tournamentId)`; tải lại cùng nhịp với BXH cặp.

## 6. Trang công khai (FRD-08)

- Đầu trang: nhãn "Giao hữu liên CLB" + "CLB A × CLB B" (≥ 3 CLB: "Giao hữu 3 CLB" + dãy chip).
- Chip CLB cạnh cặp ở Đang đấu / Sắp tới / Kết quả / Sơ đồ.
- Tab "Xếp hạng": đoạn chuyển "Cặp · CLB"; "CLB" hiện `ClubStandingsCard` chế độ chỉ đọc.
- Dữ liệu từ khối `friendly` của `GET /api/tournament-v2/public` (F2 §7.2). Giải nội bộ không đổi.

## 7. Văn bản giao diện

Toàn bộ tiếng Việt có dấu; không "pending", "invited", "roster". Nhãn trạng thái lấy từ `statusLabel` của API, câu lỗi từ
`error` của API (đã tiếng Việt qua `setupMessages`) — UI không tự dịch mã.

## 8. Test node — `tests/stitch-setup/epic-3/f3-ui-contract.test.js`

Đọc mã nguồn (như `epic-2/ui-contract.test.js`):

- Không file UI mới nào import `@supabase`/`supabaseAdmin`; mọi fetch mới đi qua `lib/tournamentV2Client.js`.
- `FriendlyClubsPanel` render nút "Mời CLB" với `disabled` theo `limit.reached` và hiện `upgradeHint` — không so số `1` cứng.
- `InviteLinkDialog` không lưu token vào `localStorage`/`sessionStorage`.
- `app/giai-dau/moi/[token]/page.js` redirect khi không có phiên; nhánh `FRIENDLY_INVITE_WRONG_CLUB` không đọc/hiện
  `tournament`/`hostClub`.
- `app/page.js` dùng `safeNextPath` (không `router.push(next)` thô).
- `PhNotificationBell` còn nguyên đường `unassigned_transaction` ("Gán cho thành viên"), mục khác đi theo `display`.
- `GuestRosterEditor` không có nút/ô khách mời; ghép cặp qua chọn đúng hai người (không `draggable`).
- Chuỗi hiển thị trong các file mới không chứa từ tiếng Anh cấm (`pending`, `invited`, `roster`, `Match #`).
- Class chỉ dùng tiền tố `fr-`, `li-`, token CSS từ DESIGN.md (không mã màu lạ ngoài `CLUB_COLORS`).

Hồi quy: `npm run test:stitch-setup` toàn bộ + `npm run build` xanh.

## 9. Nghiệm thu browser (người dùng, D45) — G1 chạy tới cuối

**Chuẩn bị:** README §11 câu 1 đã trả lời (CLB khách, mật khẩu admin). CLB 59 có ≥ 8 thành viên có hồ sơ thi đấu; CLB
khách có ≥ 6. Hai cửa sổ trình duyệt (một cửa sổ ẩn danh). Ảnh chụp lưu `_workspace/epic-3-friendly/evidence/`.

| # | Ai / màn | Thao tác | Kỳ vọng |
|---|---|---|---|
| 1 | 59, desktop | Tạo giải → "Giao hữu liên CLB", tên "Giao hữu E3 G1", ngày, giờ | Bước 1 lưu; ô loại giải chỉ đọc |
| 2 | 59, Bước 2 | Chọn 8 thành viên; "Mời CLB" → tìm CLB khách → hạn mức 3 → Gửi | Dialog link; khối hiện "Đã mời 1/1 CLB khách", CLB khách "Chờ phản hồi" |
| 3 | 59 | Mở lại "Mời CLB" | Nút khoá + câu gói trả phí (G1-limit). (Agent kiểm thêm bằng `fetch` trong console: POST `/clubs` CLB thứ hai → 409 `FRIENDLY_CLUB_LIMIT_REACHED`) |
| 4 | 59 | Hạn chót = ngày mai 23:59 | "Đang mở · hạn …" |
| 5 | Cửa sổ ẩn danh | Dán link mời | Chuyển tới đăng nhập "Đăng nhập để mở lời mời giải" |
| 6 | Ẩn danh | Đăng nhập admin CLB khách | Quay lại link → trang chi tiết lời mời (G1-link) |
| 7 | Cửa sổ 59 | Dán cùng link | "Link mời này dành cho một CLB khác", **không** thấy tên giải/CLB chủ nhà |
| 8 | Khách, **390px** | Chuông có mục "…mời CLB bạn dự giải" → Xem lời mời → Nhận lời | Chuông giảm 1; màn đăng ký cặp |
| 9 | Khách, 390px | Chọn 6 người, ghép 3 cặp, Lưu nháp, tải lại trang, Gửi danh sách | Nháp còn nguyên sau tải lại; "Chờ chủ nhà duyệt" |
| 10 | 59 | Chuông "…gửi 3 cặp" → Duyệt → Yêu cầu sửa "Đổi cặp 2" | CLB khách "Cần sửa" |
| 11 | Khách | Chuông "Chủ nhà yêu cầu sửa…" → đổi cặp 2 → Gửi lại | "Chờ duyệt" |
| 12 | 59 | Duyệt | "Đã duyệt · 3 cặp"; chuông 59 hết mục |
| 13 | 59 | Khoá đăng ký | Khách: banner "Đăng ký đã đóng", nút sửa khoá; mở link → "Đăng ký của giải này đã đóng" + "Xem lời mời" |
| 14 | 59, Bước 3 | Ghép 4 cặp của mình; chọn Vòng bảng → loại trực tiếp, 2 bảng × 2 suất, không tranh hạng ba; 2 sân | "7 cặp (4 của bạn + 3 của CLB khách)", cặp khách chỉ đọc có chip |
| 15 | 59, Bước 4 | Bốc thăm | Bảng A = 2 cặp 59 + 2 cặp khách, Bảng B = 2 + 1; 2 cảnh báo rải CLB có tên; ghi chú link công khai |
| 16 | 59 | Chốt giải | Vào bàn điều hành; **12 trận** (9 vòng bảng + 2 bán kết + 1 chung kết); giải có link "không liệt kê" |
| 17 | 59, Điều hành | Nhập 9 trận vòng bảng (một trận xử thắng W.O.) | Thẻ "việc tiếp theo" → Chốt vòng bảng & vào loại trực tiếp |
| 18 | 59 | Nhập 2 bán kết, chung kết → Kết thúc giải | Giải "Đã kết thúc" |
| 19 | 59, Sơ đồ & xếp hạng | Xem BXH | BXH cặp có chip CLB; thẻ đối đầu CLB: thắng(59) + thắng(khách) = số trận liên CLB đã đấu; sau vòng bảng mỗi CLB "đã đấu" 6; trận nội bộ không tính |
| 20 | Trang công khai, 390px + desktop | Mở link | "CLB Test 23.9.2026 × {CLB khách}", chip CLB, tab Xếp hạng "Cặp · CLB" |
| 21 | Khách | Hộp lời mời | "Đã chốt · Xem trang giải" mở đúng trang công khai |
| 22 | 59 | Mở một giải nội bộ cũ (vd 220) | Không có chip/khối CLB; mọi mục như trước |

Ca âm chạy thêm nếu có thời gian (không chặn merge): G3 (bốc thăm khi khách còn "Chờ duyệt" → blocker ở Bước 3), G5 (hai
tab khách cùng lưu → banner xung đột), G1-link với phiên **thành viên** (không phải admin) của CLB khách → "Cần tài khoản
quản trị CLB…" (cần mật khẩu thành viên của CLB khách).

## 10. Không làm ở F3

Trang nâng cấp gói/thanh toán (chỉ câu gợi ý); thông báo đẩy/Zalo; sửa hộ danh sách khách; tùy biến màu CLB; ảnh logo CLB
trong danh sách mời (chỉ chữ cái đầu).
