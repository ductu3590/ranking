# Prompt bàn giao IDE — Unified Internal Tournament Setup

**Plan gốc:** `docs/superpowers/plans/2026-09-19-unified-internal-tournament-setup-parallel.md`
**Worktree:** `C:\Users\ductu\ranking-unified-setup-ux`
**Branch:** `feat/tournament-unified-setup-ux`
**Baseline:** `943e539`
**Ngày:** 2026-09-19

Tài liệu này chỉ chứa **prompt để copy-paste**. Mọi nội dung kỹ thuật nằm trong plan gốc; prompt không nhắc lại để tránh lệch bản.

---

## 0. Cách dùng

1. Mở IDE session ở đúng worktree, dán **Prompt A (lead)**. Lead điều phối toàn bộ.
2. Nếu muốn tự tay giao từng task (kiểm soát chặt hơn, tốn nhiều session hơn): dán **Prompt B + phần riêng** cho từng task theo thứ tự ở §11 của plan.
3. Mỗi prompt con tự chứa đủ bối cảnh để một agent khởi động nguội (cold start) làm được việc.

**Không** chạy nhiều agent cùng lúc trên: `TournamentWizard.js`, `TournamentConsoleV2.js`, `ConsoleShell.js`, `lib/tournamentV2Client.js`, `package.json`, và toàn bộ `app/giai-dau/v2/console/*.css`. Đó là file của integrator (T2.D).

### Hạ tầng hỗ trợ đã dựng sẵn

| Thứ | Ở đâu | Tác dụng |
|---|---|---|
| Skill `tournament-setup-invariants` | `.claude/skills/tournament-setup-invariants/SKILL.md` | Bản rút gọn: 3 file đóng băng, 6 GAP, 7 bất biến nghiệp vụ, ca 14 người, ma trận ownership, checklist trước commit. Agent đọc skill này thay vì đọc lại plan 500+ dòng. |
| Hook `ownership-guard` | `.claude/hooks/ownership-guard.js`, đăng ký ở `.claude/settings.json` | Chặn ghi ra ngoài ownership, chặn 3 file đóng băng, chặn shared entry point với agent không phải integrator, chặn lệnh `DROP`/`TRUNCATE`/`db reset`. |

**BẮT BUỘC trước mỗi session agent:** đặt biến môi trường mã task, nếu không hook chỉ kiểm được file đóng băng.

```powershell
$env:PICKHUB_TASK_ID = "T1.A"
```

Giá trị hợp lệ: `T0.1` `T0.2` `T0.3` `T1.A` `T1.B` `T1.C` `T1.D` `T2.A` `T2.B` `T2.C` `T2.D` `LEAD` `T3.1` `T3.2` `T3.3`.

Van thoát, chỉ dùng khi lead đã đồng ý: `PICKHUB_ALLOW_FROZEN=1` (mở 3 file đóng băng), `PICKHUB_GUARD_OFF=1` (tắt hẳn hook).

---

## 1. Prompt A — Lead / Integrator (dán một lần, điều phối cả đợt)

