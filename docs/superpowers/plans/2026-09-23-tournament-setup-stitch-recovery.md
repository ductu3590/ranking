# Kế hoạch phục hồi Unified Internal Tournament Setup theo Stitch

**Trạng thái: CHỜ NGƯỜI DÙNG PHÊ DUYỆT (bản sửa lần 2 sau review 2026-09-23)**

Tài liệu này chỉ là plan. Trước khi người dùng duyệt rõ ràng, không tạo spec, ADR, contract delta, migration, test mới hoặc sửa code.

## 1. Baseline và phạm vi

- Branch recovery: `feat/tournament-setup-stitch-recovery`; worktree `C:\Users\ductu\ranking-unified-setup-stitch-recovery`; base `29e33c6`.
- Snapshot `C:\Users\ductu\ranking-unified-setup-ux` giữ nguyên làm nguồn audit; không reset, stash, xóa hoặc gộp thay đổi chưa hiểu rõ.
- Không dùng `943e539` làm base vì production đã có migration/RPC unified setup mới hơn.
- **`29e33c6` cũng cũ hơn production** (đã xác minh read-only ngày 2026-09-23 trên project `uhhlelemewilgsdijwja`):
  - `098_generalize_internal_doubles_finalize.sql` (chỉ có trong snapshot): SHA-256 định nghĩa hàm `finalize_internal_doubles_group_knockout_v2` trên production = `83b5076f…792ee`, khớp `migration098-verification.json`.
  - `097_fix_aggregate_draft_v3_roundtrip.sql` (chỉ có trong snapshot): comment của `save_unified_setup_aggregate_draft` trên production khớp dòng 54 của file → đã apply.
  - Snapshot còn sửa trực tiếp `091`/`094`; chưa xác định production đang ở bản nào.
- Phạm vi: giải nội bộ CLB, đánh đôi. Không đưa giao hữu liên CLB, MLP, double-elimination, PDF, upload áp phích, seed/hash công khai hoặc DUPR vào surface này.
- Dùng lại engine có sẵn (`lib/tournament/engines/`, `orchestrator.js`, `stagePlan.js`, `rules/roundScoring.js`); không viết engine mới. Việc thiếu nằm ở đường preview + finalize nguyên tử của unified setup, hiện chỉ nhận `group_knockout` 2 bảng × lấy 2, tối thiểu 4 cặp, và chỉ nhận thành viên CLB.

### Quyết định đã chốt với người dùng (2026-09-23)

| Vấn đề | Quyết định |
|---|---|
| Migration 097/098 | Mang từ snapshot sang và commit như tài liệu hiện trạng production. Không sửa 091/094; lệch thì ghi vào migration mới (099+). |
| 34 file chưa commit ở snapshot | Lập bảng diff từng file: `mang sang` / `làm lại` / `bỏ`; chỉ mang phần đã hiểu rõ và có test. |
| Nguồn Stitch | Copy vào `_workspace/stitch-internal-setup/` của nhánh recovery kèm manifest SHA-256 và commit. |
| Skill `tournament-setup-invariants` | Mang từ snapshot sang; sửa dòng 67 (bỏ dự bị) và bổ sung quy tắc mới trong cùng ADR. |
| Cấu trúc triển khai | Lát dọc theo thể thức; **một RPC finalize mới dùng chung**, rẽ nhánh theo `formatKey`. RPC v2/v3 giữ nguyên, không sửa. |
| Phát hành thể thức | Theo từng lát: vòng bảng → loại trực tiếp, rồi vòng tròn, rồi loại trực tiếp. Thể thức chưa xong hiện thẻ khóa `Sắp có` và server từ chối. |
| Số bảng | 2–4 bảng, lấy 1–2 cặp mỗi bảng; tổng vào vòng loại trực tiếp phải là 4 hoặc 8, thiếu thì bù bằng cặp xếp kế tiếp tốt nhất (vd 3 bảng × 2 + 2 hạng ba tốt nhất = 8). Không dùng BYE. |
| So cặp giữa các bảng lệch số cặp | Tỉ lệ thắng → hiệu số điểm trung bình mỗi trận → điểm ghi trung bình mỗi trận → bốc thăm. |
| BO | Chỉ trận chung kết chọn BO1/BO3/BO5; mọi trận khác (kể cả bán kết, tranh hạng ba) cố định BO1. |
| Khách mời | Chốt giải tạo VĐV riêng của giải (athlete không liên kết club_member); không vào danh bạ CLB, không tính bảng xếp hạng CLB. |
| Ngoài quy mô khuyến nghị | Chỉ cảnh báo; chỉ chặn khi engine báo không hợp lệ thật. |
| Visual sign-off | Ảnh chụp đặt cạnh ảnh Stitch để người dùng duyệt bằng mắt. |
| Dữ liệu test | CLB test mới riêng cho đợt này; dọn an toàn sau khi xong; không dùng lại group 19. |
| Canary | Không canary. Kiểm thử đầy đủ trên CLB test rồi deploy cho mọi CLB. |

