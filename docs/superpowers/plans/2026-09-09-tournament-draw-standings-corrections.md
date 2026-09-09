# Tournament Draw, Standings & Corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BTC bốc thăm ra bản nháp rồi sửa tay trước khi chốt; bảng xếp hạng nói rõ ai đã chắc suất đi tiếp; sửa được kết quả đã chốt mà không âm thầm làm hỏng vòng sau.

**Architecture:** Bản nháp bốc thăm nằm trong `tournament_stages.config.draw` (jsonb sẵn có). Chốt bốc thăm là **nơi duy nhất** tạo trận. Suất đi tiếp tính bằng một hàm thuần dựa trên cơ hội toán học. Sửa kết quả ghi vào bảng `tournament_result_corrections` có sẵn, và **chặn** khi trận vòng sau đã bắt đầu.

**Tech Stack:** Next.js 14 App Router (JavaScript thuần), Supabase JS, node test thuần, migration SQL idempotent.

**Spec:** [`docs/superpowers/specs/2026-09-09-tournament-draw-standings-corrections-design.md`](../specs/2026-09-09-tournament-draw-standings-corrections-design.md)

**Phụ thuộc:** Plan Spec 0 (bảng nhật ký, `writeOperationLog`, chốt giải), Spec 1 (`resolveMatchScoring`), Spec 2 (shell 8 bước, `matchLifecycle`).

---

## Hai khối — khối B có thể cắt ra

Spec mục 4.3 đã chia. Plan này giữ nguyên ranh giới đó.

| Khối | Nội dung | Phụ thuộc engine của IDE khác |
|---|---|---|
| **A** (Task A1–A8) | Bốc thăm cho round-robin và knockout một nhánh · suất đi tiếp · hạng chung cuộc · sửa kết quả | **Không** |
| **B** (Task B1–B3) | Định tuyến kẻ thua · vẽ nhánh W/L/GF | **Có** — cần `lib/tournament/engines/doubleElim.js` đã commit |

**Khối A phải chạy được và giao được một mình.** Nếu engine trễ, dừng sau Task A8 và giao; đừng để plan treo giữa chừng.

## Sự thật đã kiểm chứng

| Điều | Giá trị |
|---|---|
| `tournament_result_corrections` | tồn tại, **rỗng**; cột `match_id, before_payload, after_payload, reason, requester, approver, status (default 'requested'), requested_at, approved_at, applied_at` |
| `tournament_stages.config` | `jsonb` — chỗ để bản nháp bốc thăm, không cần cột mới |
| Sinh lịch | đi qua RPC `replace_tournament_entry_schedule` / `replace_tournament_schedule` với `p_matches` mang `_key` và `_parent_key` |
| `resolveParentLinks` | chỉ nối **một** đường (`parent_match_id`) — thêm đường thứ hai là sửa code lõi |
| `tournament_matches` | **không có** cột `bracket` lẫn `loser_match_id` |

## File Structure

| File | Trách nhiệm |
|---|---|
| `lib/tournament/draw.js` (mới) | Thuần. `buildDrawSlots`, `swapDrawSlots`, `validateDraw`. |
| `lib/tournament/qualification.js` (mới) | Thuần. `qualificationOutlook`, `finalStandingsFrom`. |
| `lib/tournament/correction.js` (mới) | Thuần. `correctionImpact`, `buildCorrectionRow`. |
| `database/migrations/047_tournament_draw_and_results.sql` (mới) | `final_standings`, CHECK corrections, `loser_match_id`. |
| `app/api/tournament-v2/draw/route.js` (mới) | Bốc / sửa tay / chốt / huỷ chốt. |
| `app/api/tournament-v2/corrections/route.js` (viết lại) | Xem trước hệ quả + áp dụng. |
| `app/giai-dau/v2/console/steps/DrawStep.js` (mới) | Bước 4. |
| `app/giai-dau/v2/console/tabs/StandingsTab.js` (sửa) | Cột suất đi tiếp + dòng tiêu chí. |
| `tests/tournament/draw.test.js`, `qualification.test.js`, `correction.test.js` (mới) | Test thuần. |

---

# KHỐI A

## Task A1: Module thuần `draw.js`

**Files:**
- Create: `lib/tournament/draw.js`
- Test: `tests/tournament/draw.test.js`

- [ ] **Step 1: Viết test thất bại**

Create `tests/tournament/draw.test.js`:

```js
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const D = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'draw'));

const entrants = [
  { id: 1, name: 'A', seed: 1, club_id: 10 },
  { id: 2, name: 'B', seed: 2, club_id: 11 },
  { id: 3, name: 'C', seed: 3, club_id: 10 },
  { id: 4, name: 'D', seed: 4, club_id: 12 },
];

// --- buildDrawSlots: vòng tròn nhiều bảng ---
const rr = D.buildDrawSlots({ schedule_format: 'round_robin', config: { groups: 2 } }, entrants, 42);
assert(rr.length === 4, 'đủ 4 đội');
assert(new Set(rr.map((s) => s.entry_id)).size === 4, 'không đội nào lặp');
assert(new Set(rr.map((s) => s.group_label)).size === 2, 'chia đúng 2 bảng');
const perGroup = rr.reduce((acc, s) => { acc[s.group_label] = (acc[s.group_label] || 0) + 1; return acc; }, {});
assert(Object.values(perGroup).every((n) => n === 2), 'mỗi bảng 2 đội');

// cùng seed thì bốc lại ra cùng kết quả — BTC bốc lại được và giải thích được
const rrAgain = D.buildDrawSlots({ schedule_format: 'round_robin', config: { groups: 2 } }, entrants, 42);
assert(JSON.stringify(rr) === JSON.stringify(rrAgain), 'cùng seed cho cùng kết quả');
const rrOther = D.buildDrawSlots({ schedule_format: 'round_robin', config: { groups: 2 } }, entrants, 7);
assert(JSON.stringify(rr) !== JSON.stringify(rrOther), 'seed khác cho kết quả khác');

// --- buildDrawSlots: knockout ---
const ko = D.buildDrawSlots({ schedule_format: 'knockout', config: {} }, entrants, 1);
assert(ko.length === 4, 'knockout giữ đủ đội');
assert(ko.every((s) => s.group_label === null), 'knockout không có bảng');
assert(ko.every((s) => Number.isInteger(s.seed_in_stage)), 'knockout có vị trí nhánh');

// --- swapDrawSlots ---
const swapped = D.swapDrawSlots(rr, rr[0].entry_id, rr[3].entry_id);
assert(swapped.length === 4, 'đổi chỗ giữ nguyên số đội');
assert(new Set(swapped.map((s) => s.entry_id)).size === 4, 'đổi chỗ không tạo trùng');
const before = rr.find((s) => s.entry_id === rr[0].entry_id);
const after = swapped.find((s) => s.entry_id === rr[0].entry_id);
assert(before.group_label !== after.group_label || before.seed_in_stage !== after.seed_in_stage,
  'đội đầu thực sự đổi chỗ');
let threw = null;
try { D.swapDrawSlots(rr, 999, rr[1].entry_id); } catch (e) { threw = e; }
assert(threw !== null, 'đổi chỗ với đội không có trong bốc thăm thì ném lỗi');

// --- validateDraw: lỗi chặn ---
const dup = [{ entry_id: 1, group_label: 'A' }, { entry_id: 1, group_label: 'B' }];
assert(D.validateDraw(dup, entrants).code === 'DRAW_DUPLICATE_ENTRY', 'đội trùng bị chặn');
assert(D.validateDraw([{ entry_id: 1, group_label: 'A' }], entrants).code === 'DRAW_TOO_FEW_ENTRIES', 'một đội bị chặn');
assert(D.validateDraw(rr, entrants).ok === true, 'bốc thăm hợp lệ');

// --- validateDraw: cảnh báo KHÔNG chặn ---
const lop = [
  { entry_id: 1, group_label: 'A' }, { entry_id: 2, group_label: 'A' },
  { entry_id: 3, group_label: 'A' }, { entry_id: 4, group_label: 'B' },
];
const vLop = D.validateDraw(lop, entrants);
assert(vLop.ok === true, 'bảng lệch không chặn');
assert(vLop.warnings.some((w) => /lệch/.test(w.message)), 'có cảnh báo bảng lệch');
assert(vLop.warnings.every((w) => w.blocking === false), 'mọi cảnh báo đều không chặn');

const cungClb = [
  { entry_id: 1, group_label: 'A' }, { entry_id: 3, group_label: 'A' },
  { entry_id: 2, group_label: 'B' }, { entry_id: 4, group_label: 'B' },
];
const vClb = D.validateDraw(cungClb, entrants);
assert(vClb.ok === true, 'cùng CLB một bảng không chặn');
assert(vClb.warnings.some((w) => /CLB/.test(w.message)), 'có cảnh báo cùng CLB');

console.log('draw ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/draw.test.js`
Expected: FAIL — `Cannot find module '.../lib/tournament/draw'`

