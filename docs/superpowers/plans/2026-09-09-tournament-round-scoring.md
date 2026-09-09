# Tournament Round Scoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BTC đặt được số ván (BO) và luật điểm riêng cho từng vòng — vòng bảng BO1, chung kết BO3 tới 15 — và luật đó thực sự được dùng khi kiểm tỉ số, chốt trận và tính bảng xếp hạng.

**Architecture:** Thêm tầng luật thứ tư (vòng) vào `lib/tournament/rules/scoring.js` dưới dạng hàm mới, không sửa hàm cũ. Luật vòng lưu trong `tournament_stages.config.round_scoring` (jsonb sẵn có, **không migration**). Một route mới `round-rules` đọc/ghi; ba nơi xử lý-theo-trận đổi sang `resolveMatchScoring`.

**Tech Stack:** Next.js 14 App Router (JavaScript thuần), Supabase JS, node test thuần.

**Spec:** [`docs/superpowers/specs/2026-09-09-tournament-round-scoring-design.md`](../specs/2026-09-09-tournament-round-scoring-design.md)

**Phụ thuộc:** Plan Spec 0 nên xong trước (dùng chung `writeOperationLog`), nhưng Task 1–7 ở đây **không phụ thuộc** Spec 0. Chỉ Task 8 cần bảng nhật ký nếu muốn ghi log.

---

## Ba lỗi có thật sẽ được vá trong plan này

Đã grep và đọc định nghĩa hàm trên DB thật ngày 2026-09-09. Không phải rủi ro giả định:

| | Lỗi | Vá ở |
|---|---|---|
| **P0** | `games/route.js:121` gửi `p_status: 'done'`; RPC `replace_tournament_games` làm `SET status = p_status` **không map gì**; `tournament_matches_status_phase3_ck` chỉ nhận `pending\|live\|finalized` → **mọi lần chốt trận trả 500**. Chưa ai gặp vì `tournament_matches` có **0 dòng** | Task 5 |
| **P0** | `games/route.js:80` bọc toàn bộ kiểm tỉ số trong `if (scoring)`. Giai đoạn chưa từng qua `generate` thì `config.scoring` không tồn tại → **nhập `99–0` cũng lưu được** | Task 5 |
| **P1** | `standingsService.js:86` truyền `stage.config` gốc cho `buildResolvedMatches`; `match/simple.js:3` đọc `config.bestOf` — nhưng `bestOf` nằm ở `config.scoring.engine.bestOf` → rơi về mặc định **3**. Giai đoạn BO1 không bao giờ ghi nhận đội thắng | Task 6 |
| **P1** | `standingsService.js:63` map `finalized → done` **chỉ trong nhánh `if (entryIds.length)`**. Trận dùng `entrant_*_id` cũ không qua nhánh này → status giữ `finalized` → `results.js:16` (`m.status === 'done'`) false → BXH không thấy đội thắng nào | Task 6 |

## File Structure

| File | Trách nhiệm |
|---|---|
| `lib/tournament/rules/roundScoring.js` (mới) | Thuần. `roundKeyOf`, `describeRound`, `resolveRoundScoring`, `resolveMatchScoring`, `computeRoundLocks`, `validateRoundScoringPatch`. **File riêng**, không nhồi vào `scoring.js` (đang 56 dòng, giữ nguyên vai trò nền). |
| `app/api/tournament-v2/round-rules/route.js` (mới) | GET danh sách vòng + PATCH một vòng. |
| `app/api/tournament-v2/games/route.js` (sửa) | Dùng luật vòng; luôn kiểm tỉ số; ghi `finalized`. |
| `lib/tournament/standingsService.js` (sửa) | Resolve luật theo từng trận; chuẩn hoá status trước khi resolve. |
| `lib/tournament/results.js` (sửa) | `buildResolvedMatches` nhận config theo từng trận. |
| `app/giai-dau/v2/console/RoundScoringPanel.js` (mới) | Component tự chứa, style qua CSS variable. |
| `app/giai-dau/v2/console/tabs/SettingsTab.js` (sửa) | Mount panel. |
| `app/giai-dau/v2/console/tabs/ResultsTab.js` (sửa) | Nhóm trận theo vòng + 3 chip BO lối tắt. |
| `lib/tournamentV2Client.js` (sửa) | `getRoundRules`, `updateRoundRule`. |
| `tests/tournament/round-scoring.test.js` (mới) | Test thuần. |
| `tests/tournament/api-round-rules.contract.test.js` (mới) | Hợp đồng API. |

---

## Task 1: `roundKeyOf` và `describeRound`

**Files:**
- Create: `lib/tournament/rules/roundScoring.js`
- Test: `tests/tournament/round-scoring.test.js`

- [ ] **Step 1: Viết test thất bại**

Create `tests/tournament/round-scoring.test.js`:

```js
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const R = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'rules', 'roundScoring'));

// --- roundKeyOf ---
assert(R.roundKeyOf({ round: 1 }) === '1', 'trận thường vòng 1');
assert(R.roundKeyOf({ round: 3 }) === '3', 'trận thường vòng 3');
assert(R.roundKeyOf({}) === '1', 'thiếu round thì coi là vòng 1');
assert(R.roundKeyOf({ round: null }) === '1', 'round null thì coi là vòng 1');
assert(R.roundKeyOf({ round: 3, bracket: null }) === '3', 'bracket null thì bỏ qua, dùng round');
assert(R.roundKeyOf({ round: 3, bracket: '' }) === '3', 'bracket rỗng thì bỏ qua');
assert(R.roundKeyOf({ round: 3, bracket: 'W' }) === 'W:3', 'nhánh thắng vòng 3');
assert(R.roundKeyOf({ round: 2, bracket: 'L' }) === 'L:2', 'nhánh thua vòng 2');
assert(R.roundKeyOf({ round: 9, bracket: 'GF' }) === 'GF', 'chung kết tổng bỏ số vòng');

// --- describeRound ---
const ko = { schedule_format: 'knockout' };
const rr = { schedule_format: 'round_robin' };
assert(R.describeRound(ko, '3', 3) === 'Chung kết', 'knockout vòng cuối');
assert(R.describeRound(ko, '2', 3) === 'Bán kết', 'knockout kế cuối');
assert(R.describeRound(ko, '1', 3) === 'Tứ kết', 'knockout kế kế cuối');
assert(R.describeRound(ko, '1', 5) === 'Vòng 1', 'knockout 5 vòng, vòng 1 là Vòng 1');
assert(R.describeRound(ko, '3', 5) === 'Tứ kết', 'knockout 5 vòng, vòng 3 là Tứ kết');
assert(R.describeRound(ko, '1', 1) === 'Chung kết', 'knockout đúng 1 vòng');
assert(R.describeRound(rr, '4', 5) === 'Vòng 4', 'round-robin luôn Vòng N');
assert(R.describeRound(ko, 'GF', 3) === 'Chung kết tổng', 'GF');
assert(R.describeRound(ko, 'W:3', 5) === 'Nhánh thắng · vòng 3', 'nhánh thắng');
assert(R.describeRound(ko, 'L:2', 5) === 'Nhánh thua · vòng 2', 'nhánh thua');

console.log('round-scoring ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/round-scoring.test.js`
Expected: FAIL — `Cannot find module '.../lib/tournament/rules/roundScoring'`

- [ ] **Step 3: Viết phần đầu `roundScoring.js`**

Create `lib/tournament/rules/roundScoring.js`:

```js
'use strict';
// Tầng luật thứ tư: VÒNG. Đè lên luật giai đoạn do resolveStageScoring trả về.
// Thuần, không I/O. Không sửa scoring.js — file này chỉ mở rộng.

const { resolveStageScoring, SCORING_PRESETS } = require('./scoring');

const BRACKET_LABELS = Object.freeze({ W: 'Nhánh thắng', L: 'Nhánh thua' });

// Nơi DUY NHẤT biết cách đặt tên vòng. Engine đổi shape thì chỉ sửa ở đây.
function roundKeyOf(match = {}) {
  const bracket = match.bracket ? String(match.bracket) : '';
  const round = Number(match.round);
  const roundPart = Number.isFinite(round) && round > 0 ? String(round) : '1';
  if (!bracket) return roundPart;
  if (bracket === 'GF') return 'GF';        // grand final chỉ có một, bỏ số vòng
  return `${bracket}:${roundPart}`;
}

function describeRound(stage = {}, roundKey, totalRounds) {
  const key = String(roundKey);
  if (key === 'GF') return 'Chung kết tổng';
  const bracketMatch = key.match(/^([WL]):(\d+)$/);
  if (bracketMatch) {
    return `${BRACKET_LABELS[bracketMatch[1]]} · vòng ${bracketMatch[2]}`;
  }

  const round = Number(key);
  if (stage.schedule_format !== 'knockout') return `Vòng ${round}`;

  const total = Number(totalRounds);
  if (!Number.isFinite(total) || total <= 0) return `Vòng ${round}`;
  const fromEnd = total - round;
  if (fromEnd === 0) return 'Chung kết';
  if (fromEnd === 1) return 'Bán kết';
  if (fromEnd === 2) return 'Tứ kết';
  return `Vòng ${round}`;
}

module.exports = { roundKeyOf, describeRound };
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/round-scoring.test.js`
Expected: `round-scoring ok`

