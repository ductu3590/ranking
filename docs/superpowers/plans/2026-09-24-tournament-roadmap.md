# Roadmap module giải đấu sau đợt Stitch (2026-09-24)

Quyết định: `_workspace/unified-setup-ux/ADR-007-roadmap-decisions.md` (D13–D20), tiếp nối ADR-005 (D1–D12).
Bằng chứng đợt trước: `_workspace/stitch-setup/deploy-1-db.md`. Bất biến: skill `tournament-setup-invariants`.
Tham khảo mã nguồn mở (chỉ học ý tưởng, không chép code): tài liệu trên nhánh nghiên cứu
`origin/claude/tournament-system-research-rplg8t`, file `docs/superpowers/specs/2026-09-19-danh-gia-opensource-giai-dau.md`
(đọc bằng `git show origin/claude/tournament-system-research-rplg8t:docs/superpowers/specs/2026-09-19-danh-gia-opensource-giai-dau.md`).

## 0. Nền tảng đã có (tái dùng, không viết lại)

- **Một nguồn cấu trúc:** `lib/tournament/setupPlans/` (`buildSetupPlan` → builder theo `formatKey`: `group_knockout`, `round_robin`, `knockout`). Preview và finalize cùng gọi; finalize tính lại trên server và so fingerprint.
- **Registry thể thức:** `lib/tournament/setupFormats.js` (bật/tắt, số cặp tối thiểu/khuyến nghị, `validateConfig`).
- **Bản nháp v3:** `lib/tournament/setupDraftV3.js` — `participants` (memberIds, guests), `pairs`, `format { entrantType, formatKey, config }`, `draw`. `format.entrantType` hiện chỉ `'doubles'`; `tournament.organizerMode` hiện chỉ `'internal'`.
- **Chốt giải:** hàm SQL `finalize_internal_setup_v4` (bản mới nhất: migration 107). Kiểm plan khớp bản nháp, có nhánh bất biến riêng cho từng thể thức; ghi VĐV (khách = VĐV riêng của giải), cặp, entry, stage, trận, tuyến đi tiếp tường minh (`tournament_stage_transitions`).
- **Tiến cấp khi thi đấu:** `replace_tournament_games_with_transitions` (068) tự điền cặp thắng/thua theo cạnh `match_outcome`; `advance_division_group_rank_transitions_v2` (103) cho vòng bảng; `advance_division_entry_stage` (sửa ở 106) để kết thúc chặng cuối.
- **Luật điểm:** mọi stage v4 mang `config.scoring` (`STAGE_SCORING` = phong_trao_11, BO1); chỉ `F` ghi đè BO qua `config.match_scoring.F` (D8).
- **Xếp hạng:** `computeStageStandings` (standingsService) — nhánh loại trực tiếp gắn nhãn qua `knockoutPlacementLabels`.
- **Engine có sẵn chưa nối vào luồng mới:** `engines/doubleElim.js` (nhánh W/L/GF, `loser_to_slot`, `config.grandFinalReset`), `match/mlp.js` + `match/mlpPairs.js` + `match/team.js`, preset `mlp_4_van`.
- **Hạ tầng liên CLB/cộng đồng có sẵn từ v2 (cần rà lại trước khi dùng):** `lib/tournament/interclub.js`, `lib/tournament/openRegistration.js`, bảng `tournament_clubs` (mời, hạn mức), `tournament_registrations`, `tournament_registration_members`, `tournament_pair_invites`, `tournament_external_clubs`, `athlete_accounts` (tài khoản VĐV), `platform_accounts` + `platform_sessions` (**0 dòng**).
- **Test:** `npm run test:stitch-setup` (lat-0/a/b/c). Kiểm thử tích hợp SQL dạng rollback: `scripts/qa/stitch-lat-c-integration.js`.

## 1. Quy tắc làm việc chung (áp cho mọi epic)

