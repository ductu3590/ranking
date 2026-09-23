---
name: tournament-setup-invariants
description: Bất biến nghiệp vụ và ranh giới ownership của đợt "Unified Internal Tournament Setup" (workspace 4 bước cho giải nội bộ CLB). Dùng khi làm BẤT KỲ task nào mang mã T0.x / T1.x / T2.x / T3.x của đợt này, hoặc khi đụng tới setup giải nội bộ, ghép cặp, bốc thăm, sinh lịch, tạo stage vòng bảng + loại trực tiếp, readiness console, theme trang quản trị giải. Đọc skill này TRƯỚC khi sửa code, để không phải đọc lại toàn bộ plan 500+ dòng.
---

# Unified Internal Tournament Setup — Bất biến

Plan thi hành đầy đủ: `docs/superpowers/plans/2026-09-19-unified-internal-tournament-setup-parallel.md`
Audit gốc (vì sao có từng yêu cầu): `docs/superpowers/plans/plan-1.md`
Prompt bàn giao: `docs/superpowers/plans/2026-09-19-prompt-giao-ide-unified-setup.md`
Contract khóa ở T0.1: `_workspace/unified-setup-ux/00-contract.md`

Skill này là bản rút gọn để **nhớ đúng** giữa các wave. Khi skill và plan mâu thuẫn, **plan thắng** — và báo lead để sửa skill.

---

## 1. Ba file ĐÃ ĐÚNG trên baseline `943e539` — cấm sửa

Sửa ba file này là gây hồi quy, vì chúng vừa được fix ở chính commit baseline:

| File | Đã fix gì |
|---|---|
| `lib/tournament/setupContract.js` | `resolveGroupCount()` gom alias `groupCount` / `groups` / `group_count`, ném `CONFLICTING_GROUP_COUNT` khi mâu thuẫn |
| `lib/tournament/engines/roundRobin.js` | Nhánh `assigned` tôn trọng `group_label` đã bốc; ném `INCOMPLETE_GROUP_ASSIGNMENT` / `GROUP_ASSIGNMENT_COUNT_MISMATCH` |
| `lib/tournament/draw.js` | Bỏ qua cảnh báo `DRAW_SAME_CLUB_IN_GROUP` khi `organizerMode === 'internal'` |

Cần sửa thật thì **dừng, nêu lý do, hỏi lead**. Hook `ownership-guard` sẽ chặn; chỉ mở bằng `PICKHUB_ALLOW_FROZEN=1` sau khi lead đồng ý.

`lib/tournament/wizardModel.js` cũng chỉ được **gọi**, không sửa (trừ khi bạn là integrator và đã bàn với lead).

---

## 2. Sáu lỗ hổng phải đóng

| Mã | Vấn đề | Bằng chứng |
|---|---|---|
| **GAP-STAGE** | "Vòng bảng + loại trực tiếp" chỉ tạo **một** stage, không có tuyến đi tiếp | `TournamentWizard.js` chỉ có checkpoint `GROUP_STAGE`; `buildDivisionStagePayloads()` đã có nhánh `group_knockout` nhưng **không nơi nào gọi** ngoài test |
| **GAP-PAIR** | Thêm/bớt một người ghép lại toàn bộ, phá cặp đã có; không có khóa cặp | `TournamentWizard.js` gọi `chunkPairs(next)` trên toàn danh sách ở mọi thao tác |
| **GAP-ROSTER** | Không có "Chọn toàn bộ thành viên" | Không có thao tác chọn hàng loạt trong `wizard/StepRegister.js` |
| **GAP-READY** | Bước VĐV luôn báo hoàn thành | `console/TournamentConsoleV2.js` gán cứng `readiness.athletes = true` |
| **GAP-THEME** | Console dùng bộ màu `ops-*` riêng, lẫn với token chung | `console/shell.css`, `ConsoleShell.js`, `TournamentConsoleV2.js`, `console/steps/{ControlStep,CourtsStep,DrawStep,LogStep}.js` |
| **GAP-PERF** | Chưa có số đo thực tế | Baseline ở `_workspace/unified-setup-ux/T0.3-perf-baseline.md` |

---

## 3. Bảy bất biến nghiệp vụ

Mỗi dòng dưới đây là một câu hỏi bạn phải trả lời "có" trước khi commit.

