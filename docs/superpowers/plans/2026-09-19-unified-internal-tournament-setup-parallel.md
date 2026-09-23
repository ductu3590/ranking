# Unified Internal Tournament Setup — Parallel Implementation Plan

**Ngày:** 2026-09-19  
**Branch:** `feat/tournament-unified-setup-ux`  
**Worktree:** `C:\Users\ductu\ranking-unified-setup-ux`  
**Baseline:** `943e539`  
**Trạng thái:** Sẵn sàng phân công; chưa triển khai.

## 1. Mục tiêu và quyết định khóa

Thay trải nghiệm setup kép bằng **một workspace 4 bước** cho giải nội bộ CLB:

1. Thông tin & người tham gia.
2. Thể thức & ghép cặp/đội.
3. Bốc thăm & xem trước lịch.
4. Kiểm tra, lưu nháp hoặc chốt lịch.

Plan này **thay thế định hướng UX 3 bước** trong:

- `docs/superpowers/plans/2026-09-07-tournament-create-wizard-redesign.md` (đã gỡ khỏi worktree này; bản gốc còn trên `main`)
- `docs/superpowers/specs/2026-09-07-tournament-create-wizard-redesign.md`

Backend setup/checkpoint/revision/readiness hiện có được tái sử dụng. Không viết lại engine hoặc persistence nếu contract hiện tại đáp ứng. Preview bắt buộc dùng entrant, pair/team identity, draw và stage config thật; không dùng entrant giả từ số lượng.

### Đã có trên baseline `943e539` — không làm lại

Audit `plan-1.md` nêu ba điểm nay đã được xử lý trong baseline. Agent **không mở lại** các mục này, chỉ tránh làm hỏng khi sửa chỗ khác:

| Vấn đề plan-1 | Đã xử lý tại |
|---|---|
| Xung đột tên trường số bảng (`groupCount` / `groups` / `group_count`) | `lib/tournament/setupContract.js` — `resolveGroupCount()` gom alias, ném `CONFLICTING_GROUP_COUNT` khi mâu thuẫn |
| Engine round-robin tự chia lại bảng, bỏ qua kết quả bốc thăm | `lib/tournament/engines/roundRobin.js` — nhánh `assigned` tôn trọng `group_label` đã chốt, ném `INCOMPLETE_GROUP_ASSIGNMENT` / `GROUP_ASSIGNMENT_COUNT_MISMATCH` |
| Cảnh báo "cùng CLB chung bảng" phát vô nghĩa ở giải nội bộ | `lib/tournament/draw.js` — bỏ qua `DRAW_SAME_CLUB_IN_GROUP` khi `organizerMode === 'internal'` |

### Lỗ hổng chức năng còn mở, plan này phải đóng

| Mã | Vấn đề | Bằng chứng trên baseline | Task chịu trách nhiệm |
|---|---|---|---|
| GAP-STAGE | Chọn "vòng bảng + loại trực tiếp" chỉ tạo **một** stage vòng tròn, không tạo stage knockout, không có tuyến đi tiếp | `app/giai-dau/v2/TournamentWizard.js` chỉ có checkpoint `GROUP_STAGE`; `buildDivisionStagePayloads()` trong `lib/tournament/wizardModel.js` đã có nhánh `group_knockout` nhưng **không nơi nào gọi** ngoài test | T1.A + T1.B + T2.C |
| GAP-PAIR | Thêm/bớt một người ghép lại toàn bộ danh sách, phá các cặp đã có; không có khái niệm khóa cặp | `TournamentWizard.js` gọi `chunkPairs(next)` trên toàn danh sách ở mọi thao tác thêm/xóa/ngẫu nhiên | T1.A + T1.C + T2.B |
| GAP-ROSTER | Không có "Chọn toàn bộ thành viên"; chọn từng người một | Không có thao tác chọn hàng loạt trong `app/giai-dau/v2/wizard/StepRegister.js` | T2.B |
| GAP-READY | Bước VĐV luôn báo hoàn thành | `app/giai-dau/v2/console/TournamentConsoleV2.js` — `readiness.athletes` gán cứng `true` | T1.A + T2.D |
| GAP-THEME | Console dùng bộ màu `ops-*` riêng, lẫn với token giao diện chung | `console/shell.css`, `console/ConsoleShell.js`, `console/TournamentConsoleV2.js`, `console/steps/{ControlStep,CourtsStep,DrawStep,LogStep}.js` | T2.D |
| GAP-PERF | Chưa có số đo thực tế cho độ trễ tạo giải | Chưa đo | T0.3 + Wave 4 |

### Quyết định mặc định để agent không bị chặn

- Setup draft luôn mở lại bằng workspace 4 bước; console không giữ wizard setup thứ hai.
- `Lưu nháp`: lưu checkpoint an toàn, không lock roster/draw, không sinh lịch chính thức; ở lại workspace và hiện trạng thái đã lưu. Danh sách giải có CTA `Tiếp tục thiết lập`.
- Sau finalize: điều hướng tới **Lịch thi đấu**; không tự chuyển giải sang LIVE.
- Inactive member: mặc định ẩn bởi filter `Đang hoạt động`, vẫn chọn được trong `Tất cả/Ngừng hoạt động`, lựa chọn cũ không bị mất và có cảnh báo.
- VĐV chưa ghép: hiện danh sách riêng; là blocker khi đánh đôi/đội trước bước bốc thăm.
- URL console setup cũ được redirect tương thích: draft → workspace; finalized → tab vận hành phù hợp.

### Quyết định nghiệp vụ bắt buộc (từ audit `plan-1.md`)