```text
Bạn là lead kiêm integrator cho đợt "Unified Internal Tournament Setup" của dự án Pickhub.

Worktree: C:\Users\ductu\ranking-unified-setup-ux (branch feat/tournament-unified-setup-ux, baseline 943e539).
Làm việc hoàn toàn trong worktree này, không cd sang repo gốc.

ĐỌC TRƯỚC KHI LÀM BẤT CỨ VIỆC GÌ:
1. docs/superpowers/plans/2026-09-19-unified-internal-tournament-setup-parallel.md — plan thi hành, đọc HẾT.
2. docs/superpowers/plans/plan-1.md — audit gốc, giải thích vì sao có từng yêu cầu.
3. AGENTS.md và CLAUDE.md.
4. Skill tournament-setup-invariants — bất biến nghiệp vụ + ma trận ownership của chính đợt này.
5. Skill pickhub-engineering (quy ước kỹ thuật bắt buộc) và pickleball-formats.

TRƯỚC KHI LÀM VIỆC: đặt $env:PICKHUB_TASK_ID = "LEAD".
Hook .claude/hooks/ownership-guard.js chạy ở mọi Write/Edit/Bash và sẽ chặn nếu bạn ghi sai phạm vi.
Là integrator, bạn được sửa shared entry points; ba file đóng băng vẫn bị chặn cho tới khi bạn
chủ động bật PICKHUB_ALLOW_FROZEN=1 và ghi lý do vào handoff.

NHIỆM VỤ: điều phối thực thi plan theo đúng §11 "Thứ tự phân công khuyến nghị":
  Wave 0: T0.1 -> (T0.2 sau khi contract khóa) + T0.3 chạy song song.
  Wave 1: T1.A + T1.B + T1.C + T1.D song song.
  Reconcile Wave 1, chạy contract suites.
  Wave 2: T2.A + T2.B + T2.C song song, rồi T2.D do CHÍNH BẠN làm.
  Wave 3: T3.1 + T3.2 + T3.3 song song, lặp T3.4.
  Wave 4: release gate, chính bạn chạy.

CÁCH GIAO VIỆC: mỗi task là một sub-agent riêng, dùng đúng agent type ghi ở mục Owner của task
(tournament-architect / tournament-engine-dev / tournament-api-dev / tournament-ui-dev / tournament-qa).
Prompt giao việc lấy NGUYÊN VĂN từ docs/superpowers/plans/2026-09-19-prompt-giao-ide-unified-setup.md
mục tương ứng, không tự chế lại.
Mỗi prompt con phải bắt đầu bằng việc đặt PICKHUB_TASK_ID đúng mã task và gọi skill
tournament-setup-invariants. Agent nào không làm hai việc đó thì giao lại.

LUẬT CỨNG:
- Ownership file theo §9 của plan. Agent nào chạm file ngoài ownership thì từ chối kết quả và giao lại.
- Chỉ BẠN được sửa: app/giai-dau/v2/TournamentWizard.js, TournamentV2DashboardClient.js,
  console/ConsoleShell.js, console/TournamentConsoleV2.js, console/*.css, console/steps/*.js,
  lib/tournamentV2Client.js, package.json.
- Không sửa lib/tournament/setupContract.js, engines/roundRobin.js, draw.js — ba file này ĐÃ ĐÚNG
  trên baseline (xem bảng "Đã có trên baseline" §1 của plan). Ai đề xuất sửa phải nêu lý do và hỏi bạn.
- Không DROP / TRUNCATE / reset database. Dữ liệu test scope theo group_id riêng, dọn an toàn.
- Migration additive, forward-only. Trước khi viết migration phải preflight schema/RPC thật bằng
  Supabase MCP và đối chiếu npm run migration:ledger.
- Mỗi task: test đỏ trước, test xanh sau, commit riêng, handoff _workspace/unified-setup-ux/<ID>.md.
- Không sửa test để che bug khi contract chưa đổi chính thức.

NHIỄU CÓ SẴN TRONG WORKTREE — KHÔNG PHẢI LỖI, ĐỪNG DỪNG VÌ NÓ:
worktree này có sẵn thay đổi tài liệu chưa commit của chủ dự án, gồm 38 file plan cũ bị xóa có chủ ý
(bản gốc còn trên main), plan song song đã được sửa, và các file docs chưa track. Đây là trạng thái
mong muốn. Chỉ dừng và hỏi khi thấy thay đổi chưa commit trong app/, lib/, tests/ hoặc
database/migrations/ mà không phải của task đang chạy.

TRẠNG THÁI: trước mỗi wave, báo tôi bảng ngắn — task nào xong, test nào xanh, rủi ro gì, cần tôi quyết gì.
Dừng lại hỏi khi contract cần đổi (phải có ADR ngắn) hoặc khi phải chạm dữ liệu CLB thật.

Bắt đầu bằng T0.1. Đừng viết code production ở Wave 0.
```

---

## 2. Prompt B — Khung chung cho mọi task con

Thay `<ID>`, `<AGENT_TYPE>` rồi dán. Phần này **bắt buộc** đứng đầu mọi prompt con.