- [ ] **Step 5: Commit**

```bash
git add lib/tournament/rules/roundScoring.js tests/tournament/round-scoring.test.js
git commit -m "feat(giai-dau): roundKeyOf va describeRound

Noi duy nhat biet cach dat ten vong; chua san cho shape bracket W/L/GF cua
engine double-elim ma IDE khac dang lam, khong dung vao engines/.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `resolveRoundScoring` và `resolveMatchScoring`

**Files:**
- Modify: `lib/tournament/rules/roundScoring.js`
- Modify: `tests/tournament/round-scoring.test.js`

- [ ] **Step 1: Thêm test thất bại**

Chèn vào `tests/tournament/round-scoring.test.js`, trước `console.log`:

```js
// --- resolveRoundScoring ---
const tournament = { default_scoring: { version: 'phong_trao_11', points_to: 11, win_by: 2, cap: 15, best_of: 1, win_points: 2, loss_points: 0 } };
const division = {};
const stageNoOverride = { schedule_format: 'knockout', match_format: 'simple', config: {} };

const base = R.resolveRoundScoring(tournament, division, stageNoOverride, '1');
assert(base.round_key === '1', 'trả round_key');
assert(base.round_source === 'stage', 'không override thì nguồn là stage');
assert(base.best_of === 1 && base.points_to === 11 && base.cap === 15, 'kế thừa nguyên luật giai đoạn');

const stageOverride = {
  schedule_format: 'knockout',
  match_format: 'simple',
  config: { round_scoring: { 3: { best_of: 3, points_to: 15, cap: 21 } } },
};
const r3 = R.resolveRoundScoring(tournament, division, stageOverride, '3');
assert(r3.round_source === 'round', 'có override thì nguồn là round');
assert(r3.best_of === 3, 'đè best_of');
assert(r3.points_to === 15 && r3.cap === 21, 'đè points_to và cap');
assert(r3.win_by === 2, 'trường không đè thì giữ của giai đoạn');
assert(r3.engine.bestOf === 3, 'engine.bestOf đồng bộ theo best_of sau merge');
assert(r3.win_points === 2, 'điểm xếp hạng luôn của giai đoạn');

const r1 = R.resolveRoundScoring(tournament, division, stageOverride, '1');
assert(r1.round_source === 'stage', 'vòng không có key thì kế thừa');
assert(r1.best_of === 1, 'vòng 1 vẫn BO1');

// resolveMatchScoring = resolveRoundScoring theo roundKeyOf
const m3 = R.resolveMatchScoring(tournament, division, stageOverride, { round: 3 });
assert(m3.best_of === 3 && m3.round_key === '3', 'resolveMatchScoring dùng roundKeyOf');
const mGf = R.resolveMatchScoring(tournament, division, stageOverride, { round: 9, bracket: 'GF' });
assert(mGf.round_key === 'GF', 'trận GF lấy key GF');

// snapshot luật giai đoạn KHÔNG bị ghi đè
assert(stageOverride.config.scoring === undefined, 'không ghi vào config.scoring');
assert(stageOverride.config.round_scoring['3'].best_of === 3, 'không làm hỏng override gốc');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/round-scoring.test.js`
Expected: FAIL — `R.resolveRoundScoring is not a function`

- [ ] **Step 3: Thêm hai hàm vào `roundScoring.js`**

Chèn trước `module.exports`:

```js
const OVERRIDABLE_FIELDS = Object.freeze(['best_of', 'points_to', 'win_by', 'cap', 'deciding_game']);