- **Cấu trúc giai đoạn.** Chọn "vòng bảng → loại trực tiếp" phải tạo **đủ hai stage** cùng `division_id`, cộng tuyến đi tiếp tường minh (stage nguồn → stage đích, suất dạng `Nhất A`, `Nhì B`). Dùng `buildDivisionStagePayloads()` sẵn có làm nguồn duy nhất; không viết bộ chuyển đổi thể thức thứ hai.
- **Khung trận knockout.** Khi chốt setup có thể tạo trận knockout **chờ suất đi tiếp**; chỉ gán entry khi kết quả vòng trước được xác nhận. Preview, dữ liệu lưu và màn bracket dùng chung một cách biểu diễn. Không tạo VĐV/entrant giả để lấp chỗ.
- **Ổn định ghép cặp.** Cặp có ID ổn định và trạng thái khóa; không suy ra từ thứ tự danh sách. Thêm người chỉ đưa vào danh sách chưa ghép; xóa người chỉ tác động cặp chứa người đó. "Ghép lại" là thao tác riêng, tường minh và luôn tôn trọng cặp đã khóa.
- **Số người lẻ.** Đánh đôi lẻ người thì đưa ba lựa chọn rõ ràng: thêm một người cho đủ, để một người dự bị ngoài danh sách thi đấu, hoặc đổi thể thức phù hợp nếu đã hỗ trợ. **Không** tự bỏ người cuối, **không** tạo cặp một người, **không** dùng BYE thay cho đồng đội còn thiếu — BYE chỉ xử lý suất/cặp nghỉ lượt.
- **Bảo toàn dữ liệu.** Giải đã có trận bắt đầu hoặc đã có tỉ số **không được đổi cấu trúc** qua luồng setup; finalize phải chặn và nêu lý do. Không backfill lịch, không tự thêm stage vào giải cũ.
- **Không xóa-rồi-tạo-lại.** Mở nháp hoặc lưu nháp không được xóa entrant/fixture rồi dựng lại làm hành vi mặc định. Mọi thao tác ghi đè phải là lựa chọn có chủ đích của người dùng và nằm trong một transaction.

## 2. Nguyên tắc làm song song

### Hạ tầng bắt buộc dùng

- **Skill `tournament-setup-invariants`** (`.claude/skills/tournament-setup-invariants/SKILL.md`): bản rút gọn của plan này — 3 file đóng băng, 6 mã GAP, 7 bất biến nghiệp vụ, ca 14 người, ma trận ownership, checklist trước commit. Mọi agent gọi skill này **trước khi sửa code**.
- **Hook `ownership-guard`** (`.claude/hooks/ownership-guard.js`, đăng ký ở `.claude/settings.json`): chạy ở mọi `Write`/`Edit`/`MultiEdit`/`NotebookEdit`/`Bash`, chặn ghi ra ngoài ownership, chặn 3 file đóng băng, chặn shared entry point với agent không phải integrator, chặn lệnh `DROP`/`TRUNCATE`/`DELETE FROM`/`db reset`.
- Mỗi session **phải** đặt `$env:PICKHUB_TASK_ID = "<mã task>"`. Không đặt thì hook chỉ kiểm được file đóng băng.
- Van thoát `PICKHUB_ALLOW_FROZEN=1` và `PICKHUB_GUARD_OFF=1` **chỉ integrator** được dùng, sau khi ghi lý do vào handoff. Agent bị hook chặn thì dừng và báo lead, không đi vòng.

### Quy tắc

1. Mỗi agent chỉ sửa file thuộc ownership của mình. Muốn sửa file dùng chung phải nhắn integrator.
2. Contract/domain shape được khóa ở Wave 0 trước khi UI/API triển khai song song.
3. Mỗi task bắt đầu bằng test đỏ, kết thúc bằng test xanh và commit riêng.
4. Không sửa migration đã apply. Migration mới additive, forward-only, tenant-scoped.
5. Không gọi Supabase trực tiếp từ component; dùng `lib/tournamentV2Client.js`.
6. Không đọc role/group từ localStorage; dùng session server hiện hành.
7. Không `DROP`, `TRUNCATE`, reset DB hoặc dùng dữ liệu CLB thật ngoài test scope.
8. Agent ghi handoff vào `_workspace/unified-setup-ux/<task-id>.md`: files, contract, test, commit, rủi ro.
9. Integrator là người duy nhất sửa `package.json`, route adapter chính và giải conflict file dùng chung.

## 3. Dependency graph và waves

```text
W0 Contract/spec/tests đỏ
 ├─ W1A state machine/domain ─┬─ W2A shell
 ├─ W1B preview/finalize API ─┼─ W2C draw/review
 ├─ W1C roster/pair contract ─┴─ W2B participants/pairing
 └─ W1D browser harness ───────── W3 journeys

W2A + W2B + W2C → W2D console cleanup → W3 integration/QA → W4 release
```

Có thể chạy song song tối đa:

- **Wave 1:** 4 agent.
- **Wave 2:** 3 agent sau khi contract khóa.
- **Wave 3:** 3 QA stream độc lập; integrator sửa lỗi tuần tự theo ownership.

Không nên cho nhiều agent cùng sửa `TournamentWizard.js`, `TournamentConsoleV2.js`, `lib/tournamentV2Client.js` hoặc `package.json`.

---

## 4. Wave 0 — Contract freeze

### T0.1 — Architect: spec delta + state/endpoint contracts

**Owner:** `tournament-architect`  
**Files:**

- Create `docs/superpowers/specs/2026-09-19-unified-internal-tournament-setup.md`
- Create `_workspace/unified-setup-ux/00-contract.md`

**Deliverables:**