- [ ] **Step 3: Viết `draw.js`**

```js
'use strict';
// Bản nháp bốc thăm. Thuần, không I/O.
// Bốc thăm KHÔNG tạo trận — chốt bốc thăm mới tạo. Nhờ vậy BTC sửa tay và bốc
// lại thoải mái mà không phải xoá đi xoá lại lịch.

const { seedOrder, nextPowerOfTwo } = require('./seeding');

// Bộ sinh số giả ngẫu nhiên có hạt giống: cùng seed cho cùng kết quả, để BTC
// bốc lại được và giải thích được với VĐV.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, seed) {
  const rand = mulberry32(seed);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function groupLabel(index) {
  return String.fromCharCode(65 + index);   // 0 -> 'A'
}

function buildDrawSlots(stage = {}, entrants = [], seed = 1) {
  const order = shuffled(entrants, Number(seed) || 1);

  if (stage.schedule_format === 'knockout') {
    const size = nextPowerOfTwo(order.length);
    const positions = seedOrder(size);
    return order.map((entrant, index) => ({
      entry_id: entrant.id,
      group_label: null,
      seed_in_stage: positions[index] != null ? positions[index] : index + 1,
    }));
  }

  const groups = Math.max(1, Number((stage.config || {}).groups) || 1);
  return order.map((entrant, index) => ({
    entry_id: entrant.id,
    group_label: groupLabel(index % groups),
    seed_in_stage: Math.floor(index / groups) + 1,
  }));
}

function swapDrawSlots(slots, entryA, entryB) {
  const a = slots.findIndex((s) => String(s.entry_id) === String(entryA));
  const b = slots.findIndex((s) => String(s.entry_id) === String(entryB));
  if (a < 0 || b < 0) throw new Error('Đội cần đổi chỗ không có trong bản bốc thăm.');
  const out = slots.map((s) => ({ ...s }));
  const tmp = { group_label: out[a].group_label, seed_in_stage: out[a].seed_in_stage };
  out[a].group_label = out[b].group_label;
  out[a].seed_in_stage = out[b].seed_in_stage;
  out[b].group_label = tmp.group_label;
  out[b].seed_in_stage = tmp.seed_in_stage;
  return out;
}

// Trả { ok, code, message, warnings }. Cảnh báo KHÔNG chặn — giống cách wizard
// đang xử lý cảnh báo ghép cặp: nói cho BTC biết rồi để họ quyết.
function validateDraw(slots = [], entrants = []) {
  const warnings = [];
  const ids = slots.map((s) => String(s.entry_id));
  if (new Set(ids).size !== ids.length) {
    return { ok: false, code: 'DRAW_DUPLICATE_ENTRY', message: 'Có đội xuất hiện nhiều hơn một lần trong bản bốc thăm.', warnings };
  }
  if (slots.length < 2) {
    return { ok: false, code: 'DRAW_TOO_FEW_ENTRIES', message: 'Cần ít nhất 2 đội mới bốc thăm được.', warnings };
  }

  const byGroup = new Map();
  for (const slot of slots) {
    const key = slot.group_label == null ? '' : slot.group_label;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(slot);
  }

  if (byGroup.size > 1) {
    const sizes = [...byGroup.values()].map((g) => g.length);
    if (Math.max(...sizes) - Math.min(...sizes) > 1) {
      warnings.push({
        code: 'DRAW_UNEVEN_GROUPS',
        blocking: false,
        message: `Các bảng lệch nhau quá 1 đội (${sizes.join(' / ')}). Đội ở bảng ít hơn sẽ đá ít trận hơn.`,
      });
    }
  }

  const clubOf = new Map(entrants.map((e) => [String(e.id), e.club_id]));
  for (const [label, group] of byGroup.entries()) {
    if (!label) continue;
    const clubs = group.map((s) => clubOf.get(String(s.entry_id))).filter((c) => c != null);
    const dup = clubs.filter((c, i) => clubs.indexOf(c) !== i);
    if (dup.length > 0) {
      warnings.push({
        code: 'DRAW_SAME_CLUB_IN_GROUP',
        blocking: false,
        message: `Bảng ${label} có hai đội cùng một CLB.`,
      });
    }
  }

  return { ok: true, code: null, message: null, warnings };
}

module.exports = { buildDrawSlots, swapDrawSlots, validateDraw };
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/draw.test.js`
Expected: `draw ok`

- [ ] **Step 5: Commit**

```bash
git add lib/tournament/draw.js tests/tournament/draw.test.js
git commit -m "feat(giai-dau): module thuan boc tham nhap

Boc tham KHONG tao tran; chot moi tao. Cung seed cho cung ket qua de BTC boc
lai duoc va giai thich duoc voi VDV. Bang lech va cung CLB mot bang chi la
canh bao, khong chan.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A2: Migration 047

**Files:**
- Create: `database/migrations/047_tournament_draw_and_results.sql`
- Test: `tests/tournament/migration-047.test.js`

- [ ] **Step 1: Kiểm dữ liệu trước khi thêm CHECK**

Chạy bằng Supabase MCP:

```sql
select distinct status from tournament_result_corrections;
```

Expected: **0 dòng**. Nếu có giá trị lạ, mở rộng CHECK cho khớp trước khi apply.

- [ ] **Step 2: Viết test thất bại**

Create `tests/tournament/migration-047.test.js`:

```js
const fs = require('fs');
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const file = path.join(__dirname, '..', '..', 'database', 'migrations', '047_tournament_draw_and_results.sql');

