# ADR-007 — Quyết định roadmap module giải đấu sau đợt Stitch

Ngày: 2026-09-24 · Trạng thái: đã chốt với người dùng (AskUserQuestion, 2 vòng) · Tiếp nối ADR-005 (D1–D12)

Bối cảnh: Lát 0/A/B/C (vòng bảng → loại trực tiếp, vòng tròn, loại trực tiếp) đã lên production và người dùng
đã duyệt. Roadmap chi tiết: `docs/superpowers/plans/2026-09-24-tournament-roadmap.md`.

| Mã | Quyết định | Lý do |
|---|---|---|
| D13 | Thứ tự: **Double elimination → Tối ưu điều hành → Giao hữu liên CLB → Giải cộng đồng → MLP** | DE nhỏ nhất, dùng lại toàn bộ pipeline v4 và cho biết màn điều hành cần gì (nhánh W/L/GF). MLP đổi đơn vị thi đấu sang đội ở mọi tầng và hợp với giải liên CLB, nên làm sau khi mô hình nhiều CLB ổn định |
| D14 | DE **không đá lại** chung kết tổng (không bracket reset). Chung kết tổng chọn BO như `F` hiện nay; mọi trận khác BO1 (giữ D8) | Tránh trận kích hoạt theo điều kiện và hàm SQL mới |
| D15 | DE nhận **4–32 cặp, có bye** | Linh hoạt như loại trực tiếp. Hệ quả: phải thu gọn nhánh thua khi nguồn là bye — không được sinh trận chỉ có một bên (giữ D12) |
| D16 | Điều hành: **thiết kế Stitch trước**, rồi mới chia lát code. Phần thiết kế được làm song song khi đang code DE | Đợt setup cho thấy có thiết kế chuẩn thì code ít lệch |
| D17 | Giao hữu: **chỉ ghép cặp trong cùng CLB** | Mỗi cặp đại diện một CLB; xếp hạng theo CLB rõ ràng |
| D18 | Giao hữu: **admin CLB khách tự đăng ký** thành viên của mình trong hạn mức; CLB chủ nhà duyệt | Đúng ranh giới dữ liệu giữa các CLB (multi-tenant) |
| D19 | Giải cộng đồng: VĐV **bắt buộc có tài khoản VĐV PickHub** (`athlete_accounts`); chỉ admin cấp hệ thống (`platform_accounts`) tạo giải | Danh tính sạch, tính được xếp hạng. Lưu ý: `platform_accounts` hiện 0 dòng — cần quy trình cấp tài khoản admin hệ thống |
| D20 | MLP bản đầu **không ràng buộc giới tính**: đội tự xếp cặp từng ván con, có dreambreaker | `club_members`/`athletes` chưa có cột giới tính; engine `match/mlp.js` đã hỗ trợ kiểu "vòng/cặp" |

Các câu hỏi còn để ngỏ, chốt ở vòng brainstorm của từng việc: xem mục "Câu hỏi mở" của từng epic trong roadmap.

## Bổ sung — Epic 1 (loại kép), brainstorm 2026-09-24

Chốt bằng AskUserQuestion (người dùng chọn cả bốn phương án đề xuất). Spec: `docs/superpowers/specs/2026-09-24-epic-1-double-elim/`.

| Mã | Quyết định | Lý do |
|---|---|---|
| D21 | Tên vòng: `Nhánh thắng · Vòng r` / `Bán kết nhánh thắng` / `Chung kết nhánh thắng`; `Nhánh thua · Vòng r` / `Chung kết nhánh thua`; `Chung kết tổng`. Mã nội bộ `W<r>-<ô>`, `WF`, `L<r>-<ô>`, `LF`, `GF` | Dễ hiểu với VĐV phong trào; mã ngắn chỉ dùng nội bộ |
| D22 | Không trận tranh hạng ba. Hạng 3 = thua `LF`; hạng 4 = thua trận nhánh thua ngay trước `LF`; còn lại đồng hạng theo vòng bị loại ở nhánh thua (5–6, 7–8, 9–12…) | `LF` đã phân hạng 3 tự nhiên; không thêm trận/nhánh bất biến |
| D23 | Chống gặp lại sớm: người thua nhánh thắng từ vòng 2 được thả sang nửa đối diện nhánh thua (bảng hoán vị cố định theo số trận vòng nhận) | Engine thả 1:1 nên có thể tái đấu ngay đối thủ vừa gặp |
| D24 | Epic 1 deploy qua nhánh + PR nháp: agent apply migration (ROLLBACK trước, md5 sau) và kiểm thử tích hợp; người dùng chạy browser CLB 59 rồi merge | Người dùng giữ quyền quyết định lên production |