- `SetupDraftV2` shape và version migration từ draft cũ.
- State machine: `local_only`, `server_draft`, `roster_ready`, `pairing_ready`, `draw_drafted`, `finalized`.
- Invalidation matrix khi sửa participant/config/pair/draw.
- Aggregate load/save contract, revision conflict và idempotency key.
- Preview/finalize invariant: cùng draw/config phải cho cùng match identities/count.
- Readiness blocker/warning taxonomy bằng mã ổn định, **tính từ dữ liệu thật** — không mục nào được gán cứng `true` (xem GAP-READY).
- Quy tắc redirect draft/finalized.
- **Stage plan contract:** ánh xạ lựa chọn thể thức → danh sách stage payload (`buildDivisionStagePayloads`) + tuyến đi tiếp (stage nguồn, stage đích, suất `Nhất A`/`Nhì B`, tranh hạng ba bật/tắt). Giải quyết GAP-STAGE.
- **Pair identity contract:** cặp có ID ổn định, hai thành viên theo `member_id`/`athlete_id`, cờ `locked`; quy tắc thêm/xóa/ghép-lại không đụng cặp khác. Giải quyết GAP-PAIR.
- **Placeholder contract cho knockout:** cách biểu diễn trận chờ suất đi tiếp dùng chung cho preview, database và bracket; cấm entrant giả.
- **Preflight schema/RPC:** đối chiếu schema và RPC thực tế trên Supabase với migration ledger trước khi kết luận cần migration mới; không suy ra trạng thái database chỉ từ file SQL trong repo.

**Exit gate:** architect, API, UI và QA thống nhất contract; sau đó shape chỉ đổi qua ADR ngắn.

### T0.2 — QA: acceptance tests đỏ

**Owner:** `tournament-qa`  
**Depends:** T0.1  
**Files ownership:**

- Rewrite `tests/phase3/wizard-redesign-contract.test.js`
- Rewrite `tests/tournament/ui-unified-wizard.contract.test.js`
- Create tests dưới `tests/unified-setup-v2/`

**Test đỏ bắt buộc:**

- Đúng 4 bước mới, không còn ba nhãn wizard cũ.
- Athlete picker có search/filter/checkbox/select-visible/X-Y.
- Draft resume và invalidation.
- Preview dùng identity/draw thật.
- Save draft khác finalize.
- Console không còn prep flow độc lập.
- Finalize redirect tới schedule, không LIVE.
- **Ca xuyên suốt 14 người** (bắt buộc, từ `plan-1.md`): 14 VĐV → 7 cặp → 2 bảng chia 4/3 → vòng bảng 6 + 3 = 9 trận → bán kết chéo bảng (Nhất A–Nhì B, Nhất B–Nhì A) + chung kết = **12 trận**; bật tranh hạng ba thành **13 trận**.
- **Hai stage cho `group_knockout`:** finalize tạo đủ stage vòng bảng + stage knockout cùng division, có tuyến đi tiếp hợp lệ.
- **Ổn định cặp:** xóa một người ở giữa danh sách không làm đổi các cặp còn lại; cặp đã khóa không bị ghép lại.
- **Số lẻ:** lưu nháp được, finalize bị chặn khi còn cặp thiếu người; không có cặp một người, không có BYE thay đồng đội.
- **Giải đã có tỉ số:** finalize/đổi cấu trúc bị chặn với mã lỗi rõ ràng.

**Không sửa:** production code và `package.json`.

**Exit gate:** lưu output test đỏ trong `_workspace/unified-setup-ux/T0.2.md`.

### T0.3 — QA: baseline hiệu năng trước khi sửa

**Owner:** `tournament-qa` (có thể chạy song song T0.1/T0.2)  
**Files ownership:**

- Create `_workspace/unified-setup-ux/T0.3-perf-baseline.md`
- Không sửa production code.

**Phải đo trên luồng hiện tại, CLB test đã scope:**

- Số request và thời gian cho: mở nháp, lưu nháp, preview lịch, chốt tạo giải.
- Payload size của roster, danh sách giải, bảng sân.
- Số lần tải trùng: roster, sân (console và màn điều hành), danh sách giải trước khi tìm một giải.
- Thời gian phản hồi giao diện sau thêm/bỏ một người.
- Cấu hình đo: thiết bị, mạng, số VĐV, có ghi rõ để Wave 4 lặp lại đúng điều kiện.

**Nguyên tắc:** không cam kết mức giảm latency khi chưa có baseline. Wave 4 báo cáo trước/sau trên **cùng** bộ dữ liệu và điều kiện đo.

**Exit gate:** baseline đã ghi; Wave 4 có mốc để so.

---

## 5. Wave 1 — Foundation, bốn workstream song song

### T1.A — Domain state machine, validation và metrics

**Owner:** `tournament-architect` hoặc `tournament-engine-dev`  
**Depends:** T0.1  
**Exclusive files:**

- Create `lib/tournament/setupFlowModel.js`
- Create `lib/tournament/setupValidation.js`
- Create `lib/tournament/setupImpact.js`
- Create `lib/tournament/scheduleMetrics.js`
- Create `lib/tournament/pairingDraft.js` — quản lý cặp bằng logic thuần, kiểm thử độc lập với React (GAP-PAIR)
- Create `lib/tournament/stagePlan.js` — bọc `buildDivisionStagePayloads()` và sinh tuyến đi tiếp (GAP-STAGE)
- Modify `lib/tournament/wizardDraft.js`
- Tests tương ứng dưới `tests/unified-setup-v2/domain/`

**Không sửa:** React, API route, client API. Không sửa `lib/tournament/wizardModel.js` (chỉ gọi lại `buildDivisionStagePayloads`), `setupContract.js`, `engines/roundRobin.js`, `draw.js` — các file này đã đúng trên baseline.