### 3.1 Cấu trúc giai đoạn
`group_knockout` tạo **đủ hai stage** cùng `division_id`, cộng tuyến đi tiếp tường minh: stage nguồn, stage đích, suất dạng `Nhất A` / `Nhì B`, cờ tranh hạng ba.
Nguồn duy nhất là `buildDivisionStagePayloads()`. **Cấm** viết bộ chuyển đổi thể thức thứ hai.

### 3.2 Khung trận knockout
Chốt setup có thể tạo trận **chờ suất đi tiếp**; chỉ gán entry khi kết quả vòng trước được xác nhận.
Preview, dữ liệu lưu và màn bracket dùng **chung một** cách biểu diễn. **Cấm** tạo VĐV/entrant giả để lấp chỗ.

### 3.3 Ổn định ghép cặp
Cặp có **ID ổn định** + cờ `locked`; không suy ra từ thứ tự danh sách.

- Thêm người → chỉ vào danh sách **chưa ghép**, không ghép lại gì.
- Xóa người → chỉ tách cặp chứa người đó. Mọi cặp khác giữ nguyên, **kể cả cặp chưa khóa**.
- "Ghép lại" là thao tác **riêng, tường minh**, luôn bỏ qua cặp đã khóa.
- Một người không được xuất hiện ở hai cặp.

### 3.4 Số người lẻ
Đánh đôi lẻ người → đưa **ba lựa chọn**: thêm một người cho đủ / để một người dự bị ngoài danh sách thi đấu / đổi thể thức phù hợp nếu đã hỗ trợ.

**Cấm:** tự bỏ người cuối, tạo cặp một người, dùng BYE thay đồng đội còn thiếu.
BYE chỉ xử lý suất/cặp **nghỉ lượt**, không giải quyết một cặp thiếu người.

### 3.5 Danh tính theo ID
Chọn/bỏ chọn bằng `member_id`; server ánh xạ sang `athlete_id`. Tên chỉ là **snapshot hiển thị**.
Hai người **trùng tên** là hai bản ghi riêng biệt xuyên suốt roster → cặp → entrant.
Chưa có `athlete_id` → xử lý tường minh, không im lặng bỏ qua.
`member_id` ngoài tenant → chặn, mã lỗi ổn định.

### 3.6 Bảo toàn dữ liệu
Giải đã có **trận bắt đầu** hoặc đã có **tỉ số** → **không** được đổi cấu trúc qua luồng setup; finalize chặn và nêu lý do.
Không backfill lịch. Không tự thêm stage vào giải cũ.
**Không xóa-rồi-tạo-lại** khi mở hoặc lưu nháp — ghi đè chỉ khi người dùng chọn có chủ đích, và trong một transaction.

### 3.7 Toàn vẹn khi ghi
"Tạo thành công" nghĩa là cấu hình và danh sách bắt buộc **đã lưu đầy đủ**, không phải chỉ tạo được bản ghi giải.
Sau finalize **không** được tồn tại trạng thái "draw đã khóa nhưng thiếu lịch" hay "đã xóa entrants nhưng chưa tạo lại".
Tuyến đi tiếp tham chiếu stage đích **tường minh**, kiểm tra cùng tenant / giải / division — **không** suy ra bằng `stage_order + 1`.

---

## 4. Ca nghiệm thu xuyên suốt — 14 người

Thuộc lòng con số này. Mọi lớp (domain, API, UI, QA) phải ra cùng kết quả.

```
14 VĐV → 7 cặp → 2 bảng chia 4/3
  Bảng A: 4 cặp → 4 × 3 / 2 = 6 trận
  Bảng B: 3 cặp → 3 × 2 / 2 = 3 trận
  Vòng bảng: 9 trận
  Bán kết: Nhất A – Nhì B, Nhất B – Nhì A  → 2 trận
  Chung kết: 1 trận
  TỔNG: 12 trận   (13 nếu bật tranh hạng ba)
```

Bảng 4 cặp đá nhiều trận hơn bảng 3 cặp → đây là **cảnh báo có nội dung** cho BTC, không phải blocker.

Ca số lẻ đối chứng: **15 người** → lưu nháp được, finalize bị chặn.

---

## 5. Bốn nghiệp vụ không được gộp nhãn

```
ghép cặp        — ai đánh cùng ai
   ↓
bốc thăm        — cặp nào vào bảng/vị trí nào
   ↓
sinh trận       — những cặp nào gặp nhau
   ↓
xếp sân/giờ     — trận nào đấu ở đâu, lúc nào
```