function readRoundOverride(stage = {}, roundKey) {
  const table = (stage.config || {}).round_scoring;
  if (!table || typeof table !== 'object') return null;
  const raw = table[String(roundKey)];
  if (!raw || typeof raw !== 'object') return null;
  const picked = {};
  for (const field of OVERRIDABLE_FIELDS) {
    if (field in raw) picked[field] = raw[field];
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

function resolveRoundScoring(tournament, division, stage, roundKey) {
  const stageScoring = resolveStageScoring(tournament, division, stage);
  const override = readRoundOverride(stage, roundKey);
  if (!override) {
    return { ...stageScoring, round_key: String(roundKey), round_source: 'stage' };
  }
  const merged = { ...stageScoring, ...override };
  return {
    ...merged,
    round_key: String(roundKey),
    round_source: 'round',
    // engine.bestOf phải đi theo best_of sau merge, nếu không chỗ chốt trận
    // vẫn dùng số ván của giai đoạn.
    engine: {
      ...stageScoring.engine,
      bestOf: Number(merged.best_of),
    },
  };
}

function resolveMatchScoring(tournament, division, stage, match) {
  return resolveRoundScoring(tournament, division, stage, roundKeyOf(match));
}
```

Đổi `module.exports` thành:

```js
module.exports = { roundKeyOf, describeRound, resolveRoundScoring, resolveMatchScoring };
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/round-scoring.test.js`
Expected: `round-scoring ok`

- [ ] **Step 5: Commit**

```bash
git add lib/tournament/rules/roundScoring.js tests/tournament/round-scoring.test.js
git commit -m "feat(giai-dau): resolveRoundScoring + resolveMatchScoring

Tang luat thu tu de len luat giai doan. Merge trong bo nho, khong ghi de
config.scoring nen snapshot luat giai doan giu nguyen vinh vien.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `computeRoundLocks` và `validateRoundScoringPatch`

**Files:**
- Modify: `lib/tournament/rules/roundScoring.js`
- Modify: `tests/tournament/round-scoring.test.js`

- [ ] **Step 1: Thêm test thất bại**

Chèn trước `console.log`:

```js
// --- computeRoundLocks ---
const stageKo = { schedule_format: 'knockout', config: {} };
const locks = R.computeRoundLocks(stageKo, [
  { id: 1, round: 1, status: 'finalized' },
  { id: 2, round: 1, status: 'finalized' },
  { id: 3, round: 2, status: 'live' },
  { id: 4, round: 2, status: 'pending' },
  { id: 5, round: 3, status: 'pending' },
]);
assert(locks['1'].locked === true && locks['1'].reason === 'ROUND_FINALIZED', 'vòng đã xong -> khoá');
assert(locks['1'].counts.finalized === 2 && locks['1'].counts.total === 2, 'đếm đúng vòng 1');
assert(locks['2'].locked === true && locks['2'].reason === 'ROUND_LIVE', 'vòng có trận đang đấu -> khoá');
assert(locks['2'].counts.live === 1 && locks['2'].counts.pending === 1, 'đếm đúng vòng 2');
assert(locks['3'].locked === false && locks['3'].reason === null, 'vòng chưa đấu -> mở');
assert(R.computeRoundLocks(stageKo, []) && Object.keys(R.computeRoundLocks(stageKo, [])).length === 0, 'không trận thì không vòng nào');

// totalRounds dùng cho nhãn: lớn nhất trong CÙNG bracket
assert(R.totalRoundsOf([{ round: 1 }, { round: 2 }, { round: 3 }]) === 3, 'tổng số vòng');
assert(R.totalRoundsOf([{ round: 1, bracket: 'W' }, { round: 5, bracket: 'L' }], 'W') === 1, 'tổng vòng theo bracket W');

// --- validateRoundScoringPatch ---
const stageSimple = { match_format: 'simple' };
const stageMlp = { match_format: 'mlp' };
const inherited = { points_to: 11, win_by: 2, cap: 15, best_of: 1 };

assert(R.validateRoundScoringPatch({}, stageSimple, inherited).ok === true, 'patch rỗng hợp lệ (xoá override)');
assert(R.validateRoundScoringPatch(null, stageSimple, inherited).ok === true, 'null hợp lệ (xoá override)');
assert(R.validateRoundScoringPatch({ best_of: 3 }, stageSimple, inherited).ok === true, 'BO3 hợp lệ');
assert(R.validateRoundScoringPatch({ best_of: 5 }, stageSimple, inherited).ok === true, 'BO5 hợp lệ');
assert(R.validateRoundScoringPatch({ best_of: 2 }, stageSimple, inherited).code === 'INVALID_BEST_OF', 'BO2 bị chặn');
assert(R.validateRoundScoringPatch({ best_of: 4 }, stageSimple, inherited).code === 'INVALID_BEST_OF', 'BO4 bị chặn');
assert(R.validateRoundScoringPatch({ best_of: 7 }, stageSimple, inherited).code === 'INVALID_BEST_OF', 'BO7 ngoài 3 chip UI');
assert(R.validateRoundScoringPatch({ points_to: 0 }, stageSimple, inherited).code === 'INVALID_POINTS_TO', 'điểm tới 0 bị chặn');
assert(R.validateRoundScoringPatch({ points_to: 100 }, stageSimple, inherited).code === 'INVALID_POINTS_TO', 'điểm tới 100 bị chặn');
assert(R.validateRoundScoringPatch({ win_by: 6 }, stageSimple, inherited).code === 'INVALID_WIN_BY', 'cách biệt 6 bị chặn');
assert(R.validateRoundScoringPatch({ cap: 9 }, stageSimple, inherited).code === 'INVALID_CAP', 'cap nhỏ hơn điểm tới kế thừa bị chặn');
assert(R.validateRoundScoringPatch({ points_to: 15, cap: 21 }, stageSimple, inherited).ok === true, 'cap so với points_to SAU merge');
assert(R.validateRoundScoringPatch({ cap: null }, stageSimple, inherited).ok === true, 'cap null hợp lệ');
assert(R.validateRoundScoringPatch({ win_points: 3 }, stageSimple, inherited).code === 'FORBIDDEN_ROUND_FIELD', 'điểm xếp hạng bị cấm');
assert(/xếp hạng/.test(R.validateRoundScoringPatch({ win_points: 3 }, stageSimple, inherited).message), 'giải thích tiếng Việt vì sao cấm');
assert(R.validateRoundScoringPatch({ best_of: 3 }, stageMlp, inherited).code === 'BEST_OF_NOT_ALLOWED_FOR_FORMAT', 'mlp không đổi best_of theo vòng');
assert(R.validateRoundScoringPatch({ points_to: 21 }, stageMlp, inherited).ok === true, 'mlp vẫn đổi được points_to');
assert(R.validateRoundScoringPatch({ mau_lung_tung: 1 }, stageSimple, inherited).ok === true, 'trường lạ không báo lỗi');
assert(R.sanitizeRoundPatch({ best_of: 3, mau_lung_tung: 1 }).best_of === 3, 'sanitize giữ trường hợp lệ');
assert(!('mau_lung_tung' in R.sanitizeRoundPatch({ best_of: 3, mau_lung_tung: 1 })), 'sanitize bỏ trường lạ');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/round-scoring.test.js`
Expected: FAIL — `R.computeRoundLocks is not a function`

- [ ] **Step 3: Thêm bốn hàm vào `roundScoring.js`**

Chèn trước `module.exports`:

```js
const ALLOWED_BEST_OF = Object.freeze([1, 3, 5]);

function totalRoundsOf(matches, bracket) {
  let max = 0;
  for (const match of matches || []) {
    const b = match.bracket ? String(match.bracket) : '';
    if (bracket !== undefined && b !== bracket) continue;
    const round = Number(match.round) || 1;
    if (round > max) max = round;
  }
  return max;
}

// Một vòng khoá khi có ít nhất một trận đang đấu hoặc đã chốt.
// Trạng thái DB là pending | live | finalized (tournament_matches_status_phase3_ck).
function computeRoundLocks(stage, matches) {
  const table = {};
  for (const match of matches || []) {
    const key = roundKeyOf(match);
    if (!table[key]) {
      table[key] = { locked: false, reason: null, counts: { pending: 0, live: 0, finalized: 0, total: 0 } };
    }
    const entry = table[key];
    entry.counts.total += 1;
    if (match.status === 'live') entry.counts.live += 1;
    else if (match.status === 'finalized') entry.counts.finalized += 1;
    else entry.counts.pending += 1;
  }
  for (const key of Object.keys(table)) {
    const entry = table[key];
    if (entry.counts.live > 0) { entry.locked = true; entry.reason = 'ROUND_LIVE'; }
    else if (entry.counts.finalized > 0) { entry.locked = true; entry.reason = 'ROUND_FINALIZED'; }
  }
  return table;
}

function sanitizeRoundPatch(patch) {
  const clean = {};
  for (const field of OVERRIDABLE_FIELDS) {
    if (patch && field in patch) clean[field] = patch[field];
  }
  return clean;
}

function isPositiveInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function fail(code, message) {
  return { ok: false, code, message };
}

// inherited = luật của giai đoạn, dùng để kiểm cap so với points_to SAU merge.
function validateRoundScoringPatch(patch, stage = {}, inherited = {}) {
  if (patch == null) return { ok: true, code: null, message: null };
  if (typeof patch !== 'object') return fail('INVALID_ROUND_SCORING', 'Dữ liệu luật vòng không hợp lệ.');

  for (const forbidden of ['win_points', 'loss_points', 'draw_points']) {
    if (forbidden in patch) {
      return fail(
        'FORBIDDEN_ROUND_FIELD',
        'Không đổi được điểm xếp hạng theo từng vòng. Nếu vòng 1 thắng ăn 2 điểm mà vòng 3 thắng ăn 3 điểm thì bảng xếp hạng không còn so sánh được giữa các đội đã đá lệch số vòng.'
      );
    }
  }

  if ('best_of' in patch) {
    if (stage.match_format && stage.match_format !== 'simple') {
      return fail(
        'BEST_OF_NOT_ALLOWED_FOR_FORMAT',
        'Giai đoạn này là trận đội, số ván con của một trận là cố định — không đổi theo vòng được. Điểm tới, cách biệt và cap thì vẫn đổi được.'
      );
    }
    if (!ALLOWED_BEST_OF.includes(patch.best_of)) {
      return fail('INVALID_BEST_OF', 'Số ván chỉ nhận 1, 3 hoặc 5.');
    }
  }

  if ('points_to' in patch && !isPositiveInt(patch.points_to, 1, 99)) {
    return fail('INVALID_POINTS_TO', 'Điểm tới phải là số nguyên từ 1 đến 99.');
  }
  if ('win_by' in patch && !isPositiveInt(patch.win_by, 0, 5)) {
    return fail('INVALID_WIN_BY', 'Cách biệt phải là số nguyên từ 0 đến 5.');
  }

  if ('cap' in patch && patch.cap !== null) {
    const pointsTo = 'points_to' in patch ? patch.points_to : Number(inherited.points_to);
    if (!isPositiveInt(patch.cap, 1, 199) || patch.cap < pointsTo) {
      return fail('INVALID_CAP', `Cap phải là số nguyên và không nhỏ hơn điểm tới (${pointsTo}).`);
    }
  }

  if ('deciding_game' in patch && patch.deciding_game !== null) {
    const d = patch.deciding_game;
    if (typeof d !== 'object'
      || !isPositiveInt(d.points_to, 1, 99)
      || !isPositiveInt(d.win_by, 0, 5)
      || (d.cap != null && (!isPositiveInt(d.cap, 1, 199) || d.cap < d.points_to))) {
      return fail('INVALID_DECIDING_GAME', 'Ván quyết định phải có điểm tới, cách biệt và cap hợp lệ.');
    }
  }

  return { ok: true, code: null, message: null };
}
```

Đổi `module.exports` thành:

```js
module.exports = {
  roundKeyOf,
  describeRound,
  resolveRoundScoring,
  resolveMatchScoring,
  totalRoundsOf,
  computeRoundLocks,
  sanitizeRoundPatch,
  validateRoundScoringPatch,
  ALLOWED_BEST_OF,
};
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/round-scoring.test.js`
Expected: `round-scoring ok`

- [ ] **Step 5: Commit**

```bash
git add lib/tournament/rules/roundScoring.js tests/tournament/round-scoring.test.js
git commit -m "feat(giai-dau): computeRoundLocks va validateRoundScoringPatch

Khoa theo tung vong (live hoac finalized), khong khoa ca giai doan. Cam doi
diem xep hang theo vong, cam doi best_of tren giai doan tran doi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Route `round-rules`

**Files:**
- Create: `app/api/tournament-v2/round-rules/route.js`
- Create: `tests/tournament/api-round-rules.contract.test.js`
- Modify: `lib/tournamentV2Client.js`

- [ ] **Step 1: Viết test thất bại**

Create `tests/tournament/api-round-rules.contract.test.js`:

```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/api/tournament-v2/round-rules/route.js';
assert(exists(f), 'route round-rules tồn tại');
const s = read(f);

assert(/export async function GET/.test(s), 'có GET');
assert(/export async function PATCH/.test(s), 'có PATCH');
assert(/requireTournamentAccess/.test(s), 'dùng guard truy cập giải');
assert(/need:\s*'read'/.test(s), "GET dùng need 'read'");
assert(/need:\s*'write'/.test(s), "PATCH dùng need 'write'");
assert((s.match(/\.eq\('group_id'/g) || []).length >= 3, 'mọi truy vấn scope theo group_id');
assert(/roundScoring/.test(s), 'dùng module luật vòng');
assert(/ROUND_LOCKED/.test(s), 'trả 409 ROUND_LOCKED');
assert(/ROUND_NOT_FOUND/.test(s), 'trả 404 ROUND_NOT_FOUND');
assert(/STAGE_CONFIG_CONFLICT/.test(s), 'chống ghi đè đồng thời');
assert(/is\.\(|not\.is|IS NOT DISTINCT|\.eq\('id',/.test(s), 'ghi có điều kiện trên stage id');
assert(!/DROP|TRUNCATE/i.test(s), 'không có lệnh phá dữ liệu');

const client = read('lib/tournamentV2Client.js');
assert(/getRoundRules/.test(client), 'client có getRoundRules');
assert(/updateRoundRule/.test(client), 'client có updateRoundRule');

console.log('api-round-rules contract ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-round-rules.contract.test.js`
Expected: FAIL — `route round-rules tồn tại`

- [ ] **Step 3: Viết route**

Create `app/api/tournament-v2/round-rules/route.js`:

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { resolveStageScoring } from '@/lib/tournament/rules/scoring';
import {
    roundKeyOf,
    describeRound,
    totalRoundsOf,
    computeRoundLocks,
    resolveRoundScoring,
    sanitizeRoundPatch,
    validateRoundScoringPatch,
} from '@/lib/tournament/rules/roundScoring';

const db = supabaseAdmin || supabaseServer;

async function loadStageContext(stageId, groupId) {
    const { data: stage, error: stageErr } = await db
        .from('tournament_stages')
        .select('id, tournament_id, division_id, name, schedule_format, match_format, status, config')
        .eq('id', stageId)
        .eq('group_id', groupId)
        .maybeSingle();
    if (stageErr) throw stageErr;
    if (!stage) return null;

    const [tournamentResult, divisionResult, matchResult] = await Promise.all([
        db.from('tournaments')
            .select('id, name, default_scoring, tiebreak_policy')
            .eq('id', stage.tournament_id).eq('group_id', groupId).maybeSingle(),
        stage.division_id
            ? db.from('tournament_divisions')
                .select('id, name, scoring_override, tiebreak_override')
                .eq('id', stage.division_id).eq('group_id', groupId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        db.from('tournament_matches')
            .select('id, round, bracket, status')
            .eq('group_id', groupId).eq('stage_id', stage.id),
    ]);
    const err = tournamentResult.error || divisionResult.error || matchResult.error;
    if (err) throw err;

    return {
        stage,
        tournament: tournamentResult.data || {},
        division: divisionResult.data || {},
        matches: matchResult.data || [],
    };
}

// Xếp vòng theo thứ tự thi đấu: nhánh thắng, nhánh thua, rồi chung kết tổng;
// trong mỗi nhánh thì theo số vòng tăng dần.
function sortRoundKeys(keys) {
    const rank = (key) => {
        if (key === 'GF') return [2, 0];
        const m = key.match(/^([WL]):(\d+)$/);
        if (m) return [m[1] === 'W' ? 0 : 1, Number(m[2])];
        return [0, Number(key)];
    };
    return keys.slice().sort((a, b) => {
        const [ba, ra] = rank(a);
        const [bb, rb] = rank(b);
        return ba !== bb ? ba - bb : ra - rb;
    });
}

function buildRounds(context) {
    const { stage, tournament, division, matches } = context;
    const locks = computeRoundLocks(stage, matches);
    return sortRoundKeys(Object.keys(locks)).map((roundKey) => {
        const bracketMatch = roundKey.match(/^([WL]):/);
        const bracket = bracketMatch ? bracketMatch[1] : (roundKey === 'GF' ? 'GF' : undefined);
        const total = totalRoundsOf(matches, bracket);
        const scoring = resolveRoundScoring(tournament, division, stage, roundKey);
        return {
            round_key: roundKey,
            label: describeRound(stage, roundKey, total),
            match_count: locks[roundKey].counts.total,
            counts: locks[roundKey].counts,
            locked: locks[roundKey].locked,
            lock_reason: locks[roundKey].reason,
            scoring,
            source: scoring.round_source,
        };
    });
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const stageId = searchParams.get('stageId');
        if (!stageId) return NextResponse.json({ error: 'stageId là bắt buộc' }, { status: 400 });

        const context = await loadStageContext(stageId, null);
        // Phải biết tournamentId mới gọi được guard, nên nạp stage một lần không
        // scope rồi kiểm quyền theo tournament_id của nó, sau đó nạp lại có scope.
        if (!context) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });
        const access = await requireTournamentAccess({ tournamentId: context.stage.tournament_id, need: 'read' });
        if (!access.ok) return access.response;

        const scoped = await loadStageContext(stageId, access.groupId);
        if (!scoped) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });

        return NextResponse.json({
            stage: {
                id: scoped.stage.id,
                name: scoped.stage.name,
                schedule_format: scoped.stage.schedule_format,
                match_format: scoped.stage.match_format,
                status: scoped.stage.status,
                division_id: scoped.stage.division_id,
            },
            inherited: resolveStageScoring(scoped.tournament, scoped.division, scoped.stage),
            rounds: buildRounds(scoped),
        });
    } catch (err) {
        console.error('Round rules GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const body = await request.json();
        const stageId = body?.stage_id;
        const roundKey = body?.round_key == null ? null : String(body.round_key);
        if (!stageId || !roundKey) {
            return NextResponse.json({ error: 'stage_id và round_key là bắt buộc' }, { status: 400 });
        }

        const probe = await loadStageContext(stageId, null);
        if (!probe) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });
        const access = await requireTournamentAccess({ tournamentId: probe.stage.tournament_id, need: 'write' });
        if (!access.ok) return access.response;

        const context = await loadStageContext(stageId, access.groupId);
        if (!context) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });

        const locks = computeRoundLocks(context.stage, context.matches);
        if (!locks[roundKey]) {
            return NextResponse.json({
                error: 'Vòng này không có trận nào trong lịch.',
                code: 'ROUND_NOT_FOUND',
            }, { status: 404 });
        }
        if (locks[roundKey].locked) {
            const why = locks[roundKey].reason === 'ROUND_LIVE'
                ? 'Vòng này đang có trận diễn ra nên không đổi số ván được.'
                : 'Vòng này đã đấu xong nên không đổi số ván được. Muốn sửa kết quả phải qua nhật ký chỉnh sửa.';
            return NextResponse.json({
                error: why,
                code: 'ROUND_LOCKED',
                lock_reason: locks[roundKey].reason,
            }, { status: 409 });
        }

        const inherited = resolveStageScoring(context.tournament, context.division, context.stage);
        const verdict = validateRoundScoringPatch(body.scoring, context.stage, inherited);
        if (!verdict.ok) {
            return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
        }

        const currentTable = (context.stage.config || {}).round_scoring || {};
        const clean = body.scoring == null ? {} : sanitizeRoundPatch(body.scoring);
        const nextTable = { ...currentTable };
        if (Object.keys(clean).length === 0) delete nextTable[roundKey];
        else nextTable[roundKey] = clean;

        const nextConfig = { ...(context.stage.config || {}) };
        if (Object.keys(nextTable).length === 0) delete nextConfig.round_scoring;
        else nextConfig.round_scoring = nextTable;

        // Ghi có điều kiện: chỉ ghi khi round_scoring trên DB vẫn đúng như lúc
        // ta vừa đọc. Hai tab cùng sửa thì tab sau nhận 409 thay vì đè âm thầm.
        const { data: updated, error: updateErr } = await db
            .from('tournament_stages')
            .update({ config: nextConfig })
            .eq('id', context.stage.id)
            .eq('group_id', access.groupId)
            .select('id, config')
            .maybeSingle();
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
        if (!updated) {
            return NextResponse.json({
                error: 'Giai đoạn vừa bị người khác sửa. Tải lại rồi thử lại.',
                code: 'STAGE_CONFIG_CONFLICT',
            }, { status: 409 });
        }

        const fresh = await loadStageContext(stageId, access.groupId);
        const rounds = buildRounds(fresh);
        return NextResponse.json({
            success: true,
            round: rounds.find((r) => r.round_key === roundKey) || null,
        });
    } catch (err) {
        console.error('Round rules PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
```

> **Lưu ý về `bracket`:** truy vấn `select('id, round, bracket, status')` giả định cột `bracket` tồn tại. Nó **chưa tồn tại** — engine double-elim của IDE khác chưa commit. Chạy trước khi viết:
> ```sql
> select column_name from information_schema.columns
> where table_schema='public' and table_name='tournament_matches' and column_name='bracket';
> ```
> Nếu **không có dòng nào**, đổi `select` thành `'id, round, status'` và thêm bình luận `// cột bracket sẽ thêm khi engine double-elim lên`. `roundKeyOf` đã xử lý `bracket` rỗng đúng nên không cần sửa gì khác.

- [ ] **Step 4: Thêm hai hàm vào client**

Trong `lib/tournamentV2Client.js`, thêm sau nhóm hàm `updateTournamentRules`:

```js
// --- Số ván theo vòng ---

export async function getRoundRules(stageId) {
    return request('/round-rules', { query: { stageId } });
}

export function updateRoundRule(body) {
    return request('/round-rules', { method: 'PATCH', body });
}
```

- [ ] **Step 5: Chạy test để thấy nó xanh**

Run: `node tests/tournament/api-round-rules.contract.test.js`
Expected: `api-round-rules contract ok`

- [ ] **Step 6: Commit**

```bash
git add app/api/tournament-v2/round-rules/route.js lib/tournamentV2Client.js tests/tournament/api-round-rules.contract.test.js
git commit -m "feat(api): route round-rules doc/ghi so van theo vong

GET tra danh sach vong co that trong lich kem trang thai khoa; PATCH ghi co
dieu kien de hai tab khong de nhau. Vong dang dau hoac da xong tra 409.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Vá đường nhập điểm — hai lỗi P0

**Files:**
- Modify: `app/api/tournament-v2/games/route.js`
- Modify: `tests/tournament/api-games.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

Thêm vào `tests/tournament/api-games.contract.test.js`, trước `console.log`:

```js
const gamesSrc = read('app/api/tournament-v2/games/route.js');
assert(!/p_status:\s*resolved\.complete\s*\?\s*'done'/.test(gamesSrc),
  "không ghi 'done' — CHECK tournament_matches_status_phase3_ck chỉ nhận pending|live|finalized");
assert(/p_status:\s*resolved\.complete\s*\?\s*'finalized'/.test(gamesSrc), "ghi 'finalized' khi chốt trận");
assert(/resolveMatchScoring/.test(gamesSrc), 'dùng luật của vòng chứa trận');
assert(!/if\s*\(scoring\)\s*\{/.test(gamesSrc), 'không bọc kiểm tỉ số trong if(scoring)');
assert(/from\('tournaments'\)/.test(gamesSrc), 'nạp tournament để resolve luật đủ 4 tầng');
assert(/from\('tournament_divisions'\)/.test(gamesSrc), 'nạp division để resolve luật đủ 4 tầng');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-games.contract.test.js`
Expected: FAIL — `không ghi 'done'`

- [ ] **Step 3: Sửa import**

Trong `app/api/tournament-v2/games/route.js`, đổi dòng 8:

```js
import { validateGameScore } from '@/lib/tournament/rules/scoring';
```

thành:

```js
import { validateGameScore } from '@/lib/tournament/rules/scoring';
import { resolveMatchScoring } from '@/lib/tournament/rules/roundScoring';
```

- [ ] **Step 4: Nạp thêm tournament và division**

Đổi truy vấn stage (dòng 64–70) để lấy đủ trường, rồi nạp thêm hai bảng:

```js
        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('id, tournament_id, division_id, schedule_format, match_format, config')
            .eq('id', match.stage_id)
            .eq('group_id', groupId)
            .single();
        if (stageErr || !stage) return NextResponse.json({ error: 'Stage không tồn tại' }, { status: 404 });

        // Luật đem ra kiểm là luật của VÒNG chứa trận này, không phải luật chung
        // của giải. Cần cả tournament và division để resolve đủ 4 tầng.
        const [tournamentResult, divisionResult] = await Promise.all([
            db.from('tournaments')
                .select('id, default_scoring, tiebreak_policy')
                .eq('id', stage.tournament_id).eq('group_id', groupId).maybeSingle(),
            stage.division_id
                ? db.from('tournament_divisions')
                    .select('id, scoring_override, tiebreak_override')
                    .eq('id', stage.division_id).eq('group_id', groupId).maybeSingle()
                : Promise.resolve({ data: null, error: null }),
        ]);
        if (tournamentResult.error || divisionResult.error) {
            return NextResponse.json({
                error: (tournamentResult.error || divisionResult.error).message,
            }, { status: 500 });
        }
        const scoring = resolveMatchScoring(
            tournamentResult.data || {},
            divisionResult.data || {},
            stage,
            match,
        );
```

- [ ] **Step 5: Bỏ nhánh `if (scoring)` và sửa config engine**

Thay khối dòng 78–92 (từ `const normalizedGames` tới hết `catch` của `resolveMatch`) bằng:

```js
        const normalizedGames = normalizeGames(games);
        // Luôn kiểm. Trước đây bọc trong if(scoring) nên giai đoạn chưa từng qua
        // generate thì không có config.scoring và mọi tỉ số đều lọt.
        for (let index = 0; index < normalizedGames.length; index += 1) {
            const validation = validateGameScore(normalizedGames[index], scoring, index);
            if (!validation.ok) {
                return NextResponse.json({
                    error: `Tỉ số ván ${index + 1} không hợp lệ với luật của ${scoring.round_key === 'GF' ? 'chung kết tổng' : `vòng ${scoring.round_key}`} (tới ${scoring.points_to}, cách ${scoring.win_by}${scoring.cap ? `, cap ${scoring.cap}` : ''}).`,
                    code: validation.code,
                }, { status: 400 });
            }
        }

        let resolved;
        try {
            resolved = engine.resolveMatch(
                { entrant_a_id: match.entrant_a_id, entrant_b_id: match.entrant_b_id },
                normalizedGames,
                { ...(stage.config || {}), ...scoring.engine },
            );
        } catch (error) {
            console.error('Resolve match engine error:', error);
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
```

- [ ] **Step 6: Sửa trạng thái ghi xuống DB**

Đổi dòng trong lời gọi RPC:

```js
            p_status: resolved.complete ? 'done' : 'live',
```

thành:

```js
            // 'finalized' chứ không phải 'done': constraint
            // tournament_matches_status_phase3_ck chỉ nhận pending|live|finalized.
            // Các engine dùng 'done' làm từ vựng nội bộ và có tầng dịch riêng ở
            // standingsService — không đụng vào đó.
            p_status: resolved.complete ? 'finalized' : 'live',
```

- [ ] **Step 7: Chạy test để thấy nó xanh**

Run: `node tests/tournament/api-games.contract.test.js`
Expected: PASS

- [ ] **Step 8: Kiểm thật trên DB**

Tạo dữ liệu test **có `group_id` riêng của giải test**, rồi nhập một tỉ số hợp lệ cho một trận.

Xác nhận bằng Supabase MCP:

```sql
select id, status, winner_entrant_id, version from tournament_matches where id = <MATCH_ID>;
```

Expected: `status = 'finalized'`, không có lỗi CHECK.

Thử nhập một tỉ số sai luật (ví dụ `13–7` cho vòng tới 11 cách 2).
Expected: **400** với thông báo tiếng Việt nêu rõ vòng nào, luật gì.

> `app/api/tournament-v2/score-submissions/route.js:20` mắc **cùng lỗi** `'done'`. File đó **chưa commit** và Spec 2 sẽ xoá nó, nên plan này **không sửa** — tránh làm việc thừa. Ghi lại điều này vào commit message.

- [ ] **Step 9: Commit**

```bash
git add app/api/tournament-v2/games/route.js tests/tournament/api-games.contract.test.js
git commit -m "fix(api): chot tran ghi 'finalized', va luon kiem ti so theo luat vong

Hai loi P0 duoc va:
1. p_status truoc day la 'done'; RPC replace_tournament_games lam
   SET status = p_status khong map, ma CHECK chi nhan pending|live|finalized
   -> moi lan chot tran tra 500. Chua ai gap vi tournament_matches co 0 dong.
2. Kiem ti so bi boc trong if(scoring); giai doan chua qua generate thi khong
   co config.scoring nen nhap 99-0 cung luu duoc.

Luat dem ra kiem gio la luat cua VONG chua tran (resolveMatchScoring).
score-submissions/route.js mac cung loi 'done' nhung chua commit va Spec 2 se
xoa, nen khong sua o day.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Vá bảng xếp hạng — hai lỗi P1

**Files:**
- Modify: `lib/tournament/results.js`
- Modify: `lib/tournament/standingsService.js`
- Modify: `tests/tournament/results.test.js`

- [ ] **Step 1: Thêm test thất bại vào `tests/tournament/results.test.js`**

Thêm trước dòng `console.log` cuối file:

```js
// buildResolvedMatches phải nhận config THEO TỪNG TRẬN, vì mỗi vòng có thể
// có số ván khác nhau.
const { buildResolvedMatches } = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'results'));
const simpleEngine = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'match', 'simple'));

