# Tournament Directory & Lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang `/giai-dau/v2` nhóm giải theo Sắp / Đang / Đã, và mọi thay đổi trạng thái giải đi qua một máy trạng thái có kiểm — vá luôn lỗi 500 khi admin chọn "Đang diễn ra".

**Architecture:** Một module thuần `lib/tournament/lifecycle.js` giữ toàn bộ tri thức về 7 trạng thái và các cạnh chuyển; API `tournaments/route.js` gọi nó để kiểm trước khi ghi; trang danh sách gọi cùng module để nhóm và sắp xếp. Thêm một bảng nhật ký dùng chung cho Spec 0/2/3.

**Tech Stack:** Next.js 14 App Router (JavaScript thuần), Supabase JS, node test thuần (`node tests/...`), migration SQL idempotent.

**Spec:** [`docs/superpowers/specs/2026-09-09-tournament-directory-lifecycle-design.md`](../specs/2026-09-09-tournament-directory-lifecycle-design.md)

---

## Đọc trước khi bắt đầu

- Skill `pickhub-engineering` — quy ước group-scoping, admin guard, client Supabase nào dùng ở đâu.
- `app/api/tournament-v2/tournaments/route.js` — route sẽ sửa. Chú ý `ALLOWED_TOURNAMENT_FIELDS` dòng 11–22 và `buildTournamentPayload` dòng 28.
- `app/giai-dau/v2/page.js` — trang sẽ sửa. `isAdmin` lấy từ `fetch('/api/groups/session')`, **không** từ `localStorage` (test `ui-list.contract.test.js` đóng đinh điều này).

## Sự thật đã kiểm chứng trên DB (2026-09-09, project `uhhlelemewilgsdijwja`)

| Điều | Giá trị |
|---|---|
| `tournaments_status_phase3_ck` | `draft, registration_open, registration_closed, scheduled, live, completed, archived` |
| Dữ liệu hiện có | 4 giải, **tất cả ở `draft`** — không có bản ghi hỏng cần vá |
| `tournament_registrations.status` | `draft, submitted, approved, changes_requested, rejected, withdrawn, awaiting_partner, merged` — **không có `checked_in`** |
| `tournament_registrations` | có `group_id`, `division_id`, `status` — **không có `tournament_id`**, phải join qua `tournament_divisions` |
| `tournament_matches` | có `stage_id`, `division_id` — **không có `tournament_id`**, phải join qua `tournament_stages` |

> Spec mục 3 viết guard là "`approved`/`checked_in`". `checked_in` không tồn tại ở bảng này — plan dùng **`approved`** thôi. Task 1 sửa lại spec cho khớp.

## File Structure

| File | Trách nhiệm |
|---|---|
| `lib/tournament/lifecycle.js` (mới) | Thuần. 7 trạng thái, bảng cạnh, `canTransition`, `groupOf`, `sortForGroup`, `canDelete`. Không I/O. |
| `lib/tournament/operationLog.js` (mới) | Thuần + một hàm ghi. Dựng payload dòng nhật ký; hàm ghi nhận `db` từ ngoài để test được. |
| `database/migrations/045_tournament_operation_logs.sql` (mới) | Tạo bảng nhật ký. Idempotent. |
| `app/api/tournament-v2/tournaments/route.js` (sửa) | GET làm giàu, POST ép `draft`, PATCH kiểm cạnh, DELETE kiểm điều kiện. |
| `app/giai-dau/v2/page.js` (sửa) | Nhóm Sắp/Đang/Đã, ô tìm, thẻ giải giàu thông tin hơn. |
| `app/giai-dau/v2/v2.css` (sửa) | Lớp cho nhóm và thẻ mới. |
| `tests/tournament/lifecycle.test.js` (mới) | Test thuần cho `lifecycle.js` + `operationLog.js`. |
| `tests/tournament/migration-045.test.js` (mới) | Kiểm nội dung file migration. |
| `tests/tournament/api-tournaments.contract.test.js` (sửa) | Thêm khẳng định cho 4 handler. |
| `tests/tournament/ui-list.contract.test.js` (sửa) | Thêm khẳng định cho nhóm và ô tìm. |
| `package.json` (sửa) | Thêm `test:t-lifecycle` vào `test:tournament`. |

---

## Task 1: Module thuần `lifecycle.js`

**Files:**
- Create: `lib/tournament/lifecycle.js`
- Test: `tests/tournament/lifecycle.test.js`
- Modify: `docs/superpowers/specs/2026-09-09-tournament-directory-lifecycle-design.md`

- [ ] **Step 1: Sửa spec cho khớp DB**

Trong file spec, thay mọi chỗ ghi `` `approved`/`checked_in` `` thành `` `approved` ``. Có 2 chỗ: bảng cạnh (dòng cạnh 9 và cạnh 11). Thêm ngay dưới bảng cạnh một dòng:

```markdown
> `tournament_registrations.status` không có giá trị `checked_in` (CHECK cho: `draft, submitted, approved, changes_requested, rejected, withdrawn, awaiting_partner, merged`). Guard chỉ đếm `approved`.
```

- [ ] **Step 2: Viết test thất bại**

Create `tests/tournament/lifecycle.test.js`:

```js
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const {
  TOURNAMENT_STATUSES,
  STATUS_TRANSITIONS,
  canTransition,
  groupOf,
  sortForGroup,
  canDelete,
} = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'lifecycle'));

// 1. Bảy trạng thái, khớp đúng tournaments_status_phase3_ck trên DB thật.
assert(
  JSON.stringify(TOURNAMENT_STATUSES) === JSON.stringify([
    'draft', 'registration_open', 'registration_closed',
    'scheduled', 'live', 'completed', 'archived',
  ]),
  'TOURNAMENT_STATUSES đúng 7 giá trị theo đúng thứ tự vòng đời'
);
assert(!TOURNAMENT_STATUSES.includes('active'), "'active' không phải trạng thái hợp lệ");

// 2. Cạnh hợp lệ.
const OK = [
  ['draft', 'registration_open'], ['draft', 'scheduled'],
  ['registration_open', 'registration_closed'], ['registration_closed', 'scheduled'],
  ['scheduled', 'live'], ['live', 'completed'], ['completed', 'archived'],
  ['registration_closed', 'registration_open'], ['scheduled', 'draft'],
  ['live', 'scheduled'], ['registration_open', 'draft'],
];
for (const [from, to] of OK) {
  assert(canTransition(from, to).ok === true, `cạnh hợp lệ ${from} -> ${to}`);
}

// 3. Cạnh không hợp lệ.
const BAD = [
  ['draft', 'live'], ['draft', 'completed'], ['completed', 'live'],
  ['archived', 'completed'], ['archived', 'draft'], ['live', 'draft'],
  ['registration_open', 'live'],
];
for (const [from, to] of BAD) {
  const r = canTransition(from, to);
  assert(r.ok === false, `cạnh cấm ${from} -> ${to}`);
  assert(r.code === 'INVALID_STATUS_TRANSITION', `mã lỗi đúng cho ${from} -> ${to}`);
  assert(/hiện đang/.test(r.message), `thông báo tiếng Việt cho ${from} -> ${to}`);
}

// 4. Trạng thái lạ.
assert(canTransition('active', 'live').code === 'INVALID_STATUS', "'active' -> INVALID_STATUS");
assert(canTransition('draft', 'active').code === 'INVALID_STATUS', "đích 'active' -> INVALID_STATUS");

// 5. Cạnh nào cần guard nào.
assert(canTransition('scheduled', 'draft').guards.includes('no_approved_registrations'), 'cạnh 9 cần guard đăng ký');
assert(canTransition('scheduled', 'draft').guards.includes('no_played_matches'), 'cạnh 9 cần guard trận đã đấu');
assert(canTransition('registration_open', 'draft').guards.includes('no_approved_registrations'), 'cạnh 11 cần guard đăng ký');
assert(canTransition('live', 'completed').guards.includes('all_matches_finalized'), 'chốt giải cần mọi trận finalized');
assert(canTransition('draft', 'scheduled').guards.length === 0, 'draft -> scheduled không cần guard');

// 6. Nhóm hiển thị.
assert(groupOf('draft') === 'upcoming', 'draft -> upcoming');
assert(groupOf('registration_open') === 'upcoming', 'registration_open -> upcoming');
assert(groupOf('registration_closed') === 'upcoming', 'registration_closed -> upcoming');
assert(groupOf('scheduled') === 'upcoming', 'scheduled -> upcoming');
assert(groupOf('live') === 'running', 'live -> running');
assert(groupOf('completed') === 'finished', 'completed -> finished');
assert(groupOf('archived') === 'finished', 'archived -> finished');
assert(groupOf('active') === 'upcoming', 'trạng thái lạ rơi về upcoming, không văng lỗi');

// 7. Sắp xếp: Sắp tăng dần, giải thiếu ngày xuống cuối.
const up = sortForGroup([
  { id: 1, event_date: '2026-10-05' },
  { id: 2, event_date: null },
  { id: 3, event_date: '2026-09-20' },
], 'upcoming');
assert(up.map((t) => t.id).join(',') === '3,1,2', 'nhóm Sắp: tăng dần, null xuống cuối');

// 8. Sắp xếp: Đã giảm dần, giải thiếu ngày xuống cuối.
const fin = sortForGroup([
  { id: 1, event_date: '2026-01-05' },
  { id: 2, event_date: null },
  { id: 3, event_date: '2026-03-20' },
], 'finished');
assert(fin.map((t) => t.id).join(',') === '3,1,2', 'nhóm Đã: giảm dần, null xuống cuối');

// 9. Điều kiện xoá.
assert(canDelete({ status: 'draft' }, 0).ok === true, 'draft + 0 trận: xoá được');
assert(canDelete({ status: 'draft' }, 3).ok === false, 'draft + có trận: không xoá');
assert(canDelete({ status: 'draft' }, 3).code === 'TOURNAMENT_HAS_MATCHES', 'mã lỗi khi có trận');
assert(canDelete({ status: 'completed' }, 0).ok === false, 'completed: không xoá');
assert(canDelete({ status: 'completed' }, 0).code === 'TOURNAMENT_NOT_DRAFT', 'mã lỗi khi không phải draft');
assert(/lưu trữ/.test(canDelete({ status: 'completed' }, 0).message), 'gợi ý dùng lưu trữ');

console.log('lifecycle ok');
```

- [ ] **Step 3: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/lifecycle.test.js`
Expected: FAIL — `Cannot find module '.../lib/tournament/lifecycle'`

- [ ] **Step 4: Viết `lifecycle.js`**

Create `lib/tournament/lifecycle.js`:

```js
'use strict';
// Vòng đời trạng thái của một giải. Thuần, không I/O.
// 7 giá trị khớp đúng constraint tournaments_status_phase3_ck trên DB.

const TOURNAMENT_STATUSES = Object.freeze([
  'draft',
  'registration_open',
  'registration_closed',
  'scheduled',
  'live',
  'completed',
  'archived',
]);

const STATUS_LABELS = Object.freeze({
  draft: 'Nháp',
  registration_open: 'Đang nhận đăng ký',
  registration_closed: 'Đã đóng đăng ký',
  scheduled: 'Đã chốt lịch',
  live: 'Đang diễn ra',
  completed: 'Đã kết thúc',
  archived: 'Lưu trữ',
});

// Mỗi cạnh khai báo guard mà tầng API phải tự kiểm bằng dữ liệu thật.
// Module này không truy vấn gì; nó chỉ nói cạnh nào cần kiểm gì.
const STATUS_TRANSITIONS = Object.freeze({
  draft: Object.freeze({
    registration_open: [],
    scheduled: [],
  }),
  registration_open: Object.freeze({
    registration_closed: [],
    draft: ['no_approved_registrations'],
  }),
  registration_closed: Object.freeze({
    scheduled: [],
    registration_open: [],
  }),
  scheduled: Object.freeze({
    live: [],
    draft: ['no_played_matches', 'no_approved_registrations'],
  }),
  live: Object.freeze({
    completed: ['all_matches_finalized'],
    scheduled: ['no_finalized_matches'],
  }),
  completed: Object.freeze({
    archived: [],
  }),
  archived: Object.freeze({}),
});

const GROUPS = Object.freeze({
  draft: 'upcoming',
  registration_open: 'upcoming',
  registration_closed: 'upcoming',
  scheduled: 'upcoming',
  live: 'running',
  completed: 'finished',
  archived: 'finished',
});

function isStatus(value) {
  return TOURNAMENT_STATUSES.includes(value);
}

function reachableFrom(status) {
  return Object.keys(STATUS_TRANSITIONS[status] || {});
}

function describeReachable(status) {
  const next = reachableFrom(status);
  if (next.length === 0) return 'không chuyển sang trạng thái nào khác được nữa';
  return `chỉ chuyển sang: ${next.map((s) => STATUS_LABELS[s]).join(', ')}`;
}