**Acceptance:** pure CommonJS, deterministic; test transition/invalidation, odd doubles, inactive warning, groups/byes và court/time estimate.

**Acceptance bổ sung (GAP-PAIR, GAP-STAGE, GAP-READY):**

- `pairingDraft`: cặp có ID ổn định + cờ `locked`; thêm người → vào danh sách chưa ghép, **không** ghép lại gì; xóa người → chỉ tách cặp chứa người đó, các cặp khác giữ nguyên **kể cả cặp chưa khóa**; `regenerate()` là hàm riêng và bỏ qua cặp đã khóa; chặn một người xuất hiện ở hai cặp.
- Số lẻ: trả về ba lựa chọn hợp lệ (thêm người / để dự bị ngoài danh sách / đổi thể thức); không bao giờ trả cặp một người hoặc BYE thay đồng đội.
- `stagePlan`: `group_knockout` trả đúng hai stage cùng `division_id` + danh sách tuyến đi tiếp; ca 14 người → 7 cặp → bảng 4/3 → 9 + 3 = 12 trận (13 nếu bật tranh hạng ba); bảng lệch cỡ là cảnh báo có nội dung, không phải blocker.
- Readiness tính từ dữ liệu: không hằng số `true`; giải đa giai đoạn **không** đòi mọi stage đều có trận (playoff chờ kết quả vòng bảng) mới coi là xong.

### T1.B — Setup aggregate, preview và finalize orchestration

**Owner:** `tournament-api-dev`  
**Depends:** T0.1  
**Exclusive files:**

- `app/api/tournament-v2/setup/**`
- `app/api/tournament-v2/preview-schedule/route.js`
- Có thể create `app/api/tournament-v2/setup/finalize/route.js`
- Server use-case files riêng dưới `lib/tournament/`; không đụng files T1.A
- Migration additive nếu contract chứng minh schema thiếu
- API tests dưới `tests/unified-setup-v2/api/`

**Yêu cầu:** admin guard, `group_id` scope, revision CAS, idempotent retry, checkpoint result, không success giả khi lỗi giữa chừng.

**Yêu cầu bổ sung:**

- **GAP-STAGE:** finalize ghi đủ stage theo `stagePlan` của T1.A + tuyến đi tiếp, trong **một** đơn vị nguyên tử cùng stage entrants, fixtures và khóa draw. Không tồn tại trạng thái "draw đã khóa nhưng thiếu lịch" hay "đã xóa entrants nhưng chưa tạo lại".
- **Khung knockout:** tạo trận chờ suất đi tiếp theo placeholder contract của T0.1; không insert entrant giả.
- **Progression scope:** tuyến đi tiếp tham chiếu stage đích tường minh, kiểm tra cùng tenant / cùng giải / cùng division — không suy ra bằng `stage_order + 1`.
- **Bảo toàn dữ liệu:** finalize từ chối khi giải/division đã có trận bắt đầu hoặc đã có tỉ số, trả mã lỗi ổn định. Không backfill lịch, không tự thêm stage vào giải cũ.
- **Không xóa-rồi-tạo-lại** khi mở hoặc lưu nháp; ghi đè chỉ khi người dùng chọn có chủ đích.
- **Preflight trước migration:** đối chiếu schema/RPC thực tế với ledger (`npm run migration:ledger`) rồi mới chốt số migration. RPC ghi không mở cho browser gọi trực tiếp; kiểm tra quyền thực thi và `search_path`.

**Exit gate:** preview/finalize invariant test xanh; mô phỏng lỗi tại **từng** điểm ghi chứng minh không còn trạng thái dở dang; chạy security/performance advisors nếu có DDL.

### T1.C — Roster/participant/pair contract hardening

**Owner:** `tournament-api-dev` thứ hai hoặc `tournament-engine-dev`  
**Depends:** T0.1  
**Exclusive files:**

- Roster/participant/pair routes hiện có; liệt kê chính xác trong handoff trước khi sửa
- Pair/team domain helpers riêng
- Tests dưới `tests/unified-setup-v2/participants/`

**Yêu cầu:** roster trả active + inactive; selection không phụ thuộc filter; preview pair không ghi DB; apply giữ identity; unpaired rõ; revision conflict ổn định.

**Yêu cầu bổ sung:**

- **Danh tính theo ID:** chọn/bỏ chọn bằng `member_id`, server ánh xạ sang `athlete_id`; tên chỉ là snapshot hiển thị. Hai người **trùng tên** phải là hai bản ghi riêng biệt xuyên suốt roster → cặp → entrant. Trường hợp chưa có `athlete_id` được xử lý tường minh, không im lặng bỏ qua.
- **Cross-tenant:** `member_id` ngoài tenant/giải bị chặn với mã lỗi ổn định.
- **Ổn định cặp phía server:** apply pair dùng pair ID của `pairingDraft` (T1.A), tôn trọng cờ `locked`; apply lại cùng danh sách không đảo cặp.

**Boundary:** không sửa setup aggregate/finalize files của T1.B.

### T1.D — Browser harness và fixtures

**Owner:** `tournament-qa`  
**Depends:** T0.1; có thể bắt đầu cùng T1.A–C  
**Exclusive files:**

- Create `tests/unified-setup-v2/browser/**`
- Create fixture/helper riêng; không sửa production
- Tài liệu fixture/test cleanup

**Yêu cầu:** viewport 390px/tablet/desktop; fixture group riêng; safe cleanup. Fixture phải có sẵn ca 14 người (7 cặp / 2 bảng 4-3) và một ca 15 người để thử nhánh số lẻ. Test có thể skip với lý do rõ nếu thiếu env trong lúc phát triển, nhưng release gate không chấp nhận `BLOCKED`.