## 2. Nguồn thiết kế Stitch chuẩn

Sau Lát 0 nằm tại `_workspace/stitch-internal-setup/stitch_pickleball_tournament_management_dashboard` của nhánh recovery.

- Token/design system: `pro_court_os/DESIGN.md`.
- Bước 1–3: thư mục `t_o_gi_i_n_i_b_b_c_1_...`, `..._b_c_2_...`, `..._b_c_3_...`.
- Tap-to-Pair: `t_o_gi_i_n_i_b_m_ph_ng_...` (trạng thái của Bước 3, không phải bước thứ năm).
- Bước 4: `b_c_4_b_c_th_m_...`.
- Dashboard, quỹ, hồ sơ, danh bạ chỉ là tham khảo shell CLB.

Không sao chép HTML/Tailwind CDN/Google Fonts/remote avatar/dữ liệu mẫu. Dùng thiết kế làm chuẩn cho bố cục, typography, màu, khoảng cách, card, rail, stepper, action bar và trạng thái tương tác; ứng dụng dùng font và token local.

## 3. Bốn bước chính thức

### Bước 1 — Thông tin giải

- Tên giải, ngày thi đấu, giờ bắt đầu, số sân là bắt buộc; địa điểm, mô tả/thể lệ, poster URL tùy chọn.
- Số sân lưu trong draft, dùng ước tính lịch ở Bước 4.
- Chỉ giải nội bộ; không có lựa chọn giao hữu liên CLB.
- Checklist lấy từ readiness thật, không hard-code.

### Bước 2 — Người tham gia

- Chọn thành viên theo `member_id`; server ánh xạ sang `athlete_id`.
- Tìm kiếm, lọc đang hoạt động/tất cả, chọn các kết quả đang hiển thị, chọn toàn bộ thành viên đang hoạt động; lựa chọn bị ẩn bởi bộ lọc vẫn được giữ.
- Khách mời có `clientRef` ổn định, snapshot và validation server-side; lưu, tải lại, ghép cặp, xem trước và chốt như người thật. Khi chốt, server tạo VĐV riêng của giải, idempotent theo `clientRef`.
- Người trùng tên là danh tính riêng.
- Rating chỉ tư vấn (`Trình độ`/`Điểm trình CLB`); không ép bốc thăm, không chặn khi thiếu.
- Không hiện mã kỹ thuật (`ROSTER_EMPTY`, `ATHLETE_ID_MISSING`); hiện thông báo tiếng Việt gần vị trí cần sửa.

### Bước 3 — Thể thức & ghép cặp