function canTransition(from, to) {
  if (!isStatus(from) || !isStatus(to)) {
    return {
      ok: false,
      code: 'INVALID_STATUS',
      guards: [],
      message: `Trạng thái không hợp lệ. Chỉ nhận: ${TOURNAMENT_STATUSES.join(', ')}.`,
    };
  }
  const guards = STATUS_TRANSITIONS[from][to];
  if (!guards) {
    return {
      ok: false,
      code: 'INVALID_STATUS_TRANSITION',
      guards: [],
      message: `Giải hiện đang ở "${STATUS_LABELS[from]}", ${describeReachable(from)}.`,
    };
  }
  return { ok: true, code: null, guards: guards.slice(), message: null };
}

function groupOf(status) {
  return GROUPS[status] || 'upcoming';
}

// Sắp: ngày gần nhất lên trước. Đã: ngày mới nhất lên trước.
// Giải thiếu ngày luôn xuống cuối, ở cả hai nhóm.
function sortForGroup(tournaments, group) {
  const desc = group === 'finished';
  return tournaments.slice().sort((a, b) => {
    const da = a.event_date || null;
    const db = b.event_date || null;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    if (da === db) return 0;
    return desc ? (da < db ? 1 : -1) : (da < db ? -1 : 1);
  });
}

function canDelete(tournament, matchCount) {
  if ((tournament || {}).status !== 'draft') {
    return {
      ok: false,
      code: 'TOURNAMENT_NOT_DRAFT',
      message: 'Chỉ xoá được giải còn ở trạng thái Nháp. Giải đã chạy thì chuyển sang lưu trữ để giữ kết quả.',
    };
  }
  if (Number(matchCount) > 0) {
    return {
      ok: false,
      code: 'TOURNAMENT_HAS_MATCHES',
      message: `Giải đã có ${matchCount} trận trong lịch. Xoá lịch trước, hoặc chuyển giải sang lưu trữ.`,
    };
  }
  return { ok: true, code: null, message: null };
}

module.exports = {
  TOURNAMENT_STATUSES,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  isStatus,
  canTransition,
  groupOf,
  sortForGroup,
  canDelete,
};
```

- [ ] **Step 5: Chạy test để thấy nó xanh**

Run: `node tests/tournament/lifecycle.test.js`
Expected: `lifecycle ok`

- [ ] **Step 6: Commit**

```bash
git add lib/tournament/lifecycle.js tests/tournament/lifecycle.test.js docs/superpowers/specs/2026-09-09-tournament-directory-lifecycle-design.md
git commit -m "feat(giai-dau): module thuan vong doi trang thai giai

7 trang thai khop tournaments_status_phase3_ck, 11 canh chuyen kem guard,
nhom hien thi va dieu kien xoa. Sua spec: registrations khong co checked_in.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Migration 045 — bảng nhật ký thao tác

**Files:**
- Create: `database/migrations/045_tournament_operation_logs.sql`
- Test: `tests/tournament/migration-045.test.js`

- [ ] **Step 1: Viết test thất bại**

Create `tests/tournament/migration-045.test.js`:

```js
const fs = require('fs');
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const file = path.join(__dirname, '..', '..', 'database', 'migrations', '045_tournament_operation_logs.sql');

assert(fs.existsSync(file), 'migration 045 tồn tại');
const sql = fs.readFileSync(file, 'utf8');

assert(/CREATE TABLE IF NOT EXISTS public\.tournament_operation_logs/.test(sql), 'tạo bảng idempotent');
for (const col of ['group_id', 'tournament_id', 'division_id', 'actor', 'action', 'target_type', 'target_id', 'before', 'after', 'reason', 'created_at']) {
  assert(new RegExp(`\\b${col}\\b`).test(sql), `có cột ${col}`);
}
assert(/REFERENCES public\.groups\(id\) ON DELETE CASCADE/.test(sql), 'group_id khoá ngoại cascade');
assert(/REFERENCES public\.tournaments\(id\) ON DELETE CASCADE/.test(sql), 'tournament_id khoá ngoại cascade');
assert(/CREATE INDEX IF NOT EXISTS idx_tournament_operation_logs_tournament/.test(sql), 'có index đọc theo giải');
assert(!/DROP\s+TABLE/i.test(sql), 'không DROP TABLE');
assert(!/TRUNCATE/i.test(sql), 'không TRUNCATE');

console.log('migration-045 ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/migration-045.test.js`
Expected: FAIL — `migration 045 tồn tại`

- [ ] **Step 3: Viết migration**

Create `database/migrations/045_tournament_operation_logs.sql`:

```sql
-- 045_tournament_operation_logs.sql
-- Nhật ký thao tác điều hành giải. Dùng chung cho vòng đời giải (Spec 0),
-- bàn điều hành (Spec 2) và sửa kết quả (Spec 3).
-- Idempotent; chỉ thêm bảng mới, không DROP/TRUNCATE gì.

CREATE TABLE IF NOT EXISTS public.tournament_operation_logs (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  group_id      bigint NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  tournament_id bigint NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  division_id   bigint REFERENCES public.tournament_divisions(id) ON DELETE SET NULL,
  actor         text NOT NULL,
  action        text NOT NULL,
  target_type   text NOT NULL,
  target_id     bigint,
  before        jsonb,
  after         jsonb,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_operation_logs_tournament
  ON public.tournament_operation_logs(group_id, tournament_id, created_at DESC);

ALTER TABLE public.tournament_operation_logs DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tournament_operation_logs IS 'Nhat ky thao tac dieu hanh giai; chi doc, khong sua khong xoa';
COMMENT ON COLUMN public.tournament_operation_logs.action IS 'tournament_status_changed, court_toggled, match_called, result_corrected, ...';
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/migration-045.test.js`
Expected: `migration-045 ok`

- [ ] **Step 5: Apply lên Supabase**

Dùng Supabase MCP `apply_migration` với project `uhhlelemewilgsdijwja`, tên `045_tournament_operation_logs`, nội dung đúng file trên.

Xác nhận bằng `execute_sql`:

```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='tournament_operation_logs' order by ordinal_position;
```

Expected: 12 cột đúng như file.

- [ ] **Step 6: Cập nhật sổ migration**

Run: `npm run migration:ledger`
Expected: chạy xong không lỗi, `043` xuất hiện trong sổ.

- [ ] **Step 7: Commit**

```bash
git add database/migrations/045_tournament_operation_logs.sql tests/tournament/migration-045.test.js
git commit -m "feat(db): bang tournament_operation_logs (migration 045)

Nhat ky thao tac dung chung cho Spec 0/2/3. Chi them bang moi, idempotent.
Da apply len project uhhlelemewilgsdijwja va xac nhan 12 cot.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Helper ghi nhật ký

**Files:**
- Create: `lib/tournament/operationLog.js`
- Modify: `tests/tournament/lifecycle.test.js`

- [ ] **Step 1: Thêm test thất bại vào cuối `tests/tournament/lifecycle.test.js`**

Chèn **trước** dòng `console.log('lifecycle ok');`:

```js
// ---- operationLog ----
const { buildLogRow, writeOperationLog } = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'operationLog'));

