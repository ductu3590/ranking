# Tournament Module — Plan 2: API Layer (tournament-v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Build on branch `feat/tournament-v2-foundation` (Plan 1 already merged into this branch).

**Goal:** Lớp API server cho module giải đấu: CRUD giải/stage/entrant, sinh lịch (nối engine + map slot→id), nhập tỉ số (nối match engine + đẩy winner lên bracket), BXH tính tại chỗ, chuyển stage (mix), trang công khai.

**Architecture:** Route flat `app/api/tournament-v2/*` (query/body param, KHÔNG `[id]` folder) theo convention `pickhub-engineering` (admin guard + group-scope). Logic DB-mapping khó (slot→id, parent link, winner propagation, gom resolved-match cho standings) tách ra helper THUẦN trong `lib/tournament/` để test thật bằng node. Engine từ Plan 1 (`lib/tournament/engines`, `lib/tournament/orchestrator`) — xem `_workspace/02_engine_api.md`.

**Tech Stack:** Next.js 14 route handlers, Supabase (`supabaseAdmin||supabaseServer`), CommonJS engine. Test = node (pure helper test thật + route contract test theo pattern dự án).

---

## File Structure

Pure helpers (test thật, không DB):
- `lib/tournament/persistence.js` — `scheduleToInsertRows`, `resolveParentLinks`.
- `lib/tournament/results.js` — `advanceWinner`, `buildResolvedMatches`.

API routes (admin guard cho ghi, group-scope toàn bộ):
- `app/api/tournament-v2/tournaments/route.js` — GET list / POST / PATCH / DELETE.
- `app/api/tournament-v2/stages/route.js` — GET ?tournamentId / POST / PATCH / DELETE ?id.
- `app/api/tournament-v2/entrants/route.js` — GET ?tournamentId / POST / PATCH / DELETE ?id (kèm members).
- `app/api/tournament-v2/generate/route.js` — POST {stageId}.
- `app/api/tournament-v2/games/route.js` — PUT {matchId, games}.
- `app/api/tournament-v2/standings/route.js` — GET ?stageId.
- `app/api/tournament-v2/advance/route.js` — POST {stageId}.
- `app/api/tournament-v2/public/route.js` — GET ?slug.

Tests: `tests/tournament/persistence.test.js`, `results.test.js`, `api-*.contract.test.js`.

**Convention bắt buộc (pickhub-engineering):** ghi → `requireGroupAdmin()` đầu handler, trả `adminCheck.response` nếu !ok; đọc công khai → `getEffectiveGroupContext()`; mọi query `.eq('group_id', groupId)` + đúng `tournament_id`/`stage_id`/`match_id`; KHÔNG hardcode id; `const db = supabaseAdmin || supabaseServer`; allowlist field; try/catch → `NextResponse.json({error}, {status})` + `console.error`; thuật toán gọi từ `lib/...`.

**Quy ước dữ liệu engine (từ `_workspace/02_engine_api.md`):** entrant cho engine = `{id, seed}`; match round_robin có `group_label`; knockout có `slot/parent_slot/bracket_slot`; `resolveMatch -> {winner_entrant_id, games_a, games_b, points_a, points_b, complete}`; standings round_robin 13 trường vs knockout 4 trường (đọc theo `schedule_format`); `seedNextStage` trả object có sẵn `id/seed` + `entrant_id/seed_in_stage`.

---

## Task 1: Pure helper `persistence.js` (slot→id, parent link)

**Files:** Create `lib/tournament/persistence.js`, Test `tests/tournament/persistence.test.js`.

- [ ] **Step 1: Test (write first, FAIL)**