```text
Bạn là <AGENT_TYPE>, thực hiện task <ID> của đợt "Unified Internal Tournament Setup".

Worktree: C:\Users\ductu\ranking-unified-setup-ux. Làm việc trong worktree này, không cd ra ngoài.

HAI VIỆC ĐẦU TIÊN, LÀM NGAY TRƯỚC KHI ĐỌC GÌ KHÁC:
1. Đặt biến môi trường: $env:PICKHUB_TASK_ID = "<ID>"
   Hook .claude/hooks/ownership-guard.js dùng biến này để chặn ghi sai phạm vi. Không đặt thì bạn sẽ
   sửa nhầm file của agent khác và bị giao lại từ đầu.
2. Gọi skill tournament-setup-invariants. Đây là bản rút gọn của plan: 3 file đóng băng, 6 mã GAP,
   7 bất biến nghiệp vụ, ca nghiệm thu 14 người, ma trận ownership, checklist trước commit.

ĐỌC TIẾP:
- docs/superpowers/plans/2026-09-19-unified-internal-tournament-setup-parallel.md, đặc biệt:
  §1 (mục tiêu, bảng "Đã có trên baseline", bảng GAP, các quyết định nghiệp vụ bắt buộc),
  §2 (nguyên tắc song song), §9 (ma trận ownership), và mục task <ID> của bạn.
- _workspace/unified-setup-ux/00-contract.md (contract khóa ở T0.1). Nếu chưa có: dừng, báo lead.
- AGENTS.md; skill pickhub-engineering.

LUẬT CỨNG:
1. CHỈ sửa file thuộc ownership của <ID>. Cần file khác thì dừng và báo lead, không tự sửa.
2. Không sửa package.json, không sửa shared entry points (TournamentWizard.js, TournamentConsoleV2.js,
   ConsoleShell.js, lib/tournamentV2Client.js, console/*.css) — đó là của integrator T2.D.
3. Không sửa lib/tournament/setupContract.js, lib/tournament/engines/roundRobin.js,
   lib/tournament/draw.js. Ba file này đã đúng trên baseline 943e539; sửa là gây hồi quy.
4. Viết test ĐỎ trước, rồi mới viết code cho xanh. Dán output test vào handoff.
5. Không đổi shape trong 00-contract.md. Cần đổi thì viết ADR ngắn và hỏi lead.
6. Không gọi Supabase trực tiếp từ React component; đi qua lib/tournamentV2Client.js.
7. Không đọc role/group từ localStorage; dùng session server hiện hành. group_id lấy từ session,
   không tin giá trị client gửi lên.
8. Không DROP / TRUNCATE / reset DB; không dùng dữ liệu CLB thật ngoài test scope.
9. Commit riêng cho task, message tiếng Việt không dấu theo quy ước repo.
10. Kết thúc: ghi _workspace/unified-setup-ux/<ID>.md gồm — files đã đụng, API/domain shape,
    output test, hash commit, rủi ro và việc bàn lại cho task sau.
11. Hook chặn bạn (thông báo bắt đầu bằng "[ownership-guard] CHẶN") thì ĐỪNG tìm cách đi vòng:
    không tắt hook, không sửa .claude/settings.json, không đặt PICKHUB_GUARD_OFF hay
    PICKHUB_ALLOW_FROZEN. Dừng lại và báo lead kèm đường dẫn file bị chặn.
12. Trước khi commit, chạy hết checklist §8 của skill tournament-setup-invariants.

<PHẦN RIÊNG CỦA TASK — xem mục dưới>
```

---

## 3. Prompt riêng từng task

Dán **Prompt B** trước, rồi nối phần dưới.

### T0.1 — `tournament-architect`

```text
PHẦN RIÊNG T0.1:

Tạo hai tài liệu:
- docs/superpowers/specs/2026-09-19-unified-internal-tournament-setup.md
- _workspace/unified-setup-ux/00-contract.md

Nội dung phải khóa đủ các deliverable ở mục T0.1 của plan, gồm cả bốn mục bổ sung:
stage plan contract, pair identity contract, placeholder contract cho knockout, và preflight schema/RPC.

Hai điểm bắt buộc làm rõ, vì là hai lỗ hổng nghiêm trọng nhất (GAP-STAGE, GAP-PAIR):

1. Stage plan: lựa chọn "vòng bảng -> loại trực tiếp" phải ánh xạ ra ĐỦ hai stage cùng division_id,
   cộng tuyến đi tiếp tường minh (stage nguồn, stage đích, suất "Nhất A"/"Nhì B", cờ tranh hạng ba).
   Nguồn duy nhất là buildDivisionStagePayloads() trong lib/tournament/wizardModel.js — hàm này ĐÃ CÓ
   nhánh group_knockout nhưng hiện không nơi nào gọi ngoài test. Contract phải nói rõ ai gọi, gọi ở đâu.
   Cấm định nghĩa bộ chuyển đổi thể thức thứ hai.

2. Pair identity: cặp có ID ổn định, hai thành viên định danh bằng member_id (server ánh xạ athlete_id),
   cờ locked. Contract mô tả hành vi thêm người / xóa người / ghép lại / đổi người trong cặp,
   sao cho sửa một người KHÔNG làm đổi cặp khác.

PREFLIGHT bắt buộc trước khi chốt contract: dùng Supabase MCP đọc schema và RPC thật đang chạy, đối chiếu
với npm run migration:ledger. Ghi vào contract: bảng/cột/RPC nào ĐÃ có, cái nào THIẾU. Không suy ra
trạng thái database từ file SQL trong repo.

KHÔNG viết code production. KHÔNG sửa test.

Exit gate: contract đủ để T1.A/T1.B/T1.C/T2.* triển khai song song mà không phải hỏi nhau về shape.
Cuối contract liệt kê rõ: mã lỗi ổn định, mã blocker/warning, và tên field của SetupDraftV2.
```