---

## 5.5 Cổng T0.3-live — đo baseline hiệu năng thật trước Wave 2

Wave 0 T0.3 mới chỉ chốt khung đo và cấu hình máy; toàn bộ số liệu là `BLOCKED` vì thiếu `.env.local` + tenant test. Wave 1 chỉ sửa domain/API, chưa đụng UI, nên "before" định lượng phải được đo tại đây — **sau khi Wave 1 landing** và **trước khi T2.* bắt đầu**.

**Owner:** `tournament-qa` (làm lại đúng handoff `_workspace/unified-setup-ux/T0.3-perf-baseline.md`).

**Điều kiện tiên quyết:** người dùng cấp `.env.local` + tenant test đã provision qua `scripts/qa/provision-browser-harness.js`.

**Yêu cầu:** thay 17 ô `BLOCKED` bằng median/p95/min/max thật, ghi commit đúng lúc đo (là commit head sau Wave 1). Không đụng production code, không sửa UI. Nếu vẫn thiếu env: dừng ngay, không được tiếp tục Wave 2 với `BLOCKED`.

**Exit gate:** T0.3-perf-baseline.md có số thật cho cả 4 luồng, xác nhận UI còn là bản cũ khi đo (grep `TournamentSetupWorkspace` không có trong `app/`), Wave 4 dùng chính commit đó làm "before".

## 6. Wave 2 — UI slices, ba workstream song song

### T2.A — Workspace shell, navigation và persistence adapter

**Owner:** `tournament-ui-dev A`  
**Depends:** T1.A; dùng mock client theo T0.1 nếu T1.B chưa merge  
**Exclusive files:**

- Create `app/giai-dau/v2/setup/TournamentSetupWorkspace.js`
- Create `app/giai-dau/v2/setup/SetupStepper.js`
- Create `app/giai-dau/v2/setup/SetupSummaryRail.js`
- Create `app/giai-dau/v2/setup/SetupActionBar.js`
- Create `app/giai-dau/v2/setup/setup.css`
- Create UI context/reducer dưới cùng thư mục

**Integrator-only:** `TournamentWizard.js`, dashboard và `lib/tournamentV2Client.js`.

**Acceptance:** responsive, keyboard, sticky actions, save status, step guards, resume state; không để business I/O ngoài adapter.

### T2.B — Step 1 participants + Step 2 pairing

**Owner:** `tournament-ui-dev B`  
**Depends:** T1.A + T1.C  
**Exclusive files:**

- `app/giai-dau/v2/setup/steps/InfoParticipantsStep.js`
- `app/giai-dau/v2/setup/steps/FormatPairingStep.js`
- `app/giai-dau/v2/setup/participants/**`
- `app/giai-dau/v2/setup/pairing/**`
- Component tests `tests/unified-setup-v2/ui/participants-*`

**Acceptance:** search; active/inactive/all; checkbox; select/unselect kết quả đang hiển thị; X/Y; hidden selections retained; inactive badge; manual/automatic preview/apply; unpaired blocker; mobile không phụ thuộc drag-and-drop.

**Acceptance bổ sung (GAP-ROSTER, GAP-PAIR):**

- Nút nổi bật **"Chọn toàn bộ thành viên đang hoạt động"**, tách khỏi "chọn kết quả đang hiển thị"; luôn hiện `Đã chọn X/Y`.
- Chọn/bỏ chọn bằng `member_id`; hai người trùng tên hiển thị phân biệt được và không bị gộp.
- Thêm một người → chỉ vào danh sách chưa ghép. Bỏ một người ở giữa danh sách → **các cặp còn lại không đổi**.
- Khóa/mở khóa từng cặp; "Ghép lại các cặp chưa khóa" là nút riêng, có xác nhận, không chạy ngầm.
- Đổi người trong một cặp là thao tác tường minh, không kéo theo cặp khác.
- Số lẻ: hiện ba lựa chọn theo quyết định nghiệp vụ; không tự tạo cặp một người.
- Lựa chọn và trạng thái cặp giữ nguyên sau reload.

### T2.C — Step 3 draw + Step 4 review/finalize

**Owner:** `tournament-ui-dev C`  
**Depends:** T1.A + T1.B  
**Exclusive files:**

- `app/giai-dau/v2/setup/steps/DrawScheduleStep.js`
- `app/giai-dau/v2/setup/steps/ReviewFinalizeStep.js`
- `app/giai-dau/v2/setup/draw/**`
- Component tests `tests/unified-setup-v2/ui/draw-*`, `review-*`

**Acceptance:** roll/reroll/swap; groups/bracket/bye thật; courts/time metrics; blocker vs warning; computed summary; save draft/finalize/retry; post-finalize schedule destination.

**Acceptance bổ sung (GAP-STAGE):**

- Phân biệt rõ trên UI bốn nghiệp vụ: **ghép cặp → bốc thăm → sinh trận → xếp sân/giờ**; xếp sân/giờ nằm sau khi đã có fixtures và không làm đổi kết quả bốc thăm.
- Cấu hình vòng bảng → loại trực tiếp ngay tại bước này: số bảng, số cặp mỗi bảng, suất đi tiếp mỗi bảng, cách ghép nhánh, có tranh hạng ba hay không.
- Sơ đồ đi tiếp hiển thị từ tuyến thật (`Nhất A – Nhì B`, …), không phải hình minh họa dựng riêng.
- Bracket hiển thị trận **chờ suất đi tiếp** theo placeholder contract; không hiện VĐV giả.
- Summary bước 4 dùng đúng số liệu tính được: ví dụ 14 VĐV · 7 cặp · Bảng A 4 cặp / Bảng B 3 cặp · vòng bảng 9 trận · bán kết 2 · chung kết 1 · **tổng 12** (13 nếu tranh hạng ba), kèm ghi chú bảng 4 cặp đá nhiều trận hơn bảng 3 cặp.
- Sửa cấu hình/cặp làm draw cũ không còn hợp lệ → đánh dấu **cần bốc lại**, không tự sinh lại.
- Giải đã có tỉ số: nút chốt bị vô hiệu kèm lý do, không chỉ báo lỗi sau khi bấm.

