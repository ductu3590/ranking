# Tournament Create Wizard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay Wizard tạo giải hiện tại bằng wizard 3 bước (Thể thức → Thông tin giải → Đăng ký) với cấu hình hai trục, xem trước lịch sống, giao diện thẻ, quyền lấy từ session server.

**Architecture:** Thêm một đường "preview lịch" chạy engine sinh lịch trong bộ nhớ (không ghi DB). Mở rộng `lib/tournament/wizardModel.js` bằng các hàm thuần resolve cấu hình. Dựng lại `app/giai-dau/v2/TournamentWizard.js` thành wizard 3 bước theo mockup đã duyệt (artifact `tao-giai-mockup`), tách khối con thành component có ranh giới rõ. Quyền và group đọc từ `/api/groups/session`, không từ localStorage.

**Tech Stack:** Next.js 14 App Router, JavaScript, CommonJS domain modules trong `lib/`, engine thuần trong `lib/tournament/engines`, Node script tests.

**Spec:** `docs/superpowers/specs/2026-09-07-tournament-create-wizard-redesign.md`

**Tham chiếu thiết kế:** mockup đã duyệt tại artifact `tao-giai-mockup` (bố cục, thẻ chọn, luồng 3 bước, hai hình thức đăng ký). Port bố cục và logic của mockup sang React; các contract test dưới đây là hợp đồng hành vi bắt buộc.

---

## Global Constraints

- Domain thuần: `lib/tournament/**` không import React/Next/Supabase client, không I/O trong validator.
- Route mỏng: `app/api/**` chỉ parse, authorize, gọi use case, map response.
- Component không gọi Supabase trực tiếp; fetch qua `lib/tournamentV2Client.js`.
- Quyền/nhóm lấy từ `/api/groups/session` (club) — KHÔNG đọc `role` từ localStorage.
- Dùng lại schema Phase 3 (migration 030–037). Không sửa migration đã apply; schema mới (nếu cần) là file `038_` trở đi, additive, forward-only.
- TDD: viết test đỏ trước, chạy thấy đỏ, rồi implement. Test mới đặt ở `tests/phase3/`.
- Không sửa file trong `tests/tournament/` trừ khi task nói rõ.
- Ngoài phạm vi (spec riêng, KHÔNG làm ở đây): mặt công khai đăng ký tự do, điều hành giải (bốc thăm/nhập điểm/BXH/BO theo vòng), engine double elimination, engine trận đội cấu hình ván con. Wizard chỉ *thiết lập*, đánh dấu các phần này là preview/roadmap.

## File Structure

- Create `lib/tournament/wizardConfig.js` — hàm thuần resolve cấu hình wizard (đơn vị/tính thành tích/thể thức/BO/đội), mặc định theo phạm vi, và shaping entrant cho preview.
- Create `lib/tournament/schedulePreview.js` — build lịch preview từ cấu hình + entrants bằng engine, không ghi DB.
- Create `app/api/tournament-v2/preview-schedule/route.js` — POST, admin-guarded, gọi `schedulePreview`.
- Modify `lib/tournamentV2Client.js` — thêm `previewSchedule(body)`.
- Modify `app/giai-dau/v2/TournamentWizard.js` — dựng lại 3 bước.
- Create `app/giai-dau/v2/wizard.css` — đã có; mở rộng theo mockup (stepper, selcard, two-pane).
- Create tests: `tests/phase3/wizard-config.test.js`, `tests/phase3/schedule-preview.test.js`, `tests/phase3/wizard-redesign-contract.test.js`.
- Modify `package.json` — nối test mới vào `test:phase3-interclub`.

---

### Task 1: Hàm thuần resolve cấu hình wizard

**Files:**
- Create: `lib/tournament/wizardConfig.js`
- Test: `tests/phase3/wizard-config.test.js`

- [ ] **Step 1: Viết test đỏ**