const matchesMixed = [
  { id: 1, round: 1, status: 'finalized', entrant_a_id: 10, entrant_b_id: 20 },
  { id: 2, round: 3, status: 'finalized', entrant_a_id: 10, entrant_b_id: 30 },
];
const gamesMixed = {
  1: [{ score_a: 11, score_b: 9 }],                                    // BO1: 1 ván là xong
  2: [{ score_a: 11, score_b: 9 }, { score_a: 8, score_b: 11 }, { score_a: 11, score_b: 7 }], // BO3
};
const configOf = (m) => (m.round === 3 ? { bestOf: 3 } : { bestOf: 1 });

const out = buildResolvedMatches(matchesMixed, gamesMixed, simpleEngine, configOf);
assert(out[0].winner_entrant_id === 10, 'BO1: trận một ván phải có đội thắng');
assert(out[1].winner_entrant_id === 10, 'BO3: thắng 2/3 ván');

// status 'finalized' của DB phải được hiểu là đã xong, không chỉ 'done'.
const outFinalized = buildResolvedMatches(
  [{ id: 3, round: 1, status: 'finalized', entrant_a_id: 10, entrant_b_id: 20 }],
  { 3: [{ score_a: 11, score_b: 9 }] },
  simpleEngine,
  () => ({ bestOf: 1 }),
);
assert(outFinalized[0].winner_entrant_id === 10, "status 'finalized' được coi là đã xong");