## Bổ sung — Epic 2 (tối ưu điều hành), brainstorm 2026-09-24

Chốt bằng AskUserQuestion. Brief thiết kế: `_workspace/epic-2-operations/01_stitch_brief.md`.

| Mã | Quyết định | Lý do |
|---|---|---|
| D25 | Giữ D16: màn điều hành làm trên **Stitch** theo brief (không mockup HTML tự dựng); chỉ chia lát code sau khi màn có ở `canonical/operations/`. Cập nhật cùng ngày: người dùng kết nối Stitch connector và yêu cầu agent tương tác trực tiếp → agent sinh OPS-01…07 | Nhất quán với bộ setup đã duyệt |
| D26 | Lát đầu Epic 2 là **trung tâm điều hành theo sân/lượt**, gom luôn các nợ liên quan (ô chờ theo nguồn, bỏ ô BO theo lượt, lỗi phiên bản trận sau tiến cấp, chặn Back khi chưa lưu) | Người dùng ưu tiên màn chạy giải trong ngày |
| D27 | Deploy Epic 2 như D24: nhánh + PR nháp, agent apply migration (nếu có) và kiểm thử tích hợp; người dùng chạy browser CLB 59 rồi merge | Người dùng giữ quyền lên production |
| D28 | Phạm vi nợ = danh sách đã ghi trong roadmap mục Epic 2; không thêm lỗi mới ở vòng này | Người dùng xác nhận |
| D29 | Bàn điều hành sau khi chốt còn **4 mục**: `Điều hành` (mặc định; gộp trung tâm điều hành + sân + nhập tỉ số) · `Trận đấu` · `Sơ đồ & xếp hạng` · `Cài đặt` (thông tin, link/chia sẻ, sân, vùng nguy hiểm, nhật ký). Bỏ bước Cấu hình / VĐV & cặp / Bốc thăm khỏi sidebar (đã có workspace setup 4 bước); mobile dùng thanh tab đáy | So sánh Sportix (`_workspace/epic-2-operations/02_sportix_benchmark.md`); BTC dùng chính mục Điều hành |
| D30 | Trang công khai giữ **4 tab** như OPS-07: Trực tiếp · Lịch · Xếp hạng · Sơ đồ | Người dùng chọn |
| D31 | Không làm "Nhánh Bạc" (nhánh an ủi). Sơ đồ nhánh thắng/thua theo OPS-05 | Người dùng chọn |
| D32 | Epic 2 **không** làm link cho trọng tài nhập điểm bằng điện thoại (API `score-tokens` giữ nguyên, không giao diện) | Người dùng chọn |
| D33 | Hàng chờ chỉ có nút **"Gọi vào sân…"** (chọn sân trống), không kéo-thả | Người dùng chọn |

## Bổ sung — nghiệm thu Epic 2 lát E1 (2026-09-24)

Người dùng chạy thật một giải vòng bảng → loại trực tiếp trên CLB 59 (giải 220) tới hết: luồng nghiệp vụ hoàn tất
100%, giao diện chưa đạt. Chốt bằng AskUserQuestion. Spec: `docs/superpowers/specs/2026-09-24-epic-2-operations/lat-e1-1-sua-sau-nghiem-thu.md`.