```javascript
const assert = require('assert');
const {
  SCOPES, UNITS, FORMATS,
  effectiveScoring, unitToEntrantType, defaultConfigForScope,
  resolveCompetition, describeCombo,
} = require('../../lib/tournament/wizardConfig');

// scoring hiệu lực
assert.strictEqual(effectiveScoring({ unit: 'team', scope: 'internal', userScoring: 'individual' }), 'team', 'đơn vị đội -> tính theo đội');
assert.strictEqual(effectiveScoring({ unit: 'doi', scope: 'friendly', userScoring: 'club' }), 'club', 'giao hữu + chọn CLB -> cộng điểm CLB');
assert.strictEqual(effectiveScoring({ unit: 'doi', scope: 'internal', userScoring: 'club' }), 'individual', 'nội bộ đơn/đôi -> cá nhân (CLB không có nghĩa)');

// đơn vị -> entrant_type Phase 3
assert.strictEqual(unitToEntrantType('don'), 'individual');
assert.strictEqual(unitToEntrantType('doi'), 'pair');
assert.strictEqual(unitToEntrantType('team'), 'team');

// mặc định theo phạm vi
const di = defaultConfigForScope('internal');
assert.strictEqual(di.unit, 'doi'); assert.strictEqual(di.fmt, 'rr'); assert.strictEqual(di.bestOf, 1);

// resolve gộp: trả play_type/scoring_scope/schedule_format/best_of/team hợp lệ
const r = resolveCompetition({ scope: 'internal', unit: 'team', userScoring: 'individual', fmt: 'mix', bestOf: 3, teamSize: 4, subGames: 5 });
assert.strictEqual(r.play_type, 'team');
assert.strictEqual(r.scoring_scope, 'club');
assert.strictEqual(r.schedule_format, 'round_robin');
assert.strictEqual(r.group_count, 2, 'mix -> vòng bảng 2 nhóm');
assert.strictEqual(r.team.size, 4);
assert.strictEqual(r.team.sub_games, 5);

// double elim đánh dấu cần engine
const rd = resolveCompetition({ scope: 'internal', unit: 'doi', userScoring: 'individual', fmt: 'de', bestOf: 1 });
assert.strictEqual(rd.schedule_format, 'knockout');
assert.strictEqual(rd.double_elimination, true);
assert.strictEqual(rd.engine_pending, true, 'double elim chưa có engine');

// mô tả tổ hợp không rỗng cho mọi combo hợp lệ
for (const unit of ['don','doi','team']) for (const scope of ['internal','friendly']) {
  assert(describeCombo({ unit, scope, userScoring: 'individual' }).length > 0, 'mô tả combo '+unit+'/'+scope);
}
console.log('phase3 wizard config ok');
```

- [ ] **Step 2: Chạy thấy đỏ**

Run: `node tests/phase3/wizard-config.test.js`
Expected: FAIL `Cannot find module '../../lib/tournament/wizardConfig'`.

- [ ] **Step 3: Implement**