- Ba thẻ thể thức; thẻ chưa mở hiện `Sắp có`, server từ chối nếu bị gọi qua URL/API/draft sửa tay.
- Khuyến nghị quy mô (chỉ cảnh báo): vòng tròn 3–6 cặp; vòng bảng → loại trực tiếp 6–12 cặp; loại trực tiếp 8–32 cặp. Tối thiểu cứng theo từng thể thức do RPC mới quy định, không kế thừa mốc 4 cặp của v2.
- Vòng bảng → loại trực tiếp: chọn số bảng (2–4) và số cặp đi tiếp mỗi bảng (1–2). Hệ thống tính số suất bù bằng cặp xếp kế tiếp tốt nhất để tổng đạt 4 hoặc 8 và hiển thị trước cho người dùng (vd "Vào vòng loại: 6 cặp nhất/nhì + 2 cặp hạng ba tốt nhất"). Tổ hợp không đạt 4/8 báo lỗi tiếng Việt. Mặc định 2 bảng × lấy 2.
- BO: chỉ trận chung kết có lựa chọn BO1/BO3/BO5; các trận khác hiển thị cố định BO1.
- Ghép cặp bằng chạm/chọn đúng hai người chưa ghép trên mọi thiết bị; không dùng kéo-thả làm hành vi chính. Lần chọn thứ nhất có trạng thái rõ; lần thứ hai bật `Ghép cặp`; chọn lại người thứ nhất để hủy. Desktop có bàn phím và focus rõ.
- Pair có `pairId` ổn định, thành viên theo ID, snapshot hiển thị, trạng thái khóa.
- Thêm người chỉ vào danh sách chưa ghép; xóa người chỉ tách cặp chứa người đó; ghép lại là thao tác riêng, bỏ qua cặp khóa.
- Không có dự bị. Số lẻ được lưu nháp nhưng phải thêm người hoặc chủ động bỏ chọn trước khi sang Bước 4; không tự bỏ người, không cặp một người, không BYE thay đồng đội.

### Bước 4 — Bốc thăm, xem trước lịch & chốt

- Tách rõ: ghép cặp → bốc thăm → sinh trận → xếp sân/giờ.
- Draw, preview, finalize dùng cùng aggregate, assignment và fingerprint. Đổi cấu hình/cặp đánh dấu cần bốc lại; không tự random lại.
- Không hiện seed, hash, seed rank. Metadata deterministic phục vụ retry giữ server-side.
- Bracket dùng placeholder tuyến đi tiếp thật: `Nhất A`, `Nhì B`, `Hạng ba tốt nhất #1`, `Thắng bán kết 1`; không tạo entrant giả.
- Xếp nhánh loại trực tiếp tránh hai cặp cùng bảng gặp nhau ở vòng đầu khi có thể; quy tắc cụ thể chốt trong ADR.
- Preview và finalize tạo cùng match identity/count.
- Ca chuẩn (2 bảng × lấy 2): 14 VĐV → 7 cặp → bảng A 4/B 3 → 9 trận bảng + 2 bán kết + 1 chung kết = 12 trận; có tranh hạng ba = 13. Lệch bảng là cảnh báo, không phải blocker.
- Chốt thành công ghi nguyên tử cấu hình, entrant (kể cả VĐV khách), stage, progression, fixture, `round_scoring` và draw lock; chuyển tới lịch, không tự chuyển LIVE.

## 4. Lưu từng bước và khôi phục bản nháp

- Trạng thái trung thực: `Chưa lưu`, `Có thay đổi chưa lưu`, `Đang lưu`, `Đã lưu lúc ...`, `Lưu thất bại`. Không dùng "Đã lưu tự động" nếu không có autosave thật.
- Người dùng bấm lưu bước hiện tại; chỉ khi server xác nhận đúng revision và bước hợp lệ mới mở bước sau.
- Nháp chưa hoàn chỉnh vẫn lưu được; không bypass blocker bằng URL, stepper hoặc thao tác trực tiếp.
- Quay lại hoặc reload hiện đúng dữ liệu server đã xác nhận và bước gần nhất.
- Rời bước khi có thay đổi chưa lưu: `Lưu`, `Bỏ thay đổi chưa lưu`, `Ở lại`.
- Save failure, timeout, revision conflict, idempotent retry: giữ dữ liệu đang nhập, không báo thành công giả, response cũ không ghi đè edit mới.
- Đổi người/thể thức/cặp chỉ làm stale phần phụ thuộc; không đổi cặp ổn định, không tự bốc lại.

## 5. Blocker đã xác định