| Mã | Quyết định | Lý do |
|---|---|---|
| D34 | Luật tỉ số một ván: **bên nhiều điểm hơn thắng**. Chỉ chặn hoà, số âm, số lẻ; bỏ kiểm mốc tới / cách / trần ở server (`games`, `corrections`) và sheet nhập tỉ số. `points_to` còn dùng cho tỉ số W.O. (096) | Nhiều giải đánh 15 thắng cách 2 nên có 17–15; giải phong trào không cố định 11/15/21 |
| D35 | Khi mọi trận của một chặng đã chốt, mục **Điều hành** hiện thẻ "việc tiếp theo": BXH tóm tắt (suất đi tiếp) + nút "Chốt … & vào …" / "Kết thúc giải & chốt xếp hạng", bấm hai lần để xác nhận. Nút cũ ở "Sơ đồ & xếp hạng" giữ nguyên, dùng chung `stageAction.js` | Phải sang mục khác để tiến vòng là không hợp lý; vẫn cần bước xem lại khi đồng điểm |
| D36 | "Kết thúc giải" ở cả hai lối vào chuyển giải sang `completed` qua PATCH `tournaments` (vòng đời `live → completed`, ghi hạng chung cuộc). Giải đã chốt hết chặng nhưng còn `live` (vd 220) có nút "Kết thúc giải" riêng | Giải 220 xong 15/15 trận mà vẫn "Đang diễn ra" |
| D37 | Giải setup v4 **không có "Huỷ chốt lịch"** trong Cài đặt (2026-09-25, người dùng chốt sau nghiệm thu E2). `unlock_tournament_draw` chỉ dùng cho giải cũ | Huỷ từng stage làm lệch tuyến đi tiếp và bản nháp setup 4 bước |

## Bổ sung — Epic 3 (giao hữu liên CLB), brainstorm 2026-09-25

Chốt bằng AskUserQuestion, 2 vòng (người dùng chọn cả tám phương án đề xuất). Worktree `ranking-epic3`, nhánh `epic-3-friendly` từ `origin/main` `ae59fc3`.
Preflight DB (2026-09-25): `tournament_clubs` 22 dòng, **0** dòng liên CLB (`club_id <> group_id`); `tournament_registrations` 0; `tournament_external_clubs` 0 → không có dữ liệu cũ cần tương thích.

| Mã | Quyết định | Lý do |
|---|---|---|
| D38 | Hạn mức CLB khách tính theo **số cặp**. Admin CLB khách chọn thành viên của mình, **tự ghép cặp** (chạm hai người như Bước 2), gửi danh sách; chủ nhà **duyệt** hoặc **yêu cầu sửa** (không sửa hộ). Chỉ thành viên CLB — **không khách mời** trong đội CLB khách | Đúng D17/D18; ranh giới dữ liệu rõ, CLB nào chịu trách nhiệm danh sách của CLB đó |
| D39 | Bản đầu **chỉ mời CLB có trên PickHub**; CLB ngoài hệ thống (`tournament_external_clubs`) để epic sau | D18 cần admin CLB khách tự đăng ký |
| D40 | BXH: giữ **BXH cặp** (gắn tên/màu CLB cạnh cặp) + thêm **bảng tổng hợp theo CLB** (trận thắng, hiệu số; tái dùng `aggregateClubStandings`) | Giải giao hữu cần thấy CLB nào mạnh hơn mà không đổi luật xếp hạng cặp |
| D41 | Bốc thăm: **rải đều** cặp cùng CLB ra các bảng / nửa nhánh; không đủ chỗ thì **cảnh báo, không chặn** (tái dùng `distributeEntriesAcrossPools` policy `spread_if_possible`) | Tránh "nội chiến" sớm nhưng không làm kẹt giải ít CLB |
| D42 | Hạn chót đăng ký **tùy chọn**; qua hạn hoặc khi chủ nhà bấm "Khoá đăng ký" thì CLB khách không sửa được. Chốt giải vẫn do chủ nhà bấm | Linh hoạt cho giải phong trào |
| D43 | Kết quả giải giao hữu **không** tính vào xếp hạng nội bộ của CLB nào ở bản đầu | Không đụng hệ ranking từng CLB |
| D44 | UI mới (mời CLB, hộp lời mời của CLB khách, đăng ký cặp, duyệt) làm **Stitch trước** rồi mới chia lát code UI (như D16/D25). Lát domain/API/migration làm song song | Nhất quán với bộ setup/điều hành đã duyệt |
| D45 | Deploy như D24/D27: nhánh + PR nháp; agent apply migration (ROLLBACK trước, md5 sau) và kiểm thử tích hợp; người dùng chạy browser trên CLB 59 (chủ nhà) + một CLB test thứ hai (khách) rồi tự merge | Người dùng giữ quyền lên production |

Phát hiện khi rà: `GET /api/tournament-v2/clubs?mode=available` trả tên mọi `groups`; admin CLB khách chưa có đường nào đọc giải của CLB khác (`access.js` chỉ biết chủ giải / cùng `group_id`). Người dùng trả lời (2026-09-25) → D46, D47.