```js
// tests/tournament/persistence.test.js
const { scheduleToInsertRows, resolveParentLinks } = require('../../lib/tournament/persistence');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

// scheduleToInsertRows: map match engine -> hàng insert (không id)
const sched = [
  { round: 1, group_label: 'A', bracket_slot: null, parent_slot: null, slot: null, entrant_a_id: 1, entrant_b_id: 2, order: 0 },
];
const rows = scheduleToInsertRows(sched, { stageId: 9, groupId: 7 });
assert(rows[0].group_id === 7 && rows[0].stage_id === 9, 'gắn group_id + stage_id');
assert(rows[0].round === 1 && rows[0].entrant_a_id === 1 && rows[0].match_order === 0, 'map đúng trường');
assert(rows[0].status === 'pending', 'mặc định pending');
assert(!('slot' in rows[0]) && !('parent_slot' in rows[0]), 'không đẩy field engine-local vào DB');

// resolveParentLinks: knockout bracket 4. slots: r1 slot0(bs0)->parent slot2, r1 slot1(bs1)->parent slot2, r2 slot2(bs0) final
const ko = [
  { slot: 0, parent_slot: 2, round: 1, bracket_slot: 0 },
  { slot: 1, parent_slot: 2, round: 1, bracket_slot: 1 },
  { slot: 2, parent_slot: null, round: 2, bracket_slot: 0 },
];
const dbRows = [
  { id: 100, round: 1, bracket_slot: 0 },
  { id: 101, round: 1, bracket_slot: 1 },
  { id: 102, round: 2, bracket_slot: 0 },
];
const links = resolveParentLinks(ko, dbRows);
assert(links.length === 2, '2 trận có parent');
assert(links.find((l) => l.id === 100).parent_match_id === 102, 'slot0 -> final id 102');
assert(links.find((l) => l.id === 101).parent_match_id === 102, 'slot1 -> final id 102');
console.log('persistence ok');
```

- [ ] **Step 2: Run → FAIL** (`node tests/tournament/persistence.test.js`).

- [ ] **Step 3: Implement**

```js
// lib/tournament/persistence.js
// Helper thuần nối output engine với bảng DB. Không I/O.

// Map match do generateSchedule phát ra -> hàng sẵn sàng insert vào tournament_matches.
// Bỏ các field engine-local (slot, parent_slot); parent set sau qua resolveParentLinks.
function scheduleToInsertRows(scheduleMatches, { stageId, groupId }) {
  return scheduleMatches.map((m) => ({
    group_id: groupId,
    stage_id: stageId,
    round: m.round,
    bracket_slot: m.bracket_slot != null ? m.bracket_slot : null,
    group_label: m.group_label != null ? m.group_label : null,
    match_order: m.order != null ? m.order : null,
    entrant_a_id: m.entrant_a_id != null ? m.entrant_a_id : null,
    entrant_b_id: m.entrant_b_id != null ? m.entrant_b_id : null,
    status: 'pending',
  }));
}

// Sau khi insert, ánh xạ parent_slot (engine-local) -> parent_match_id (DB).
// scheduleMatches: [{slot, parent_slot, round, bracket_slot}]; dbRows: [{id, round, bracket_slot}].
// Khóa định danh trong stage = (round, bracket_slot) — chỉ knockout có parent.
function resolveParentLinks(scheduleMatches, dbRows) {
  const keyOf = (r) => `${r.round}:${r.bracket_slot}`;
  const dbByKey = new Map(dbRows.map((r) => [keyOf(r), r.id]));
  const schedBySlot = new Map(scheduleMatches.map((m) => [m.slot, m]));
  const updates = [];
  for (const m of scheduleMatches) {
    if (m.parent_slot == null) continue;
    const parent = schedBySlot.get(m.parent_slot);
    if (!parent) continue;
    const childId = dbByKey.get(keyOf(m));
    const parentId = dbByKey.get(keyOf(parent));
    if (childId != null && parentId != null) updates.push({ id: childId, parent_match_id: parentId });
  }
  return updates;
}

module.exports = { scheduleToInsertRows, resolveParentLinks };
```

- [ ] **Step 4: Run → PASS** (`persistence ok`).
- [ ] **Step 5: Commit** `git add lib/tournament/persistence.js tests/tournament/persistence.test.js && git commit -m "feat(tournament): persistence helpers (schedule->rows, parent links)"`

---

## Task 2: Pure helper `results.js` (winner propagation, resolved matches)

**Files:** Create `lib/tournament/results.js`, Test `tests/tournament/results.test.js`.

- [ ] **Step 1: Test (write first, FAIL)**