const row = buildLogRow({
  groupId: 1,
  tournamentId: 7,
  actor: 'Nguyễn Anh Tuấn',
  action: 'tournament_status_changed',
  targetType: 'tournament',
  targetId: 7,
  before: { status: 'scheduled' },
  after: { status: 'live' },
});
assert(row.group_id === 1 && row.tournament_id === 7, 'buildLogRow map id đúng');
assert(row.division_id === null, 'division_id mặc định null');
assert(row.reason === null, 'reason mặc định null');
assert(row.before.status === 'scheduled' && row.after.status === 'live', 'giữ before/after');
assert(!('created_at' in row), 'không tự đặt created_at, để DB dùng default');

let threw = null;
try { buildLogRow({ groupId: 1, tournamentId: 7, actor: 'a', action: 'x', targetType: 't' }); } catch (e) { threw = e; }
assert(threw === null, 'targetId không bắt buộc');

threw = null;
try { buildLogRow({ groupId: 1, tournamentId: 7, actor: '', action: 'x', targetType: 't' }); } catch (e) { threw = e; }
assert(threw !== null && /actor/.test(threw.message), 'thiếu actor thì ném lỗi');

// writeOperationLog không được làm hỏng nghiệp vụ chính khi ghi log lỗi.
let called = 0;
const fakeDbOk = { from() { return { insert: async () => { called += 1; return { error: null }; } }; } };
const fakeDbErr = { from() { return { insert: async () => ({ error: { message: 'boom' } }) }; } };
(async () => {
  const okResult = await writeOperationLog(fakeDbOk, { groupId: 1, tournamentId: 7, actor: 'a', action: 'x', targetType: 't' });
  assert(okResult.ok === true && called === 1, 'ghi log thành công');
  const errResult = await writeOperationLog(fakeDbErr, { groupId: 1, tournamentId: 7, actor: 'a', action: 'x', targetType: 't' });
  assert(errResult.ok === false, 'ghi log lỗi trả ok:false');
  assert(errResult.error === 'boom', 'giữ thông báo lỗi');
  console.log('lifecycle ok');
})();
```

Đồng thời **xoá** dòng `console.log('lifecycle ok');` cũ ở cuối file (nó đã nằm trong khối async ở trên).

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/lifecycle.test.js`
Expected: FAIL — `Cannot find module '.../lib/tournament/operationLog'`

- [ ] **Step 3: Viết `operationLog.js`**

Create `lib/tournament/operationLog.js`:

```js
'use strict';
// Nhật ký thao tác điều hành giải.
// buildLogRow là thuần; writeOperationLog nhận db từ ngoài để test được.

function buildLogRow(input = {}) {
  const groupId = Number(input.groupId);
  const tournamentId = Number(input.tournamentId);
  const actor = String(input.actor || '').trim();
  const action = String(input.action || '').trim();
  const targetType = String(input.targetType || '').trim();

  if (!Number.isFinite(groupId) || groupId <= 0) throw new Error('operationLog: groupId là bắt buộc');
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) throw new Error('operationLog: tournamentId là bắt buộc');
  if (!actor) throw new Error('operationLog: actor là bắt buộc');
  if (!action) throw new Error('operationLog: action là bắt buộc');
  if (!targetType) throw new Error('operationLog: targetType là bắt buộc');

  return {
    group_id: groupId,
    tournament_id: tournamentId,
    division_id: input.divisionId == null ? null : Number(input.divisionId),
    actor,
    action,
    target_type: targetType,
    target_id: input.targetId == null ? null : Number(input.targetId),
    before: input.before == null ? null : input.before,
    after: input.after == null ? null : input.after,
    reason: input.reason == null || input.reason === '' ? null : String(input.reason).trim(),
  };
}

// Ghi log KHÔNG được làm hỏng nghiệp vụ chính: nuốt lỗi, trả về kết quả để
// nơi gọi tự quyết có log ra console hay không.
async function writeOperationLog(db, input) {
  try {
    const row = buildLogRow(input);
    const { error } = await db.from('tournament_operation_logs').insert(row);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { buildLogRow, writeOperationLog };
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/lifecycle.test.js`
Expected: `lifecycle ok`

- [ ] **Step 5: Commit**

```bash
git add lib/tournament/operationLog.js tests/tournament/lifecycle.test.js
git commit -m "feat(giai-dau): helper ghi nhat ky thao tac

buildLogRow thuan co validate; writeOperationLog nuot loi de khong lam hong
nghiep vu chinh khi ghi log that bai.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: API — POST luôn tạo giải ở `draft`

**Files:**
- Modify: `app/api/tournament-v2/tournaments/route.js:197`
- Test: `tests/tournament/api-tournaments.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

Mở `tests/tournament/api-tournaments.contract.test.js`, thêm vào cuối (trước dòng `console.log`):

```js
const routeSrc = read('app/api/tournament-v2/tournaments/route.js');
assert(!/status:\s*body\.status\s*\|\|\s*'draft'/.test(routeSrc), "POST không lấy status từ body");
assert(/status:\s*'draft'/.test(routeSrc), 'POST ép trạng thái draft');
```

Nếu file chưa có hàm `read`, thêm ở đầu file:

```js
const fs = require('fs'); const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-tournaments.contract.test.js`
Expected: FAIL — `POST không lấy status từ body`

- [ ] **Step 3: Sửa route**

Trong `app/api/tournament-v2/tournaments/route.js`, dòng 197, đổi:

```js
            status: body.status || 'draft',
```

thành:

```js
            // Giải mới luôn bắt đầu ở draft. Đổi trạng thái phải đi qua PATCH
            // để được kiểm cạnh chuyển (lib/tournament/lifecycle.js).
            status: 'draft',
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/api-tournaments.contract.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/tournament-v2/tournaments/route.js tests/tournament/api-tournaments.contract.test.js
git commit -m "fix(api): giai moi luon tao o trang thai draft

Doi trang thai phai qua PATCH de duoc kiem canh chuyen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: API — PATCH kiểm cạnh chuyển trạng thái

Đây là task vá lỗi 500. Sau task này, chọn "Đang diễn ra" không còn làm vỡ constraint.

**Files:**
- Modify: `app/api/tournament-v2/tournaments/route.js` (PATCH, dòng 218–255)
- Test: `tests/tournament/api-tournaments.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

Thêm vào `tests/tournament/api-tournaments.contract.test.js`:

```js
// PATCH phải kiểm trạng thái trước khi ghi, không đẩy thẳng xuống Postgres.
assert(/from '@\/lib\/tournament\/lifecycle'/.test(routeSrc), 'PATCH import lifecycle');
assert(/canTransition\(/.test(routeSrc), 'PATCH gọi canTransition');
assert(/INVALID_STATUS_TRANSITION/.test(routeSrc), 'trả mã INVALID_STATUS_TRANSITION');
assert(/TOURNAMENT_HAS_APPROVED_REGISTRATIONS/.test(routeSrc), 'guard đăng ký đã duyệt');
assert(/TOURNAMENT_HAS_OPEN_MATCHES/.test(routeSrc), 'guard chốt giải khi còn trận dở');
assert(/tournament_operation_logs|writeOperationLog/.test(routeSrc), 'ghi nhật ký khi đổi trạng thái');
assert(/\.eq\('group_id'/.test(routeSrc), 'mọi truy vấn scope theo group_id');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-tournaments.contract.test.js`
Expected: FAIL — `PATCH import lifecycle`

- [ ] **Step 3: Thêm import và hàm đếm ở đầu route**

Trong `app/api/tournament-v2/tournaments/route.js`, sau dòng `import { resolveOrganizerPayload } from '@/lib/tournament/wizardModel';` thêm:

```js
import { canTransition, isStatus } from '@/lib/tournament/lifecycle';
import { writeOperationLog } from '@/lib/tournament/operationLog';
```

Sau khai báo `const db = supabaseAdmin || supabaseServer;` thêm ba hàm đếm. Chú ý: `tournament_matches` không có `tournament_id`, `tournament_registrations` cũng không — cả hai phải join qua bảng trung gian.

```js
// tournament_matches không có tournament_id; phải đi qua tournament_stages.
async function countMatchesByStatus(tournamentId, groupId) {
    const { data: stages, error: stageErr } = await db
        .from('tournament_stages')
        .select('id')
        .eq('group_id', groupId)
        .eq('tournament_id', tournamentId);
    if (stageErr) throw stageErr;
    const stageIds = (stages || []).map((s) => s.id);
    if (stageIds.length === 0) return { total: 0, finalized: 0, played: 0 };

    const { data: matches, error: matchErr } = await db
        .from('tournament_matches')
        .select('status')
        .eq('group_id', groupId)
        .in('stage_id', stageIds);
    if (matchErr) throw matchErr;

    const rows = matches || [];
    return {
        total: rows.length,
        finalized: rows.filter((m) => m.status === 'finalized').length,
        played: rows.filter((m) => m.status === 'live' || m.status === 'finalized').length,
    };
}

// tournament_registrations không có tournament_id; phải đi qua tournament_divisions.
async function countApprovedRegistrations(tournamentId, groupId) {
    const { data: divisions, error: divErr } = await db
        .from('tournament_divisions')
        .select('id')
        .eq('group_id', groupId)
        .eq('tournament_id', tournamentId);
    if (divErr) throw divErr;
    const divisionIds = (divisions || []).map((d) => d.id);
    if (divisionIds.length === 0) return 0;

    const { count, error } = await db
        .from('tournament_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .in('division_id', divisionIds)
        .eq('status', 'approved');
    if (error) throw error;
    return Number(count || 0);
}

// Trả null nếu guard qua; trả NextResponse lỗi nếu guard chặn.
async function checkTransitionGuards(guards, tournamentId, groupId) {
    if (guards.length === 0) return null;
    const counts = await countMatchesByStatus(tournamentId, groupId);

    if (guards.includes('all_matches_finalized') && counts.total !== counts.finalized) {
        const open = counts.total - counts.finalized;
        return NextResponse.json({
            error: `Còn ${open} trận chưa chốt kết quả. Chốt hết rồi mới kết thúc giải được.`,
            code: 'TOURNAMENT_HAS_OPEN_MATCHES',
            open_matches: open,
        }, { status: 409 });
    }
    if (guards.includes('no_played_matches') && counts.played > 0) {
        return NextResponse.json({
            error: `Giải đã có ${counts.played} trận đang đấu hoặc đã đấu xong, không quay về Nháp được.`,
            code: 'TOURNAMENT_HAS_PLAYED_MATCHES',
        }, { status: 409 });
    }
    if (guards.includes('no_finalized_matches') && counts.finalized > 0) {
        return NextResponse.json({
            error: `Giải đã có ${counts.finalized} trận chốt kết quả, không quay về Đã chốt lịch được.`,
            code: 'TOURNAMENT_HAS_FINALIZED_MATCHES',
        }, { status: 409 });
    }
    if (guards.includes('no_approved_registrations')) {
        const approved = await countApprovedRegistrations(tournamentId, groupId);
        if (approved > 0) {
            return NextResponse.json({
                error: `Giải đã có ${approved} đăng ký được duyệt. Quay về Nháp sẽ ẩn giải khỏi trang công khai và các VĐV này mất chỗ.`,
                code: 'TOURNAMENT_HAS_APPROVED_REGISTRATIONS',
                approved_registrations: approved,
            }, { status: 409 });
        }
    }
    return null;
}
```

- [ ] **Step 4: Sửa thân hàm PATCH**

Trong `export async function PATCH`, ngay sau khối kiểm `visibility` và **trước** `const payload = buildTournamentPayload(body);`, chèn:

```js
        // Đổi trạng thái phải qua máy trạng thái. Trước đây status được đẩy
        // thẳng xuống Postgres nên giá trị lạ như 'active' làm vỡ CHECK và
        // trả 500 kèm thông báo tiếng Anh.
        let statusChange = null;
        if ('status' in body && body.status != null) {
            const nextStatus = String(body.status);
            const { data: current, error: currentErr } = await db
                .from('tournaments')
                .select('id, status')
                .eq('id', id)
                .eq('group_id', adminCheck.groupId)
                .maybeSingle();
            if (currentErr) {
                return NextResponse.json({ error: currentErr.message }, { status: 500 });
            }
            if (!current) {
                return NextResponse.json({ error: 'Không tìm thấy giải' }, { status: 404 });
            }

            if (nextStatus !== current.status) {
                if (!isStatus(nextStatus)) {
                    return NextResponse.json({
                        error: `Trạng thái "${nextStatus}" không hợp lệ.`,
                        code: 'INVALID_STATUS',
                    }, { status: 400 });
                }
                const verdict = canTransition(current.status, nextStatus);
                if (!verdict.ok) {
                    return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
                }
                const blocked = await checkTransitionGuards(verdict.guards, id, adminCheck.groupId);
                if (blocked) return blocked;
                statusChange = { from: current.status, to: nextStatus };
            }
        }
```