| Mã | Quyết định | Lý do |
|---|---|---|
| D46 | CLB tổ chức **được thấy danh sách mọi CLB** trên PickHub để chọn mời (giữ `mode=available`, chỉ lọc bỏ chính mình). **Core hỗ trợ mời không giới hạn**, nhưng tài khoản **admin CLB thường chỉ mời tối đa 1 CLB khác mỗi giải**; mời nhiều hơn là quyền lợi của **gói trả phí** (làm sau). Giới hạn kiểm ở **server** qua một điểm quyết định quyền lợi (mặc định 1), không chỉ ẩn nút ở UI; mã lỗi ổn định khi vượt | Mô hình kinh doanh: giao lưu 1–1 miễn phí, mở rộng theo gói |
| D47 | Admin CLB khách nhận lời mời qua **thông báo trong app** (tái dùng `club_notifications`, `kind` mới cho lời mời giải) **và/hoặc link mời**. Mở link **bắt buộc đăng nhập**; server đối chiếu `group_id` của phiên với `club_id` được mời — khớp mới cho xem/đáp lời mời, không khớp thì từ chối (không lộ thông tin giải) | Ranh giới đa CLB: chỉ đúng CLB được mời mới vào được |

Hệ quả: với tài khoản thường, giải giao hữu mặc định là **2 CLB (chủ nhà + 1 khách)** → BXH tổng CLB (D40) là đối đầu hai CLB; rải cặp (D41) vẫn áp dụng. Diễn giải "tối đa 1 CLB mỗi giải" (không phải "1 CLB đang mời cùng lúc trên mọi giải") — xác nhận lại nếu khác.

Chốt câu hỏi mở của spec (`docs/superpowers/specs/2026-09-25-epic-3-friendly/README.md` §11), AskUserQuestion 2026-09-25:

| Mã | Quyết định | Lý do |
|---|---|---|
| D48 | CLB khách nghiệm thu browser: **group 19** "CLB Test Responsive UI" (chủ nhà vẫn là 59). Không đụng group 1 | Người dùng có tài khoản admin; đủ thành viên cho 3 cặp |
| D49 | Giải giao hữu **cấm khách mời ở cả phía chủ nhà** (không chỉ CLB khách như D38): blocker Bước 2 `FRIENDLY_HOST_GUEST_NOT_ALLOWED` + finalize nhánh giao hữu chặn `guests` khác rỗng | Công bằng hai bên; mỗi cặp đại diện đúng CLB |
| D50 | Chốt giải giao hữu đang `private` → **tự chuyển `unlisted`** và sinh `public_slug`; Bước 4 báo trước | Thành viên CLB khách không vào được bàn điều hành CLB khác, cần link xem |

| D51 | Hạn mức CLB khách là **mức tối đa**, không phải số bắt buộc: gửi từ 1 cặp tới `quota` cặp đều hợp lệ (vd hạn mức 10, gửi 6 hay 8 đều được); chỉ vượt mới chặn (`FRIENDLY_QUOTA_EXCEEDED`), 0 cặp chặn (`FRIENDLY_ROSTER_EMPTY`). Luật nằm ở hệ thống (domain + SQL 110 đã đúng), UI không cần giải thích — bộ đếm "x/y cặp" không được ngụ ý phải đủ y (người dùng chốt 2026-09-27) | Giải giao lưu phong trào, CLB khách thường ít người hơn chủ nhà |
| D52 | Người dùng **duyệt giao diện Stitch Epic 3** (FRD-01…08 + FRD-09 "chủ nhà sau khi mời", xem trực tiếp trên Stitch project 16224817196221939744) và cho tiến hành lát F3. Mời xong wizard **không khoá**: chủ nhà làm tiếp Bước 1–3, chỉ Bước 4 chặn tới khi CLB khách gửi và được duyệt; giải là bản nháp trong danh sách giải (2026-09-27) | Chốt thiết kế trước khi code (D44) |
| D53 | Bàn điều hành và trang công khai (Trực tiếp · Lịch · Xếp hạng · Sơ đồ) **giữ nguyên giao diện hiện tại** (Epic 2); giải giao hữu chỉ **bổ sung BXH tổng CLB** (D40) — không làm lại FRD-07/08 theo Stitch ngoài phần bảng CLB (2026-09-27) | Giao diện điều hành vừa nghiệm thu ở Epic 2; giảm phạm vi F3 |