assert(fs.existsSync(file), 'migration 047 tồn tại');
const sql = fs.readFileSync(file, 'utf8');

assert(/ADD COLUMN IF NOT EXISTS loser_match_id bigint/.test(sql), 'thêm loser_match_id');
assert(/ADD COLUMN IF NOT EXISTS final_standings jsonb/.test(sql), 'thêm final_standings');
assert(/tournament_result_corrections_status_ck/.test(sql), 'CHECK trạng thái correction');
for (const st of ['requested', 'approved', 'applied', 'rejected']) {
  assert(new RegExp(`'${st}'`).test(sql), `CHECK có ${st}`);
}
assert(!/DROP\s+TABLE/i.test(sql), 'không DROP TABLE');
assert(!/TRUNCATE/i.test(sql), 'không TRUNCATE');

console.log('migration-047 ok');
```

- [ ] **Step 3: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/migration-047.test.js`
Expected: FAIL

- [ ] **Step 4: Viết migration**

```sql
-- 047_tournament_draw_and_results.sql
-- Dinh tuyen ke thua cho double elimination, hang chung cuoc ghim khi chot giai,
-- va siet trang thai correction. Idempotent; chi them cot, khong DROP/TRUNCATE.

-- 1. Duong thu hai cho double elimination. Them san du khoi B chua lam:
--    cot NULL cho moi tran hien co, khong ton gi, va sau nay khong phai chay
--    migration lan nua.
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS loser_match_id bigint
  REFERENCES public.tournament_matches(id) ON DELETE SET NULL;

-- 2. Hang chung cuoc, ghim khi giai chuyen sang completed.
--    Cot rieng chu khong nhet vao eligibility (dieu kien du giai) hay
--    competition_status (trang thai van hanh) - ba thu khac nghia.
ALTER TABLE public.tournament_divisions
  ADD COLUMN IF NOT EXISTS final_standings jsonb;

-- 3. Trang thai correction: truoc day khong co CHECK.
ALTER TABLE public.tournament_result_corrections
  DROP CONSTRAINT IF EXISTS tournament_result_corrections_status_ck;
ALTER TABLE public.tournament_result_corrections
  ADD CONSTRAINT tournament_result_corrections_status_ck
  CHECK (status IN ('requested','approved','applied','rejected'));

COMMENT ON COLUMN public.tournament_matches.loser_match_id IS 'Double elim: tran ma ke THUA di vao; parent_match_id la cho ke THANG';
COMMENT ON COLUMN public.tournament_divisions.final_standings IS 'Hang chung cuoc ghim luc chot giai; du kien lich su, khong tinh lai';
```

- [ ] **Step 5: Chạy test, apply, xác nhận, commit**

Run: `node tests/tournament/migration-047.test.js`
Expected: `migration-047 ok`

Apply bằng Supabase MCP, rồi xác nhận:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='tournament_matches' and column_name='loser_match_id';
select column_name from information_schema.columns
where table_schema='public' and table_name='tournament_divisions' and column_name='final_standings';
```

```bash
npm run migration:ledger
git add database/migrations/047_tournament_draw_and_results.sql tests/tournament/migration-047.test.js
git commit -m "feat(db): loser_match_id, final_standings, CHECK correction (migration 047)

loser_match_id them san du khoi B chua lam - cot NULL khong ton gi va sau nay
khong phai chay migration lan nua.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A3: Route `draw`

**Files:**
- Create: `app/api/tournament-v2/draw/route.js`
- Create: `tests/tournament/api-draw.contract.test.js`
- Modify: `lib/tournamentV2Client.js`

- [ ] **Step 1: Viết test thất bại**

```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/api/tournament-v2/draw/route.js';
assert(exists(f), 'route draw tồn tại');
const s = read(f);

assert(/buildDrawSlots/.test(s), 'bốc thăm dùng module thuần');
assert(/validateDraw/.test(s), 'kiểm trước khi chốt');
assert(/swapDrawSlots/.test(s), 'đổi chỗ dùng module thuần');
assert(/DRAW_ALREADY_LOCKED/.test(s), 'chốt hai lần bị chặn');
assert(/DRAW_HAS_PLAYED_MATCHES/.test(s), 'huỷ chốt khi đã có trận đấu bị chặn');
assert(/DRAW_NOT_DRAFT/.test(s), 'sửa tay khi đã chốt bị chặn');
assert(/REASON_REQUIRED/.test(s), 'huỷ chốt bắt lý do');
assert(/writeOperationLog/.test(s), 'ghi nhật ký');
assert(/\.eq\('group_id'/.test(s), 'scope theo group_id');
assert(!/DROP|TRUNCATE/i.test(s), 'không có lệnh phá dữ liệu');

const client = read('lib/tournamentV2Client.js');
for (const fn of ['getDraw', 'rollDraw', 'swapDrawEntries', 'lockDraw', 'unlockDraw']) {
  assert(new RegExp(fn).test(client), `client có ${fn}`);
}

console.log('api-draw contract ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-draw.contract.test.js`
Expected: FAIL

- [ ] **Step 3: Viết route**

Route có bốn hành động, phân biệt bằng trường `action` trong body của `POST`:

| `action` | Việc |
|---|---|
| `roll` | Sinh `seed` mới, `buildDrawSlots`, ghi `config.draw` ở `status: 'draft'`. Chặn nếu đang `locked`. |
| `swap` | `swapDrawSlots(slots, entry_a, entry_b)`. Chặn nếu không phải `draft` → `DRAW_NOT_DRAFT`. |
| `lock` | `validateDraw` → nếu `ok` thì ghi `tournament_stage_entrants` theo slots, gọi RPC sinh lịch (mượn nguyên logic của `generate/route.js`), rồi đặt `config.draw.status = 'locked'`. Chặn nếu đã `locked` → `DRAW_ALREADY_LOCKED`. |
| `unlock` | Bắt `reason`. Kiểm không có trận nào `live`/`paused`/`finalized` → nếu có thì `DRAW_HAS_PLAYED_MATCHES` (409). Xoá mọi trận của giai đoạn, đặt lại `config.draw.status = 'draft'`. |

`GET ?stageId=` trả `{ stage, entrants, draw, warnings }` — `warnings` chạy `validateDraw` trên slots hiện tại để BTC thấy cảnh báo trước khi bấm chốt.

**Đừng viết lại phần sinh lịch.** Mở `app/api/tournament-v2/generate/route.js`, tách đoạn từ `getScheduleEngine` tới lời gọi `db.rpc(...)` thành một hàm dùng chung `lib/tournament/generateSchedule.js`, rồi cả `generate/route.js` lẫn `draw/route.js` cùng gọi. Trùng lặp hai bản của cùng một logic sinh lịch là cách chắc chắn nhất để chúng lệch nhau sau ba tháng.

Mọi hành động ghi một dòng nhật ký: `action` là `draw_rolled` / `draw_swapped` / `draw_locked` / `draw_unlocked`, `target_type` là `stage`.