### T0.2 — `tournament-qa`

```text
PHẦN RIÊNG T0.2:

Viết bộ test ĐỎ theo mục T0.2 của plan. Ownership:
- Rewrite tests/phase3/wizard-redesign-contract.test.js
- Rewrite tests/tournament/ui-unified-wizard.contract.test.js
- Create tests/unified-setup-v2/** (gồm run-all.js — file này chưa tồn tại, bạn tạo)

Phải có đủ các test đỏ liệt kê trong plan, KHÔNG ĐƯỢC THIẾU:
- Ca xuyên suốt 14 người: 14 VĐV -> 7 cặp -> 2 bảng chia 4/3 -> vòng bảng 6+3 = 9 trận ->
  bán kết chéo bảng (Nhất A-Nhì B, Nhất B-Nhì A) + chung kết = 12 trận; bật tranh hạng ba = 13 trận.
- group_knockout tạo đủ hai stage cùng division, có tuyến đi tiếp hợp lệ.
- Xóa một người ở giữa danh sách không làm đổi các cặp còn lại; cặp đã khóa không bị ghép lại.
- Số lẻ: lưu nháp được, finalize bị chặn; không có cặp một người; BYE không thay đồng đội thiếu.
- Giải đã có tỉ số: mọi đường đổi cấu trúc qua setup bị chặn, có mã lỗi.

Test chạy được bằng node thuần theo style repo (xem tests/unified-setup/_harness.js để tái dùng).
run-all.js gom hết và trả exit code khác 0 khi có ca đỏ.

TUYỆT ĐỐI không sửa production code và package.json. Test đỏ là kết quả mong muốn ở bước này.

Exit gate: lưu output test đỏ (nguyên văn) vào _workspace/unified-setup-ux/T0.2.md, kèm bảng
"test nào đỏ vì lý do gì" để Wave 1 biết phải làm xanh cái gì.
```

### T0.3 — `tournament-qa` (song song T0.1/T0.2)

```text
PHẦN RIÊNG T0.3:

Đo baseline hiệu năng của luồng tạo giải HIỆN TẠI, trước khi ai sửa gì. Đây là mốc để Wave 4 so sánh.

Ownership: chỉ tạo _workspace/unified-setup-ux/T0.3-perf-baseline.md. Không sửa production code.

Phải đo, trên CLB test đã scope group_id riêng:
- Số request và thời gian cho: mở nháp, lưu nháp, preview lịch, chốt tạo giải.
- Payload size của roster, danh sách giải, bảng sân.
- Số lần tải trùng: roster, sân (console và màn điều hành), danh sách giải trước khi tìm một giải đang mở.
- Thời gian phản hồi giao diện sau thêm/bỏ một người.

Ghi rõ cấu hình đo để Wave 4 lặp lại ĐÚNG điều kiện: thiết bị, viewport, mạng, số VĐV, giờ đo,
commit đang chạy. Dùng preview server của repo và playwright (đã có trong devDependencies);
scripts/qa/provision-browser-harness.js có sẵn để dựng dữ liệu.

KHÔNG tối ưu gì ở bước này. KHÔNG cam kết mức giảm latency. Chỉ đo và ghi.
```

### T1.A — `tournament-engine-dev` (hoặc `tournament-architect`)

```text
PHẦN RIÊNG T1.A:

Làm xanh phần domain của các test đỏ T0.2. Ownership đúng danh sách "Exclusive files" mục T1.A,
gồm hai file mới quan trọng: lib/tournament/pairingDraft.js và lib/tournament/stagePlan.js.

Trọng tâm 1 — pairingDraft.js (đóng GAP-PAIR):
Hiện app/giai-dau/v2/TournamentWizard.js gọi chunkPairs(next) trên TOÀN danh sách ở mọi thao tác
thêm/xóa/ngẫu nhiên, nên bỏ một người ở giữa làm xáo các cặp phía sau. Thay bằng một module thuần:
- Cặp có ID ổn định + cờ locked.
- addPerson -> chỉ vào danh sách chưa ghép, không ghép lại gì.
- removePerson -> chỉ tách cặp chứa người đó; mọi cặp khác giữ nguyên, KỂ CẢ cặp chưa khóa.
- regenerate() là hàm riêng, tường minh, luôn bỏ qua cặp đã khóa.
- Chặn một người xuất hiện ở hai cặp.
- Số lẻ: trả ba lựa chọn hợp lệ (thêm người / để dự bị ngoài danh sách thi đấu / đổi thể thức).
  Không bao giờ trả cặp một người, không dùng BYE thay đồng đội còn thiếu.

Trọng tâm 2 — stagePlan.js (đóng GAP-STAGE):
Bọc buildDivisionStagePayloads() sẵn có trong lib/tournament/wizardModel.js (CHỈ GỌI, không sửa file đó)
và sinh thêm tuyến đi tiếp. group_knockout phải trả đúng hai stage cùng division_id + danh sách progression.
Ca kiểm chứng: 14 người -> 7 cặp -> bảng 4/3 -> 9 + 3 = 12 trận (13 nếu tranh hạng ba).
Bảng lệch cỡ là CẢNH BÁO có nội dung ("bảng 4 cặp đá nhiều trận hơn bảng 3 cặp"), không phải blocker.

Trọng tâm 3 — readiness (đóng GAP-READY):
Tính từ dữ liệu thật, không hằng số true. Giải đa giai đoạn KHÔNG đòi mọi stage đều có trận mới coi là
xong bước lịch — playoff đang chờ kết quả vòng bảng là hợp lệ.

Ràng buộc: pure CommonJS, deterministic, không import React, không gọi API, không đụng Supabase.
Không sửa wizardModel.js, setupContract.js, engines/roundRobin.js, draw.js.
```