### T2.D — Integrator: shared entry points và console cleanup

**Owner:** lead/integrator  
**Depends:** T2.A + T2.B + T2.C  
**Exclusive shared files:**

- `app/giai-dau/v2/TournamentWizard.js`
- `app/giai-dau/v2/TournamentV2DashboardClient.js`
- `app/giai-dau/v2/console/ConsoleShell.js`
- `app/giai-dau/v2/console/TournamentConsoleV2.js`
- `lib/tournamentV2Client.js`
- `package.json`

**Thêm vào exclusive shared files (GAP-THEME):**

- `app/giai-dau/v2/console/console.css`
- `app/giai-dau/v2/console/shell.css`
- `app/giai-dau/v2/console/steps/ControlStep.js`
- `app/giai-dau/v2/console/steps/CourtsStep.js`
- `app/giai-dau/v2/console/steps/DrawStep.js`
- `app/giai-dau/v2/console/steps/LogStep.js`

**Yêu cầu:** xóa setup navigation kép; redirect URL cũ; legacy repair chỉ hiện có điều kiện; không render hai editor cùng ghi; giữ operations tabs sau finalize.

**Yêu cầu bổ sung:**

- **GAP-THEME:** toàn bộ phần quản trị giải kế thừa giao diện **sáng** của CLB. Gỡ các khai báo `ops-*` xung đột theo từng component, quy về token giao diện chung; không còn nền tối + thẻ trắng + chữ nhạt đan xen khi đi từ "tạo giải" sang "quản lý giải". Chế độ tối cho màn hình tại sân, nếu cần, là chế độ **bật riêng**, không tự đổi màu theo điều hướng. Đây **không** phải redesign toàn bộ màn điều hành.
- **GAP-READY:** thay `readiness.athletes = true` bằng giá trị tính từ dữ liệu thật qua domain của T1.A; console chỉ mở mặc định vào màn điều hành khi đã có lịch, ngược lại đưa về bước còn thiếu và nêu lý do chặn cụ thể.
- Trạng thái "đã lưu" chỉ hiển thị khi server xác nhận.

**Exit gate:** tất cả contract UI + API xanh trước browser journey; grep `ops-` trong `app/giai-dau/v2` không còn khai báo màu xung đột.

---

### T2.E — Giao hữu liên CLB trên workspace mới

**Owner:** `tournament-ui-dev` (phối hợp integrator cho phần shared)
**Depends:** T2.D
**Lý do phát sinh:** T2.D thay toàn bộ `TournamentWizard.js` bằng workspace nội bộ và **xóa mất đường tạo giải giao hữu** — ngoài phạm vi plan. Bằng chứng: `inviteTournamentClub` và `listTournamentClubs` còn 0 caller trong `app/`; `CHECKPOINT.CLUB_INVITES` thành định nghĩa mồ côi; dashboard vẫn hiện nhãn `Giao hữu liên CLB` nhưng lối tạo duy nhất là `?create=internal`. `tests/phase3/interclub-ui.test.js` bắt đúng lỗi này.

**Quyết định:** mở rộng workspace 4 bước để hỗ trợ giao hữu, **không** khôi phục wizard cũ — giữ đúng tinh thần "xóa setup kép".

**Phải làm:**

- Bước 1 có bộ chọn phạm vi: `Nội bộ CLB` / `Giao hữu liên CLB`. Ghi vào `draft.tournament.organizerMode`.
- Khi `organizerMode === 'friendly'`: bước 1 đổi từ chọn thành viên sang **mời CLB** — tìm CLB trong hệ thống (`listTournamentClubs`), mời bằng `inviteTournamentClub`, thêm CLB ngoài hệ thống bằng `inviteExternalClub`.
- Giữ nguyên xử lý 409 của luồng cũ: CLB đã có trong giải thì ghi nhận "đã mời", không ném lỗi.
- Blocker `NO_CLUB_INVITED` khi giao hữu mà chưa mời CLB nào.
- Checkpoint `CLUB_INVITES` được nối lại vào chuỗi finalize cho nhánh giao hữu.
- Cảnh báo cùng CLB chung bảng: giao hữu **có** cảnh báo (`draw.js` đã xử lý đúng — chỉ bỏ qua khi `organizerMode === 'internal'`). Không sửa `draw.js`.

**Contract:** `SetupDraftV2` hiện chỉ có `tournament.organizerMode`, chưa có chỗ cho danh sách CLB mời. Cần **ADR ngắn** mở rộng contract (thêm `invitedClubs`), không sửa ngầm.

#### Phân chia ba phần — KHÔNG mở ownership `TournamentWizard.js`

Khảo sát code cho thấy T2.E không cần chạm shared entry point nào:

| Việc | Đã có sẵn / Ai làm |
|---|---|
| Liệt kê CLB mời được **trước khi có `tournamentId`** | **Đã có.** `GET /api/tournament-v2/clubs?mode=available` (comment trong route ghi rõ "wizard gọi trước khi giải tồn tại"), và client helper `listAvailableTournamentClubs(tournamentId?)` đã export ở `lib/tournamentV2Client.js:285`. T2.E chỉ việc gọi. |
| Gửi `invitedClubs` tới finalize | **Đã có.** `finalize(draft)` POST nguyên `draft` lên `/setup/finalize`, nên `draft.invitedClubs` tự tới nơi. Không sửa adapter, không sửa `TournamentWizard.js`. |
| **Ghi lời mời khi finalize** | **T1.B** — route `/setup/finalize` đọc `body.draft.invitedClubs` và tạo lời mời **trong transaction**. |
| **Lưu `invitedClubs` khi lưu nháp** | **T1.B** thêm action `replace_invited_clubs` vào `/setup`; **integrator** thêm nhánh tương ứng vào `saveDraft` (`lib/tournamentV2Client.js`), vì `saveDraft` hiện chỉ gửi `athlete_ids`. |

**Cấm tuyệt đối:** gọi `inviteTournamentClub` tuần tự trong vòng lặp phía UI như wizard cũ. Đó chính là lỗi E của `plan-1.md` — nhiều API nối tiếp, nuốt lỗi 409, giải tồn tại nhưng thiếu dữ liệu. Lời mời ghi server-side, nguyên tử, cùng đơn vị với stage và fixtures.

**Exit gate:** `node tests/phase3/interclub-ui.test.js` xanh; tạo được cả giải nội bộ lẫn giao hữu qua workspace; lưu nháp giao hữu sống qua reload; `inviteTournamentClub` / `listAvailableTournamentClubs` có caller thật trở lại.

## 7. Wave 3 — Integration journeys và hardening

### T3.1 — Happy path internal doubles

**Owner:** QA A  
**Depends:** T2.D

Journey: mở tạo giải → nhập info → load roster thật → search/filter/select-all/unselect-one → pairing preview/apply → draw/swap → preview schedule → save draft → reload/resume → finalize → schedule page.

Chạy journey này **bằng ca 14 người**: 14 VĐV → 7 cặp → 2 bảng 4/3 → 9 trận vòng bảng → 2 bán kết chéo bảng + chung kết.

**Server assertions:** không duplicate tournament/division/stage/pair/match; draw locked; match count/identity khớp preview; tournament không tự LIVE.

**Server assertions bổ sung:**

- Đúng **hai** stage cho `group_knockout`, cùng `division_id`, có tuyến đi tiếp hợp lệ.
- Tổng **12 trận** (13 khi bật tranh hạng ba); trận knockout là placeholder chờ suất, không có entrant giả.
- Hoàn tất vòng bảng → advance lấy đúng suất → ghép đúng bán kết chéo bảng, đúng division.

### T3.2 — Edge journeys

**Owner:** QA B  
**Runs parallel with:** T3.1

- Inactive member selected và preserved.
- Odd doubles/unpaired blocker.
- Empty roster/load error/retry.
- Groups imbalance và knockout bye.
- Two-admin revision conflict.
- Member forbidden mutation.
- Retry fault tại từng checkpoint.
- Edit upstream invalidates draw sau confirmation.
- Legacy setup URL redirect.
- Hai thành viên **trùng tên** đi hết luồng roster → cặp → entrant mà không bị gộp; đổi tên thành viên không làm mất liên kết.
- Thành viên chưa có `athlete_id` — xử lý tường minh, không im lặng bỏ qua.
- `member_id` thuộc tenant khác bị chặn.
- Bỏ một người ở giữa danh sách sau khi đã ghép xong: các cặp còn lại và cặp đã khóa không đổi.
- Số lẻ (15 người): lưu nháp được, finalize bị chặn; không có cặp một người, BYE không thay đồng đội.
- Giải đã có trận bắt đầu/có tỉ số: mọi đường đổi cấu trúc qua setup bị chặn, dữ liệu và tỉ số nguyên vẹn.
- Advance khi kết quả vòng bảng **chưa đủ**: bị từ chối, không tạo cặp bán kết tạm.

### T3.3 — Accessibility/responsive

**Owner:** UI QA  
**Runs parallel with:** T3.1/T3.2

- Keyboard navigation/focus/labels.
- 390px không tràn ngang; target tối thiểu 44px.
- Tablet/desktop summary rail.
- Loading/error/empty states; loading cục bộ, không reset toàn trang.
- Theme thống nhất: không còn nền tối lẫn thẻ sáng giữa "tạo giải" và "quản lý giải" (GAP-THEME).
- Lỗi hiển thị cạnh phần cần sửa, không chỉ là thông báo thoáng qua.

### T3.4 — Fix loop

Bug được route theo ownership:

- Domain → T1.A owner.
- API/persistence → T1.B/T1.C owner.
- Shell → T2.A owner.
- Participants/pairing → T2.B owner.
- Draw/review → T2.C owner.
- Shared wiring/console/theme → integrator.

Mỗi fix có regression test. Không sửa test để che bug nếu contract chưa đổi chính thức.

---

## 8. Wave 4 — Release gate

Integrator chạy từ worktree:

```powershell
node tests/phase3/wizard-redesign-contract.test.js
node tests/tournament/ui-unified-wizard.contract.test.js
node tests/unified-setup-v2/run-all.js
node tests/unified-setup/run-all.js
npm run test:t-setup
npm run test:t-engines
npm run test:t-api
npm run test:t-ui
npm run test:t-draw
npm run test:regression
npm run build
```

Sau đó chạy browser journeys với fixture Supabase đã scope, kiểm tra advisors nếu có DDL và ghi:

- `_workspace/unified-setup-ux/99-qa-report.md`
- `evidence/unified-internal-tournament-setup-2026-09-19.md`