```javascript
'use strict';

const SCOPES = ['internal', 'friendly', 'community'];
const UNITS = ['don', 'doi', 'team'];
const FORMATS = ['rr', 'se', 'de', 'mix'];

function unitToEntrantType(unit) {
  return unit === 'don' ? 'individual' : unit === 'team' ? 'team' : 'pair';
}

// Tính thành tích hiệu lực: đơn vị đội -> theo đội; "cộng điểm CLB" chỉ có nghĩa
// ở giải nhiều CLB (giao hữu/cộng đồng); còn lại là cá nhân.
function effectiveScoring({ unit, scope, userScoring } = {}) {
  if (unit === 'team') return 'team';
  if (scope !== 'internal' && userScoring === 'club') return 'club';
  return 'individual';
}

// scoring_scope của schema Phase 3 nhận 'athlete' | 'club'. "team" và "club" đều
// gộp về CLB/đội ở cấp lưu trữ; wizard phân biệt để hiển thị, DB dùng 'club'.
function scoringScopeForDb(eff) {
  return eff === 'individual' ? 'athlete' : 'club';
}

function defaultConfigForScope(scope) {
  const base = { unit: 'doi', userScoring: 'individual', fmt: 'rr', bestOf: 1, teamSize: 4, subGames: 5, teamCount: 2 };
  if (scope === 'friendly') return { ...base, userScoring: 'club' };
  if (scope === 'community') return { ...base, userScoring: 'club' };
  return base;
}

function scheduleFromFormat(fmt) {
  if (fmt === 'rr') return { schedule_format: 'round_robin', group_count: 1 };
  if (fmt === 'mix') return { schedule_format: 'round_robin', group_count: 2 };
  if (fmt === 'se') return { schedule_format: 'knockout', double_elimination: false };
  return { schedule_format: 'knockout', double_elimination: true, engine_pending: true };
}

function resolveCompetition(input = {}) {
  const { scope, unit, userScoring, fmt } = input;
  if (!SCOPES.includes(scope)) throw new Error('INVALID_SCOPE');
  if (!UNITS.includes(unit)) throw new Error('INVALID_UNIT');
  if (!FORMATS.includes(fmt)) throw new Error('INVALID_FORMAT');
  const eff = effectiveScoring(input);
  const sched = scheduleFromFormat(fmt);
  const out = {
    play_type: unitToEntrantType(unit),
    entrant_type: unitToEntrantType(unit),
    scoring_scope: scoringScopeForDb(eff),
    scoring_display: eff,
    best_of: unit === 'team' ? null : Number(input.bestOf || 1),
    double_elimination: !!sched.double_elimination,
    engine_pending: !!sched.engine_pending,
    schedule_format: sched.schedule_format,
    group_count: sched.group_count || 1,
  };
  if (unit === 'team') out.team = { size: Number(input.teamSize || 4), sub_games: Number(input.subGames || 5), count: Number(input.teamCount || 2) };
  return out;
}

function describeCombo({ unit, scope, userScoring, subGames = 5, bestOf = 1 } = {}) {
  if (unit === 'team') {
    return scope === 'internal'
      ? 'Trận đội (MLP). Chia thành viên CLB thành nhiều đội; hai đội gặp nhau đánh ' + subGames + ' ván con.'
      : 'Trận đội (MLP) — mỗi CLB một đội. Hai CLB gặp nhau đánh ' + subGames + ' ván con.';
  }
  const u = unit === 'don' ? 'Đánh đơn' : 'Đánh đôi';
  if (effectiveScoring({ unit, scope, userScoring }) === 'club') {
    return u + ', cộng điểm về CLB. Các ' + (unit === 'don' ? 'VĐV' : 'cặp') + ' đấu bình thường; thắng thua dồn về CLB, tổng sắp.';
  }
  return u + ', xếp hạng cá nhân. Mỗi trận đánh ' + (bestOf === 1 ? '1 ván' : 'best of ' + bestOf) + '.';
}

module.exports = {
  SCOPES, UNITS, FORMATS,
  unitToEntrantType, effectiveScoring, scoringScopeForDb,
  defaultConfigForScope, scheduleFromFormat, resolveCompetition, describeCombo,
};
```

- [ ] **Step 4: Chạy thấy xanh**

Run: `node tests/phase3/wizard-config.test.js`
Expected: PASS `phase3 wizard config ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/tournament/wizardConfig.js tests/phase3/wizard-config.test.js
git commit -m "feat: pure wizard competition config resolver"
```

---

### Task 2: Preview lịch không ghi DB

**Files:**
- Create: `lib/tournament/schedulePreview.js`
- Test: `tests/phase3/schedule-preview.test.js`

- [ ] **Step 1: Viết test đỏ**