### T1.B — `tournament-api-dev`

```text
PHẦN RIÊNG T1.B:

Làm setup aggregate + preview + finalize theo mục T1.B của plan. Ownership đúng danh sách trong plan.
Không đụng file của T1.A và participant routes của T1.C.

Yêu cầu nền: admin guard, group_id lấy từ session, revision CAS, idempotency key, checkpoint result,
tuyệt đối không "thành công giả" khi lỗi giữa chừng.

Yêu cầu bổ sung, bám sát plan:
- GAP-STAGE: finalize ghi ĐỦ stage theo stagePlan của T1.A + tuyến đi tiếp, trong MỘT đơn vị nguyên tử
  cùng stage entrants, fixtures và khóa draw. Sau finalize không được tồn tại trạng thái
  "draw đã khóa nhưng thiếu lịch" hoặc "đã xóa entrants nhưng chưa tạo lại".
- Khung knockout: tạo trận CHỜ suất đi tiếp theo placeholder contract của T0.1; cấm insert entrant giả.
- Progression scope: tham chiếu stage đích TƯỜNG MINH, kiểm tra cùng tenant / cùng giải / cùng division.
  Không suy ra bằng stage_order + 1.
- Bảo toàn dữ liệu: finalize TỪ CHỐI khi giải/division đã có trận bắt đầu hoặc đã có tỉ số, trả mã lỗi
  ổn định. Không backfill lịch, không tự thêm stage vào giải cũ.
- Không xóa-rồi-tạo-lại khi mở hoặc lưu nháp.

Migration: chỉ viết khi contract chứng minh schema thiếu. Trước đó preflight bằng Supabase MCP và
npm run migration:ledger. Additive, forward-only, tenant-scoped. RPC ghi không mở cho browser gọi trực tiếp;
kiểm tra quyền thực thi và search_path. Có DDL thì chạy security/performance advisors.

Exit gate: preview/finalize invariant xanh, VÀ mô phỏng lỗi tại TỪNG điểm ghi để chứng minh không còn
trạng thái dở dang. Dán kịch bản mô phỏng lỗi vào handoff.
```

### T1.C — `tournament-api-dev` (agent thứ hai) hoặc `tournament-engine-dev`

```text
PHẦN RIÊNG T1.C:

Siết contract roster/participant/pair theo mục T1.C của plan.
Trước khi sửa, LIỆT KÊ chính xác các route sẽ đụng vào handoff và xác nhận không trùng ownership T1.B.

Yêu cầu nền: roster trả cả active và inactive; selection không phụ thuộc filter đang bật;
preview pair KHÔNG ghi DB; apply giữ identity; unpaired hiện rõ; revision conflict ổn định.

Yêu cầu bổ sung:
- Danh tính theo ID: chọn/bỏ chọn bằng member_id, server ánh xạ sang athlete_id. Tên chỉ là snapshot
  hiển thị. Hai người TRÙNG TÊN phải là hai bản ghi riêng biệt xuyên suốt roster -> cặp -> entrant.
  Trường hợp chưa có athlete_id xử lý tường minh, không im lặng bỏ qua.
- Cross-tenant: member_id ngoài tenant/giải bị chặn, mã lỗi ổn định.
- Ổn định cặp phía server: apply pair dùng pair ID của pairingDraft (T1.A), tôn trọng cờ locked;
  apply lại cùng một danh sách không được đảo cặp.

Viết test dưới tests/unified-setup-v2/participants/.
```

### T1.D — `tournament-qa`