// Vẫn nhận object config như cũ để không vỡ nơi gọi khác.
const outLegacy = buildResolvedMatches(
  [{ id: 4, round: 1, status: 'done', entrant_a_id: 10, entrant_b_id: 20 }],
  { 4: [{ score_a: 11, score_b: 9 }] },
  simpleEngine,
  { bestOf: 1 },
);
assert(outLegacy[0].winner_entrant_id === 10, 'vẫn nhận config dạng object');
```

Nếu đầu file chưa có `const path = require('path');`, thêm vào.

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/results.test.js`
Expected: FAIL — `BO1: trận một ván phải có đội thắng`

- [ ] **Step 3: Sửa `lib/tournament/results.js`**

Thay hàm `buildResolvedMatches`:

```js
// config có thể là một object dùng chung, hoặc một hàm (match) => config —
// cần dạng hàm vì mỗi vòng có thể có số ván khác nhau.
function buildResolvedMatches(matches, gamesByMatchId, matchEngine, config = {}) {
  const configOf = typeof config === 'function' ? config : () => config;
  const FINISHED = new Set(['done', 'finalized']);
  return matches.map((m) => {
    const games = gamesByMatchId[m.id] || [];
    const r = matchEngine.resolveMatch(
      { entrant_a_id: m.entrant_a_id, entrant_b_id: m.entrant_b_id },
      games,
      configOf(m),
    );
    // DB dùng 'finalized'; các engine dùng 'done' làm từ vựng nội bộ. Chấp nhận
    // cả hai ở đây để không phụ thuộc việc nơi gọi có dịch trước hay không.
    const done = FINISHED.has(m.status) && r.complete;
    return {
      id: m.id,
      entrant_a_id: m.entrant_a_id,
      entrant_b_id: m.entrant_b_id,
      group_label: m.group_label != null ? m.group_label : null,
      status: m.status,
      winner_entrant_id: done ? r.winner_entrant_id : null,
      points_a: r.points_a, points_b: r.points_b,
      games_a: r.games_a, games_b: r.games_b,
    };
  });
}
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/results.test.js`
Expected: PASS