1. **Mỗi epic một session + một worktree tách từ `origin/main` mới nhất.** Chia lát như A/B/C; mỗi lát: test xanh → chạy thật trên browser (CLB test group 59, người dùng tự đăng nhập) → commit → merge `origin/main` → `git push origin HEAD:main` → xác nhận Vercel → cập nhật `_workspace/stitch-setup/deploy-1-db.md` (hoặc file bằng chứng của epic).
2. **`finalize_internal_setup_v4` chỉ sửa tuần tự.** Migration mới luôn dựng từ bản mới nhất (hiện là 107) và có test khóa "chỉ khác bản trước ở các điểm X" (mẫu: `tests/stitch-setup/lat-c/api-contract.test.js`). Không hai epic cùng sửa hàm này song song.
3. **Số migration:** lấy số kế tiếp tại thời điểm apply; kiểm `ls database/migrations` trên `origin/main` trước khi đặt số (đã từng có hai file 089).
4. **Apply migration:** kiểm trước bằng transaction ROLLBACK khi có thể; sau khi apply, so `md5(prosrc)` với thân hàm trong file. Không DROP/TRUNCATE/xóa dữ liệu thật.
5. **Chạy thật tới cuối giải**, không dừng ở bước chốt: nhập hết tỉ số, kết thúc chặng, xem BXH và trang công khai (các lỗi 062, BO3 mặc định, nhãn BXH đều chỉ lộ ra ở cuối luồng).
6. **Giải test giữ lại** trong CLB 59 (người dùng đồng ý giữ). Giải 204 thuộc CLB thật (group 1) — không đụng.
7. Sửa test cũ phải ghi lý do vào `_workspace/unified-setup-ux/ADR-006-retire-v2-wizard-tests.md` (mục bổ sung theo epic).

## 2. Các epic theo thứ tự (D13)

### Epic 1 — Double elimination (~1–1,5 lát)

- **Phạm vi:** thể thức `double_elimination` trong registry; builder `setupPlans/doubleElim.js` dùng `engines/doubleElim.js` với `grandFinalReset: false` (D14); 4–32 cặp có bye (D15); chung kết tổng chọn BO, còn lại BO1; migration mở `finalize_internal_setup_v4` + nhánh bất biến DE; Bước 3/4 (cấu hình, sơ đồ nhánh W/L/GF); bàn điều hành: sơ đồ + xếp hạng + kết thúc giải.
- **Thiết kế:** matchKey gợi ý `W<vòng>-<ô>`, `L<vòng>-<ô>`, `WF`, `LF`, `GF` (chốt trong spec). Cạnh `match_outcome` winner đi tiếp trong nhánh, loser từ nhánh W rơi xuống nhánh L. Nhánh bất biến SQL: mỗi ô hoặc có cặp hoặc đúng một tuyến; mọi trận trừ GF có đúng một cạnh thắng đi ra; mọi trận nhánh W có đúng một cạnh thua đi ra (trừ khi thu gọn do bye); không cạnh thua nào ra khỏi nhánh L.
- **Rủi ro chính:** thu gọn nhánh thua khi nguồn là bye (engine hiện để trống nguồn → trận một bên). Cần thuật toán thu gọn và test đủ n = 4..32. Tiến cấp tự động qua 068 phải xử lý được chuỗi: thắng nhánh W → xuống L đúng ô.
- **Câu hỏi mở:** tên hiển thị vòng nhánh thua; xếp hạng 3/4 theo LF; có tranh hạng ba không (thường không, vì LF đã phân hạng 3).
- **Song song được:** brief + thiết kế Stitch cho Epic 2 (chỉ thiết kế, không code).

### Epic 2 — Tối ưu điều hành giải (~2–3 lát, sau thiết kế Stitch)

- **Bước 0 (song song với Epic 1):** soạn brief thiết kế và làm màn điều hành trên Stitch; lưu vào `_workspace/stitch-internal-setup/canonical/` (cạnh bộ setup, DESIGN.md là chuẩn token).
  Brief đã soạn (2026-09-24): `_workspace/epic-2-operations/01_stitch_brief.md` — tối thiểu OPS-01/02/03 để bắt đầu lát E1 (D25–D28).