- [ ] **Step 4: Thêm 5 hàm client**

```js
export async function getDraw(stageId) {
    return request('/draw', { query: { stageId } });
}
export function rollDraw(body) { return request('/draw', { method: 'POST', body: { ...body, action: 'roll' } }); }
export function swapDrawEntries(body) { return request('/draw', { method: 'POST', body: { ...body, action: 'swap' } }); }
export function lockDraw(body) { return request('/draw', { method: 'POST', body: { ...body, action: 'lock' } }); }
export function unlockDraw(body) { return request('/draw', { method: 'POST', body: { ...body, action: 'unlock' } }); }
```

- [ ] **Step 5: Chạy test và kiểm thật**

Run: `node tests/tournament/api-draw.contract.test.js`
Expected: PASS

Trên giai đoạn test: bốc → đổi chỗ → bốc lại → chốt. Xác nhận `tournament_matches` có trận sau khi chốt, và `config.draw.status = 'locked'`.

Thử chốt lần hai → **409 `DRAW_ALREADY_LOCKED`**.
Nhập một kết quả rồi thử huỷ chốt → **409 `DRAW_HAS_PLAYED_MATCHES`**.

- [ ] **Step 6: Commit**

```bash
git add app/api/tournament-v2/draw lib/tournament/generateSchedule.js app/api/tournament-v2/generate/route.js lib/tournamentV2Client.js tests/tournament/api-draw.contract.test.js
git commit -m "feat(api): boc tham nhap -> sua tay -> chot -> sinh lich

Chot boc tham la NOI DUY NHAT tao tran. Huy chot bat ly do va bi chan khi da
co tran dau. Logic sinh lich tach ra lib/tournament/generateSchedule.js dung
chung voi generate/route.js thay vi chep hai ban.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A4: Bước 4 — màn bốc thăm

**Files:**
- Create: `app/giai-dau/v2/console/steps/DrawStep.js`
- Modify: `app/giai-dau/v2/console/TournamentConsoleV2.js`
- Create: `tests/tournament/ui-draw-step.contract.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/giai-dau/v2/console/steps/DrawStep.js';
assert(exists(f), 'DrawStep tồn tại');
const s = read(f);
assert(/rollDraw|lockDraw/.test(s), 'gọi qua client wrapper');
assert(/Bốc thăm/.test(s), 'nút bốc thăm');
assert(/Chốt/.test(s), 'nút chốt');
assert(/Đổi chỗ/.test(s), 'đổi chỗ bằng chọn hai ô rồi bấm');
assert(!/draggable|onDragStart/.test(s), 'không kéo thả — bàn điều hành chạy cả trên tablet');
assert(/cảnh báo|Cảnh báo/.test(s), 'hiện cảnh báo không chặn');
assert(!/#[0-9a-fA-F]{6}/.test(s), 'không hardcode màu');

const console2 = read('app/giai-dau/v2/console/TournamentConsoleV2.js');
assert(/DrawStep/.test(console2), 'bước 4 mount DrawStep thay OverviewTab');

console.log('ui-draw-step contract ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-draw-step.contract.test.js`
Expected: FAIL

- [ ] **Step 3: Viết `DrawStep.js`**

Bố cục: thanh nút trên cùng (**Bốc thăm** / **Bốc lại** / **Chốt & sinh lịch** / **Huỷ chốt**), dải cảnh báo màu vàng, rồi các bảng/nhánh xếp cạnh nhau — mỗi ô là một đội.

**Đổi chỗ bằng chọn hai ô rồi bấm nút, không kéo thả.** Bàn điều hành có thể chạy trên tablet, và kéo thả trong danh sách cuộn rất dễ hỏng.

```js
    const [picked, setPicked] = useState([]);   // tối đa 2 entry_id

    function toggle(entryId) {
        setPicked((prev) => {
            if (prev.includes(entryId)) return prev.filter((x) => x !== entryId);
            if (prev.length >= 2) return [prev[1], entryId];
            return [...prev, entryId];
        });
    }
```

Nút **Đổi chỗ** chỉ bật khi `picked.length === 2`, gọi `swapDrawEntries({ stage_id, entry_a: picked[0], entry_b: picked[1] })` rồi tải lại và xoá lựa chọn.

Nút **Chốt & sinh lịch** phải hỏi lại một lần (`window.confirm` tạm, thay bằng modal khi `primitives.css` có). Nếu có cảnh báo, hộp hỏi lại phải liệt kê cảnh báo và nút xác nhận ghi rõ **"Chốt luôn"**.

Khi `draw.status === 'locked'`: mọi nút sửa tắt, hiện dòng "Đã chốt lúc …" và nút **Huỷ chốt** (bắt nhập lý do).

- [ ] **Step 4: Mount vào shell**

Trong `TournamentConsoleV2.js`, đổi:

```js
                    {step === 'draw' ? <OverviewTab {...stepProps} /> : null}
```

thành:

```js
                    {step === 'draw' ? <DrawStep {...stepProps} /> : null}
```

và thêm import. Nếu `OverviewTab` không còn được dùng ở đâu, xoá import của nó.

- [ ] **Step 5: Chạy test và commit**

Run: `node tests/tournament/ui-draw-step.contract.test.js`
Expected: PASS

```bash
git add app/giai-dau/v2/console/steps/DrawStep.js app/giai-dau/v2/console/TournamentConsoleV2.js tests/tournament/ui-draw-step.contract.test.js
git commit -m "feat(giai-dau): buoc 4 - boc tham va chot lich

Doi cho bang chon hai o roi bam, khong keo tha: ban dieu hanh chay ca tren
tablet va keo tha trong danh sach cuon rat de hong. Canh bao liet ke trong hop
hoi lai, nut xac nhan ghi ro 'Chot luon'.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A5: `qualificationOutlook`

**Files:**
- Create: `lib/tournament/qualification.js`
- Test: `tests/tournament/qualification.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const Q = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'qualification'));

// 4 đội, mỗi trận thắng ăn 2 điểm, top 2 đi tiếp.
const rows = [
  { entrant_id: 1, points: 8, rank: 1 },
  { entrant_id: 2, points: 6, rank: 2 },
  { entrant_id: 3, points: 4, rank: 3 },
  { entrant_id: 4, points: 2, rank: 4 },
];

// Hết trận: hạng cứng.
const done = Q.qualificationOutlook(rows, { 1: 0, 2: 0, 3: 0, 4: 0 }, { slots: 2, winPoints: 2, groupLabel: 'A' });
assert(done[1].label === 'Nhất bảng A', 'hết trận, hạng 1 chắc suất');
assert(done[2].label === 'Nhì bảng A', 'hết trận, hạng 2 chắc suất');
assert(done[3].label === 'Đã loại', 'hết trận, hạng 3 loại');
assert(done[1].status === 'qualified' && done[3].status === 'eliminated', 'trạng thái đúng');