```text
PHẦN RIÊNG T1.D:

Dựng browser harness và fixture theo mục T1.D của plan. Ownership: tests/unified-setup-v2/browser/**
và fixture/helper riêng. KHÔNG sửa production code.

Playwright đã có sẵn trong devDependencies; scripts/qa/provision-browser-harness.js và
tests/unified-setup/_harness.js đã có — tái dùng, đừng dựng lại từ đầu.

Bắt buộc:
- Viewport 390px / tablet / desktop.
- Fixture group riêng, scope group_id, cleanup an toàn (không DROP/TRUNCATE).
- Fixture có sẵn ca 14 người (7 cặp / 2 bảng 4-3) và ca 15 người để thử nhánh số lẻ.
- Trong lúc phát triển, test được phép skip kèm lý do rõ nếu thiếu env; nhưng release gate
  KHÔNG chấp nhận trạng thái BLOCKED, nên ghi rõ env cần có.

Viết tài liệu fixture + cleanup vào handoff để Wave 3 dùng lại.
```

### T2.A — `tournament-ui-dev` (A)

```text
PHẦN RIÊNG T2.A:

Dựng workspace shell 4 bước theo mục T2.A của plan. Ownership: chỉ các file MỚI dưới
app/giai-dau/v2/setup/ đúng danh sách trong plan (workspace, stepper, summary rail, action bar,
setup.css, context/reducer).

TUYỆT ĐỐI không đụng: TournamentWizard.js, TournamentV2DashboardClient.js, lib/tournamentV2Client.js,
console/**. Đó là integrator T2.D. Nếu T1.B chưa merge, dùng mock client theo shape trong 00-contract.md.

Acceptance: responsive (ưu tiên 390px), điều hướng bàn phím, action bar dính đáy, trạng thái lưu,
step guard, resume đúng bước còn dở. Toàn bộ I/O nghiệp vụ đi qua adapter, không rải trong component.

Hai nút phải tách bạch rõ về nhãn lẫn hành vi: "Lưu nháp" và "Chốt bốc thăm & tạo lịch".
Trạng thái "đã lưu" CHỈ hiện khi server xác nhận.
Giao diện dùng token sáng của CLB, không dùng bộ màu ops-*.
```

### T2.B — `tournament-ui-dev` (B)

```text
PHẦN RIÊNG T2.B:

Làm Bước 1 (thông tin & người tham gia) và Bước 2 (thể thức & ghép cặp) theo mục T2.B của plan.
Ownership: steps/InfoParticipantsStep.js, steps/FormatPairingStep.js, participants/**, pairing/**,
test tests/unified-setup-v2/ui/participants-*. Không đụng shell (T2.A) và draw/review (T2.C).

Đóng GAP-ROSTER:
- Nút NỔI BẬT "Chọn toàn bộ thành viên đang hoạt động", TÁCH BẠCH với "chọn kết quả đang hiển thị".
- Luôn hiện "Đã chọn X/Y".
- Tìm kiếm theo tên nhưng chọn/bỏ chọn bằng member_id; hai người trùng tên hiển thị phân biệt được.
- Filter Đang hoạt động / Ngừng hoạt động / Tất cả; lựa chọn bị ẩn bởi filter KHÔNG bị mất; có badge
  cảnh báo khi đã chọn người ngừng hoạt động.

Đóng GAP-PAIR (dùng lib/tournament/pairingDraft.js của T1.A, không tự viết logic ghép cặp trong React):
- Thêm một người -> chỉ vào danh sách chưa ghép.
- Bỏ một người ở giữa danh sách -> các cặp còn lại KHÔNG đổi.
- Khóa/mở khóa từng cặp.
- "Ghép lại các cặp chưa khóa" là nút riêng, có xác nhận, không chạy ngầm.
- Đổi người trong một cặp là thao tác tường minh, không kéo theo cặp khác.
- Số lẻ: hiện ba lựa chọn theo quyết định nghiệp vụ ở §1 của plan; không tự tạo cặp một người.
- Danh sách chưa ghép hiện riêng, là blocker trước bước bốc thăm khi đánh đôi/đội.

Lựa chọn và trạng thái cặp giữ nguyên sau reload. Mobile không phụ thuộc drag-and-drop.
Giao diện tiếng Việt, mobile-first, dùng token sáng của CLB.
```

### T2.C — `tournament-ui-dev` (C)