```javascript
const assert = require('assert');
const { buildSchedulePreview } = require('../../lib/tournament/schedulePreview');

// 4 cặp, vòng tròn -> 6 trận, deterministic theo seed
const rr = buildSchedulePreview({ competition: { schedule_format: 'round_robin', group_count: 1 }, entrantCount: 4, seed: 1 });
assert.strictEqual(rr.format, 'round_robin');
assert.strictEqual(rr.matches.length, 6, '4 đội vòng tròn = 6 trận');
const rr2 = buildSchedulePreview({ competition: { schedule_format: 'round_robin', group_count: 1 }, entrantCount: 4, seed: 1 });
assert.deepStrictEqual(rr.matches, rr2.matches, 'cùng seed cho cùng lịch');

// knockout 4 đội -> có vòng 1
const ko = buildSchedulePreview({ competition: { schedule_format: 'knockout' }, entrantCount: 4, seed: 1 });
assert.strictEqual(ko.format, 'knockout');
assert(ko.matches.length >= 2, 'knockout có trận vòng 1');

// mix 2 nhóm chia bảng
const mix = buildSchedulePreview({ competition: { schedule_format: 'round_robin', group_count: 2 }, entrantCount: 6, seed: 1 });
assert(mix.groups >= 2, 'mix có từ 2 bảng');

// đầu vào rỗng -> preview rỗng, không văng
const empty = buildSchedulePreview({ competition: { schedule_format: 'round_robin', group_count: 1 }, entrantCount: 0, seed: 1 });
assert.strictEqual(empty.matches.length, 0);
console.log('phase3 schedule preview ok');
```

- [ ] **Step 2: Chạy thấy đỏ**

Run: `node tests/phase3/schedule-preview.test.js`
Expected: FAIL `Cannot find module '../../lib/tournament/schedulePreview'`.

- [ ] **Step 3: Implement**

```javascript
'use strict';

const { getScheduleEngine } = require('./engines');

// Sinh lịch trong bộ nhớ từ số entrant + cấu hình, KHÔNG chạm database.
// entrantCount là số ước lượng (người/cặp/đội/CLB) đang có ở bước cấu hình.
function buildSchedulePreview({ competition = {}, entrantCount = 0, seed = 1 } = {}) {
  const format = competition.schedule_format === 'knockout' ? 'knockout' : 'round_robin';
  const groupCount = Math.max(1, Number(competition.group_count || 1));
  const n = Math.max(0, Number(entrantCount || 0));
  const entrants = Array.from({ length: n }, (_, i) => ({ id: i + 1, seed: i + 1 }));
  if (!entrants.length) return { format, groups: groupCount, matches: [] };
  const engine = getScheduleEngine(format);
  const stage = { schedule_format: format, config: { groupCount, shuffle: false } };
  let matches = [];
  try {
    matches = engine.generateSchedule(stage, entrants, Number(seed) || 1) || [];
  } catch (e) {
    matches = [];
  }
  return {
    format,
    groups: format === 'round_robin' ? groupCount : 1,
    double_elimination: !!competition.double_elimination,
    engine_pending: !!competition.engine_pending,
    matches: matches.map((m) => ({
      round: m.round, group_label: m.group_label || null, bracket_slot: m.bracket_slot || null,
      a: m.entrant_a_id, b: m.entrant_b_id,
    })),
  };
}

module.exports = { buildSchedulePreview };
```

- [ ] **Step 4: Chạy thấy xanh**

Run: `node tests/phase3/schedule-preview.test.js`
Expected: PASS `phase3 schedule preview ok`.

- [ ] **Step 5: Chạy hồi quy engine để chắc không đụng logic cũ**

Run: `npm run test:t-engines`
Expected: tất cả `ok`, không file fixture nào đổi.

- [ ] **Step 6: Commit**

```bash
git add lib/tournament/schedulePreview.js tests/phase3/schedule-preview.test.js
git commit -m "feat: in-memory schedule preview builder"
```

---

### Task 3: API preview + client function