Rồi ngay **sau** khối `if (error) { ... }` của lệnh update và **trước** `return NextResponse.json(...)` cuối hàm, chèn:

```js
        if (statusChange) {
            const logged = await writeOperationLog(db, {
                groupId: adminCheck.groupId,
                tournamentId: Number(id),
                actor: adminCheck.actor || adminCheck.memberName || 'admin',
                action: 'tournament_status_changed',
                targetType: 'tournament',
                targetId: Number(id),
                before: { status: statusChange.from },
                after: { status: statusChange.to },
            });
            if (!logged.ok) console.error('Ghi nhật ký đổi trạng thái giải lỗi:', logged.error);
        }
```

> **Kiểm trước khi viết dòng `actor`:** mở `lib/groupSession.js` xem `requireValidatedGroupAdmin()` trả về những trường nào. Nếu không có `actor` lẫn `memberName`, dùng trường định danh người dùng có thật ở đó. Không được để `actor` rỗng — `buildLogRow` sẽ ném lỗi.

- [ ] **Step 5: Chạy test để thấy nó xanh**

Run: `node tests/tournament/api-tournaments.contract.test.js`
Expected: PASS

- [ ] **Step 6: Kiểm thật trên DB**

Chạy bằng Supabase MCP `execute_sql`, thay `<ID>` bằng id một giải test:

```sql
select id, name, status from tournaments where group_id = 1 order by id;
```

Rồi gọi PATCH qua trình duyệt hoặc `curl` với `status: "active"`.
Expected: **400** `INVALID_STATUS` với thông báo tiếng Việt, **không phải 500**.

Gọi tiếp với `status: "live"` trên một giải đang `draft`.
Expected: **400** `INVALID_STATUS_TRANSITION`, thông báo nêu rõ từ Nháp chỉ đi được sang đâu.

- [ ] **Step 7: Commit**

```bash
git add app/api/tournament-v2/tournaments/route.js tests/tournament/api-tournaments.contract.test.js
git commit -m "fix(api): kiem canh chuyen trang thai giai truoc khi ghi

Truoc day status duoc day thang xuong Postgres nen 'active' (khong nam trong
tournaments_status_phase3_ck) lam vo CHECK va tra 500. Gio tra 400
INVALID_STATUS / INVALID_STATUS_TRANSITION bang tieng Viet, va 409 cho cac
guard: con tran chua chot, da co tran da dau, da co dang ky duyet.

Chu y: tournament_matches va tournament_registrations deu KHONG co
tournament_id, phai join qua tournament_stages / tournament_divisions.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: API — DELETE có điều kiện

**Files:**
- Modify: `app/api/tournament-v2/tournaments/route.js` (DELETE)
- Test: `tests/tournament/api-tournaments.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

```js
assert(/canDelete\(/.test(routeSrc), 'DELETE gọi canDelete');
assert(/TOURNAMENT_NOT_DRAFT|TOURNAMENT_HAS_MATCHES/.test(routeSrc), 'DELETE trả mã lỗi rõ ràng');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-tournaments.contract.test.js`
Expected: FAIL — `DELETE gọi canDelete`

- [ ] **Step 3: Sửa import và thân DELETE**

Đổi dòng import lifecycle thành:

```js
import { canTransition, isStatus, canDelete } from '@/lib/tournament/lifecycle';
```

Trong `export async function DELETE`, chèn giữa khối kiểm `id` và lệnh `.delete()`:

```js
        const { data: target, error: targetErr } = await db
            .from('tournaments')
            .select('id, status')
            .eq('id', id)
            .eq('group_id', adminCheck.groupId)
            .maybeSingle();
        if (targetErr) {
            return NextResponse.json({ error: targetErr.message }, { status: 500 });
        }
        if (!target) {
            return NextResponse.json({ error: 'Không tìm thấy giải' }, { status: 404 });
        }

        const counts = await countMatchesByStatus(id, adminCheck.groupId);
        const verdict = canDelete(target, counts.total);
        if (!verdict.ok) {
            return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 409 });
        }
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/api-tournaments.contract.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/tournament-v2/tournaments/route.js tests/tournament/api-tournaments.contract.test.js
git commit -m "feat(api): chi xoa duoc giai Nhap va chua co tran

Giai da chay thi chuyen sang luu tru de khong mat ket qua da dau.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: API — GET trả kèm nhóm và tiến độ

**Files:**
- Modify: `app/api/tournament-v2/tournaments/route.js` (GET)
- Test: `tests/tournament/api-tournaments.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

```js
assert(/groupOf\(/.test(routeSrc), 'GET gán nhóm hiển thị');
assert(/match_progress/.test(routeSrc), 'GET trả tiến độ trận');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-tournaments.contract.test.js`
Expected: FAIL — `GET gán nhóm hiển thị`

- [ ] **Step 3: Sửa import và thân GET**

Đổi dòng import lifecycle thành:

```js
import { canTransition, isStatus, canDelete, groupOf } from '@/lib/tournament/lifecycle';
```

Thay thân `export async function GET()` bằng:

```js
export async function GET() {
    try {
        const scope = getClubScope();
        if (!scope.ok) return scope.response;
        const groupId = scope.groupId;

        const { data, error } = await db
            .from('tournaments')
            .select('*')
            .eq('group_id', groupId)
            .order('event_date', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const tournaments = data || [];
        if (tournaments.length === 0) {
            return NextResponse.json({ tournaments: [] });
        }

        // Tiến độ trận cho MỌI giải đã sinh lịch, không chỉ giải đang chạy:
        // giải đã kết thúc cũng cần hiện 22/22 · 100%.
        // Hai truy vấn cho cả danh sách, không phải mỗi giải một truy vấn.
        const ids = tournaments.map((t) => t.id);
        const { data: stages, error: stageErr } = await db
            .from('tournament_stages')
            .select('id, tournament_id')
            .eq('group_id', groupId)
            .in('tournament_id', ids);
        if (stageErr) {
            return NextResponse.json({ error: stageErr.message }, { status: 500 });
        }

        const tournamentByStage = new Map((stages || []).map((s) => [s.id, s.tournament_id]));
        const progress = new Map();
        if (tournamentByStage.size > 0) {
            const { data: matches, error: matchErr } = await db
                .from('tournament_matches')
                .select('stage_id, status')
                .eq('group_id', groupId)
                .in('stage_id', [...tournamentByStage.keys()]);
            if (matchErr) {
                return NextResponse.json({ error: matchErr.message }, { status: 500 });
            }
            for (const match of matches || []) {
                const tid = tournamentByStage.get(match.stage_id);
                if (!tid) continue;
                const entry = progress.get(tid) || { finalized: 0, total: 0 };
                entry.total += 1;
                if (match.status === 'finalized') entry.finalized += 1;
                progress.set(tid, entry);
            }
        }

        return NextResponse.json({
            tournaments: tournaments.map((t) => ({
                ...t,
                group: groupOf(t.status),
                match_progress: progress.get(t.id) || null,
            })),
        });
    } catch (err) {
        console.error('Tournaments v2 GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/api-tournaments.contract.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/tournament-v2/tournaments/route.js tests/tournament/api-tournaments.contract.test.js
git commit -m "feat(api): GET tournaments tra kem nhom hien thi va tien do tran

Hai truy van cho ca danh sach thay vi mot truy van moi giai. Giai chua sinh
lich tra match_progress null.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Trang danh sách — ba nhóm và ô tìm

**Files:**
- Modify: `app/giai-dau/v2/page.js`
- Modify: `app/giai-dau/v2/v2.css`
- Test: `tests/tournament/ui-list.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