```js
// tests/tournament/results.test.js
const { advanceWinner, buildResolvedMatches } = require('../../lib/tournament/results');
const simple = require('../../lib/tournament/match/simple');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

// advanceWinner: child bracket_slot chẵn -> entrant_a của parent; lẻ -> entrant_b
let a = advanceWinner({ winner_entrant_id: 5, parent_match_id: 102, bracket_slot: 0 });
assert(a && a.parent_match_id === 102 && a.field === 'entrant_a_id' && a.entrant_id === 5, 'bs chẵn -> entrant_a');
let b = advanceWinner({ winner_entrant_id: 6, parent_match_id: 102, bracket_slot: 1 });
assert(b.field === 'entrant_b_id', 'bs lẻ -> entrant_b');
assert(advanceWinner({ winner_entrant_id: null, parent_match_id: 102, bracket_slot: 0 }) === null, 'chưa có winner -> null');
assert(advanceWinner({ winner_entrant_id: 5, parent_match_id: null, bracket_slot: 0 }) === null, 'không parent -> null');

// buildResolvedMatches: gom match + games -> shape computeStandings cần
const matches = [
  { id: 1, entrant_a_id: 10, entrant_b_id: 20, status: 'done', group_label: 'A' },
  { id: 2, entrant_a_id: 10, entrant_b_id: 30, status: 'pending', group_label: 'A' },
];
const gamesByMatch = {
  1: [{ score_a: 11, score_b: 9 }, { score_a: 11, score_b: 7 }],
  2: [],
};
const resolved = buildResolvedMatches(matches, gamesByMatch, simple, { bestOf: 3 });
const r1 = resolved.find((m) => m.id === 1);
assert(r1.winner_entrant_id === 10 && r1.points_a === 22 && r1.games_a === 2 && r1.status === 'done', 'gom resolved cho trận done');
const r2 = resolved.find((m) => m.id === 2);
assert(r2.status === 'pending' && r2.winner_entrant_id == null, 'trận chưa done giữ nguyên, không winner');
console.log('results ok');
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```js
// lib/tournament/results.js
// Helper thuần cho nhập kết quả & gom dữ liệu BXH. Không I/O.

// Khi 1 trận knockout done: người thắng đi vào khe nào của trận cha?
// bracket_slot chẵn -> entrant_a của cha; lẻ -> entrant_b. Trả null nếu chưa đủ điều kiện.
function advanceWinner(match) {
  if (!match || !match.parent_match_id || !match.winner_entrant_id) return null;
  const field = match.bracket_slot % 2 === 0 ? 'entrant_a_id' : 'entrant_b_id';
  return { parent_match_id: match.parent_match_id, field, entrant_id: match.winner_entrant_id };
}