**Files:**
- Create: `app/api/tournament-v2/preview-schedule/route.js`
- Modify: `lib/tournamentV2Client.js`
- Test: `tests/phase3/wizard-redesign-contract.test.js` (tạo mới, mở rộng ở các task sau)

- [ ] **Step 1: Viết test contract đỏ** (kiểm hành vi route + client, kiểu file test đã có trong `tests/tournament/*.contract.test.js`)

```javascript
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

// Route preview tồn tại, admin-guarded, không ghi DB
assert(exists('app/api/tournament-v2/preview-schedule/route.js'), 'route preview tồn tại');
const rt = read('app/api/tournament-v2/preview-schedule/route.js');
assert(rt.includes('requireValidatedGroupAdmin'), 'preview có admin guard');
assert(rt.includes('buildSchedulePreview'), 'preview dùng schedulePreview');
assert(!/\.rpc\(|\.insert\(|\.update\(/.test(rt), 'preview không ghi database');

// Client có previewSchedule
const cl = read('lib/tournamentV2Client.js');
assert(cl.includes('export function previewSchedule'), 'client export previewSchedule');

console.log('phase3 wizard redesign contract: preview ok');
```

- [ ] **Step 2: Chạy thấy đỏ**

Run: `node tests/phase3/wizard-redesign-contract.test.js`
Expected: FAIL ở dòng "route preview tồn tại".

- [ ] **Step 3: Implement route**

```javascript
import { NextResponse } from 'next/server';
import { requireValidatedGroupAdmin } from '@/lib/groupSession';
import { buildSchedulePreview } from '@/lib/tournament/schedulePreview';

export async function POST(request) {
    const admin = await requireValidatedGroupAdmin();
    if (!admin.ok) return admin.response;
    try {
        const body = await request.json();
        const preview = buildSchedulePreview({
            competition: body?.competition || {},
            entrantCount: Number(body?.entrant_count || 0),
            seed: Number(body?.seed || 1),
        });
        return NextResponse.json(preview);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 400 });
    }
}
```

- [ ] **Step 4: Implement client fn** — thêm vào `lib/tournamentV2Client.js` cạnh các hàm khác:

```javascript
export function previewSchedule(body) {
    return request('/preview-schedule', { method: 'POST', body: JSON.stringify(body) });
}
```

(Dùng đúng helper `request(...)` sẵn có trong file — xem các hàm lân cận như `previewDivisionPairing` để khớp chữ ký.)

- [ ] **Step 5: Chạy thấy xanh**

Run: `node tests/phase3/wizard-redesign-contract.test.js`
Expected: PASS `phase3 wizard redesign contract: preview ok`.

- [ ] **Step 6: Commit**

```bash
git add app/api/tournament-v2/preview-schedule/route.js lib/tournamentV2Client.js tests/phase3/wizard-redesign-contract.test.js
git commit -m "feat: preview-schedule API route and client"
```

---

### Task 4: Bộ khung wizard 3 bước

**Files:**
- Modify: `app/giai-dau/v2/TournamentWizard.js`
- Modify: `app/giai-dau/v2/wizard.css`
- Modify: `tests/phase3/wizard-redesign-contract.test.js`

Port bố cục và CSS từ mockup đã duyệt (`tao-giai-mockup`): thanh stepper 3 bước, khung rộng (max ~1440px), hai khung ở bước 1 (cấu hình trái + xem trước phải) trên desktop, tab Cấu hình/Xem trước trên mobile, chân có Quay lại / Tiếp tục / Tạo giải.

- [ ] **Step 1: Mở rộng test contract (đỏ)** — thêm vào cuối `tests/phase3/wizard-redesign-contract.test.js`, TRƯỚC dòng `console.log` cuối:

```javascript
const w = read('app/giai-dau/v2/TournamentWizard.js');
// 3 bước
for (const label of ['Thể thức', 'Thông tin giải', 'Đăng ký']) assert(w.includes(label), 'wizard có bước "' + label + '"');
// stepper + điều hướng
assert(/showStep|setStep|currentStep|step\s*===\s*1/.test(w), 'wizard có điều hướng bước');
// quyền từ session server, không localStorage
assert(w.includes("/api/groups/session"), 'wizard đọc quyền từ session server');
assert(!/getCurrentGroupClient\s*\(\)\s*\.role|group\.role\s*===\s*'admin'\s*\/\/\s*localStorage/.test(w) || w.includes('/api/groups/session'), 'không tin role localStorage một mình');
// dùng previewSchedule
assert(w.includes('previewSchedule'), 'wizard gọi previewSchedule để xem trước');
```

- [ ] **Step 2: Chạy thấy đỏ**

Run: `node tests/phase3/wizard-redesign-contract.test.js`
Expected: FAIL ở dòng bước wizard.

- [ ] **Step 3: Dựng lại TournamentWizard.js** — port từ mockup. Cấu trúc React: state `step (1|2|3)`, các state cấu hình (`scope, unit, userScoring, fmt, bestOf, teamSize, subGames, teamCount`), state thông tin (`name, slug, description`), và state đăng ký. `useEffect` fetch `/api/groups/session` để set `{ groupId, groupName, isAdmin }`. Render theo `step`. Hàm `runPreview()` gọi `previewSchedule({ competition: resolveCompetition(cfg), entrant_count, seed:1 })` (dùng `resolveCompetition` từ `lib/tournament/wizardConfig` qua một client wrapper hoặc tính entrant_count tại client) và hiển thị ở khung phải. Chi tiết bố cục lấy nguyên từ mockup; giữ selcard, stepper, two-pane, mobile tabs.

Khối con nên tách thành component trong cùng thư mục để file gọn: `wizard/StepConfig.js`, `wizard/StepInfo.js`, `wizard/StepRegister.js`, `wizard/LivePreview.js` (tùy chọn nhưng khuyến khích — mỗi file một trách nhiệm).

- [ ] **Step 4: Chạy thấy xanh + build**

Run: `node tests/phase3/wizard-redesign-contract.test.js && npm run test:t-ui`
Expected: contract PASS; `test:t-ui` vẫn ok (nếu `ui-wizard.contract.test.js` cũ đòi chuỗi không còn, cập nhật nó ở Task 8).

Run: `npm run build`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add app/giai-dau/v2/TournamentWizard.js app/giai-dau/v2/wizard.css app/giai-dau/v2/wizard tests/phase3/wizard-redesign-contract.test.js
git commit -m "feat: rebuild tournament wizard as 3-step shell with live preview"
```

---

### Task 5: Bước 1 — cấu hình thẻ + xem trước sống

**Files:**
- Modify: `app/giai-dau/v2/TournamentWizard.js` (hoặc `wizard/StepConfig.js`, `wizard/LivePreview.js`)
- Modify: `tests/phase3/wizard-redesign-contract.test.js`

- [ ] **Step 1: Test contract (đỏ)** — thêm trước dòng `console.log` cuối:

```javascript
// Thẻ chọn cho 3 nhóm cấu hình
for (const t of ['Đơn vị vào sân', 'Tính thành tích', 'Thể thức', 'Số ván', 'Cấu hình trận đội']) assert(w.includes(t), 'bước 1 có nhóm "' + t + '"');
// Bốn thể thức, có double elim đánh dấu engine đang xây
for (const t of ['Vòng tròn', 'Loại trực tiếp 1 nhánh', 'Loại trực tiếp 2 nhánh', 'Vòng bảng']) assert(w.includes(t), 'thể thức "' + t + '"');
assert(w.includes('engine đang xây') || w.includes('engine_pending'), 'double elim đánh dấu cần engine');
// Ô cộng đồng khoá theo quyền
assert(w.includes('Cộng đồng') && (w.includes('disabled') || w.includes('🔒')), 'ô cộng đồng khoá cho club admin');
```

- [ ] **Step 2: Chạy thấy đỏ** — `node tests/phase3/wizard-redesign-contract.test.js` FAIL ở nhóm cấu hình.

- [ ] **Step 3: Implement** — port khối cấu hình từ mockup: phạm vi (nút gạt, cộng đồng khoá), ba nhóm thẻ (đơn vị/tính thành tích/thể thức) dùng `.selcard`, số ván (nút gạt) hoặc cấu hình trận đội khi `unit==='team'`, dòng diễn giải combo (`describeCombo`). Khung phải gọi `runPreview()` mỗi khi cấu hình đổi và render bảng lịch/sơ đồ từ kết quả `previewSchedule`. Tính thành tích chỉ hiện khi `scope!=='internal' && unit!=='team'`.

- [ ] **Step 4: Chạy thấy xanh + build** — contract PASS; `npm run build` EXIT 0.

- [ ] **Step 5: Kiểm tay trên trình duyệt** — chạy `npm run dev`, đăng nhập admin CLB, mở tạo giải: đổi các thẻ ở bước 1 và xác nhận khung xem trước phải đổi theo (đơn vị/tính thành tích/thể thức/số ván). Ghi lại một ảnh chụp vào evidence.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wizard step 1 config cards wired to live preview"
```