```text
PHẦN RIÊNG T2.C:

Làm Bước 3 (bốc thăm & xem trước lịch) và Bước 4 (kiểm tra & chốt) theo mục T2.C của plan.
Ownership: steps/DrawScheduleStep.js, steps/ReviewFinalizeStep.js, draw/**,
test tests/unified-setup-v2/ui/draw-*, review-*. Không đụng shell (T2.A) và participants (T2.B).

Trên UI phải phân biệt rõ bốn nghiệp vụ, không gộp nhãn:
  ghép cặp -> bốc thăm -> sinh trận -> xếp sân/giờ.
Xếp sân/giờ nằm SAU khi đã có fixtures và không được làm đổi kết quả bốc thăm.

Đóng GAP-STAGE ở lớp UI:
- Cấu hình vòng bảng -> loại trực tiếp ngay tại bước này: số bảng, số cặp mỗi bảng, suất đi tiếp mỗi bảng,
  cách ghép nhánh, có tranh hạng ba hay không. Không để người dùng chọn một tên thể thức mà không biết
  giải sẽ chạy thế nào.
- Sơ đồ đi tiếp hiển thị từ tuyến THẬT (Nhất A - Nhì B, ...), không dựng hình minh họa riêng.
- Bracket hiển thị trận CHỜ suất đi tiếp theo placeholder contract; không hiện VĐV giả.

Summary bước 4 dùng đúng số liệu tính được, ví dụ mẫu:
  14 VĐV · 7 cặp · Bảng A 4 cặp / Bảng B 3 cặp · vòng bảng 9 trận · bán kết 2 · chung kết 1 · tổng 12
  (13 nếu tranh hạng ba), kèm ghi chú bảng 4 cặp đá nhiều trận hơn bảng 3 cặp.

Khác:
- Sửa cấu hình/cặp làm draw cũ hết hợp lệ -> đánh dấu "cần bốc lại", KHÔNG tự sinh lại.
- Giải đã có tỉ số: nút chốt bị vô hiệu kèm lý do NGAY, không để bấm rồi mới báo lỗi.
- Phân biệt blocker và warning; lỗi hiện cạnh phần cần sửa.
- Sau finalize điều hướng tới Lịch thi đấu, không tự chuyển giải sang LIVE.
```

### T2.D — Integrator (chính lead làm)

```text
PHẦN RIÊNG T2.D:

Nối các slice của T2.A/B/C vào đường dùng chính và dọn console, theo mục T2.D của plan.
Bạn là người DUY NHẤT được sửa nhóm file shared liệt kê trong mục đó (đã bao gồm console/*.css và
console/steps/*.js sau lần cập nhật plan).

Việc bắt buộc:
- Xóa setup navigation kép; console không còn giữ wizard setup thứ hai.
- Redirect URL setup cũ: draft -> workspace 4 bước; finalized -> tab vận hành phù hợp.
- Legacy repair chỉ hiện có điều kiện; không render hai editor cùng ghi một nguồn.
- Giữ nguyên các tab vận hành sau finalize.

GAP-READY: thay readiness.athletes = true (hiện gán cứng trong console/TournamentConsoleV2.js) bằng giá trị
tính từ dữ liệu thật qua domain của T1.A. Console chỉ mặc định mở màn điều hành khi ĐÃ CÓ lịch; ngược lại
đưa về bước còn thiếu và nêu lý do chặn cụ thể. Trạng thái "đã lưu" chỉ hiện khi server xác nhận.

GAP-THEME: toàn bộ phần quản trị giải kế thừa giao diện SÁNG của CLB. Gỡ các khai báo ops-* xung đột
theo từng component (console/shell.css, console/console.css, ConsoleShell.js, TournamentConsoleV2.js,
console/steps/{ControlStep,CourtsStep,DrawStep,LogStep}.js), quy về token giao diện chung. Không còn cảnh
nền tối + thẻ trắng + chữ nhạt đan xen khi đi từ "tạo giải" sang "quản lý giải". Chế độ tối cho màn hình
tại sân, nếu cần, là chế độ BẬT RIÊNG, không tự đổi màu theo điều hướng.
Đây KHÔNG phải redesign toàn bộ màn điều hành — chỉ thống nhất theme, input, nút chính, trạng thái trống.

Exit gate: toàn bộ contract UI + API xanh trước khi chạy browser journey;
grep "ops-" trong app/giai-dau/v2 không còn khai báo màu xung đột.
```

### T3.1 — QA A