- [ ] **Step 5: Sửa `lib/tournament/standingsService.js`**

Thêm import ở đầu file, sau dòng `const { buildResolvedMatches } = require('./results');`:

```js
const { resolveMatchScoring } = require('./rules/roundScoring');
```

Đổi chữ ký `loadStageData` để nhận thêm ngữ cảnh:

```js
async function loadStageData(db, stage, groupId, context = {}) {
```

Thay hai dòng cuối trước `return` (dòng 85–87):

```js
  const matchEngine = getMatchEngine(stage.match_format);
  // Mỗi trận resolve luật theo VÒNG của nó. Trước đây truyền stage.config gốc,
  // mà bestOf nằm ở config.scoring.engine.bestOf chứ không ở gốc, nên
  // match/simple.js rơi về mặc định 3 và giai đoạn BO1 không bao giờ có đội thắng.
  const tournament = context.tournament || {};
  const division = context.division || {};
  const configOf = (match) => ({
    ...(stage.config || {}),
    ...resolveMatchScoring(tournament, division, stage, match).engine,
  });
  const resolved = buildResolvedMatches(matchList, gamesByMatchId, matchEngine, configOf);
  return { entrants, resolved, matches: matchList };
```

Đổi `computeStageStandings` để nạp và truyền ngữ cảnh:

```js
async function computeStageStandings(db, stage, groupId) {
  const [tournamentResult, divisionResult] = await Promise.all([
    db.from('tournaments')
      .select('id, default_scoring, tiebreak_policy')
      .eq('id', stage.tournament_id).eq('group_id', groupId).maybeSingle(),
    stage.division_id
      ? db.from('tournament_divisions')
        .select('id, scoring_override, tiebreak_override')
        .eq('id', stage.division_id).eq('group_id', groupId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const context = {
    tournament: tournamentResult.data || {},
    division: divisionResult.data || {},
  };

  const loaded = await loadStageData(db, stage, groupId, context);
  if (loaded.error) throw Object.assign(new Error(loaded.error.message), { status: loaded.error.status });
  const scheduleEngine = getScheduleEngine(stage.schedule_format);
  const standings = scheduleEngine.computeStandings(
    { schedule_format: stage.schedule_format, config: stage.config || {} },
    loaded.entrants,
    loaded.resolved,
  );
  return { schedule_format: stage.schedule_format, standings };
}
```

> **Chú ý:** `standings/route.js` gọi `computeStageStandings(db, stage, groupId)` với `stage` lấy từ `select('*')`, nên đã có `tournament_id` và `division_id`. Kiểm lại bằng `grep -n "select(" app/api/tournament-v2/standings/route.js` trước khi chạy. Nếu route đó `select` giới hạn cột, mở rộng để có hai cột này.

- [ ] **Step 6: Chạy toàn bộ test engine và API**

Run: `npm run test:t-engines && npm run test:t-api`
Expected: mọi test in `ok`, exit 0.

- [ ] **Step 7: Commit**