| Blocker | Bằng chứng | Giải quyết ở |
|---|---|---|
| Nhánh recovery thiếu 097/098, Stitch, skill invariants | Chỉ có trong snapshot, chưa commit | Lát 0 |
| `TournamentWizard.js` chưa nối đúng `ParticipantsStep`/roster picker | Audit trước | Lát 0 (xác minh lại trên base) |
| Shape `selectedMemberIds`/`memberIds` lệch giữa client, save, hydration, preview, finalize | Audit trước; 097 là bản vá phía DB | Lát 0 |
| Preview/finalize chỉ nhận `group_knockout` 2×2, tối thiểu 4 cặp | `preview-schedule/route.js:107`; 098 dòng 119–120, 191; `internalDoublesGroupKnockoutPlan.js:56–57` | Lát A (RPC chung), B, C |
| Khách mời không chốt được | 098 dòng 134, 165: mọi người phải là `member_id` số tra được `athletes.legacy_club_member_id` | Lát A |
| Chưa có xếp hạng chéo bảng cho suất bù | `orchestrator.seedNextStage` chỉ lấy theo từng bảng | Lát A |
| Đường bốc thăm cục bộ yêu cầu seed, có thể lệch server preview | Audit trước | Lát 0 |
| Console còn editor setup thứ hai, readiness không phản ánh aggregate | Audit trước | Lát 0 |

Không còn blocker về contract BO: `rules/roundScoring.js` đã có override `best_of` theo từng vòng, API `round-rules` và v3 đã lưu `round_scoring`. Việc còn lại là UI chọn BO cho vòng chung kết và validation server chỉ vòng đó được khác BO1.

## 6. Trình tự triển khai (lát dọc)

Mỗi lát kết thúc bằng test xanh + evidence trên CLB test trước khi sang lát sau. Lát A, B, C mỗi lát là một lần deploy mở khóa một thể thức.

### Lát 0 — Nền tảng chung (chưa mở khóa thể thức nào)

1. **Preflight:**
   - Xác minh Git state.
   - Mang 097/098 sang và commit (098 đã khớp SHA; 097 đã khớp comment).
   - Kiểm tra 091/094 trên production là bản gốc hay bản sửa ở snapshot.
   - Copy Stitch kèm manifest, mang skill invariants sang.
   - Lập bảng diff 34 file snapshot.
   - Đọc schema, ledger, grants và `search_path` trên production.
   - Tuyệt đối không reset/drop/truncate.
2. **Tài liệu:** spec canonical Stitch; ADR (click-two pairing, không seed/DUPR, không dự bị, khách mời là VĐV riêng của giải, phát hành từng thể thức, số bảng + suất bù + tiêu chí so chéo bảng, quy tắc tránh cùng bảng ở vòng đầu, BO chỉ chung kết, không canary); cập nhật contract và skill invariants.
3. **Test đỏ nền tảng:** save/reload, direct navigation, CAS/idempotency, pairing (thêm/xóa/ghép lại/khóa), số lẻ, thể thức khóa bị server từ chối.
4. **Domain/API chung:** một aggregate snapshot/fingerprint; thống nhất `memberIds`; bỏ nguồn bốc thăm cục bộ.
5. **UI:** shell Pro Court; bốn màn; save guard từng bước; readiness duy nhất; resume; click-two pairing; loại seed/DUPR/dự bị/mã lỗi thô; console chỉ còn vận hành. Cả ba thẻ thể thức hiện `Sắp có`.

### Lát A — Vòng bảng → loại trực tiếp (phát hành đầu tiên)

- **RPC finalize mới dùng chung** (additive, tên có phiên bản mới):
  - Rẽ nhánh theo `formatKey`; lát này chỉ bật `group_knockout`.
  - Một chỗ xử lý CAS, idempotency, fingerprint, tenant scope, structure lock.
  - Grants chỉ cho `service_role`.
- Engine:
  - Tổng quát `internalDoublesGroupKnockoutPlan` cho 2–4 bảng × 1–2 suất cộng suất bù đạt 4/8.
  - Xếp hạng chéo bảng theo tỉ lệ thắng → hiệu số trung bình → điểm ghi trung bình → bốc thăm.
  - Placeholder `Hạng ba tốt nhất #n`.
  - Không sửa ba file đóng băng.