// Gom match + games của nó -> shape mà computeStandings tiêu thụ.
// matchEngine.resolveMatch(match, games, config) cho mỗi trận; trận chưa done giữ status gốc, không gán winner.
function buildResolvedMatches(matches, gamesByMatchId, matchEngine, config = {}) {
  return matches.map((m) => {
    const games = gamesByMatchId[m.id] || [];
    const r = matchEngine.resolveMatch(
      { entrant_a_id: m.entrant_a_id, entrant_b_id: m.entrant_b_id },
      games,
      config,
    );
    const done = m.status === 'done' && r.complete;
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

module.exports = { advanceWinner, buildResolvedMatches };
```

- [ ] **Step 4: Run → PASS** (`results ok`).
- [ ] **Step 5: Commit** `git add lib/tournament/results.js tests/tournament/results.test.js && git commit -m "feat(tournament): result helpers (winner advance, resolved matches)"`

---

## Task 3: Route `tournaments` (CRUD)

**Files:** Create `app/api/tournament-v2/tournaments/route.js`, Test `tests/tournament/api-tournaments.contract.test.js`.

Mirror `app/api/tournaments/route.js` (đọc nó làm khuôn). Khác biệt: bảng `tournaments` mới có `entrant_type`, `public_slug`, `settings`; DELETE dựa FK CASCADE (chỉ xóa hàng tournaments theo group, con tự cascade).

- [ ] **Step 1: Contract test (write first, FAIL)**

```js
// tests/tournament/api-tournaments.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/tournaments/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('requireGroupAdmin'), 'có admin guard');
assert(/export async function POST/.test(s) && /export async function PATCH/.test(s) && /export async function DELETE/.test(s) && /export async function GET/.test(s), 'đủ 4 method');
assert(s.includes("'tournament_v2' === undefined") === false, 'sanity'); // no-op
assert(s.includes('entrant_type') && s.includes('public_slug'), 'hỗ trợ entrant_type + public_slug');
assert(s.includes(".eq('group_id'"), 'scope group_id');
assert(!/\.eq\('id',\s*1\)/.test(s) && !s.includes('tournament_id = 1'), 'không hardcode id');
assert(s.includes('tournaments'), 'thao tác bảng tournaments');
console.log('api-tournaments contract ok');
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `app/api/tournament-v2/tournaments/route.js`

Theo khuôn `app/api/tournaments/route.js`:
- `const db = supabaseAdmin || supabaseServer;`
- `ALLOWED = ['name','description','event_date','status','location','entrant_type','public_slug','settings']`.
- `buildPayload(body, groupId)`: ép kiểu name/description/location (trim→null), `entrant_type` mặc định 'pair', `settings` default `{}`; set `group_id` (chỉ POST), `updated_at`.
- `GET`: `getEffectiveGroupContext()` → list `tournaments` `.eq('group_id', groupId).order('event_date', {ascending:false})`; trả `{tournaments}`.
- `POST`: `requireGroupAdmin()`; require name; `status` default 'draft'; `entrant_type` default 'pair'; tự sinh `public_slug` nếu trống (slug từ name + hậu tố ngẫu nhiên, ví dụ `slugify(name)-<rand4>`); insert `.select().single()`; trả `{success, tournament}`.
- `PATCH`: admin; require `body.id`; update payload (xóa group_id) `.eq('id', id).eq('group_id', groupId)`; trả tournament.
- `DELETE`: admin; `id` từ searchParams; xóa `tournaments` `.eq('id', id).eq('group_id', groupId)` (FK CASCADE tự dọn stages/entrants/matches/games). Trả `{success}`.
- Tất cả try/catch → `NextResponse.json({error}, {status})` + `console.error`.

Slug helper (đặt trong file hoặc `lib/tournament/slug.js`): bỏ dấu tiếng Việt, lowercase, thay non-alphanumeric bằng `-`, cắt gọn, nối `-` + 4 ký tự base36 ngẫu nhiên.

- [ ] **Step 4: Run → PASS** (`api-tournaments contract ok`).
- [ ] **Step 5: Commit** `git add app/api/tournament-v2/tournaments/route.js tests/tournament/api-tournaments.contract.test.js && git commit -m "feat(tournament): tournaments CRUD API (v2)"`

---

## Task 4: Route `stages` (CRUD)

**Files:** Create `app/api/tournament-v2/stages/route.js`, Test `tests/tournament/api-stages.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/api-stages.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/stages/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('requireGroupAdmin'), 'admin guard cho ghi');
assert(s.includes("'round_robin'") && s.includes("'knockout'") && s.includes("'simple'") && s.includes("'mlp'"), 'validate enum 2 trục');
assert(s.includes('tournament_stages') && s.includes(".eq('group_id'") && s.includes("tournament_id"), 'bảng + scope');
assert(/export async function GET/.test(s) && /export async function POST/.test(s) && /export async function PATCH/.test(s) && /export async function DELETE/.test(s), '4 method');
console.log('api-stages contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `app/api/tournament-v2/stages/route.js`
- `ALLOWED = ['tournament_id','stage_order','name','schedule_format','match_format','status','config']`.
- Validate `schedule_format ∈ {round_robin,knockout}`, `match_format ∈ {simple,mlp}`, `status ∈ {pending,active,completed}` → 400 nếu sai.
- GET ?tournamentId (admin hoặc public context) → list stages `.eq('group_id',groupId).eq('tournament_id',tid).order('stage_order')`.
- POST/PATCH/DELETE admin, scope group_id; POST require tournament_id + name + schedule_format; default match_format 'simple', stage_order = (max hiện có +1) hoặc body; config default `{}`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): stages CRUD API (v2)"`

---

## Task 5: Route `entrants` (+ members) CRUD

**Files:** Create `app/api/tournament-v2/entrants/route.js`, Test `tests/tournament/api-entrants.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/api-entrants.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/entrants/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('requireGroupAdmin'), 'admin guard');
assert(s.includes('tournament_entrants') && s.includes('tournament_entrant_members'), 'thao tác cả entrant + members');
assert(s.includes(".eq('group_id'") && s.includes('tournament_id'), 'scope');
assert(s.includes('member_id') && s.includes('display_name') && s.includes('gender'), 'member có member_id/tên/giới tính');
console.log('api-entrants contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `app/api/tournament-v2/entrants/route.js`
- GET ?tournamentId → entrants kèm members (2 query: entrants, rồi members theo entrant_id IN; gộp ở server) `.eq('group_id', groupId)`.
- POST admin: body `{tournament_id, name, seed, color, members:[{member_id|null, display_name, gender}]}`. Insert entrant `.select().single()`, rồi insert members (gắn group_id + entrant_id). Trả entrant + members.
- PATCH admin: cập nhật entrant theo id; nếu body có `members`, thay toàn bộ members (delete theo entrant_id rồi insert lại) trong cùng group.
- DELETE admin: xóa entrant `.eq('id',id).eq('group_id',groupId)` (FK CASCADE dọn members + stage_entrants).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): entrants + members CRUD API (v2)"`

---

## Task 6: Route `generate` (sinh lịch)

**Files:** Create `app/api/tournament-v2/generate/route.js`, Test `tests/tournament/api-generate.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/api-generate.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/generate/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('requireGroupAdmin'), 'admin guard');
assert(s.includes('getScheduleEngine') && s.includes('generateSchedule'), 'gọi schedule engine');
assert(s.includes('scheduleToInsertRows') && s.includes('resolveParentLinks'), 'dùng persistence helper');
assert(s.includes('parent_match_id'), 'set parent_match_id sau insert');
assert(s.includes('tournament_matches') && s.includes(".eq('group_id'") && s.includes('stage_id'), 'bảng + scope');
console.log('api-generate contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `app/api/tournament-v2/generate/route.js`
POST body `{stageId, seed?}`. Logic:
1. `requireGroupAdmin()`.
2. Load stage `.eq('id',stageId).eq('group_id',groupId).single()` → 404 nếu không có.
3. Lấy entrants cho stage: nếu có hàng `tournament_stage_entrants` cho stage → dùng (map `{id: entrant_id, seed: seed_in_stage, group_label}`); nếu chưa có (stage đầu) → lấy `tournament_entrants` của tournament (map `{id, seed}`), và tùy chọn ghi `tournament_stage_entrants`.
4. Xóa match cũ của stage (`.eq('stage_id',stageId).eq('group_id',groupId)`) để sinh lại (idempotent; games cascade theo match).
5. `engine = getScheduleEngine(stage.schedule_format)` (try/catch → 400 nếu format lạ); `sched = engine.generateSchedule({schedule_format, config: stage.config}, entrants, seed||1)`.
6. `rows = scheduleToInsertRows(sched, {stageId, groupId})`; insert `.select('id, round, bracket_slot')`.
7. `links = resolveParentLinks(sched, insertedRows)`; với mỗi link update `tournament_matches` set `parent_match_id` `.eq('id', link.id).eq('group_id', groupId)`.
8. Set stage `status='active'`. Trả `{success, matchCount}`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): generate schedule API (engine + slot mapping)"`

---

## Task 7: Route `games` (nhập tỉ số + đẩy winner)

**Files:** Create `app/api/tournament-v2/games/route.js`, Test `tests/tournament/api-games.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/api-games.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/games/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('requireGroupAdmin'), 'admin guard');
assert(s.includes('getMatchEngine') && s.includes('resolveMatch'), 'gọi match engine');
assert(s.includes('advanceWinner'), 'đẩy winner lên bracket cha');
assert(s.includes('tournament_games') && s.includes('tournament_matches'), 'thao tác games + matches');
assert(s.includes('winner_entrant_id') && s.includes("'done'"), 'set winner + status done');
console.log('api-games contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `app/api/tournament-v2/games/route.js`
PUT body `{matchId, games:[{game_no, kind, score_a, score_b, lineup?}]}`. Logic:
1. `requireGroupAdmin()`.
2. Load match `.eq('id',matchId).eq('group_id',groupId).single()` + stage của nó (lấy `match_format`, `config`) → 404 nếu thiếu.
3. Thay games: delete `tournament_games` `.eq('match_id',matchId).eq('group_id',groupId)` rồi insert games mới (gắn group_id, match_id; default kind 'game').
4. `engine = getMatchEngine(stage.match_format)`; `r = engine.resolveMatch({entrant_a_id, entrant_b_id}, games, stage.config)`.
5. Nếu `r.complete`: update match `winner_entrant_id=r.winner_entrant_id, status='done'`; rồi `adv = advanceWinner({winner_entrant_id, parent_match_id: match.parent_match_id, bracket_slot: match.bracket_slot})`; nếu adv → update trận cha `.eq('id', adv.parent_match_id).eq('group_id',groupId)` set `[adv.field]=adv.entrant_id`. Nếu chưa complete: update match `status='live', winner_entrant_id=null`.
6. Trả `{success, complete: r.complete, winner_entrant_id}`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): games entry API (match engine + bracket advance)"`

---

## Task 8: Route `standings` (BXH tính tại chỗ)

**Files:** Create `app/api/tournament-v2/standings/route.js`, Test `tests/tournament/api-standings.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/api-standings.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/standings/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('getScheduleEngine') && s.includes('computeStandings'), 'gọi computeStandings');
assert(s.includes('buildResolvedMatches') && s.includes('getMatchEngine'), 'gom resolved matches từ games');
assert(s.includes('tournament_games') && s.includes(".eq('group_id'") && s.includes('stage_id'), 'đọc games + scope');
console.log('api-standings contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `app/api/tournament-v2/standings/route.js`
GET ?stageId (đọc công khai bằng `getEffectiveGroupContext`). Logic:
1. Load stage (group-scoped) → 404.
2. Load entrants của stage từ `tournament_stage_entrants` (join entrants để có seed) → map `{id: entrant_id, seed: seed_in_stage || seed}`; nếu stage đầu chưa có stage_entrants → dùng `tournament_entrants`.
3. Load matches của stage + games của các match (1 query games theo `match_id IN`); gom `gamesByMatchId`.
4. `matchEngine = getMatchEngine(stage.match_format)`; `resolved = buildResolvedMatches(matches, gamesByMatchId, matchEngine, stage.config)`.
5. `scheduleEngine = getScheduleEngine(stage.schedule_format)`; `standings = scheduleEngine.computeStandings({schedule_format, config: stage.config}, entrants, resolved)`.
6. Trả `{schedule_format: stage.schedule_format, standings}` (UI nhánh theo format).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): standings API (compute on read)"`

---

## Task 9: Route `advance` (chuyển stage / mix)

**Files:** Create `app/api/tournament-v2/advance/route.js`, Test `tests/tournament/api-advance.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/api-advance.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/advance/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('requireGroupAdmin'), 'admin guard');
assert(s.includes('isStageComplete') && s.includes('seedNextStage'), 'dùng orchestrator');
assert(s.includes('tournament_stage_entrants') && s.includes('seed_in_stage'), 'ghi stage_entrants kế');
assert(s.includes('computeStandings'), 'tính standings trước khi advance');
console.log('api-advance contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `app/api/tournament-v2/advance/route.js`
POST body `{stageId}`. Logic:
1. `requireGroupAdmin()`. Load stage (group-scoped).
2. Load matches của stage → `if (!isStageComplete(matches)) return 400 "Stage chưa hoàn tất"`.
3. Tính standings như Task 8 (resolved matches + computeStandings).
4. `seeded = seedNextStage({schedule_format, config: stage.config}, standings)`.
5. Tìm stage kế: `tournament_stages` cùng tournament, `stage_order = stage.stage_order + 1` → 404 nếu không có (đây là stage cuối → trả `{success, final: true, champion: seeded}`).
6. Xóa `tournament_stage_entrants` cũ của stage kế (group-scoped) rồi insert từ `seeded`: `{group_id, stage_id: nextStage.id, entrant_id: s.entrant_id, seed_in_stage: s.seed_in_stage}`.
7. Set stage hiện tại `status='completed'`, stage kế `status='pending'`. Trả `{success, nextStageId, advanced: seeded.length}`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): advance stage API (mix seeding persist)"`

---

## Task 10: Route `public` (xem công khai)

**Files:** Create `app/api/tournament-v2/public/route.js`, Test `tests/tournament/api-public.contract.test.js`.

- [ ] **Step 1: Contract test (FAIL first)**

```js
// tests/tournament/api-public.contract.test.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/public/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('getEffectiveGroupContext'), 'đọc theo group context (không cần admin)');
assert(!s.includes('requireGroupAdmin'), 'public không chặn admin');
assert(s.includes('public_slug') && s.includes(".eq('group_id'"), 'tra theo slug + scope group');
assert(s.includes('tournament_stages') && s.includes('tournament_matches'), 'trả stage + match');
console.log('api-public contract ok');
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `app/api/tournament-v2/public/route.js`
GET ?slug. `getEffectiveGroupContext()` → groupId. Load tournament `.eq('group_id',groupId).eq('public_slug',slug).single()` → 404. Trả gói readonly: `{tournament, stages, entrants, matches}` (group-scoped theo tournament). (Realtime do UI subscribe trực tiếp Supabase; route này chỉ snapshot ban đầu.) Ghi chú giới hạn: chia sẻ link xuyên CLB chưa hỗ trợ (slug giải theo group context người xem) — để phase sau.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `git commit -m "feat(tournament): public view API"`

---

## Task 11: Đăng ký test + QA tích hợp

**Files:** Modify `package.json`, Create/Run QA.

- [ ] **Step 1:** Thêm script `package.json`:
`"test:t-api": "node tests/tournament/persistence.test.js && node tests/tournament/results.test.js && node tests/tournament/api-tournaments.contract.test.js && node tests/tournament/api-stages.contract.test.js && node tests/tournament/api-entrants.contract.test.js && node tests/tournament/api-generate.contract.test.js && node tests/tournament/api-games.contract.test.js && node tests/tournament/api-standings.contract.test.js && node tests/tournament/api-advance.contract.test.js && node tests/tournament/api-public.contract.test.js"`
- [ ] **Step 2:** Chạy `npm run test:t-engines && npm run test:t-api && npm run test:t-migration` → tất cả xanh.
- [ ] **Step 3:** QA so khớp biên (tournament-qa): đọc `_workspace/02_engine_api.md` + 2 helper + các route, xác nhận: (a) entrant truyền vào engine đúng `{id, seed}`; (b) generate map slot→id + parent đúng; (c) games gọi resolveMatch với `match_format`/`config` của stage, đẩy winner đúng khe cha; (d) standings gom resolved trước computeStandings, nhánh theo format; (e) advance ghi `entrant_id`/`seed_in_stage`; (f) mọi route ghi có admin guard, mọi query scope group_id, không hardcode id. Ghi `_workspace/03_api_contract.md` (endpoint + request/response shape) cho ui-dev.
- [ ] **Step 4: Commit** `git add package.json _workspace/03_api_contract.md && git commit -m "chore(tournament): API test aggregate + contract summary"`

---

## Self-Review

- **Spec coverage (§5):** tournaments/stages/entrants CRUD (Task 3–5), generate (6), games (7), standings (8), advance (9), public (10). Realtime = UI (Plan 3). ✅
- **Type consistency:** entrant cho engine `{id, seed}`; `scheduleToInsertRows`/`resolveParentLinks` (Task 1) dùng ở generate (Task 6); `advanceWinner`/`buildResolvedMatches` (Task 2) dùng ở games (7)/standings (8)/advance (9); shape khớp `_workspace/02_engine_api.md`. ✅
- **Placeholder:** helper thuần có code đầy đủ + test; route có spec chi tiết + contract test khóa hành vi (admin guard, scope, gọi engine/helper). Route boilerplate theo khuôn `app/api/tournaments/route.js`.
- **Ranh giới đã xử lý:** computeStandings nhận resolved (không NaN) vì buildResolvedMatches gọi resolveMatch; slot→id map ở generate; winner propagation ở games.

## Ngoài phạm vi (Plan 3)
UI wizard/console/public, realtime subscribe, QR. Lịch theo sân/giờ nâng cao, tự động bốc thăm — phase sau.