// Đội 1 đã chắc suất dù thua hết: 8 điểm, đội 3 tối đa 4 + 2*2 = 8, hoà nhưng
// không vượt được -> vẫn nằm trong top 2.
const mid = Q.qualificationOutlook(rows, { 1: 0, 2: 1, 3: 2, 4: 2 }, { slots: 2, winPoints: 2, groupLabel: 'A' });
assert(mid[1].label === 'Nhất bảng A', 'đội dẫn đầu đã chắc suất toán học');
assert(mid[2].status === 'provisional', 'đội 2 mới chỉ tạm trong suất');
assert(/Tạm/.test(mid[2].label), 'nhãn nói rõ là tạm');
assert(mid[3].status === 'contending', 'đội 3 còn cơ hội');
assert(mid[3].label === 'Tranh vé vớt', 'nhãn tranh vé vớt');

// Đội 4: 2 điểm, còn 1 trận -> tối đa 4, không thể vào top 2 (đội 2 đã 6).
const out = Q.qualificationOutlook(rows, { 1: 0, 2: 0, 3: 1, 4: 1 }, { slots: 2, winPoints: 2, groupLabel: 'A' });
assert(out[4].status === 'eliminated', 'đội 4 hết cửa toán học');

assert(Object.keys(Q.qualificationOutlook([], {}, { slots: 2, winPoints: 2 })).length === 0, 'bảng rỗng không văng lỗi');

// --- finalStandingsFrom ---
const koMatches = [
  { round: 2, status: 'finalized', entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1 },
  { round: 1, status: 'finalized', entrant_a_id: 1, entrant_b_id: 3, winner_entrant_id: 1 },
  { round: 1, status: 'finalized', entrant_a_id: 2, entrant_b_id: 4, winner_entrant_id: 2 },
];
const koFinal = Q.finalStandingsFrom({ schedule_format: 'knockout' }, [], koMatches);
assert(koFinal[0].rank === 1 && koFinal[0].entry_id === 1 && koFinal[0].label === 'Vô địch', 'vô địch');
assert(koFinal[1].rank === 2 && koFinal[1].entry_id === 2 && koFinal[1].label === 'Á quân', 'á quân');

const rrFinal = Q.finalStandingsFrom({ schedule_format: 'round_robin' }, rows, []);
assert(rrFinal[0].entry_id === 1 && rrFinal[0].label === 'Vô địch', 'vòng tròn lấy theo BXH');
assert(rrFinal[2].label === 'Hạng ba', 'hạng ba');
assert(rrFinal[3].label === 'Hạng 4', 'từ hạng 4 trở đi ghi số');

console.log('qualification ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/qualification.test.js`
Expected: FAIL

- [ ] **Step 3: Viết `qualification.js`**

`qualificationOutlook(rows, remainingByEntry, { slots, winPoints, groupLabel })` trả map `entrant_id → { status, label }` với bốn trạng thái:

- `qualified` — kể cả thua hết trận còn lại, và mọi đội dưới thắng hết, thứ hạng vẫn không tụt khỏi `slots`. Nhãn `Nhất bảng A` / `Nhì bảng A` theo thứ hạng hiện tại.
- `provisional` — đang trong `slots` nhưng còn trận. Nhãn `Tạm nhất bảng A`.
- `contending` — ngoài `slots` nhưng `points + remaining * winPoints` còn đủ để vượt đội cuối trong `slots`. Nhãn `Tranh vé vớt`.
- `eliminated` — không còn cửa. Nhãn `Đã loại`.

`finalStandingsFrom(stage, standingsRows, matches)`: knockout thì vô địch/á quân lấy từ trận vòng cuối, hạng ba lấy từ hai đội thua bán kết (nếu có trận tranh hạng ba thì lấy đội thắng trận đó); round-robin thì lấy thẳng thứ tự BXH. Nhãn: `Vô địch`, `Á quân`, `Hạng ba`, rồi `Hạng N`.

- [ ] **Step 4: Chạy test và commit**

Run: `node tests/tournament/qualification.test.js`
Expected: `qualification ok`

```bash
git add lib/tournament/qualification.js tests/tournament/qualification.test.js
git commit -m "feat(giai-dau): suat di tiep theo co hoi toan hoc va hang chung cuoc

Phan biet 'chac suat' voi 'tam dan dau': doi chi duoc goi la Nhat bang khi ke
ca thua het tran con lai va cac doi duoi thang het thi van khong tut khoi suat.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A6: Cột suất đi tiếp trong BXH

**Files:**
- Modify: `app/api/tournament-v2/standings/route.js`
- Modify: `app/giai-dau/v2/console/tabs/StandingsTab.js`
- Modify: `tests/tournament/ui-standings.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

```js
assert(/Suất đi tiếp/.test(s), 'có cột suất đi tiếp');
assert(/Tiêu chí/.test(s), 'có dòng tiêu chí xếp hạng');
assert(!/Điểm → Hiệu số → Đối đầu/.test(s) || /tiebreak/.test(s),
  'tiêu chí lấy từ tie-break đang áp dụng, không viết cứng');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-standings.contract.test.js`
Expected: FAIL

- [ ] **Step 3: Route trả thêm `outlook` và `tiebreak_criteria`**

Trong `standings/route.js`, sau khi có `result` từ `computeStageStandings`, đếm số trận còn lại của từng đội rồi gọi `qualificationOutlook`. Số suất lấy từ `stage.config.advance` (số suất đi tiếp mỗi bảng); không có thì mặc định `2`. `winPoints` lấy từ luật giai đoạn.

Trả thêm:

```js
            outlook,                       // map entrant_id -> { status, label }
            tiebreak_criteria: criteria,   // mảng chuỗi, ví dụ ['Điểm', 'Hiệu số', 'Đối đầu trực tiếp', 'PHR']
```

`criteria` dựng từ `tiebreak_policy` đang áp dụng (`lib/tournament/rules/tiebreak.js` có sẵn preset) — **không viết cứng chuỗi trong UI**.

- [ ] **Step 4: `StandingsTab` vẽ cột và dòng tiêu chí**

Thêm cột cuối bảng, nhãn header **Suất đi tiếp**, ô lấy từ `outlook[row.entrant_id]?.label`. Class theo `status`: `qualified` → nền tím nhạt, `provisional` → nền xám, `contending` → chữ thường, `eliminated` → chữ mờ.

Dưới bảng thêm: `Tiêu chí xếp hạng: {tiebreak_criteria.join(' → ')}`.

- [ ] **Step 5: Chạy test và commit**

Run: `node tests/tournament/ui-standings.contract.test.js`
Expected: PASS

```bash
git add app/api/tournament-v2/standings/route.js app/giai-dau/v2/console/tabs/StandingsTab.js tests/tournament/ui-standings.contract.test.js
git commit -m "feat(giai-dau): cot suat di tiep va dong tieu chi trong BXH

Tra loi dung cau VDV hay hoi nhat. Tieu chi lay tu tie-break dang ap dung chu
khong viet cung trong UI.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A7: Ghim hạng chung cuộc khi chốt giải

**Files:**
- Modify: `app/api/tournament-v2/tournaments/route.js` (PATCH, nhánh `live → completed`)
- Modify: `tests/tournament/api-tournaments.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

```js
assert(/finalStandingsFrom/.test(routeSrc), 'chốt giải ghim hạng chung cuộc');
assert(/final_standings/.test(routeSrc), 'ghi vào cột final_standings');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-tournaments.contract.test.js`
Expected: FAIL

- [ ] **Step 3: Ghim hạng sau khi chuyển `completed`**

Trong PATCH, sau khi update thành công và `statusChange.to === 'completed'`: với mỗi division của giải, nạp giai đoạn cuối (`stage_order` lớn nhất), tính BXH, gọi `finalStandingsFrom`, rồi ghi vào `tournament_divisions.final_standings`.

Ghi **sau** khi trạng thái đã đổi, và lỗi ở bước này **không** làm hỏng việc chốt giải — log ra console rồi trả về bình thường, kèm cờ `final_standings_written: false` để UI biết mà nhắc BTC bấm lại.

- [ ] **Step 4: Chạy test và commit**

```bash
git add app/api/tournament-v2/tournaments/route.js tests/tournament/api-tournaments.contract.test.js
git commit -m "feat(api): chot giai ghim hang chung cuoc vao final_standings

Ghim chu khong tinh dong: sau khi giai xong, hang la du kien lich su - de tinh
dong thi doi luat tie-break nam sau se lam doi hang cua giai nam truoc.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A8: Sửa kết quả đã chốt

**Files:**
- Create: `lib/tournament/correction.js`
- Create: `app/api/tournament-v2/corrections/route.js`
- Test: `tests/tournament/correction.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const C = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'correction'));