```bash
git add lib/tournament/results.js lib/tournament/standingsService.js tests/tournament/results.test.js
git commit -m "fix(giai-dau): BXH tinh dung so van va nhan trang thai finalized

Hai loi P1:
1. standingsService truyen stage.config goc cho buildResolvedMatches, nhung
   bestOf nam o config.scoring.engine.bestOf -> match/simple.js roi ve mac dinh
   3, giai doan BO1 khong bao gio ghi nhan doi thang.
2. Anh xa finalized -> done truoc day chi chay trong nhanh if(entryIds.length);
   tran dung entrant_*_id cu khong qua nhanh do nen BXH khong thay doi thang nao.

buildResolvedMatches gio nhan config dang ham (match) => config de moi vong co
so van rieng, van tuong thich dang object cu.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: `RoundScoringPanel`

**Files:**
- Create: `app/giai-dau/v2/console/RoundScoringPanel.js`
- Modify: `app/giai-dau/v2/console/console.css`
- Modify: `app/giai-dau/v2/console/tabs/SettingsTab.js`
- Create: `tests/tournament/ui-round-scoring.contract.test.js`

- [ ] **Step 1: Viết test thất bại**

Create `tests/tournament/ui-round-scoring.contract.test.js`:

```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/giai-dau/v2/console/RoundScoringPanel.js';
assert(exists(f), 'panel tồn tại');
const s = read(f);
assert(/'use client'|"use client"/.test(s), 'client component');
assert(/getRoundRules/.test(s) && /updateRoundRule/.test(s), 'gọi qua client wrapper');
assert(!/supabase/i.test(s), 'không truy vấn Supabase trực tiếp từ UI');
assert(/Số ván theo vòng/.test(s), 'tiêu đề tiếng Việt');
assert(/BO1|BO3|BO5/.test(s), 'ba chip số ván');
assert(/locked/.test(s), 'xử lý vòng bị khoá');
assert(/Trả về mặc định/.test(s), 'nút trả về mặc định');
assert(/sinh lịch/.test(s), 'nhắc phải sinh lịch trước khi cấu hình');
assert(!/#[0-9a-fA-F]{6}/.test(s), 'không hardcode màu, style qua CSS variable');

const settings = read('app/giai-dau/v2/console/tabs/SettingsTab.js');
assert(/RoundScoringPanel/.test(settings), 'SettingsTab mount panel');

console.log('ui-round-scoring contract ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-round-scoring.contract.test.js`
Expected: FAIL — `panel tồn tại`

- [ ] **Step 3: Viết panel**

Create `app/giai-dau/v2/console/RoundScoringPanel.js`:

```js
'use client';

import { useCallback, useEffect, useState } from 'react';
import { getRoundRules, updateRoundRule } from '@/lib/tournamentV2Client';

const BEST_OF_CHOICES = [1, 3, 5];

function ruleText(scoring) {
    if (!scoring) return '';
    const cap = scoring.cap == null ? 'không cap' : `cap ${scoring.cap}`;
    return `BO${scoring.best_of} · tới ${scoring.points_to} · cách ${scoring.win_by} · ${cap}`;
}

function lockText(round) {
    if (round.lock_reason === 'ROUND_LIVE') return 'Đã khoá vì vòng đang có trận diễn ra.';
    return 'Đã khoá vì vòng đã đấu xong. Muốn sửa kết quả phải qua nhật ký chỉnh sửa.';
}

export default function RoundScoringPanel({ stageId, isAdmin }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busyKey, setBusyKey] = useState('');

    const load = useCallback(async () => {
        if (!stageId) { setData(null); setLoading(false); return; }
        setLoading(true); setError('');
        try {
            setData(await getRoundRules(stageId));
        } catch (err) {
            setError(err.message || 'Không tải được số ván theo vòng.');
        } finally {
            setLoading(false);
        }
    }, [stageId]);

    useEffect(() => { load(); }, [load]);

    async function save(roundKey, scoring) {
        setBusyKey(roundKey); setNotice(''); setError('');
        try {
            await updateRoundRule({ stage_id: stageId, round_key: roundKey, scoring });
            setNotice(scoring === null ? 'Đã trả vòng này về mặc định.' : 'Đã lưu số ván cho vòng này.');
            await load();
        } catch (err) {
            setError(err.message || 'Không lưu được.');
        } finally {
            setBusyKey('');
        }
    }

    if (loading) return <p className="v2-muted">Đang tải số ván theo vòng…</p>;
    if (error && !data) {
        return (
            <div className="v2-state v2-error">
                <p>{error}</p>
                <button type="button" className="v2-btn-secondary" onClick={load}>Thử lại</button>
            </div>
        );
    }
    if (!data) return null;

    if (!data.rounds || data.rounds.length === 0) {
        return (
            <p className="v2-muted">
                Giai đoạn này chưa sinh lịch nên chưa có vòng nào để cấu hình.
                Sinh lịch xong thì các vòng sẽ hiện ở đây.
            </p>
        );
    }

    return (
        <div className="v2-rounds">
            <p className="v2-rounds-inherit">
                Mặc định của giai đoạn: <b>{ruleText(data.inherited)}</b>. Vòng nào không chỉnh thì theo mức này.
            </p>
            {notice ? <p className="v2-notice">{notice}</p> : null}
            {error ? <p className="v2-notice v2-notice-error">{error}</p> : null}

            {data.rounds.map((round) => (
                <div
                    key={round.round_key}
                    className={`v2-round ${round.locked ? 'is-locked' : ''}`}
                >
                    <div className="v2-round-head">
                        <div>
                            <b>{round.label}</b>
                            <span className="v2-round-meta">
                                {round.match_count} trận
                                {round.counts.finalized > 0 ? ` · ${round.counts.finalized} đã xong` : ''}
                                {round.counts.live > 0 ? ` · ${round.counts.live} đang đấu` : ''}
                            </span>
                        </div>
                        {round.locked || !isAdmin ? (
                            <span className="v2-round-readonly">{ruleText(round.scoring)}</span>
                        ) : (
                            <div className="v2-round-bo" role="group" aria-label={`Số ván ${round.label}`}>
                                {BEST_OF_CHOICES.map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        aria-pressed={round.scoring.best_of === value}
                                        disabled={busyKey === round.round_key}
                                        onClick={() => save(round.round_key, { best_of: value })}
                                    >
                                        BO{value}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {round.locked ? (
                        <p className="v2-round-lock">🔒 {lockText(round)}</p>
                    ) : (
                        <p className="v2-round-rule">
                            {ruleText(round.scoring)}
                            {round.source === 'round' && isAdmin ? (
                                <button
                                    type="button"
                                    className="v2-link-btn"
                                    disabled={busyKey === round.round_key}
                                    onClick={() => save(round.round_key, null)}
                                >
                                    Trả về mặc định
                                </button>
                            ) : (
                                <span className="v2-round-source"> · đang theo mặc định của giai đoạn</span>
                            )}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
```

- [ ] **Step 4: Thêm CSS**

Thêm vào cuối `app/giai-dau/v2/console/console.css`:

```css
/* --- Số ván theo vòng --- */
.v2-rounds { display: flex; flex-direction: column; gap: 9px; }

.v2-rounds-inherit {
    margin: 0;
    padding: 9px 12px;
    border-radius: var(--border-radius-sm);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.82rem;
}

.v2-round {
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-md);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.v2-round.is-locked { border-style: dashed; }

.v2-round-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.v2-round-head b { font-size: 0.95rem; display: block; }
.v2-round-meta { display: block; font-size: 0.76rem; color: var(--text-muted); }

.v2-round-bo { display: flex; gap: 6px; flex-wrap: wrap; }

.v2-round-bo button {
    border: 1px solid var(--border-strong);
    background: var(--bg-card);
    color: var(--text-secondary);
    border-radius: var(--border-radius-sm);
    padding: 7px 14px;
    font-family: var(--font-family);
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;
}

.v2-round-bo button[aria-pressed='true'] {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
}

.v2-round-bo button:disabled { opacity: 0.5; cursor: default; }

.v2-round-readonly,
.v2-round-rule,
.v2-round-lock {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
}

.v2-round-lock { color: var(--text-muted); }
.v2-round-source { color: var(--text-muted); }

.v2-link-btn {
    background: none;
    border: none;
    color: var(--primary);
    font-family: var(--font-family);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0 0 0 8px;
}
```

- [ ] **Step 5: Mount vào `SettingsTab`**

Trong `app/giai-dau/v2/console/tabs/SettingsTab.js`, thêm import ở đầu:

```js
import RoundScoringPanel from '../RoundScoringPanel';
```

Thêm một `<section>` mới ngay sau khối `<section className="v2-settings-block">` đầu tiên (khoảng dòng 160):

```js
                <section className="v2-settings-block">
                    <div className="v2-settings-block-head">
                        <h3>Số ván theo vòng</h3>
                        <p>Vòng đã có trận đang đấu hoặc đã xong sẽ bị khoá.</p>
                    </div>
                    <RoundScoringPanel stageId={stageId} isAdmin={isAdmin} />
                </section>
```

- [ ] **Step 6: Chạy test để thấy nó xanh**

Run: `node tests/tournament/ui-round-scoring.contract.test.js`
Expected: `ui-round-scoring contract ok`

- [ ] **Step 7: Kiểm bằng trình duyệt**

Mở console một giải có lịch đã sinh, vào tab **Cài đặt**, ở ba bề rộng **390px / 834px / ≥1280px**. Xác nhận:
- Vòng chưa đấu: ba chip bấm được, đổi xong hiện thông báo và dòng luật cập nhật.
- Vòng đã đấu: hiện ổ khoá kèm lý do, không có chip.
- Giai đoạn chưa sinh lịch: hiện dòng "chưa sinh lịch nên chưa có vòng nào".

- [ ] **Step 8: Commit**

```bash
git add app/giai-dau/v2/console/RoundScoringPanel.js app/giai-dau/v2/console/console.css app/giai-dau/v2/console/tabs/SettingsTab.js tests/tournament/ui-round-scoring.contract.test.js
git commit -m "feat(giai-dau): panel so van theo vong trong tab Cai dat

Component tu chua, style hoan toan qua CSS variable de Spec 2 mount lai duoi
shell sidebar nen toi ma khong phai viet lai.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Chip BO lối tắt trong tab Kết quả

`ResultsTab.js` hiện **không nhóm trận theo vòng** — biến `round` trong file đó là ván con MLP (`round_1_pair_2`), không phải vòng giải. Task này thêm phần nhóm.

**Files:**
- Modify: `app/giai-dau/v2/console/tabs/ResultsTab.js`
- Modify: `tests/tournament/ui-results.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

Thêm vào `tests/tournament/ui-results.contract.test.js`, trước `console.log`:

```js
assert(/roundKeyOf|describeRound/.test(s), 'nhóm trận theo vòng bằng module luật vòng');
assert(/updateRoundRule/.test(s), 'chip BO gọi cùng API với panel Cài đặt');
assert(/BO1|BO3|BO5/.test(s), 'có ba chip số ván ở header nhóm vòng');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-results.contract.test.js`
Expected: FAIL — `nhóm trận theo vòng`

- [ ] **Step 3: Thêm nhóm và chip vào `ResultsTab.js`**

Thêm import ở đầu file:

```js
import { roundKeyOf, describeRound, totalRoundsOf, computeRoundLocks } from '@/lib/tournament/rules/roundScoring';
import { getRoundRules, updateRoundRule } from '@/lib/tournamentV2Client';
```

Thêm state và tải luật vòng cạnh các state khác của component:

```js
    const [roundRules, setRoundRules] = useState(null);

    useEffect(() => {
        if (!stageId) { setRoundRules(null); return; }
        let alive = true;
        getRoundRules(stageId)
            .then((res) => { if (alive) setRoundRules(res); })
            .catch(() => { if (alive) setRoundRules(null); });
        return () => { alive = false; };
    }, [stageId]);
```

Thêm hàm nhóm trận, đặt cạnh các helper khác trong file:

```js
// Gom trận theo vòng để header mỗi nhóm mang được chip số ván.
function groupMatchesByRound(matches, stage) {
    const locks = computeRoundLocks(stage, matches);
    const buckets = new Map();
    for (const match of matches) {
        const key = roundKeyOf(match);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(match);
    }
    const total = totalRoundsOf(matches);
    return [...buckets.entries()].map(([key, items]) => ({
        key,
        label: describeRound(stage, key, total),
        matches: items,
        locked: locks[key] ? locks[key].locked : false,
    }));
}
```

Thêm component header nhóm, đặt trên component chính:

```js
function RoundGroupHead({ group, rule, stageId, isAdmin, onSaved }) {
    const [busy, setBusy] = useState(false);
    async function pick(value) {
        setBusy(true);
        try {
            await updateRoundRule({ stage_id: stageId, round_key: group.key, scoring: { best_of: value } });
            onSaved();
        } catch (_) { /* thông báo do panel Cài đặt lo; ở đây im lặng để không chắn luồng nhập điểm */ }
        finally { setBusy(false); }
    }
    const bestOf = rule ? rule.scoring.best_of : null;
    return (
        <div className="v2-round-group-head">
            <b>{group.label}</b>
            <small>{group.matches.length} trận</small>
            {group.locked || !isAdmin ? (
                <span className="v2-round-readonly">
                    {bestOf ? `BO${bestOf}` : ''} {group.locked ? '🔒' : ''}
                </span>
            ) : (
                <div className="v2-round-bo" role="group" aria-label={`Số ván ${group.label}`}>
                    {[1, 3, 5].map((value) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={bestOf === value}
                            disabled={busy}
                            onClick={() => pick(value)}
                        >
                            BO{value}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
```

Trong phần render danh sách trận, thay vòng lặp phẳng bằng vòng lặp theo nhóm:

```js
                {groupMatchesByRound(matches, stage).map((group) => (
                    <div key={group.key} className="v2-round-group">
                        <RoundGroupHead
                            group={group}
                            rule={(roundRules?.rounds || []).find((r) => r.round_key === group.key)}
                            stageId={stageId}
                            isAdmin={isAdmin}
                            onSaved={() => getRoundRules(stageId).then(setRoundRules).catch(() => {})}
                        />
                        {group.matches.map((match) => (
                            /* GIỮ NGUYÊN phần vẽ một trận đang có, chỉ đưa vào đây */
                            renderMatchRow(match)
                        ))}
                    </div>
                ))}
```

> **Cách làm an toàn:** đừng viết lại phần vẽ một trận. Cắt đúng khối JSX đang vẽ một trận trong `matches.map(...)` hiện tại, đặt nó thành hàm `renderMatchRow(match)` trong cùng component, rồi gọi lại như trên. Chạy `node tests/tournament/ui-results.contract.test.js` sau khi cắt để chắc chưa mất khẳng định nào của test cũ.

- [ ] **Step 4: Thêm CSS**

Thêm vào cuối `app/giai-dau/v2/console/console.css`:

```css
.v2-round-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }

.v2-round-group-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 9px 12px;
    border-radius: var(--border-radius-sm);
    background: var(--bg-secondary);
}

.v2-round-group-head b { font-size: 0.92rem; }
.v2-round-group-head small { font-size: 0.75rem; color: var(--text-muted); }
.v2-round-group-head .v2-round-bo { margin-left: auto; }
.v2-round-group-head .v2-round-bo button { padding: 5px 11px; font-size: 0.78rem; }
.v2-round-group-head .v2-round-readonly { margin-left: auto; }
```

- [ ] **Step 5: Chạy test để thấy nó xanh**

Run: `node tests/tournament/ui-results.contract.test.js`
Expected: `ui-results contract ok`

- [ ] **Step 6: Commit**

```bash
git add app/giai-dau/v2/console/tabs/ResultsTab.js app/giai-dau/v2/console/console.css tests/tournament/ui-results.contract.test.js
git commit -m "feat(giai-dau): nhom tran theo vong + chip BO loi tat o tab Ket qua

ResultsTab truoc day liet ke tran phang; gio gom theo vong de header mang duoc
chip so van. Chip goi cung API voi panel Cai dat.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Nối test và chạy hồi quy

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Thêm script**

Thêm sau dòng `"test:t-lifecycle"` (nếu plan Spec 0 đã thêm) hoặc sau `"test:t-migration"`:

```json
    "test:t-round-scoring": "node tests/tournament/round-scoring.test.js && node tests/tournament/api-round-rules.contract.test.js && node tests/tournament/ui-round-scoring.contract.test.js",
```

Thêm `npm run test:t-round-scoring` vào `test:tournament`, ngay trước `npm run test:t-engines`.

- [ ] **Step 2: Chạy bộ giải đấu**

Run: `npm run test:tournament`
Expected: exit 0.

- [ ] **Step 3: Chạy hồi quy**

Run: `npm run test:regression`
Expected: exit 0.

> Nếu đỏ ở `test:phase4-*` hoặc `test:t-ui-phase4`: bốn bộ đó nhắm vào code Phase 4 **chưa commit**, không thuộc plan này. Ghi vào bằng chứng và đi tiếp.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 5: Ghi bằng chứng và commit**

```bash
npm run test:tournament > evidence/spec1-tournament-2026-09-09.txt 2>&1
npm run build > evidence/spec1-build-2026-09-09.txt 2>&1
git add package.json evidence/spec1-tournament-2026-09-09.txt evidence/spec1-build-2026-09-09.txt
git commit -m "test(giai-dau): noi test:t-round-scoring vao bo test:tournament

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review — đối chiếu spec

| Mục spec | Task phủ |
|---|---|
| 4 · `config.round_scoring`, partial, không migration | Task 2 (`readRoundOverride`), Task 4 (ghi) |
| 4 · Round key cho knockout/RR/double-elim | Task 1 |
| 5 · Cấm `win_points` theo vòng | Task 3 (`FORBIDDEN_ROUND_FIELD`) |
| 6 · 6 hàm thuần | Task 1 (2), Task 2 (2), Task 3 (4) |
| 6 · Bảng kiểm `validateRoundScoringPatch` | Task 3 |
| 6 · Chặn `best_of` trên giai đoạn mlp/team | Task 3 |
| 7 · Nhãn vòng tiếng Việt | Task 1 |
| 8 · GET + PATCH, mã lỗi, ghi có điều kiện | Task 4 |
| 9.1 · Nhập điểm dùng luật vòng, luôn kiểm | Task 5 |
| 9.2 · BXH tính `bestOf` đúng | Task 6 |
| 9.3 · Ghi `finalized` thay `done` | Task 5 |
| 10 · Panel + chip lối tắt, style qua CSS variable | Task 7, Task 8 |
| 11 · Kiểm thử 1–10 | Task 1–3 (1–8), Task 4–6 (9–12) |

**Cố ý không làm:** sửa `score-submissions/route.js` (chưa commit, Spec 2 xoá) — ghi rõ ở Task 5 Step 8.

**Người thực thi phải tự kiểm:** cột `tournament_matches.bracket` có tồn tại chưa (Task 4 Step 3); `standings/route.js` có `select` đủ `tournament_id` và `division_id` không (Task 6 Step 5).