- **Lát gợi ý:** trung tâm điều hành theo sân/lượt; nhập tỉ số + BO theo **từng trận** (bỏ ô chọn BO theo vòng với stage v4 — trái D8); một component sơ đồ nhánh dùng chung (single / W-L-GF / tranh hạng ba tách khỏi "Chung kết"); BXH + trang công khai; chặn nút Back khi có thay đổi chưa lưu.
- **Nợ đã biết:** ô chờ hiện "Đội A / Đội B"; BRONZE bị gộp vào nhóm "Chung kết"; `koLabel` fallback còn sai cho dữ liệu không có `label`.
- **Nợ ghi nhận khi người dùng chạy thử Epic 1 (loại kép):** tab Kết quả của stage `double_elim` vẫn hiện ô chọn BO1/BO3/BO5 theo "Lượt" (trái D8/D14 — đúng mục "bỏ ô chọn BO theo vòng" ở trên); thẻ trận báo "Dữ liệu trận đã thay đổi, hãy tải lại." khi lưu tỉ số — nghi do 068 tăng `version` của trận đích lúc điền cặp tiến cấp trong khi thẻ còn giữ `version` cũ (cần xác minh, rồi tải lại trận sau mỗi lần định tuyến). Người dùng sẽ liệt kê thêm các lỗi nhỏ khác khi bắt đầu Epic 2.

### Epic 3 — Giải giao hữu liên CLB (~2 lát)

- **Phạm vi:** `organizerMode: 'friendly'`; CLB chủ nhà tạo giải và mời CLB (hạn mức); **admin CLB khách tự đăng ký** thành viên của mình (D18); **cặp chỉ trong cùng CLB** (D17); chủ nhà duyệt; chốt giải qua cùng pipeline plan → finalize (hàm SQL kiểm thành viên theo đúng group của từng CLB).
- **Thiết kế:** bản nháp v3 thêm chiều CLB cho người tham gia/cặp (hoặc tách phần đăng ký của CLB khách thành bảng đăng ký riêng, bản nháp của chủ nhà chỉ tham chiếu). Quyền truy cập chéo CLB qua `requireTournamentAccess` + scope `group_id`; rà lại `interclub.js`.
- **Rủi ro:** bảo mật đa CLB (RLS, không lộ danh sách thành viên CLB khác), cạnh tranh ghi khi nhiều CLB đăng ký cùng lúc.
- **Câu hỏi mở:** BXH theo CLB (tổng điểm CLB?); giải có tính vào xếp hạng CLB từng bên không; hạn chót đăng ký.

### Epic 4 — Giải cộng đồng (~2–3 lát)

- **Phạm vi:** chỉ admin hệ thống (`platform_accounts`) tạo; VĐV **bắt buộc tài khoản VĐV PickHub** (D19); form đăng ký công khai, rủ ghép cặp (`tournament_pair_invites`), admin duyệt; chốt qua pipeline chung.
- **Tiền đề:** quy trình cấp tài khoản admin hệ thống (hiện 0 dòng, không có đăng ký công khai); rà luồng tài khoản VĐV (`athlete_accounts`, `lib/athleteSession.js`).
- **Rủi ro:** cao nhất — dữ liệu cá nhân, spam, trùng danh tính, rate limit.
- **Câu hỏi mở:** lệ phí (để sau hay có QR SePay); giới hạn số cặp; hiển thị công khai danh sách đăng ký.

### Epic 5 — MLP (~2–3 lát)

- **Phạm vi:** `format.entrantType: 'mlp_team'`; Bước 3 "ghép đội"; cấu hình số ván con + dreambreaker (preset `mlp_4_van`); đội hình từng trận trên bàn điều hành; **không ràng buộc giới tính** (D20).
- **Thiết kế:** thể thức lịch (vòng tròn / vòng bảng → loại trực tiếp / loại trực tiếp) giữ nguyên; MLP là trục `match_format` của stage. Hàm finalize thêm nhánh cho entry đội (không còn "mỗi cặp hai người").
- **Câu hỏi mở:** số người mỗi đội (4 cố định hay 4–6 có dự bị trong đội); xếp hạng theo trận đội hay theo ván con; MLP trong giải giao hữu (đội = CLB).

## 3. Prompt mở session mới

Mẫu chung (thay `<EPIC>`):

```
Làm Epic <EPIC> theo roadmap docs/superpowers/plans/2026-09-24-tournament-roadmap.md
(quyết định: _workspace/unified-setup-ux/ADR-007-roadmap-decisions.md).
Dùng skill tournament-orchestrator + tournament-setup-invariants. Trước khi code:
brainstorm chốt các "câu hỏi mở" của epic bằng AskUserQuestion, rồi viết spec chia lát
vào docs/superpowers/specs/. Làm theo "Quy tắc làm việc chung" mục 1 của roadmap.
```