- Khách mời: finalize tạo VĐV riêng của giải, idempotent theo `clientRef`; test tenant isolation.
- BO chung kết qua `round_scoring`; validation server.
- Test:
  - Ca 14/15 VĐV mặc định.
  - 3 bảng × 2 + 2 hạng ba.
  - 4 bảng × 1.
  - 4 bảng × 2.
  - Tổ hợp không hợp lệ.
  - Khách mời.
  - BO chung kết.
  - Preview/finalize parity.
  - Rollback khi lỗi giữa chừng.
- Evidence: browser 390px/tablet/desktop trên CLB test; ảnh chụp để người dùng duyệt.
- Mở khóa thẻ; deploy.

### Lát B — Vòng tròn tính điểm

- Thêm nhánh `round_robin` vào RPC chung; preview dùng engine `roundRobin` có sẵn; tối thiểu cứng riêng (dự kiến 3 cặp).
- BO chung kết không áp dụng (vòng tròn không có chung kết) — ẩn lựa chọn BO.
- Test, evidence, ảnh chụp; mở khóa; deploy.

### Lát C — Loại trực tiếp

- Thêm nhánh `knockout` vào RPC chung; dùng engine `knockout` có sẵn; bye khi số cặp không phải lũy thừa 2 (bye là vé đi thẳng của cặp, không phải thay đồng đội); tranh hạng ba tùy chọn; BO chung kết.
- Test, evidence, ảnh chụp; mở khóa; deploy.

### Kiểm tra chung cho mỗi lần deploy

- Thiếu môi trường phải `BLOCKED` hoặc non-zero, không báo pass giả.
- Keyboard, focus, touch target 44px, không overflow ngang, retry, reload, conflict.
- Performance so với baseline `_workspace/unified-setup-ux/T0.3-perf-baseline.md` cùng fixture và cách đo; báo số liệu, không có ngưỡng chặn.
- Sau Lát C: dọn dữ liệu CLB test an toàn, scope đúng `group_id`, báo cáo truy vấn.

## 7. Phạm vi file

**Được tạo/sửa sau khi duyệt:**

- Spec `docs/superpowers/specs/2026-09-23-stitch-internal-tournament-setup-canonical.md`.
- ADR `docs/superpowers/adr/ADR-...-unified-setup-stitch-product-overrides.md`.
- Contract `_workspace/unified-setup-ux/00-contract.md`.
- Skill `.claude/skills/tournament-setup-invariants/SKILL.md`.
- Nguồn Stitch + manifest.
- Migration 097/098 (mang sang) và migration mới cho RPC finalize chung.
- Domain/API/UI/console/test trong `lib/`, `app/`, `tests/`.

**Không sửa:**

- Nội dung migration đã chạy (`091`–`098`); RPC v2/v3.
- File đóng băng `setupContract.js`, `engines/roundRobin.js`, `draw.js`. `wizardModel.js` chỉ được gọi, không viết converter thứ hai. Nếu buộc phải sửa: dừng, nêu lý do, hỏi người dùng.

## 8. Điều kiện hoàn tất (sau Lát C)

- Bốn bước đúng thứ tự và thiết kế canonical; không còn setup editor cạnh tranh.
- Lưu thành công mới mở bước sau; reload khôi phục đúng.
- Click-two pairing giống nhau trên desktop/tablet/mobile.
- Ba thể thức có preview/finalize thật qua một RPC chung; preview và finalize cùng identity/count; transaction không để dữ liệu dở dang.
- Group-knockout đúng với mọi tổ hợp 2–4 bảng hợp lệ, kể cả suất bù chéo bảng.
- Khách mời chốt thành VĐV riêng của giải, không lọt vào danh bạ hay xếp hạng CLB.
- Chỉ trận chung kết có BO khác BO1.
- Không hiện seed/hash/DUPR/dự bị/mã lỗi kỹ thuật.
- Test chức năng, browser, accessibility đạt; người dùng đã duyệt ảnh từng lát.
- Dữ liệu CLB test đã dọn an toàn.

## 9. Cổng phê duyệt

Chưa được tạo spec hoặc code. Sau khi người dùng duyệt, bắt đầu Lát 0 bước 1 (preflight).