```text
PHẦN RIÊNG T3.1:

Chạy happy path internal doubles theo mục T3.1 của plan, BẰNG CA 14 NGƯỜI.

Journey: mở tạo giải -> nhập info -> load roster thật -> tìm kiếm/filter/chọn toàn bộ/bỏ chọn một người ->
pairing preview/apply -> bốc thăm/đổi chỗ -> preview lịch -> lưu nháp -> reload và resume -> chốt -> trang lịch.

Server assertions bắt buộc:
- Không duplicate tournament/division/stage/pair/match.
- Draw đã khóa; match count và identity khớp preview.
- Giải KHÔNG tự chuyển LIVE.
- Đúng HAI stage cho group_knockout, cùng division_id, tuyến đi tiếp hợp lệ.
- Tổng 12 trận (13 khi bật tranh hạng ba); trận knockout là placeholder chờ suất, không có entrant giả.
- Hoàn tất vòng bảng -> advance lấy đúng suất -> ghép đúng bán kết chéo bảng, đúng division.

Dùng fixture của T1.D. Scope group_id test, cleanup an toàn.
Bug thì báo theo ownership ở T3.4, đừng tự sửa production code ngoài phạm vi QA.
```

### T3.2 — QA B

```text
PHẦN RIÊNG T3.2:

Chạy toàn bộ edge journeys liệt kê ở mục T3.2 của plan (song song T3.1). Không bỏ ca nào.

Chú ý riêng các ca mới thêm:
- Hai thành viên TRÙNG TÊN đi hết luồng roster -> cặp -> entrant mà không bị gộp; đổi tên không mất liên kết.
- Thành viên chưa có athlete_id — xử lý tường minh.
- member_id thuộc tenant khác bị chặn.
- Bỏ một người ở giữa danh sách sau khi đã ghép xong: cặp còn lại và cặp đã khóa KHÔNG đổi.
- Số lẻ 15 người: lưu nháp được, finalize bị chặn; không cặp một người; BYE không thay đồng đội.
- Giải đã có trận bắt đầu / có tỉ số: mọi đường đổi cấu trúc qua setup bị chặn, dữ liệu và tỉ số nguyên vẹn.
- Advance khi kết quả vòng bảng CHƯA đủ: bị từ chối, không tạo cặp bán kết tạm.
- Hai admin sửa đồng thời -> 409, không ghi đè âm thầm.
- Retry fault tại TỪNG checkpoint.

Với mỗi ca, ghi: bước tái hiện, kỳ vọng, thực tế, mã lỗi trả về.
```

### T3.3 — UI QA

```text
PHẦN RIÊNG T3.3:

Kiểm tra accessibility và responsive theo mục T3.3 của plan (song song T3.1/T3.2).

- Điều hướng bàn phím, focus order, label đầy đủ.
- 390px không tràn ngang; vùng chạm tối thiểu 44px.
- Tablet/desktop: summary rail hiển thị đúng.
- Loading/error/empty states: loading CỤC BỘ, không reset toàn trang.
- Theme thống nhất: không còn nền tối lẫn thẻ sáng giữa "tạo giải" và "quản lý giải" (GAP-THEME).
- Lỗi hiển thị cạnh phần cần sửa, không phải toast thoáng qua.

Chụp ảnh màn hình làm bằng chứng cho từng viewport.
```

### Wave 4 — Release gate (lead chạy)

```text
PHẦN RIÊNG WAVE 4:

Chạy đúng khối lệnh ở §8 của plan, từ worktree, không bỏ lệnh nào. Ghi output thật, không tóm tắt lại.

Sau đó chạy browser journeys với fixture Supabase đã scope, kiểm tra advisors nếu có DDL, và ghi:
- _workspace/unified-setup-ux/99-qa-report.md
- evidence/unified-internal-tournament-setup-2026-09-19.md

ĐO LẠI HIỆU NĂNG: lặp ĐÚNG kịch bản và điều kiện trong _workspace/unified-setup-ux/T0.3-perf-baseline.md,
ghi bảng trước/sau. Chỉ áp dụng các tối ưu liệt kê trong plan và chỉ khi baseline chỉ ra vấn đề.
Không cam kết mức giảm latency nếu không có số đo hai đầu.

Đối chiếu đủ hai nhóm điều kiện chặn release ở §8, và toàn bộ checklist §12.
Chỉ báo hoàn tất khi TẤT CẢ xanh. Nếu có mục không chạy được, ghi rõ mục đó và lý do — không được
báo hoàn tất kèm ghi chú mờ.
```

---

## 4. Thứ tự dán prompt

| Bước | Dán | Song song |
|---|---|---|
| 1 | Prompt A (lead) | — |
| 2 | T0.1 | T0.3 |
| 3 | T0.2 | T0.3 |
| 4 | T1.A, T1.B, T1.C, T1.D | cả bốn |
| 5 | (lead reconcile + chạy contract suites) | — |
| 6 | T2.A, T2.B, T2.C | cả ba |
| 7 | T2.D | — (lead làm một mình) |
| 8 | T3.1, T3.2, T3.3 | cả ba, lặp T3.4 |
| 9 | Wave 4 | — |