const match = { id: 5, parent_match_id: 9, winner_entrant_id: 1, status: 'finalized' };

// Trận vòng sau chưa gọi -> cho sửa.
let impact = C.correctionImpact(match, { id: 9, status: 'pending' }, { winnerChanged: true });
assert(impact.blocked === false, 'trận sau pending thì cho sửa');
assert(impact.downstream.length === 1, 'liệt kê trận bị ảnh hưởng');

// Trận vòng sau đang đấu -> chặn. Có người trên sân đang đấu dưới danh nghĩa
// một suất mà ta sắp lấy đi.
for (const st of ['warmup', 'live', 'paused']) {
  impact = C.correctionImpact(match, { id: 9, status: st }, { winnerChanged: true });
  assert(impact.blocked === true, `trận sau ${st} thì chặn`);
  assert(impact.code === 'CORRECTION_BLOCKED_DOWNSTREAM', `mã lỗi cho ${st}`);
  assert(/đang/.test(impact.message), `thông báo nói rõ tình trạng cho ${st}`);
}

// Trận vòng sau đã chốt -> chặn, thông báo khác.
impact = C.correctionImpact(match, { id: 9, status: 'finalized' }, { winnerChanged: true });
assert(impact.blocked === true, 'trận sau finalized thì chặn');
assert(/huỷ chốt/.test(impact.message), 'nói rõ phải huỷ chốt trận sau trước');

// Không đổi đội thắng thì không đụng vòng sau.
impact = C.correctionImpact(match, { id: 9, status: 'finalized' }, { winnerChanged: false });
assert(impact.blocked === false, 'chỉ sửa tỉ số, không đổi đội thắng -> không chặn');
assert(impact.downstream.length === 0, 'không liệt kê trận sau');

// Trận không có vòng sau.
impact = C.correctionImpact({ ...match, parent_match_id: null }, null, { winnerChanged: true });
assert(impact.blocked === false, 'không có trận sau thì không chặn');

// --- buildCorrectionRow ---
const row = C.buildCorrectionRow({
  groupId: 1, tournamentId: 2, divisionId: 3, matchId: 5,
  before: { games: [] }, after: { games: [] }, reason: 'Trọng tài ghi nhầm', actor: 'Tuấn',
});
assert(row.status === 'applied', 'ghi thẳng applied, không qua duyệt hai bước');
assert(row.requester === 'Tuấn' && row.approver === 'Tuấn', 'một BTC vừa đề nghị vừa duyệt');
assert(row.applied_at && row.approved_at, 'đóng dấu cả hai mốc');
let threw = null;
try { C.buildCorrectionRow({ groupId: 1, tournamentId: 2, matchId: 5, before: {}, after: {}, reason: '  ', actor: 'a' }); } catch (e) { threw = e; }
assert(threw !== null && /lý do/.test(threw.message), 'thiếu lý do thì ném lỗi');