---

### Task 6: Bước 2 — thông tin giải

**Files:**
- Modify: `app/giai-dau/v2/TournamentWizard.js` (hoặc `wizard/StepInfo.js`)
- Modify: `tests/phase3/wizard-redesign-contract.test.js`

- [ ] **Step 1: Test contract (đỏ)** — thêm:

```javascript
for (const t of ['Tên giải', 'Link chia sẻ', 'Mô tả', 'Poster']) assert(w.includes(t), 'bước 2 có "' + t + '"');
assert(/slugify|toLowerCase\(\)\.normalize/.test(w), 'slug tự sinh từ tên');
```

- [ ] **Step 2: Chạy thấy đỏ.**

- [ ] **Step 3: Implement** — form: tên giải; link chia sẻ với prefix `pickhub.vn/giai/` và slug tự sinh từ tên (hàm `slugify` bỏ dấu tiếng Việt, thay `đ→d`, ký tự lạ thành `-`), sửa được; mô tả (textarea); ô poster (placeholder tải ảnh). Lưu vào state, gửi khi tạo giải qua `createTournament` + `updateTournamentRules`/`share_settings`.

- [ ] **Step 4: Chạy thấy xanh + build.**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wizard step 2 tournament info and share slug"
```

---

### Task 7: Bước 3 — đăng ký rẽ theo hai hình thức

**Files:**
- Modify: `app/giai-dau/v2/TournamentWizard.js` (hoặc `wizard/StepRegister.js`)
- Modify: `tests/phase3/wizard-redesign-contract.test.js`

- [ ] **Step 1: Test contract (đỏ)** — thêm:

```javascript
// Ba nhánh đăng ký
assert(w.includes('Người chơi') && w.includes('Ghép cặp'), 'nội bộ: nhập người + ghép cặp');
assert(w.includes('Các đội') && w.includes('Chia ngẫu nhiên'), 'nội bộ đội: chia đội');
assert(w.includes('CLB được mời') && w.includes('Hạn nộp'), 'giao hữu: mời CLB + hạn nộp');
assert(w.includes('Link đăng ký') && w.includes('Hạn đăng ký'), 'cộng đồng: mở link + hạn');
// Rẽ theo scope
assert(/regInternal|regFriendly|regCommunity|scope\s*===\s*'friendly'/.test(w), 'bước 3 rẽ theo phạm vi');
```

- [ ] **Step 2: Chạy thấy đỏ.**

- [ ] **Step 3: Implement** — port ba nhánh từ mockup:
  - *Nội bộ (đơn/đôi):* danh sách người chơi (chip, thêm bằng Enter/dán, chọn từ roster qua client), ghép cặp (chạm đổi + ghép ngẫu nhiên) dùng `previewDivisionPairing`/`confirmDivisionPairing`; nội bộ + đội: bộ chia đội (số đội tăng/giảm, chia ngẫu nhiên).
  - *Giao hữu:* ô hạn nộp danh sách; danh sách CLB được mời với trạng thái + nút duyệt qua `updateTournamentClub`; `inviteTournamentClub`/`inviteExternalClub`.
  - *Cộng đồng:* block link đăng ký (copy), hạn đăng ký, ai được đăng ký, hàng chờ duyệt. Đây chỉ là *thiết lập*; mặt công khai và duyệt thực tế thuộc spec `tournament-open-registration` — hiện hiển thị và lưu cấu hình mở đăng ký, kèm ghi chú.
  - Cảnh báo PHR (thiếu/pending/vượt cap) hiện nhưng KHÔNG chặn.

- [ ] **Step 4: Chạy thấy xanh + build.**

- [ ] **Step 5: Kiểm tay** — dev: đổi phạm vi ở bước 1, sang bước 3 thấy đúng nhánh; nội bộ tạo được danh sách + ghép cặp; giao hữu mời được CLB. Ghi ảnh vào evidence.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wizard step 3 registration branches for both organizing modes"
```

