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

- `docs/superpowers/plans/2026-09-07-tournament-create-wizard-redesign.md`
- `docs/superpowers/specs/2026-09-07-tournament-create-wizard-redesign.md`

Backend setup/checkpoint/revision/readiness hiện có được tái sử dụng. Không viết lại engine hoặc persistence nếu contract hiện tại đáp ứng. Preview bắt buộc dùng entrant, pair/team identity, draw và stage config thật; không dùng entrant giả từ số lượng.

### Quyết định mặc định để agent không bị chặn

- Setup draft luôn mở lại bằng workspace 4 bước; console không giữ wizard setup thứ hai.
- `Lưu nháp`: lưu checkpoint an toàn, không lock roster/draw, không sinh lịch chính thức; ở lại workspace và hiện trạng thái đã lưu. Danh sách giải có CTA `Tiếp tục thiết lập`.
- Sau finalize: điều hướng tới **Lịch thi đấu**; không tự chuyển giải sang LIVE.
- Inactive member: mặc định ẩn bởi filter `Đang hoạt động`, vẫn chọn được trong `Tất cả/Ngừng hoạt động`, lựa chọn cũ không bị mất và có cảnh báo.
- VĐV chưa ghép: hiện danh sách riêng; là blocker khi đánh đôi/đội trước bước bốc thăm.
- URL console setup cũ được redirect tương thích: draft → workspace; finalized → tab vận hành phù hợp.

## 2. Nguyên tắc làm song song

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
- Readiness blocker/warning taxonomy bằng mã ổn định.
- Quy tắc redirect draft/finalized.

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

**Không sửa:** production code và `package.json`.

**Exit gate:** lưu output test đỏ trong `_workspace/unified-setup-ux/T0.2.md`.

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
- Modify `lib/tournament/wizardDraft.js`
- Tests tương ứng dưới `tests/unified-setup-v2/domain/`

**Không sửa:** React, API route, client API.

**Acceptance:** pure CommonJS, deterministic; test transition/invalidation, odd doubles, inactive warning, groups/byes và court/time estimate.

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

**Exit gate:** preview/finalize invariant test xanh; chạy security/performance advisors nếu có DDL.

### T1.C — Roster/participant/pair contract hardening

**Owner:** `tournament-api-dev` thứ hai hoặc `tournament-engine-dev`  
**Depends:** T0.1  
**Exclusive files:**

- Roster/participant/pair routes hiện có; liệt kê chính xác trong handoff trước khi sửa
- Pair/team domain helpers riêng
- Tests dưới `tests/unified-setup-v2/participants/`

**Yêu cầu:** roster trả active + inactive; selection không phụ thuộc filter; preview pair không ghi DB; apply giữ identity; unpaired rõ; revision conflict ổn định.

**Boundary:** không sửa setup aggregate/finalize files của T1.B.

### T1.D — Browser harness và fixtures

**Owner:** `tournament-qa`  
**Depends:** T0.1; có thể bắt đầu cùng T1.A–C  
**Exclusive files:**

- Create `tests/unified-setup-v2/browser/**`
- Create fixture/helper riêng; không sửa production
- Tài liệu fixture/test cleanup

**Yêu cầu:** viewport 390px/tablet/desktop; fixture group riêng; safe cleanup. Test có thể skip với lý do rõ nếu thiếu env trong lúc phát triển, nhưng release gate không chấp nhận `BLOCKED`.

---

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

### T2.C — Step 3 draw + Step 4 review/finalize

**Owner:** `tournament-ui-dev C`  
**Depends:** T1.A + T1.B  
**Exclusive files:**

- `app/giai-dau/v2/setup/steps/DrawScheduleStep.js`
- `app/giai-dau/v2/setup/steps/ReviewFinalizeStep.js`
- `app/giai-dau/v2/setup/draw/**`
- Component tests `tests/unified-setup-v2/ui/draw-*`, `review-*`

**Acceptance:** roll/reroll/swap; groups/bracket/bye thật; courts/time metrics; blocker vs warning; computed summary; save draft/finalize/retry; post-finalize schedule destination.

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

**Yêu cầu:** xóa setup navigation kép; redirect URL cũ; legacy repair chỉ hiện có điều kiện; không render hai editor cùng ghi; giữ operations tabs sau finalize.

**Exit gate:** tất cả contract UI + API xanh trước browser journey.

---

## 7. Wave 3 — Integration journeys và hardening

### T3.1 — Happy path internal doubles

**Owner:** QA A  
**Depends:** T2.D

Journey: mở tạo giải → nhập info → load roster thật → search/filter/select-all/unselect-one → pairing preview/apply → draw/swap → preview schedule → save draft → reload/resume → finalize → schedule page.

**Server assertions:** không duplicate tournament/division/stage/pair/match; draw locked; match count/identity khớp preview; tournament không tự LIVE.

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

### T3.3 — Accessibility/responsive

**Owner:** UI QA  
**Runs parallel with:** T3.1/T3.2

- Keyboard navigation/focus/labels.
- 390px không tràn ngang; target tối thiểu 44px.
- Tablet/desktop summary rail.
- Loading/error/empty states.

### T3.4 — Fix loop

Bug được route theo ownership:

- Domain → T1.A owner.
- API/persistence → T1.B/T1.C owner.
- Shell → T2.A owner.
- Participants/pairing → T2.B owner.
- Draw/review → T2.C owner.
- Shared wiring/console → integrator.

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
npm run build
```

Sau đó chạy browser journeys với fixture Supabase đã scope, kiểm tra advisors nếu có DDL và ghi:

- `_workspace/unified-setup-ux/99-qa-report.md`
- `evidence/unified-internal-tournament-setup-2026-09-19.md`

**Release bị chặn nếu:** UX-01, ATH-01..07, preview/finalize invariant, finalize idempotency/error handling hoặc browser journey chính chưa chạy xanh.

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

1. Giao **T0.1**; sau khi contract khóa, giao **T0.2**.
2. Chạy song song **T1.A + T1.B + T1.C + T1.D**.
3. Integrator reconcile Wave 1 và chạy contract suites.
4. Chạy song song **T2.A + T2.B + T2.C**.
5. Integrator làm **T2.D**.
6. Chạy song song **T3.1 + T3.2 + T3.3**; lặp **T3.4**.
7. Integrator thực hiện **Wave 4** và chỉ báo hoàn tất khi release gate xanh.

## 12. Checklist điều phối

- [ ] T0.1 contract đã khóa.
- [ ] T0.2 có bằng chứng test đỏ.
- [ ] Wave 1 không có file overlap chưa xử lý.
- [ ] Domain/API contract suites xanh sau Wave 1.
- [ ] Wave 2 không sửa shared entry points ngoài integrator.
- [ ] Console setup kép đã bị loại khỏi đường dùng chính.
- [ ] Browser happy path xanh trên desktop và 390px.
- [ ] Revision conflict, retry và idempotency xanh.
- [ ] Preview/finalize match identities/count khớp.
- [ ] Regression và production build xanh.
- [ ] QA report và evidence đã ghi.