console.log('correction ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/correction.test.js`
Expected: FAIL

- [ ] **Step 3: Viết `correction.js` rồi route**

`correctionImpact(match, downstreamMatch, { winnerChanged })` theo đúng bảng ba dòng ở spec mục 5.3.

`buildCorrectionRow({...})` bắt buộc `reason` không rỗng, trả hàng đủ cột cho `tournament_result_corrections` với `status: 'applied'`, `requester = approver = actor`, `approved_at = applied_at = now`.

Route `corrections/route.js`:
- `GET ?matchId=` → lịch sử sửa của một trận.
- `POST { match_id, games, reason, preview: true }` → **chỉ** trả bản xem trước hệ quả: BXH đổi thế nào, đội nào đổi suất đi tiếp, trận nào ở vòng sau bị ảnh hưởng. Không ghi gì.
- `POST { match_id, games, reason }` → kiểm `correctionImpact`; nếu `blocked` thì 409. Nếu không: kiểm tỉ số bằng `resolveMatchScoring` (Spec 1) **kể cả khi luật vòng đã khoá**, ghi lại ván, cập nhật `winner_entry_id`, ghi `tournament_result_corrections` + `tournament_operation_logs` (`action: 'result_corrected'`), rồi nếu giải đang `completed` thì xoá `final_standings` của division đó và trả cờ `final_standings_cleared: true`.

- [ ] **Step 4: Chạy test và commit**

Run: `node tests/tournament/correction.test.js`
Expected: `correction ok`

```bash
git add lib/tournament/correction.js app/api/tournament-v2/corrections tests/tournament/correction.test.js
git commit -m "feat(giai-dau): sua ket qua da chot co ly do va xem truoc he qua

Chan ca khi tran vong sau dang warmup/live/paused chu khong chi finalized: co
nguoi tren san dang dau duoi danh nghia mot suat ma ta sap lay di. May khong
tu day chuyen huy ket qua - de BTC quyet tung buoc.

Sua ket qua khi giai da completed thi xoa final_standings, buoc BTC chot lai.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A9: Nối test khối A và chạy hồi quy

- [ ] **Step 1: Thêm script**

```json
    "test:t-draw": "node tests/tournament/draw.test.js && node tests/tournament/qualification.test.js && node tests/tournament/correction.test.js && node tests/tournament/migration-047.test.js && node tests/tournament/api-draw.contract.test.js && node tests/tournament/ui-draw-step.contract.test.js",
```

Thêm vào `test:tournament`.

- [ ] **Step 2: Chạy và ghi bằng chứng**

Run: `npm run test:tournament && npm run test:regression && npm run build`
Expected: exit 0 cả ba.

```bash
npm run test:regression > evidence/spec3-blockA-regression-2026-09-09.txt 2>&1
git add package.json evidence/spec3-blockA-regression-2026-09-09.txt
git commit -m "test(giai-dau): noi test khoi A vao bo chung

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

> **Khối A xong. Đây là điểm giao được.** Nếu engine double-elim chưa commit, dừng ở đây.

---

# KHỐI B — chỉ bắt đầu khi engine double-elim đã commit

## Task B1: Test hồi quy `resolveParentLinks` — phải XANH trước khi sửa

`resolveParentLinks` là code lõi đang chạy cho mọi knockout. Trình tự dưới đây **không được đảo**: đóng đinh hành vi hiện tại trước, sửa sau.

**Files:**
- Modify: `tests/tournament/persistence.test.js`

- [ ] **Step 1: Kiểm engine đã sẵn sàng chưa**

```bash
git ls-files --error-unmatch lib/tournament/engines/doubleElim.js >/dev/null 2>&1 \
  && echo "engine da commit, tiep tuc" || echo "engine CHUA commit - DUNG LAI, giao khoi A"
```

Nếu in `CHUA commit`, **dừng plan ở đây**.

- [ ] **Step 2: Viết test đóng đinh hành vi HIỆN TẠI**

Thêm vào `tests/tournament/persistence.test.js`:

```js
// Hành vi hiện tại của resolveParentLinks với knockout một nhánh.
// Test này phải XANH TRƯỚC khi thêm đường thứ hai, và vẫn XANH sau đó.
const ko8 = [
  { slot: 1, round: 1, bracket_slot: 1, parent_slot: 5 },
  { slot: 2, round: 1, bracket_slot: 2, parent_slot: 5 },
  { slot: 3, round: 1, bracket_slot: 3, parent_slot: 6 },
  { slot: 4, round: 1, bracket_slot: 4, parent_slot: 6 },
  { slot: 5, round: 2, bracket_slot: 1, parent_slot: 7 },
  { slot: 6, round: 2, bracket_slot: 2, parent_slot: 7 },
  { slot: 7, round: 3, bracket_slot: 1, parent_slot: null },
];
const rows8 = ko8.map((m, i) => ({ id: 100 + i, round: m.round, bracket_slot: m.bracket_slot }));
const links8 = resolveParentLinks(ko8, rows8);
assert(links8.length === 6, 'knockout 8 đội: 6 trận có trận cha');
assert(links8.every((l) => l.parent_match_id != null), 'mọi liên kết đều có parent_match_id');
assert(links8.find((l) => l.id === 100).parent_match_id === 104, 'trận slot 1 nối lên slot 5');
assert(links8.every((l) => !('loser_match_id' in l)), 'chưa có đường kẻ thua ở knockout thường');

// Knockout 5 đội có bye — nhánh dễ vỡ nhất.
const ko5 = [
  { slot: 1, round: 1, bracket_slot: 1, parent_slot: 4 },
  { slot: 4, round: 2, bracket_slot: 1, parent_slot: 6 },
  { slot: 5, round: 2, bracket_slot: 2, parent_slot: 6 },
  { slot: 6, round: 3, bracket_slot: 1, parent_slot: null },
];
const rows5 = ko5.map((m, i) => ({ id: 200 + i, round: m.round, bracket_slot: m.bracket_slot }));
assert(resolveParentLinks(ko5, rows5).length === 3, 'knockout 5 đội có bye vẫn nối đủ');
```

- [ ] **Step 3: Chạy để thấy nó XANH**

Run: `node tests/tournament/persistence.test.js`
Expected: PASS — **nếu đỏ thì test viết sai, sửa test chứ không sửa code lõi.**

- [ ] **Step 4: Commit test trước, riêng một commit**

```bash
git add tests/tournament/persistence.test.js
git commit -m "test(giai-dau): dong dinh hanh vi resolveParentLinks truoc khi sua

Knockout 8 doi va 5 doi co bye. Test nay phai xanh truoc khi them duong dinh
tuyen ke thua, va van xanh sau do.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task B2: Đường thứ hai — `loser_match_id`

**Files:**
- Modify: `lib/tournament/persistence.js`
- Modify: `lib/tournament/results.js`
- Modify: `tests/tournament/persistence.test.js`
- Modify: RPC `replace_tournament_entry_schedule` trên DB

- [ ] **Step 1: Thêm test cho đường thứ hai**

```js
const de4 = [
  { slot: 1, round: 1, bracket: 'W', bracket_slot: 1, parent_slot: 3, loser_to_slot: 4 },
  { slot: 2, round: 1, bracket: 'W', bracket_slot: 2, parent_slot: 3, loser_to_slot: 4 },
  { slot: 3, round: 2, bracket: 'W', bracket_slot: 1, parent_slot: 5, loser_to_slot: 5 },
  { slot: 4, round: 2, bracket: 'L', bracket_slot: 1, parent_slot: 5, loser_to_slot: null },
  { slot: 5, round: 3, bracket: 'GF', bracket_slot: 1, parent_slot: null, loser_to_slot: null },
];
const rowsDe = de4.map((m, i) => ({ id: 300 + i, round: m.round, bracket_slot: m.bracket_slot, bracket: m.bracket }));
const linksDe = resolveParentLinks(de4, rowsDe);
const first = linksDe.find((l) => l.id === 300);
assert(first.parent_match_id === 302, 'kẻ thắng đi lên nhánh W');
assert(first.loser_match_id === 303, 'kẻ thua xuống nhánh L');
assert(linksDe.find((l) => l.id === 303).loser_match_id == null, 'trận nhánh L cuối không có đường thua');
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `node tests/tournament/persistence.test.js`
Expected: FAIL — `kẻ thua xuống nhánh L`

- [ ] **Step 3: Sửa `resolveParentLinks`**

Khoá `keyOf` hiện là `${round}:${bracket_slot}` — **không đủ** cho double-elim vì nhánh W và L có thể trùng cặp đó. Đổi thành `${bracket || ''}:${round}:${bracket_slot}` và thêm đường thứ hai:

```js
function resolveParentLinks(scheduleMatches, dbRows) {
  // Khoá phải gồm cả bracket: nhánh W và L có thể trùng (round, bracket_slot).
  const keyOf = (r) => `${r.bracket || ''}:${r.round}:${r.bracket_slot}`;
  const dbByKey = new Map(dbRows.map((r) => [keyOf(r), r.id]));
  const schedBySlot = new Map(scheduleMatches.map((m) => [m.slot, m]));
  const updates = [];
  for (const m of scheduleMatches) {
    const childId = dbByKey.get(keyOf(m));
    if (childId == null) continue;
    const patch = { id: childId };
    let touched = false;

    if (m.parent_slot != null) {
      const parent = schedBySlot.get(m.parent_slot);
      const parentId = parent ? dbByKey.get(keyOf(parent)) : null;
      if (parentId != null) { patch.parent_match_id = parentId; touched = true; }
    }
    if (m.loser_to_slot != null) {
      const loserTarget = schedBySlot.get(m.loser_to_slot);
      const loserId = loserTarget ? dbByKey.get(keyOf(loserTarget)) : null;
      if (loserId != null) { patch.loser_match_id = loserId; touched = true; }
    }
    if (touched) updates.push(patch);
  }
  return updates;
}
```

- [ ] **Step 4: Chạy CẢ HAI nhóm test**

Run: `node tests/tournament/persistence.test.js`
Expected: PASS — **cả test knockout của Task B1 lẫn test double-elim mới.** Nếu test B1 đỏ, đường thứ hai đã làm vỡ knockout thường; sửa cho tới khi cả hai xanh.

- [ ] **Step 5: Đẩy kẻ thua khi chốt trận**

Trong `lib/tournament/results.js`, thêm hàm song song với `advanceWinner`:

```js
function advanceLoser(match) {
  if (!match || !match.loser_match_id || !match.winner_entrant_id) return null;
  const loserId = match.winner_entrant_id === match.entrant_a_id ? match.entrant_b_id : match.entrant_a_id;
  if (!loserId) return null;
  const field = match.bracket_slot % 2 === 0 ? 'entrant_a_id' : 'entrant_b_id';
  return { loser_match_id: match.loser_match_id, field, entrant_id: loserId };
}
```

Xuất thêm `advanceLoser` và gọi nó trong `games/route.js` cạnh `advanceWinner`.

- [ ] **Step 6: Mở rộng RPC**

RPC `replace_tournament_entry_schedule` hiện nhận `_key` và `_parent_key`. Thêm `_loser_key` và một lượt update thứ hai cho `loser_match_id`.

Viết bản mới của hàm vào một migration `048_schedule_rpc_loser_routing.sql` với `CREATE OR REPLACE FUNCTION` — **không** `DROP FUNCTION`, để không có khoảng thời gian route gọi vào hàm không tồn tại.

Trước khi viết, đọc bản hiện tại:

```sql
select pg_get_functiondef(p.oid) from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='replace_tournament_entry_schedule';
```

- [ ] **Step 7: Commit**

```bash
git add lib/tournament/persistence.js lib/tournament/results.js tests/tournament/persistence.test.js database/migrations/048_schedule_rpc_loser_routing.sql
git commit -m "feat(giai-dau): dinh tuyen ke thua cho double elimination

Khoa cua resolveParentLinks doi tu (round, bracket_slot) sang
(bracket, round, bracket_slot): nhanh W va L co the trung cap cu. Test hoi quy
knockout 8 doi va 5 doi co bye van xanh.

RPC dung CREATE OR REPLACE, khong DROP, de khong co khoang thoi gian route goi
vao ham khong ton tai.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task B3: Vẽ nhánh W / L / GF

**Files:**
- Modify: `app/giai-dau/v2/console/bracketRender.js`
- Modify: `app/giai-dau/v2/console/tabs/BracketTab.js`
- Modify: `tests/tournament/ui-standings.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

```js
const br = read('app/giai-dau/v2/console/bracketRender.js');
assert(/bracket/.test(br), 'nhận biết nhánh W/L/GF');
assert(/Nhánh thắng/.test(br) || /Nhánh thắng/.test(read('app/giai-dau/v2/console/tabs/BracketTab.js')), 'có nhãn nhánh thắng');
assert(/overflow-x|overflowX/.test(read('app/giai-dau/v2/console/bracket.css')), 'sơ đồ cuộn ngang trong khung riêng');
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `node tests/tournament/ui-standings.contract.test.js`
Expected: FAIL

- [ ] **Step 3: Vẽ ba cụm**

Gom trận theo `match.bracket`. Trận không có `bracket` (knockout thường) giữ nguyên cách vẽ hiện tại — **không đổi đường đi cũ**.

Ba cụm có tiêu đề **Nhánh thắng** / **Nhánh thua** / **Chung kết tổng**, mỗi cụm nằm trong `<div className="v2-bracket-scroll">` có `overflow-x: auto`.

Trận chưa có đội hiện chữ suy ra thay vì để trống: `Thắng BK1`, `Thua TK2`. Suy từ `parent_match_id` và `loser_match_id` ngược lại.

- [ ] **Step 4: Chạy test, kiểm trình duyệt, commit**

Run: `node tests/tournament/ui-standings.contract.test.js`
Expected: PASS

Kiểm ở 390px / 834px / ≥1280px: ba cụm cuộn ngang trong khung riêng, **thân trang không cuộn ngang**.

```bash
git add app/giai-dau/v2/console/bracketRender.js app/giai-dau/v2/console/tabs/BracketTab.js app/giai-dau/v2/console/bracket.css tests/tournament/ui-standings.contract.test.js
git commit -m "feat(giai-dau): ve nhanh thang/thua/chung ket tong cho double elim

Tran khong co bracket giu nguyen cach ve cu. Tran chua co doi hien 'Thang BK1'
thay vi de trong.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task B4: Hồi quy cuối

- [ ] **Step 1: Chạy**

Run: `npm run test:regression && npm run build`
Expected: exit 0.

- [ ] **Step 2: Kiểm tay một nội dung 8 đội**

Bốc thăm → đổi chỗ → bốc lại → chốt → đấu hết vòng bảng → xem cột suất đi tiếp đổi theo từng trận → sửa một kết quả đã chốt → xác nhận BXH và nhánh cập nhật đúng → chốt giải → xác nhận `final_standings` được ghi.

- [ ] **Step 3: Ghi bằng chứng và commit**

```bash
npm run test:regression > evidence/spec3-regression-2026-09-09.txt 2>&1
git add evidence/spec3-regression-2026-09-09.txt
git commit -m "test(giai-dau): bang chung hoi quy Spec 3

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review — đối chiếu spec

| Mục spec | Task phủ |
|---|---|
| 3.1 · Ba trạng thái `none/draft/locked` | A1, A3 |
| 3.2 · Bốc / sửa tay / bốc lại / chốt / huỷ chốt | A3, A4 |
| 3.3 · Kiểm chặn và cảnh báo không chặn | A1 (`validateDraw`), A4 (UI) |
| 3.4 · Đổi chỗ bằng chọn hai ô, không kéo thả | A4 |
| 4.1 · Cột suất đi tiếp, dòng tiêu chí, hạng chung cuộc | A5, A6, A7 |
| 4.2 · Sơ đồ nhánh double-elim | B2, B3 |
| 4.3 · Cắt khối A / khối B | Cấu trúc plan; B1 Step 1 là cổng chặn |
| 5 · Correction: lý do, xem trước, chặn downstream | A8 |
| 5.3 · Chặn cả khi trận sau `live` | A8 (test 3 trạng thái) |
| 6 · Migration 047 | A2 |
| 7 · Kiểm thử 1–13 | A1 (1–2), A5 (3–4), B1–B2 (5–6), A8 (7), A3 (8–9), A8 (10–11) |

**Cố ý chưa làm:**
- Luồng duyệt correction hai bước — cột `requester`/`approver` giữ nguyên, hiện luôn bằng nhau. Nếu bật hai bước sau này, **phải** thêm cột `single_actor boolean` để phân biệt bản ghi cũ, không được diễn giải ngược dữ liệu cũ.
- `window.confirm` / `window.prompt` ở A4 — chờ `primitives.css` của plan design-system.

**Người thực thi phải tự kiểm:** engine `doubleElim.js` đã commit chưa (B1 Step 1 — cổng chặn của cả khối B); định nghĩa hiện tại của RPC `replace_tournament_entry_schedule` (B2 Step 6).