---

### Task 8: Cập nhật test cũ, nối script, evidence

**Files:**
- Modify: `tests/tournament/ui-wizard.contract.test.js` (chỉ khi chuỗi cũ không còn)
- Modify: `package.json`
- Modify: `evidence/phase-3-test-report.md`

- [ ] **Step 1:** Nếu `npm run test:t-ui` đỏ vì `ui-wizard.contract.test.js` đòi chuỗi cũ đã bỏ (ví dụ `Giai đoạn`, `saveEntrant`), cập nhật assertion sang chuỗi/hành vi mới của wizard 3 bước (kiểm `createTournament`, `saveStage`, `saveDivisionEntry`, `previewSchedule`, và ba bước). Không nới lỏng thành no-op.

- [ ] **Step 2:** Nối test mới vào `test:phase3-interclub` trong `package.json`: thêm `node tests/phase3/wizard-config.test.js`, `node tests/phase3/schedule-preview.test.js`, `node tests/phase3/wizard-redesign-contract.test.js` vào cuối chuỗi.

- [ ] **Step 3:** Chạy đủ:

Run: `npm run test:phase3-interclub && npm run test:t-ui && npm run test:t-api && npm run test:t-engines && npm run build`
Expected: tất cả EXIT 0.

- [ ] **Step 4:** Ghi kết quả thật vào `evidence/phase-3-test-report.md` (mục "Wizard redesign"), kèm output lệnh và ảnh chụp bước 1/3 đã kiểm tay.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/tournament/ui-wizard.contract.test.js evidence/phase-3-test-report.md
git commit -m "test: wire wizard redesign tests into phase3 suite"
```

---

## Self-review checklist

- [ ] Mọi mục trong spec (3 lớp, hai trục, 3 bước, hai hình thức, preview, responsive, giao diện thẻ, không tin localStorage, engine pending, spec liên quan) có task tương ứng hoặc được đánh dấu ngoài phạm vi.
- [ ] Không flow mới nào đọc `role` từ localStorage một mình; quyền từ `/api/groups/session`.
- [ ] Preview không ghi database (không `.rpc/.insert/.update`).
- [ ] Double elimination và trận đội cấu hình ván con được đánh dấu "engine đang xây", không giả vờ đã có.
- [ ] Mỗi hàm thuần/route mới có test chạy được và đã thấy đỏ trước khi implement.
- [ ] `npm run test:t-engines` xanh, không sửa fixture cũ trong `tests/tournament/`.
- [ ] Bốc thăm/sinh lịch/nhập điểm/BO theo vòng KHÔNG nằm trong wizard (thuộc spec operations).