Xếp sân/giờ nằm **sau** khi đã có fixtures và **không** làm đổi kết quả bốc thăm.
Sửa cấu hình/cặp khiến draw cũ hết hợp lệ → đánh dấu **"cần bốc lại"**, **không** tự sinh lại.

---

## 6. Ranh giới ownership

Hook `.claude/hooks/ownership-guard.js` chặn tự động theo biến môi trường `PICKHUB_TASK_ID`. Đặt đúng mã task trước khi làm việc:

```powershell
$env:PICKHUB_TASK_ID = "T1.A"
```

| Task | Được sửa |
|---|---|
| T0.1 | `docs/superpowers/specs/**`, `_workspace/**` |
| T0.2 | `tests/unified-setup-v2/**`, 2 file contract test được nêu trong plan, `_workspace/**` |
| T0.3 | `_workspace/**` |
| T1.A | 6 file domain dưới `lib/tournament/` (xem plan), `tests/unified-setup-v2/domain/**` |
| T1.B | `app/api/tournament-v2/setup/**`, `preview-schedule/**`, `database/migrations/**`, `tests/unified-setup-v2/api/**` |
| T1.C | Các route roster/participant/pair khác dưới `app/api/tournament-v2/**` (trừ của T1.B), `tests/unified-setup-v2/participants/**` |
| T1.D | `tests/unified-setup-v2/browser/**`, fixture riêng |
| T2.A | `app/giai-dau/v2/setup/*` (shell, stepper, rail, action bar, css, context) |
| T2.B | `setup/steps/InfoParticipantsStep.js`, `FormatPairingStep.js`, `setup/participants/**`, `setup/pairing/**` |
| T2.C | `setup/steps/DrawScheduleStep.js`, `ReviewFinalizeStep.js`, `setup/draw/**` |
| T2.D / LEAD | Toàn bộ, gồm shared entry points và `console/**` |
| T3.1–T3.3 | `tests/**`, `evidence/**`, `_workspace/**` |

**Shared entry points — chỉ integrator (T2.D / LEAD):**
`app/giai-dau/v2/TournamentWizard.js`, `TournamentV2DashboardClient.js`, `console/ConsoleShell.js`, `console/TournamentConsoleV2.js`, `console/**/*.css`, `console/steps/*.js`, `lib/tournamentV2Client.js`, `package.json`.

Cần file ngoài ownership → **dừng, báo lead**. Đừng tự nới hook.

---

## 7. Quy ước kỹ thuật bắt buộc

Chi tiết ở skill `pickhub-engineering`. Nhắc lại phần dễ sai trong đợt này:

- `group_id` lấy từ **session server**, không tin giá trị client gửi lên. Không đọc role/group từ `localStorage`.
- Ghi dữ liệu → `requireGroupAdmin()` ở đầu handler.
- React component **không** gọi Supabase trực tiếp; đi qua `lib/tournamentV2Client.js`.
- Domain logic dưới `lib/tournament/` là **CommonJS thuần, deterministic**: không React, không fetch, không Supabase.
- Test là node script thuần, không Jest.
- Migration: additive, forward-only, tenant-scoped. **Preflight trước:** đọc schema/RPC thật bằng Supabase MCP, đối chiếu `npm run migration:ledger`. Không suy ra trạng thái database từ file SQL trong repo.
- RPC ghi không mở cho browser gọi trực tiếp; kiểm tra quyền thực thi và `search_path`.
- Không `DROP` / `TRUNCATE` / reset DB. Dữ liệu test scope theo `group_id` riêng, dọn an toàn.
- UI: mobile-first, ưu tiên 390px, tiếng Việt, token sáng của CLB.

---

## 8. Checklist trước khi commit

- [ ] Chỉ đụng file thuộc ownership của task mình.
- [ ] Không chạm ba file đóng băng ở §1.
- [ ] Test đỏ viết trước, giờ đã xanh; output dán vào handoff.
- [ ] Bất biến §3 nào liên quan tới task đều đã có test phủ.
- [ ] Nếu task đụng tới stage/lịch: ca 14 người ra đúng 12 trận (13 khi tranh hạng ba).
- [ ] Nếu task đụng tới cặp: bỏ một người ở giữa danh sách không làm đổi cặp khác.
- [ ] Không có `console.log` rác, không sửa test để che bug.
- [ ] Handoff `_workspace/unified-setup-ux/<ID>.md` đủ: files, shape, test output, commit, rủi ro.