### Đo lại hiệu năng (GAP-PERF)

Lặp đúng kịch bản và điều kiện của `_workspace/unified-setup-ux/T0.3-perf-baseline.md`, ghi bảng **trước/sau** cho: số request mở nháp / lưu nháp / preview / chốt lịch, thời gian API, payload size, số lần tải trùng roster và sân, thời gian phản hồi sau thêm/bỏ người.

Các tối ưu được phép trong đợt này, chỉ khi baseline chỉ ra vấn đề:

- Ghi theo lô thay cho một request mỗi cặp.
- Giải nội bộ không tải danh sách CLB có thể mời.
- Console không tải toàn bộ danh sách giải chỉ để tìm một giải đang mở.
- Bỏ tải trùng bảng sân giữa console và màn điều hành.
- Cập nhật state cục bộ từ response thay vì reload toàn trang.
- Chỉ chạy song song những request độc lập.

Không cam kết mức giảm latency nếu không có số đo hai đầu.

**Release bị chặn nếu:** UX-01, ATH-01..07, preview/finalize invariant, finalize idempotency/error handling hoặc browser journey chính chưa chạy xanh.

**Release cũng bị chặn nếu:** ca 14 người không ra đúng 12 trận và hai stage có tuyến đi tiếp; thao tác thêm/bớt người còn phá cặp đã ghép; giải có tỉ số vẫn bị đổi cấu trúc qua setup; theme còn lẫn sáng/tối trên đường dùng chính; hoặc chưa có báo cáo hiệu năng trước/sau.

## 9. Ma trận ownership tóm tắt

| Workstream | Có thể song song | Không được chạm |
|---|---|---|
| T1.A Domain | T1.B/C/D | API, React, shared client |
| T1.B Aggregate/finalize | T1.A/C/D | Participant routes của T1.C |
| T1.C Roster/pair | T1.A/B/D | Setup aggregate/finalize |
| T1.D Browser harness | T1.A/B/C | Production code |
| T2.A Shell | T2.B/C | Step internals, shared entry points |
| T2.B Participants/pairing | T2.A/C | Shell, draw/review |
| T2.C Draw/review | T2.A/B | Shell, participants |
| T2.D Integrator | Sau T2.A/B/C | Không chạy song song trên shared files |
| T0.3 Perf baseline | T0.1/T0.2 | Production code |

## 10. Prompt bàn giao ngắn cho sub-agent

```text
Làm task <ID> trong docs/superpowers/plans/2026-09-19-unified-internal-tournament-setup-parallel.md.
Worktree: C:\Users\ductu\ranking-unified-setup-ux.
Đọc AGENTS.md, spec T0.1 và contract _workspace/unified-setup-ux/00-contract.md trước.
Chỉ sửa files thuộc ownership của task. Viết test đỏ trước, chạy test xanh sau.
Không sửa package.json hoặc shared entry points nếu không phải integrator.
Commit riêng; ghi handoff _workspace/unified-setup-ux/<ID>.md gồm files, API shape, test output, commit và rủi ro.
```

## 11. Thứ tự phân công khuyến nghị

1. Giao **T0.1**; sau khi contract khóa, giao **T0.2**. **T0.3** (baseline hiệu năng) chạy song song, phải xong trước Wave 2.
2. Chạy song song **T1.A + T1.B + T1.C + T1.D**.
3. Integrator reconcile Wave 1 và chạy contract suites.
4. **Cổng T0.3-live** (§5.5): QA đo baseline hiệu năng thật, người dùng cấp env/tenant. Không được bỏ qua.
5. Chạy song song **T2.A + T2.B + T2.C**.
6. Integrator làm **T2.D**.
7. Chạy song song **T3.1 + T3.2 + T3.3**; lặp **T3.4**.
8. Integrator thực hiện **Wave 4** và chỉ báo hoàn tất khi release gate xanh.

## 12. Checklist điều phối

- [ ] Mọi session đã đặt `PICKHUB_TASK_ID` và gọi skill `tournament-setup-invariants`.
- [ ] T0.1 contract đã khóa (gồm stage plan, pair identity, placeholder knockout, preflight schema).
- [ ] T0.2 có bằng chứng test đỏ, gồm ca 14 người.
- [ ] T0.3 baseline hiệu năng: khung đo đã ghi ở Wave 0; số liệu định lượng được đo tại cổng T0.3-live sau Wave 1, trước Wave 2.
- [ ] Wave 1 không có file overlap chưa xử lý.
- [ ] Domain/API contract suites xanh sau Wave 1.
- [ ] Wave 2 không sửa shared entry points ngoài integrator.
- [ ] Console setup kép đã bị loại khỏi đường dùng chính.
- [ ] T2.E: tạo được giải giao hữu qua workspace; `interclub-ui.test.js` xanh.
- [ ] Browser happy path xanh trên desktop và 390px.
- [ ] Revision conflict, retry và idempotency xanh.
- [ ] Preview/finalize match identities/count khớp.
- [ ] `group_knockout` tạo đủ hai stage + tuyến đi tiếp; ca 14 người ra 12 trận.
- [ ] Thêm/bớt người không phá cặp khác; cặp đã khóa được giữ.
- [ ] Số lẻ bị chặn ở finalize, không có cặp một người và không dùng BYE thay đồng đội.
- [ ] Giải đã có tỉ số không bị đổi cấu trúc qua luồng setup.
- [ ] Theme quản trị giải đã thống nhất, không còn `ops-*` xung đột.
- [ ] Báo cáo hiệu năng trước/sau trên cùng điều kiện đo.
- [ ] Regression và production build xanh.
- [ ] QA report và evidence đã ghi.