Thêm vào `tests/tournament/ui-list.contract.test.js`, trước `console.log`:

```js
assert(/Đang diễn ra/.test(s), 'có nhóm Đang diễn ra');
assert(/Sắp tổ chức/.test(s), 'có nhóm Sắp tổ chức');
assert(/Đã kết thúc/.test(s), 'có nhóm Đã kết thúc');
assert(/sortForGroup|groupOf/.test(s), 'dùng lifecycle để nhóm/sắp xếp');
assert(/lib\/tournament\/lifecycle|@\/lib\/tournament\/lifecycle/.test(s), 'import lifecycle');
assert(/placeholder="Tìm/.test(s), 'có ô tìm theo tên');
assert(/STATUS_LABELS/.test(s), 'nhãn trạng thái lấy từ lifecycle, không viết cứng');
assert(!/active:\s*'Đang diễn ra'/.test(s), "không còn nhãn cho trạng thái 'active' đã bỏ");
assert(/match_progress/.test(s), 'hiện tiến độ trận cho giải đang chạy');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-list.contract.test.js`
Expected: FAIL — `có nhóm Đang diễn ra`

- [ ] **Step 3: Sửa `app/giai-dau/v2/page.js`**

Thêm import ở đầu file, sau dòng import `tournamentV2Client`:

```js
import { STATUS_LABELS, groupOf, sortForGroup } from '@/lib/tournament/lifecycle';
```

**Xoá** khối `STATUS_LABELS` và `STATUS_OPTIONS` viết cứng (dòng 10–21) và thay bằng:

```js
// Trạng thái admin đổi được từ form Sửa. Không liệt kê 'archived' ở đây —
// lưu trữ đi qua nút riêng để không ai bấm nhầm.
const STATUS_OPTIONS = [
    { value: 'draft', label: STATUS_LABELS.draft },
    { value: 'registration_open', label: STATUS_LABELS.registration_open },
    { value: 'registration_closed', label: STATUS_LABELS.registration_closed },
    { value: 'scheduled', label: STATUS_LABELS.scheduled },
    { value: 'live', label: STATUS_LABELS.live },
    { value: 'completed', label: STATUS_LABELS.completed },
];
```

Trong `TournamentV2PageInner`, thêm state ô tìm cạnh các state khác:

```js
    const [query, setQuery] = useState('');
```

Thêm ba nhóm được tính từ `tournaments`, đặt ngay trước phần `return` của view danh sách:

```js
    const groups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const filtered = needle
            ? tournaments.filter((t) => String(t.name || '').toLowerCase().includes(needle))
            : tournaments;
        return {
            running: sortForGroup(filtered.filter((t) => groupOf(t.status) === 'running'), 'running'),
            upcoming: sortForGroup(filtered.filter((t) => groupOf(t.status) === 'upcoming'), 'upcoming'),
            finished: sortForGroup(filtered.filter((t) => groupOf(t.status) === 'finished'), 'finished'),
        };
    }, [tournaments, query]);
```

Thêm `useMemo` vào import React ở dòng 3:

```js
import { useState, useEffect, useMemo, Suspense } from 'react';
```

Tách phần vẽ một thẻ giải thành hàm dùng lại được, đặt ngay trên `TournamentV2PageInner`:

```js
function TournamentCard({ tournament, isAdmin, onOpen, onEdit, onDelete }) {
    const progress = tournament.match_progress;
    const percent = progress && progress.total > 0
        ? Math.round((progress.finalized / progress.total) * 100)
        : null;
    return (
        <li className="v2-card-wrap">
            <button type="button" className="v2-card" onClick={() => onOpen(tournament.id)}>
                <div className="v2-card-top">
                    <span className={`v2-chip v2-chip-${tournament.status || 'draft'}`}>
                        {STATUS_LABELS[tournament.status] || STATUS_LABELS.draft}
                    </span>
                    <span className="v2-card-date">{tournament.event_date || '—'}</span>
                </div>
                <h2 className="v2-card-name">{tournament.name}</h2>
                <p className="v2-card-meta">
                    {ENTRANT_TYPE_LABELS[tournament.entrant_type] || 'Cặp đôi'}
                    {tournament.location ? ` · ${tournament.location}` : ''}
                </p>
                {percent !== null && (
                    <p className="v2-card-progress">
                        {progress.finalized}/{progress.total} trận · {percent}%
                    </p>
                )}
                <span className="v2-card-chevron" aria-hidden="true">›</span>
            </button>
            {isAdmin && (
                <div className="v2-card-actions">
                    <button type="button" className="v2-card-action-btn" onClick={() => onEdit(tournament)}>
                        ✏️ Sửa
                    </button>
                    <button
                        type="button"
                        className="v2-card-action-btn v2-card-action-delete"
                        onClick={() => onDelete(tournament.id)}
                    >
                        🗑 Xoá
                    </button>
                </div>
            )}
        </li>
    );
}

function TournamentGroup({ title, items, isAdmin, onOpen, onEdit, onDelete }) {
    if (items.length === 0) return null;   // nhóm rỗng ẩn hẳn, không hiện khung trống
    return (
        <section className="v2-group">
            <h2 className="v2-group-title">{title} <span>{items.length}</span></h2>
            <ul className="v2-card-list">
                {items.map((t) => (
                    <TournamentCard
                        key={t.id}
                        tournament={t}
                        isAdmin={isAdmin}
                        onOpen={onOpen}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                ))}
            </ul>
        </section>
    );
}
```

Thay toàn bộ khối `<ul className="v2-card-list"> ... </ul>` trong view danh sách bằng:

```js
                <>
                    <input
                        className="v2-search"
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Tìm theo tên giải"
                        aria-label="Tìm theo tên giải"
                    />
                    <TournamentGroup
                        title="Đang diễn ra"
                        items={groups.running}
                        isAdmin={isAdmin}
                        onOpen={openTournament}
                        onEdit={setEditing}
                        onDelete={setDeletingId}
                    />
                    <TournamentGroup
                        title="Sắp tổ chức"
                        items={groups.upcoming}
                        isAdmin={isAdmin}
                        onOpen={openTournament}
                        onEdit={setEditing}
                        onDelete={setDeletingId}
                    />
                    <TournamentGroup
                        title="Đã kết thúc"
                        items={groups.finished}
                        isAdmin={isAdmin}
                        onOpen={openTournament}
                        onEdit={setEditing}
                        onDelete={setDeletingId}
                    />
                    {groups.running.length + groups.upcoming.length + groups.finished.length === 0 && (
                        <div className="v2-state v2-empty">
                            <p>Không có giải nào khớp với &ldquo;{query}&rdquo;.</p>
                        </div>
                    )}
                </>
```

- [ ] **Step 4: Thêm CSS**

Thêm vào cuối `app/giai-dau/v2/v2.css`:

```css
/* --- Nhóm giải theo vòng đời --- */
.v2-search {
    width: 100%;
    padding: 10px 14px;
    margin-bottom: 18px;
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    font-family: var(--font-family);
    font-size: 0.95rem;
}

.v2-group {
    margin-bottom: 26px;
}

.v2-group-title {
    margin: 0 0 10px;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 8px;
}

.v2-group-title span {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
}

.v2-card-progress {
    margin: 4px 0 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--primary);
    font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Chạy test để thấy nó xanh**

Run: `node tests/tournament/ui-list.contract.test.js`
Expected: `ui-list contract ok`

- [ ] **Step 6: Kiểm bằng trình duyệt**

Mở `/giai-dau/v2` ở ba bề rộng: **390px**, **834px**, **≥1280px**. Xác nhận:
- Ba nhóm hiện đúng thứ tự Đang diễn ra → Sắp tổ chức → Đã kết thúc.
- Nhóm rỗng **ẩn hẳn**, không để lại khung trống.
- Gõ vào ô tìm thì lọc đúng; gõ chuỗi không khớp thì hiện dòng "Không có giải nào khớp".
- Mở form **Sửa**, chọn "Đang diễn ra" trên một giải `draft` → hiện thông báo **tiếng Việt** nói từ Nháp chỉ đi được sang đâu, **không phải lỗi Postgres**.

- [ ] **Step 7: Commit**

```bash
git add app/giai-dau/v2/page.js app/giai-dau/v2/v2.css tests/tournament/ui-list.contract.test.js
git commit -m "feat(giai-dau): trang danh sach nhom Sap/Dang/Da + o tim

Nhan trang thai lay tu lifecycle thay vi viet cung 3 gia tri; bo nhan cho
'active' vi khong phai trang thai hop le. Nhom rong an han. Giai da sinh lich
hien tien do tran.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Nối test vào bộ chạy chung và chạy hồi quy

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Thêm script**

Trong `package.json`, thêm sau dòng `"test:t-migration"`:

```json
    "test:t-lifecycle": "node tests/tournament/lifecycle.test.js && node tests/tournament/migration-045.test.js",
```

Và sửa `test:tournament` thành:

```json
    "test:tournament": "npm run test:t-migration && npm run test:t-lifecycle && npm run test:t-engines && npm run test:t-api && npm run test:t-ui",
```

- [ ] **Step 2: Chạy bộ test giải đấu**

Run: `npm run test:tournament`
Expected: mọi test in dòng `ok`, exit 0.

- [ ] **Step 3: Chạy hồi quy toàn dự án**

Run: `npm run test:regression`
Expected: exit 0.

> **Nếu đỏ ở `test:phase4-*` hoặc `test:t-ui-phase4`:** bốn bộ test đó nhắm vào code Phase 4 **chưa commit** (`tests/phase4/*.js` và `tests/tournament/ui-phase4-operations.contract.test.js` đều untracked). Plan này không đụng tới chúng — nếu đỏ thì là do working tree, không phải do Task 1–8. Ghi lại hiện tượng vào file bằng chứng và đi tiếp; việc dọn bốn bộ test đó thuộc plan Spec 2.

- [ ] **Step 4: Chạy build**

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 5: Ghi bằng chứng**

```bash
mkdir -p evidence
npm run test:tournament > evidence/spec0-tournament-2026-09-09.txt 2>&1
npm run build > evidence/spec0-build-2026-09-09.txt 2>&1
```

- [ ] **Step 6: Commit**

```bash
git add package.json evidence/spec0-tournament-2026-09-09.txt evidence/spec0-build-2026-09-09.txt
git commit -m "test(giai-dau): noi test:t-lifecycle vao bo test:tournament

Kem bang chung chay test va build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review — đối chiếu spec

| Mục spec | Task phủ |
|---|---|
| 3 · 7 trạng thái + 11 cạnh + guard | Task 1 (bảng cạnh), Task 5 (thi hành guard) |
| 4 · Ba nhóm, sắp xếp, nhóm rỗng ẩn | Task 1 (`sortForGroup`), Task 8 (UI) |
| 4 · Ô tìm theo tên | Task 8 |
| 4 · Thẻ giải: tên, chip, ngày, địa điểm, tiến độ | Task 7 (API), Task 8 (UI) |
| 4 · Xoá chỉ khi `draft` + 0 trận | Task 1 (`canDelete`), Task 6 (API) |
| 4 · Quyền member/admin | Không đổi — `isAdmin` từ `/api/groups/session` giữ nguyên, test cũ đã đóng đinh |
| 5 · API validate status, POST ép draft, GET làm giàu | Task 4, 5, 7 |
| 5 · Ghi nhật ký khi đổi trạng thái | Task 3 (helper), Task 5 (nơi gọi) |
| 6 · Chốt giải khi mọi trận `finalized` | Task 5 (guard `all_matches_finalized`) |
| 7 · Migration 045 | Task 2 |
| 8 · Kiểm thử 1–10 | Task 1 (1–5), Task 4–7 (6–10) |
| 8 · Kiểm tay ba bề rộng | Task 8 Step 6 |

**Chưa phủ, cố ý:** giao diện kho lưu trữ riêng cho `archived` — spec mục 3 đã nói rõ ngoài phạm vi; giải archived vẫn hiện trong nhóm "Đã kết thúc".

**Điểm cần người thực thi tự kiểm:** tên trường định danh người dùng trả về từ `requireValidatedGroupAdmin()` (Task 5 Step 4). Plan không đoán tên trường — phải mở `lib/groupSession.js` đọc.
