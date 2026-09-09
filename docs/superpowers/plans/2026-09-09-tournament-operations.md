# Tournament Operations (Bàn điều hành) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một BTC ngồi máy, cầm mic, chạy được cả ngày thi đấu trên một màn hình: gọi sân, bấm giờ, ghi tỉ số, thấy tiến độ và bảng xếp hạng cập nhật.

**Architecture:** Console 7 tab được thay bằng shell sidebar theo **lộ trình 8 bước**, nền tối/tím. Trạng thái sân **không lưu**, suy ra từ trận đang gán. Giờ dự kiến **không lưu**, tính khi đọc. Vòng đời trận mở rộng thành 5 trạng thái với 8 cạnh, mọi cạnh đi qua một hàm thuần.

**Tech Stack:** Next.js 14 App Router (JavaScript thuần), Supabase JS, node test thuần, migration SQL idempotent.

**Spec:** [`docs/superpowers/specs/2026-09-09-tournament-operations-design.md`](../specs/2026-09-09-tournament-operations-design.md)

**Phụ thuộc bắt buộc:** Plan Spec 0 (bảng `tournament_operation_logs`, migration 043) và Plan Spec 1 (`resolveMatchScoring`) phải xong trước.

---

## Bốn nhóm task — mỗi nhóm giao được một mình

| Nhóm | Nội dung | Giao được gì |
|---|---|---|
| **A** | Dọn code nháp · migration 044 · 4 hàm thuần | Nền tảng, chưa nhìn thấy gì |
| **B** | API `venues`, `courts`, `assignments`, `match-transition` | Chạy được bằng curl |
| **C** | Shell sidebar 8 bước + theme tối + chuyển 7 tab cũ | Console mới thay console cũ |
| **D** | Bước 2 (sân) · bước 5 (điều hành) · bước 8 (nhật ký) | Bàn điều hành hoàn chỉnh |

Dừng sau bất kỳ nhóm nào cũng để lại một hệ chạy được. Đừng bắt đầu nhóm sau khi nhóm trước còn test đỏ.

## Sự thật đã kiểm chứng trên DB (2026-09-09)

| Điều | Giá trị |
|---|---|
| `tournament_matches.status` CHECK | `pending \| live \| finalized` (tên constraint `tournament_matches_status_phase3_ck`) |
| `tournament_matches` | **không có cột thời gian nào**; có `version` (mặc định 1), `result_type` (mặc định `'simple'`, **không có CHECK**), `court` kiểu `text` (di sản), `division_id`, `entry_a_id`/`entry_b_id`, `winner_entry_id` |
| `tournament_matches` | **không có `tournament_id`** — join qua `tournament_stages` |
| `tournament_venues` / `tournament_courts` / `tournament_match_assignments` | tồn tại, **rỗng 0 dòng** |
| `tournament_courts` | `venue_id, label, surface, active (default true), availability jsonb` |
| `tournament_match_assignments` | `match_id, court_id, time_slot_id, scheduled_start, scheduled_end, version (default 1), status (default 'assigned'), locked (default false)` |
| `tournaments.settings` | `jsonb` — chỗ để cấu hình vận hành, không cần cột mới |

## Ràng buộc thiết kế phải theo

**[`ADR-006`](../../pickhub-core/decisions/ADR-006-montserrat-va-hop-nhat-token-ui.md)** (`accepted`): font chính là **`Montserrat`**; `Outfit` bị gỡ khỏi sản phẩm; chỉ còn bộ token `--ph-*`, các token `--court-green` / `--pickle-lime` / `--live-cyan` / `--rally-coral` bị khai tử.

**Mockup đã duyệt dựng bằng Outfit — đó là sai sót của mockup, không phải quyết định.** Thi công dùng Montserrat.

**Tương phản:** spec design-system đo `--ph-cyan` ~1.3:1 và `--ph-coral` ~2.5:1 **trên nền trắng** và cấm dùng chúng cho chữ. Bàn điều hành dùng chúng làm **chữ trên nền đen** — phép đo khác hẳn. Task C4 bắt buộc đo lại.

## File Structure

| File | Trách nhiệm |
|---|---|
| `lib/tournament/matchLifecycle.js` (mới) | Thuần. 5 trạng thái trận, 8 cạnh, `transitionMatch`, `matchElapsed`. |
| `lib/tournament/courtBoard.js` (mới) | Thuần. `computeCourtState`, `projectSchedule`, `averageMatchMinutes`. |
| `database/migrations/044_tournament_operations.sql` (mới) | 3 cột thời gian, mở rộng CHECK trạng thái, CHECK `result_type`. |
| `app/api/tournament-v2/venues/route.js` (viết lại) | CRUD địa điểm. |
| `app/api/tournament-v2/courts/route.js` (viết lại) | CRUD sân + bật/tắt + guard xoá. |
| `app/api/tournament-v2/assignments/route.js` (viết lại) | Gán/gỡ trận khỏi sân. |
| `app/api/tournament-v2/match-transition/route.js` (mới) | Một cửa cho mọi đổi trạng thái trận. |
| `app/api/tournament-v2/operation-logs/route.js` (mới) | Đọc nhật ký. |
| `app/giai-dau/v2/console/ConsoleShell.js` (mới) | Sidebar 8 bước, drawer, ánh xạ `?tab=` → `?step=`. |
| `app/giai-dau/v2/console/shell.css` (mới) | Token tối + layout shell. |
| `app/giai-dau/v2/console/steps/CourtsStep.js` (mới) | Bước 2. |
| `app/giai-dau/v2/console/steps/ControlStep.js` (mới) | Bước 5. |
| `app/giai-dau/v2/console/steps/LogStep.js` (mới) | Bước 8. |

---

# NHÓM A — Dọn dẹp, migration, lớp thuần

## Task A1: Xoá code nháp Phase 4

Bản nháp của agent trước **chưa từng được commit**, nên git không có bản ghi nào về chúng. Giữ lại chỉ gây nhầm lẫn về việc code nào đang chạy thật. Nội dung đáng giữ (bảng chuyển trạng thái) đã nằm trong spec mục 6.3.

**Files:** xoá 8 thư mục/tệp chưa commit.

- [ ] **Step 1: Xác nhận tất cả đều chưa commit**

```bash
for p in lib/tournament/operations.js app/giai-dau/v2/operations \
  app/api/tournament-v2/check-ins app/api/tournament-v2/qr-checkins \
  app/api/tournament-v2/score-submissions app/api/tournament-v2/notifications \
  app/api/tournament-v2/finance app/api/tournament-v2/time-slots; do
  git ls-files --error-unmatch "$p" >/dev/null 2>&1 && echo "TRACKED $p" || echo "untracked $p"
done
```

Expected: **tất cả in `untracked`**. Nếu có dòng `TRACKED`, **dừng lại** và báo — plan này giả định chúng chưa commit.

- [ ] **Step 2: Xoá**

```bash
rm -rf lib/tournament/operations.js app/giai-dau/v2/operations \
  app/api/tournament-v2/check-ins app/api/tournament-v2/qr-checkins \
  app/api/tournament-v2/score-submissions app/api/tournament-v2/notifications \
  app/api/tournament-v2/finance app/api/tournament-v2/time-slots \
  tests/phase4/tournament-operations.test.js tests/phase4/score-reliability.test.js \
  tests/phase4/notifications-finance.test.js \
  tests/tournament/ui-phase4-operations.contract.test.js
```

- [ ] **Step 3: Gỡ 4 script test mồ côi khỏi `package.json`**

Xoá bốn dòng script: `test:phase4-tournament-operations`, `test:phase4-score-reliability`, `test:phase4-notifications-finance`, `test:t-ui-phase4`.

Trong `test:regression`, xoá bốn lời gọi tương ứng: `&& npm run test:phase4-tournament-operations && npm run test:phase4-score-reliability && npm run test:phase4-notifications-finance && npm run test:t-ui-phase4`.

> Giữ `test:phase4` (`tests/multitenant-phase4.test.js`) — đó là Phase 4 của multi-tenant, việc khác hoàn toàn.

- [ ] **Step 4: Gỡ liên kết tới trang đã xoá**

Trong `app/giai-dau/v2/console/TournamentConsoleV2.js`, xoá cả nút:

```js
                <button type="button" className="v2-btn-primary v2-operations-link" onClick={() => router.push(`/giai-dau/v2/operations?t=${tournamentId}${activeStageId ? `&stage=${activeStageId}` : ''}`)}>
                    Bàn điều hành
                </button>
```

Nếu `router` không còn dùng ở chỗ nào khác trong file, xoá luôn `const router = useRouter();` và import.

- [ ] **Step 5: Chạy hồi quy để chắc không gãy gì**

Run: `npm run test:regression`
Expected: exit 0.

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add -A package.json app/giai-dau/v2/console/TournamentConsoleV2.js
git commit -m "chore(giai-dau): don ban nhap Phase 4 chua commit

Xoa lib/tournament/operations.js (56 dong), trang operations/ (96 dong) va 6
route chua spec nao dung. Tat ca deu chua tung commit nen git khong co ban ghi;
giu lai chi gay nham lan ve code nao dang chay that. Bang chuyen trang thai
dang giu da nam trong spec muc 6.3.

Go 4 script test mo coi khoi package.json va test:regression.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A2: Migration 044

**Files:**
- Create: `database/migrations/044_tournament_operations.sql`
- Test: `tests/tournament/migration-044.test.js`

- [ ] **Step 1: Kiểm dữ liệu trước khi thêm CHECK**

Chạy bằng Supabase MCP `execute_sql`:

```sql
select distinct result_type from tournament_matches;
select distinct status from tournament_matches;
```

Expected: **cả hai trả 0 dòng** (bảng rỗng). Nếu có giá trị nằm ngoài danh sách trong migration bên dưới, **dừng lại** và mở rộng CHECK cho khớp dữ liệu thật trước — không được để migration làm vỡ dữ liệu đang có.

- [ ] **Step 2: Viết test thất bại**

Create `tests/tournament/migration-044.test.js`:

```js
const fs = require('fs');
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const file = path.join(__dirname, '..', '..', 'database', 'migrations', '044_tournament_operations.sql');

assert(fs.existsSync(file), 'migration 044 tồn tại');
const sql = fs.readFileSync(file, 'utf8');

for (const col of ['warmup_started_at', 'started_at', 'ended_at']) {
  assert(new RegExp(`ADD COLUMN IF NOT EXISTS ${col} timestamptz`).test(sql), `thêm cột ${col}`);
}
assert(/DROP CONSTRAINT IF EXISTS tournament_matches_status_phase3_ck/.test(sql), 'gỡ CHECK cũ');
assert(/tournament_matches_status_phase4_ck/.test(sql), 'thêm CHECK mới');
for (const st of ['pending', 'warmup', 'live', 'paused', 'finalized']) {
  assert(new RegExp(`'${st}'`).test(sql), `CHECK có trạng thái ${st}`);
}
assert(!/'done'/.test(sql), "không đưa 'done' vào CHECK — đó là từ vựng nội bộ của engine");
assert(/tournament_matches_result_type_ck/.test(sql), 'CHECK cho result_type');
for (const rt of ['simple', 'mlp', 'team', 'walkover', 'retired']) {
  assert(new RegExp(`'${rt}'`).test(sql), `result_type có ${rt}`);
}
assert(!/DROP\s+TABLE/i.test(sql), 'không DROP TABLE');
assert(!/TRUNCATE/i.test(sql), 'không TRUNCATE');
assert(!/tournament_operation_logs/.test(sql), 'bảng nhật ký thuộc migration 043, không lặp ở đây');

console.log('migration-044 ok');
```

- [ ] **Step 3: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/migration-044.test.js`
Expected: FAIL — `migration 044 tồn tại`

- [ ] **Step 4: Viết migration**

Create `database/migrations/044_tournament_operations.sql`:

```sql
-- 044_tournament_operations.sql
-- Ban dieu hanh giai: moc thoi gian tran, mo rong trang thai tran, sieu chat
-- kieu ket qua. Idempotent; chi them cot va doi CHECK, khong DROP/TRUNCATE du lieu.
-- Bang tournament_operation_logs nam o migration 043.

-- 1. Moc thoi gian de chay dong ho tran va uoc tinh gio hoan tat.
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz;
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS started_at        timestamptz;
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS ended_at          timestamptz;

-- 2. Mo rong trang thai: them warmup va paused, GIU finalized.
--    'done' KHONG duoc dua vao: do la tu vung noi bo cua cac engine, co tang
--    dich rieng o standingsService.
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_phase3_ck;
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_phase4_ck;
ALTER TABLE public.tournament_matches ADD CONSTRAINT tournament_matches_status_phase4_ck
  CHECK (status IN ('pending','warmup','live','paused','finalized'));

-- 3. Kieu ket qua: truoc day NOT NULL DEFAULT 'simple' nhung khong co CHECK.
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_result_type_ck;
ALTER TABLE public.tournament_matches ADD CONSTRAINT tournament_matches_result_type_ck
  CHECK (result_type IN ('simple','mlp','team','walkover','retired'));

CREATE INDEX IF NOT EXISTS idx_tournament_matches_stage_status
  ON public.tournament_matches(group_id, stage_id, status);

COMMENT ON COLUMN public.tournament_matches.warmup_started_at IS 'Luc goi vao san, bat dau dem nguoc thu san';
COMMENT ON COLUMN public.tournament_matches.started_at IS 'Luc bat dau dau that su; dong ho tran dem tu day';
COMMENT ON COLUMN public.tournament_matches.ended_at IS 'Luc chot tran; dung tinh thoi luong tran trung binh';
COMMENT ON COLUMN public.tournament_matches.court IS 'DI SAN - nguon su that la tournament_match_assignments.court_id';
```

- [ ] **Step 5: Chạy test để thấy nó xanh**

Run: `node tests/tournament/migration-044.test.js`
Expected: `migration-044 ok`

- [ ] **Step 6: Apply và xác nhận**

Apply bằng Supabase MCP `apply_migration`, tên `044_tournament_operations`.

Xác nhận:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.tournament_matches'::regclass and contype = 'c';
```

Expected: thấy `tournament_matches_status_phase4_ck` với 5 giá trị, và `tournament_matches_result_type_ck` với 5 giá trị. **Không còn** `tournament_matches_status_phase3_ck`.

- [ ] **Step 7: Cập nhật sổ và commit**

```bash
npm run migration:ledger
git add database/migrations/044_tournament_operations.sql tests/tournament/migration-044.test.js
git commit -m "feat(db): moc thoi gian tran va mo rong trang thai (migration 044)

Them warmup_started_at/started_at/ended_at; trang thai tran thanh
pending|warmup|live|paused|finalized; them CHECK cho result_type (truoc day
NOT NULL nhung khong rang buoc gia tri). Da xac nhan bang rong truoc khi them
CHECK.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A3: `matchLifecycle.js`

**Files:**
- Create: `lib/tournament/matchLifecycle.js`
- Test: `tests/tournament/operations.test.js`

- [ ] **Step 1: Viết test thất bại**

Create `tests/tournament/operations.test.js`:

```js
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const L = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'matchLifecycle'));

// --- 8 cạnh hợp lệ ---
const OK = [
  ['pending', 'warmup'], ['warmup', 'pending'], ['warmup', 'live'],
  ['live', 'paused'], ['paused', 'live'], ['live', 'finalized'],
  ['warmup', 'finalized'], ['paused', 'finalized'],
];
for (const [from, to] of OK) {
  assert(L.canTransitionMatch(from, to).ok === true, `cạnh hợp lệ ${from} -> ${to}`);
}
assert(Object.values(L.MATCH_TRANSITIONS).reduce((n, m) => n + Object.keys(m).length, 0) === 8,
  'đúng 8 cạnh, không hơn không kém');

// --- cạnh cấm ---
for (const [from, to] of [['pending', 'live'], ['pending', 'finalized'], ['finalized', 'live'], ['finalized', 'pending'], ['live', 'pending']]) {
  const r = L.canTransitionMatch(from, to);
  assert(r.ok === false, `cạnh cấm ${from} -> ${to}`);
  assert(r.code === 'INVALID_MATCH_TRANSITION', `mã lỗi ${from} -> ${to}`);
}
assert(/khởi động/.test(L.canTransitionMatch('pending', 'live').message),
  'thông báo nói rõ phải qua khởi động');

// --- cạnh nào bắt lý do ---
assert(L.canTransitionMatch('warmup', 'pending').requiresReason === true, 'huỷ gọi bắt lý do');
assert(L.canTransitionMatch('warmup', 'finalized').requiresReason === true, 'walkover bắt lý do');
assert(L.canTransitionMatch('paused', 'finalized').requiresReason === true, 'bỏ giữa chừng bắt lý do');
assert(L.canTransitionMatch('live', 'finalized').requiresReason === false, 'chốt bình thường không bắt lý do');
assert(L.canTransitionMatch('pending', 'warmup').requiresReason === false, 'gọi sân không bắt lý do');

// --- result_type suy ra từ cạnh ---
assert(L.resultTypeFor('warmup', 'finalized') === 'walkover', 'bỏ cuộc trước khi đấu = walkover');
assert(L.resultTypeFor('paused', 'finalized') === 'retired', 'bỏ giữa chừng = retired');
assert(L.resultTypeFor('live', 'finalized') === null, 'chốt bình thường giữ result_type sẵn có');

// --- mốc thời gian phải ghi ở mỗi cạnh ---
const now = '2026-09-09T08:00:00.000Z';
assert(L.timestampsFor('pending', 'warmup', now).warmup_started_at === now, 'gọi sân ghi warmup_started_at');
assert(L.timestampsFor('warmup', 'live', now).started_at === now, 'bắt đầu đấu ghi started_at');
assert(L.timestampsFor('live', 'finalized', now).ended_at === now, 'chốt ghi ended_at');
assert(L.timestampsFor('warmup', 'pending', now).warmup_started_at === null, 'huỷ gọi xoá warmup_started_at');
assert(Object.keys(L.timestampsFor('live', 'paused', now)).length === 0, 'tạm dừng không đụng mốc nào');

// --- matchElapsed ---
const T0 = Date.parse('2026-09-09T08:00:00Z');
assert(L.matchElapsed({ status: 'live', started_at: '2026-09-09T08:00:00Z' }, T0 + 125000).seconds === 125,
  'trận đang đấu đếm từ started_at');
assert(L.matchElapsed({ status: 'paused', started_at: '2026-09-09T08:00:00Z' }, T0 + 125000).seconds === 125,
  'tạm dừng vẫn đếm — thời gian đó vẫn chiếm sân');
assert(L.matchElapsed({ status: 'finalized', started_at: '2026-09-09T08:00:00Z', ended_at: '2026-09-09T08:20:00Z' }, T0 + 999999).seconds === 1200,
  'trận đã chốt lấy ended_at - started_at');
const warm = L.matchElapsed({ status: 'warmup', warmup_started_at: '2026-09-09T08:00:00Z' }, T0 + 60000, { warmupMinutes: 4 });
assert(warm.countdownSeconds === 180, 'khởi động đếm ngược đúng');
const warmOver = L.matchElapsed({ status: 'warmup', warmup_started_at: '2026-09-09T08:00:00Z' }, T0 + 600000, { warmupMinutes: 4 });
assert(warmOver.countdownSeconds === 0, 'hết giờ khởi động trả 0, không âm');
assert(L.matchElapsed({ status: 'pending' }, T0).seconds === null, 'trận chưa gọi không có đồng hồ');
assert(L.matchElapsed({ status: 'live', started_at: null }, T0).seconds === null, 'thiếu started_at trả null, không NaN');

console.log('operations ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/operations.test.js`
Expected: FAIL — `Cannot find module '.../lib/tournament/matchLifecycle'`

- [ ] **Step 3: Viết module**

Create `lib/tournament/matchLifecycle.js`:

```js
'use strict';
// Vòng đời một trận trong ngày thi đấu. Thuần, không I/O.
// 5 trạng thái khớp CHECK tournament_matches_status_phase4_ck.

const MATCH_STATUSES = Object.freeze(['pending', 'warmup', 'live', 'paused', 'finalized']);

const MATCH_STATUS_LABELS = Object.freeze({
  pending: 'Chưa gọi',
  warmup: 'Khởi động',
  live: 'Đang đấu',
  paused: 'Tạm dừng',
  finalized: 'Đã chốt',
});

// Đúng 8 cạnh. requiresReason: cạnh nào xoá dấu vết hoặc kết thúc bất thường
// thì phải nói lý do — người trên sân có quyền biết vì sao.
const MATCH_TRANSITIONS = Object.freeze({
  pending: Object.freeze({
    warmup: { requiresReason: false, action: 'match_called' },
  }),
  warmup: Object.freeze({
    live: { requiresReason: false, action: 'match_started' },
    pending: { requiresReason: true, action: 'match_call_cancelled' },
    finalized: { requiresReason: true, action: 'match_walkover', resultType: 'walkover' },
  }),
  live: Object.freeze({
    paused: { requiresReason: false, action: 'match_paused' },
    finalized: { requiresReason: false, action: 'match_finalized' },
  }),
  paused: Object.freeze({
    live: { requiresReason: false, action: 'match_resumed' },
    finalized: { requiresReason: true, action: 'match_retired', resultType: 'retired' },
  }),
  finalized: Object.freeze({}),
});

function edge(from, to) {
  return (MATCH_TRANSITIONS[from] || {})[to] || null;
}

function canTransitionMatch(from, to) {
  if (!MATCH_STATUSES.includes(from) || !MATCH_STATUSES.includes(to)) {
    return {
      ok: false,
      code: 'INVALID_MATCH_STATUS',
      requiresReason: false,
      action: null,
      message: `Trạng thái trận không hợp lệ. Chỉ nhận: ${MATCH_STATUSES.join(', ')}.`,
    };
  }
  const found = edge(from, to);
  if (!found) {
    const extra = from === 'pending' && to === 'live'
      ? ' Mọi trận phải đi qua bước khởi động để có mốc tính thời gian chiếm sân.'
      : '';
    const next = Object.keys(MATCH_TRANSITIONS[from]);
    const list = next.length ? next.map((s) => MATCH_STATUS_LABELS[s]).join(', ') : 'không đi đâu được nữa';
    return {
      ok: false,
      code: 'INVALID_MATCH_TRANSITION',
      requiresReason: false,
      action: null,
      message: `Trận đang ở "${MATCH_STATUS_LABELS[from]}", chỉ chuyển sang: ${list}.${extra}`,
    };
  }
  return {
    ok: true,
    code: null,
    requiresReason: found.requiresReason,
    action: found.action,
    message: null,
  };
}

function resultTypeFor(from, to) {
  const found = edge(from, to);
  return found && found.resultType ? found.resultType : null;
}

// Mốc thời gian phải ghi khi đi qua một cạnh. Trả object rỗng nếu cạnh không
// đụng mốc nào (ví dụ tạm dừng).
function timestampsFor(from, to, nowIso) {
  if (from === 'pending' && to === 'warmup') return { warmup_started_at: nowIso };
  if (from === 'warmup' && to === 'pending') return { warmup_started_at: null };
  if (from === 'warmup' && to === 'live') return { started_at: nowIso };
  if (to === 'finalized') return { ended_at: nowIso };
  return {};
}

function toMs(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// Trả cả đồng hồ đếm lên (trận) và đếm ngược (khởi động).
// Trận tạm dừng VẪN đếm: thời gian đó vẫn đang chiếm sân.
function matchElapsed(match = {}, nowMs = Date.now(), options = {}) {
  const status = match.status;
  const warmupMinutes = Number(options.warmupMinutes || 0);

  if (status === 'warmup') {
    const start = toMs(match.warmup_started_at);
    if (start == null) return { seconds: null, countdownSeconds: null };
    const remain = Math.round((start + warmupMinutes * 60000 - nowMs) / 1000);
    return { seconds: null, countdownSeconds: Math.max(0, remain) };
  }

  if (status === 'live' || status === 'paused') {
    const start = toMs(match.started_at);
    if (start == null) return { seconds: null, countdownSeconds: null };
    return { seconds: Math.round((nowMs - start) / 1000), countdownSeconds: null };
  }

  if (status === 'finalized') {
    const start = toMs(match.started_at);
    const end = toMs(match.ended_at);
    if (start == null || end == null) return { seconds: null, countdownSeconds: null };
    return { seconds: Math.round((end - start) / 1000), countdownSeconds: null };
  }

  return { seconds: null, countdownSeconds: null };
}

module.exports = {
  MATCH_STATUSES,
  MATCH_STATUS_LABELS,
  MATCH_TRANSITIONS,
  canTransitionMatch,
  resultTypeFor,
  timestampsFor,
  matchElapsed,
};
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/operations.test.js`
Expected: `operations ok`

- [ ] **Step 5: Commit**

```bash
git add lib/tournament/matchLifecycle.js tests/tournament/operations.test.js
git commit -m "feat(giai-dau): vong doi tran trong ngay thi dau

5 trang thai, dung 8 canh. pending -> live bi cam: moi tran phai qua khoi dong
de co moc tinh thoi gian chiem san. Ba canh bat ly do: huy goi (xoa dau mot lan
goi san da phat tren mic), walkover, bo giua chung.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task A4: `courtBoard.js`

**Files:**
- Create: `lib/tournament/courtBoard.js`
- Modify: `tests/tournament/operations.test.js`

- [ ] **Step 1: Thêm test thất bại**

Chèn trước `console.log('operations ok');`:

```js
// ---- courtBoard ----
const C = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'courtBoard'));

// --- computeCourtState ---
const court = { id: 1, label: 'Sân 01', active: true };
assert(C.computeCourtState(court, [{ status: 'live' }], 3).state === 'playing', 'có trận live -> playing');
assert(C.computeCourtState(court, [{ status: 'warmup' }], 3).state === 'warming', 'có trận warmup -> warming');
assert(C.computeCourtState(court, [{ status: 'paused' }], 3).state === 'playing', 'tạm dừng vẫn coi là bận');
assert(C.computeCourtState(court, [], 3).state === 'needs_call', 'trống + hàng đợi còn trận -> needs_call');
assert(C.computeCourtState(court, [], 0).state === 'idle', 'trống + hàng đợi rỗng -> idle');
assert(C.computeCourtState({ ...court, active: false }, [], 3).state === 'off', 'sân tắt -> off');
assert(C.computeCourtState({ ...court, active: false }, [{ status: 'live' }], 3).state === 'playing',
  'sân tắt nhưng còn trận đang đấu thì vẫn hiện đang đấu, không giấu đi');

// --- projectSchedule ---
const NOW = Date.parse('2026-09-09T08:00:00Z');
const proj = C.projectSchedule({
  courts: [{ id: 1, active: true }, { id: 2, active: true }],
  runningByCourt: {},
  queue: [{ id: 11 }, { id: 12 }, { id: 13 }],
  matchMinutes: 20,
  now: NOW,
});
assert(proj.byMatchId[11] === NOW, 'trận đầu vào sân trống ngay');
assert(proj.byMatchId[12] === NOW, 'trận thứ hai vào sân còn lại ngay');
assert(proj.byMatchId[13] === NOW + 20 * 60000, 'trận thứ ba đợi sân rảnh');
assert(proj.finishAt === NOW + 40 * 60000, 'ước tính hoàn tất là lúc trận cuối xong');

const proj1 = C.projectSchedule({
  courts: [{ id: 1, active: true }],
  runningByCourt: {},
  queue: [{ id: 11 }, { id: 12 }, { id: 13 }],
  matchMinutes: 20,
  now: NOW,
});
assert(proj1.finishAt === NOW + 60 * 60000, 'ít sân hơn thì xong muộn hơn');
assert(proj1.finishAt - proj.finishAt === 20 * 60000, 'bớt 1 trong 2 sân, 3 trận thì lùi đúng 20 phút');

const projRunning = C.projectSchedule({
  courts: [{ id: 1, active: true }],
  runningByCourt: { 1: { started_at: '2026-09-09T07:50:00Z' } },
  queue: [{ id: 11 }],
  matchMinutes: 20,
  now: NOW,
});
assert(projRunning.byMatchId[11] === NOW + 10 * 60000, 'đợi trận đang chạy trên sân xong');

const projLocked = C.projectSchedule({
  courts: [{ id: 1, active: true }],
  runningByCourt: {},
  queue: [{ id: 11, locked_start: '2026-09-09T09:00:00Z' }, { id: 12 }],
  matchMinutes: 20,
  now: NOW,
});
assert(projLocked.byMatchId[11] === Date.parse('2026-09-09T09:00:00Z'), 'trận ghim giữ đúng giờ ghim');
assert(projLocked.byMatchId[12] === NOW, 'trận khác không bị trận ghim chặn, dùng sân sớm hơn');

assert(C.projectSchedule({ courts: [], runningByCourt: {}, queue: [{ id: 1 }], matchMinutes: 20, now: NOW }).finishAt === null,
  'không sân nào thì không ước tính được');

// --- averageMatchMinutes ---
assert(C.averageMatchMinutes([
  { status: 'finalized', started_at: '2026-09-09T08:00:00Z', ended_at: '2026-09-09T08:20:00Z' },
  { status: 'finalized', started_at: '2026-09-09T08:00:00Z', ended_at: '2026-09-09T08:30:00Z' },
]) === 25, 'trung bình 20 và 30 phút');
assert(C.averageMatchMinutes([
  { status: 'finalized', started_at: '2026-09-09T08:00:00Z', ended_at: '2026-09-09T08:20:00Z' },
  { status: 'finalized', started_at: null, ended_at: '2026-09-09T08:30:00Z' },
]) === 20, 'bỏ qua trận thiếu mốc');
assert(C.averageMatchMinutes([]) === null, 'chưa trận nào xong thì trả null, không NaN');
assert(C.averageMatchMinutes([{ status: 'live', started_at: '2026-09-09T08:00:00Z' }]) === null, 'trận chưa chốt không tính');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/operations.test.js`
Expected: FAIL — `Cannot find module '.../lib/tournament/courtBoard'`

- [ ] **Step 3: Viết module**

Create `lib/tournament/courtBoard.js`:

```js
'use strict';
// Bảng sân và giờ dự kiến. Thuần, không I/O.
// Trạng thái sân KHÔNG lưu ở đâu cả — suy ra từ trận đang gán, nhờ vậy không
// bao giờ lệch với trận. Giờ dự kiến cũng không lưu: nó đổi mỗi khi có trận
// kết thúc sớm/muộn hoặc sân bật/tắt, lưu xuống là tự chuốc dữ liệu lệch.

const BUSY = new Set(['live', 'paused']);

function computeCourtState(court, matchesOnCourt, queueLength) {
  const list = matchesOnCourt || [];
  if (list.some((m) => BUSY.has(m.status))) {
    return { state: 'playing', label: 'Đang đấu' };
  }
  if (list.some((m) => m.status === 'warmup')) {
    return { state: 'warming', label: 'Khởi động' };
  }
  if (court && court.active === false) {
    return { state: 'off', label: 'Ngưng dùng' };
  }
  if (Number(queueLength) > 0) {
    return { state: 'needs_call', label: 'Trống — cần gọi' };
  }
  return { state: 'idle', label: 'Trống' };
}

// Gán từng trận trong hàng đợi vào sân rảnh sớm nhất, cộng dồn thời lượng.
// Trận có locked_start được tôn trọng và các trận khác né ra.
function projectSchedule({ courts, runningByCourt, queue, matchMinutes, now }) {
  const active = (courts || []).filter((c) => c.active !== false);
  if (active.length === 0) return { byMatchId: {}, finishAt: null };

  const duration = Number(matchMinutes) * 60000;
  const freeAt = new Map();
  for (const court of active) {
    const running = (runningByCourt || {})[court.id];
    if (running && running.started_at) {
      const start = Date.parse(running.started_at);
      freeAt.set(court.id, Number.isFinite(start) ? Math.max(now, start + duration) : now);
    } else {
      freeAt.set(court.id, now);
    }
  }

  const byMatchId = {};
  let finishAt = null;
  for (const match of queue || []) {
    let bestCourt = null;
    let bestTime = Infinity;
    for (const [courtId, time] of freeAt.entries()) {
      if (time < bestTime) { bestTime = time; bestCourt = courtId; }
    }
    const locked = match.locked_start ? Date.parse(match.locked_start) : null;
    const start = Number.isFinite(locked) && locked !== null ? Math.max(locked, now) : bestTime;
    byMatchId[match.id] = start;
    freeAt.set(bestCourt, start + duration);
    const end = start + duration;
    if (finishAt === null || end > finishAt) finishAt = end;
  }
  return { byMatchId, finishAt };
}

function averageMatchMinutes(matches) {
  let total = 0;
  let count = 0;
  for (const match of matches || []) {
    if (match.status !== 'finalized') continue;
    const start = match.started_at ? Date.parse(match.started_at) : NaN;
    const end = match.ended_at ? Date.parse(match.ended_at) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    total += (end - start) / 60000;
    count += 1;
  }
  return count === 0 ? null : Math.round(total / count);
}

module.exports = { computeCourtState, projectSchedule, averageMatchMinutes };
```

- [ ] **Step 4: Chạy test để thấy nó xanh**

Run: `node tests/tournament/operations.test.js`
Expected: `operations ok`

- [ ] **Step 5: Nối vào bộ test và commit**

Thêm vào `package.json`:

```json
    "test:t-operations": "node tests/tournament/operations.test.js && node tests/tournament/migration-044.test.js",
```

Thêm `npm run test:t-operations` vào `test:tournament` trước `npm run test:t-engines`.

```bash
git add lib/tournament/courtBoard.js tests/tournament/operations.test.js package.json
git commit -m "feat(giai-dau): trang thai san va gio du kien, deu suy ra khong luu

computeCourtState suy tu tran dang gan nen khong bao gio lech. projectSchedule
tinh gio du kien khi doc; tran ghim gio duoc ton trong va cac tran khac ne ra.
averageMatchMinutes tra null thay vi NaN khi chua tran nao xong.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# NHÓM B — API

## Task B1: Route `venues` và `courts`

**Files:**
- Create: `app/api/tournament-v2/venues/route.js`
- Create: `app/api/tournament-v2/courts/route.js`
- Create: `tests/tournament/api-courts.contract.test.js`
- Modify: `lib/tournamentV2Client.js`

- [ ] **Step 1: Viết test thất bại**

Create `tests/tournament/api-courts.contract.test.js`:

```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

for (const f of ['app/api/tournament-v2/venues/route.js', 'app/api/tournament-v2/courts/route.js']) {
  assert(exists(f), `${f} tồn tại`);
  const s = read(f);
  assert(/requireTournamentAccess|requireValidatedGroupAdmin/.test(s), `${f} có guard`);
  assert(/\.eq\('group_id'/.test(s), `${f} scope theo group_id`);
  assert(!/DROP|TRUNCATE/i.test(s), `${f} không có lệnh phá dữ liệu`);
}

const courts = read('app/api/tournament-v2/courts/route.js');
assert(/COURT_IN_USE/.test(courts), 'chặn xoá sân đang vướng trận');
assert(/COURT_HAS_ACTIVE_MATCH/.test(courts), 'chặn tắt sân đang có trận');
assert(/export async function DELETE/.test(courts), 'có DELETE');
assert(/active/.test(courts), 'bật/tắt sân qua cột active');
assert(/eq\('active',\s*true\)/.test(courts), 'tắt sân bằng ghi có điều kiện trên active');
assert(!/availability/.test(courts), 'không dùng cột availability — spec đã loại');

const client = read('lib/tournamentV2Client.js');
for (const fn of ['listVenues', 'saveVenue', 'listCourts', 'saveCourt', 'setCourtActive', 'deleteCourt']) {
  assert(new RegExp(fn).test(client), `client có ${fn}`);
}

console.log('api-courts contract ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-courts.contract.test.js`
Expected: FAIL — `app/api/tournament-v2/venues/route.js tồn tại`

- [ ] **Step 3: Viết `venues/route.js`**

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';

const db = supabaseAdmin || supabaseServer;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
        const access = await requireTournamentAccess({ tournamentId, need: 'read' });
        if (!access.ok) return access.response;

        const { data, error } = await db
            .from('tournament_venues')
            .select('id, name, address, timezone, contact, map_link')
            .eq('group_id', access.groupId)
            .eq('tournament_id', tournamentId)
            .order('id');
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ venues: data || [] });
    } catch (err) {
        console.error('Venues GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const tournamentId = body?.tournament_id;
        const name = String(body?.name || '').trim();
        if (!tournamentId) return NextResponse.json({ error: 'tournament_id là bắt buộc' }, { status: 400 });
        if (!name) return NextResponse.json({ error: 'Tên địa điểm là bắt buộc' }, { status: 400 });
        const access = await requireTournamentAccess({ tournamentId, need: 'write' });
        if (!access.ok) return access.response;

        const payload = {
            group_id: access.groupId,
            tournament_id: tournamentId,
            name,
            address: String(body?.address || '').trim() || null,
            contact: String(body?.contact || '').trim() || null,
            map_link: String(body?.map_link || '').trim() || null,
        };

        const query = body?.id
            ? db.from('tournament_venues').update(payload).eq('id', body.id).eq('group_id', access.groupId)
            : db.from('tournament_venues').insert(payload);
        const { data, error } = await query.select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ venue: data });
    } catch (err) {
        console.error('Venues POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
```

- [ ] **Step 4: Viết `courts/route.js`**

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';

const db = supabaseAdmin || supabaseServer;

const BLOCKING_STATUSES = ['warmup', 'live', 'paused'];

// Trận đang vướng ở một sân. Dùng cho cả guard tắt sân lẫn guard xoá sân.
async function matchesOnCourt(courtId, groupId, statuses) {
    const { data: assignments, error: aErr } = await db
        .from('tournament_match_assignments')
        .select('match_id')
        .eq('group_id', groupId)
        .eq('court_id', courtId);
    if (aErr) throw aErr;
    const matchIds = (assignments || []).map((a) => a.match_id).filter(Boolean);
    if (matchIds.length === 0) return [];

    const { data: matches, error: mErr } = await db
        .from('tournament_matches')
        .select('id, status')
        .eq('group_id', groupId)
        .in('id', matchIds)
        .in('status', statuses);
    if (mErr) throw mErr;
    return matches || [];
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
        const access = await requireTournamentAccess({ tournamentId, need: 'read' });
        if (!access.ok) return access.response;

        const { data, error } = await db
            .from('tournament_courts')
            .select('id, venue_id, label, surface, active')
            .eq('group_id', access.groupId)
            .eq('tournament_id', tournamentId)
            .order('label');
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ courts: data || [] });
    } catch (err) {
        console.error('Courts GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const tournamentId = body?.tournament_id;
        const venueId = body?.venue_id;
        const label = String(body?.label || '').trim();
        if (!tournamentId || !venueId) {
            return NextResponse.json({ error: 'tournament_id và venue_id là bắt buộc' }, { status: 400 });
        }
        if (!label) return NextResponse.json({ error: 'Tên sân là bắt buộc' }, { status: 400 });
        const access = await requireTournamentAccess({ tournamentId, need: 'write' });
        if (!access.ok) return access.response;

        const payload = {
            group_id: access.groupId,
            tournament_id: tournamentId,
            venue_id: venueId,
            label,
            surface: String(body?.surface || '').trim() || null,
        };
        const query = body?.id
            ? db.from('tournament_courts').update(payload).eq('id', body.id).eq('group_id', access.groupId)
            : db.from('tournament_courts').insert(payload);
        const { data, error } = await query.select().single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ court: data });
    } catch (err) {
        console.error('Courts POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// Bật/tắt sân.
export async function PATCH(request) {
    try {
        const body = await request.json();
        const tournamentId = body?.tournament_id;
        const courtId = body?.id;
        const nextActive = body?.active === true;
        const reason = String(body?.reason || '').trim();
        if (!tournamentId || !courtId) {
            return NextResponse.json({ error: 'tournament_id và id là bắt buộc' }, { status: 400 });
        }
        const access = await requireTournamentAccess({ tournamentId, need: 'write' });
        if (!access.ok) return access.response;

        if (!nextActive) {
            if (!reason) {
                return NextResponse.json({
                    error: 'Tắt sân giữa giải phải nói lý do — VĐV đang chờ ở sân đó cần biết vì sao.',
                    code: 'REASON_REQUIRED',
                }, { status: 400 });
            }
            const blocking = await matchesOnCourt(courtId, access.groupId, BLOCKING_STATUSES);
            if (blocking.length > 0) {
                return NextResponse.json({
                    error: `Sân này đang có ${blocking.length} trận chưa xong. Chốt hoặc chuyển trận sang sân khác trước.`,
                    code: 'COURT_HAS_ACTIVE_MATCH',
                }, { status: 409 });
            }
        }

        // Ghi có điều kiện: 0 dòng nghĩa là ai đó vừa đổi trước, coi như đã xong.
        const { data, error } = await db
            .from('tournament_courts')
            .update({ active: nextActive })
            .eq('id', courtId)
            .eq('group_id', access.groupId)
            .eq('active', !nextActive)
            .select()
            .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        if (data) {
            // Sân vừa tắt: gỡ các trận CHƯA GỌI khỏi sân, đẩy về hàng đợi.
            // Không xoá bản ghi assignment, chỉ bỏ court_id.
            if (!nextActive) {
                const pending = await matchesOnCourt(courtId, access.groupId, ['pending']);
                if (pending.length > 0) {
                    const { error: clearErr } = await db
                        .from('tournament_match_assignments')
                        .update({ court_id: null })
                        .eq('group_id', access.groupId)
                        .eq('court_id', courtId)
                        .in('match_id', pending.map((m) => m.id));
                    if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 });
                }
            }
            const logged = await writeOperationLog(db, {
                groupId: access.groupId,
                tournamentId: Number(tournamentId),
                actor: access.actor || 'admin',
                action: 'court_toggled',
                targetType: 'court',
                targetId: Number(courtId),
                before: { active: !nextActive },
                after: { active: nextActive },
                reason: reason || null,
            });
            if (!logged.ok) console.error('Ghi nhật ký bật/tắt sân lỗi:', logged.error);
        }

        return NextResponse.json({ success: true, court: data || null, already: !data });
    } catch (err) {
        console.error('Courts PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        const courtId = searchParams.get('id');
        if (!tournamentId || !courtId) {
            return NextResponse.json({ error: 'tournamentId và id là bắt buộc' }, { status: 400 });
        }
        const access = await requireTournamentAccess({ tournamentId, need: 'write' });
        if (!access.ok) return access.response;

        const { data: court, error: courtErr } = await db
            .from('tournament_courts')
            .select('id, label, active')
            .eq('id', courtId)
            .eq('group_id', access.groupId)
            .maybeSingle();
        if (courtErr) return NextResponse.json({ error: courtErr.message }, { status: 500 });
        if (!court) return NextResponse.json({ error: 'Không tìm thấy sân' }, { status: 404 });

        if (court.active) {
            return NextResponse.json({
                error: `${court.label} đang bật. Tắt sân trước rồi mới xoá được.`,
                code: 'COURT_IN_USE',
            }, { status: 409 });
        }
        const vướng = await matchesOnCourt(courtId, access.groupId, ['pending', ...BLOCKING_STATUSES, 'finalized']);
        if (vướng.length > 0) {
            return NextResponse.json({
                error: `${court.label} đã dùng cho ${vướng.length} trận trong giải này. Không xoá được — cứ để tắt để giữ lịch sử.`,
                code: 'COURT_IN_USE',
            }, { status: 409 });
        }

        const { error } = await db
            .from('tournament_courts')
            .delete()
            .eq('id', courtId)
            .eq('group_id', access.groupId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Courts DELETE error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
```

> Đổi tên biến `vướng` thành `blocked` khi viết — tránh dấu tiếng Việt trong tên biến. Giữ nội dung logic y nguyên.

- [ ] **Step 5: Thêm 6 hàm vào client**

Trong `lib/tournamentV2Client.js`:

```js
// --- Địa điểm và sân ---

export async function listVenues(tournamentId) {
    const data = await request('/venues', { query: { tournamentId } });
    return data.venues;
}

export function saveVenue(body) {
    return request('/venues', { method: 'POST', body });
}

export async function listCourts(tournamentId) {
    const data = await request('/courts', { query: { tournamentId } });
    return data.courts;
}

export function saveCourt(body) {
    return request('/courts', { method: 'POST', body });
}

export function setCourtActive(body) {
    return request('/courts', { method: 'PATCH', body });
}

export function deleteCourt(tournamentId, id) {
    return request('/courts', { method: 'DELETE', query: { tournamentId, id } });
}
```

- [ ] **Step 6: Chạy test để thấy nó xanh**

Run: `node tests/tournament/api-courts.contract.test.js`
Expected: `api-courts contract ok`

- [ ] **Step 7: Commit**

```bash
git add app/api/tournament-v2/venues app/api/tournament-v2/courts lib/tournamentV2Client.js tests/tournament/api-courts.contract.test.js
git commit -m "feat(api): route venues va courts

Tat san bat ly do va chan khi san dang co tran chua xong; xoa san chi khi da
tat va chua tung dung cho tran nao. Tat san thi tran CHUA GOI tu day ve hang
doi (bo court_id, khong xoa ban ghi). Ghi co dieu kien tren cot active de hai
tab khong de nhau.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task B2: Route `match-transition`

**Files:**
- Create: `app/api/tournament-v2/match-transition/route.js`
- Create: `tests/tournament/api-match-transition.contract.test.js`
- Modify: `lib/tournamentV2Client.js`

- [ ] **Step 1: Viết test thất bại**

Create `tests/tournament/api-match-transition.contract.test.js`:

```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/api/tournament-v2/match-transition/route.js';
assert(exists(f), 'route match-transition tồn tại');
const s = read(f);

assert(/canTransitionMatch/.test(s), 'dùng máy trạng thái thuần');
assert(/timestampsFor/.test(s), 'ghi mốc thời gian theo cạnh');
assert(/resultTypeFor/.test(s), 'suy result_type từ cạnh');
assert(/REASON_REQUIRED/.test(s), 'cạnh bắt lý do thì chặn khi thiếu');
assert(/MATCH_VERSION_CONFLICT/.test(s), 'chống ghi đè đồng thời bằng version');
assert(/eq\('version'/.test(s), 'ghi có điều kiện trên version');
assert(/version:\s*.*\+\s*1|version\s*\+\s*1/.test(s), 'tăng version sau khi ghi');
assert(/writeOperationLog/.test(s), 'ghi nhật ký mỗi lần đổi trạng thái');
assert(/\.eq\('group_id'/.test(s), 'scope theo group_id');
assert(/requireTournamentAccess|requireValidatedGroupAdmin/.test(s), 'có guard');

const client = read('lib/tournamentV2Client.js');
assert(/transitionMatch/.test(client), 'client có transitionMatch');

console.log('api-match-transition contract ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-match-transition.contract.test.js`
Expected: FAIL — `route match-transition tồn tại`

- [ ] **Step 3: Viết route**

Create `app/api/tournament-v2/match-transition/route.js`:

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { writeOperationLog } from '@/lib/tournament/operationLog';
import {
    canTransitionMatch,
    resultTypeFor,
    timestampsFor,
} from '@/lib/tournament/matchLifecycle';

const db = supabaseAdmin || supabaseServer;

export async function POST(request) {
    try {
        const body = await request.json();
        const matchId = body?.match_id;
        const to = body?.to;
        const reason = String(body?.reason || '').trim();
        const courtId = body?.court_id == null ? undefined : body.court_id;
        const expectedVersion = body?.expected_version == null ? null : Number(body.expected_version);
        if (!matchId || !to) {
            return NextResponse.json({ error: 'match_id và to là bắt buộc' }, { status: 400 });
        }

        // tournament_matches không có tournament_id — đi qua stage.
        const { data: match, error: matchErr } = await db
            .from('tournament_matches')
            .select('id, group_id, stage_id, status, version, result_type, court')
            .eq('id', matchId)
            .maybeSingle();
        if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });
        if (!match) return NextResponse.json({ error: 'Không tìm thấy trận' }, { status: 404 });

        const { data: stage, error: stageErr } = await db
            .from('tournament_stages')
            .select('id, tournament_id, division_id')
            .eq('id', match.stage_id)
            .maybeSingle();
        if (stageErr) return NextResponse.json({ error: stageErr.message }, { status: 500 });
        if (!stage) return NextResponse.json({ error: 'Không tìm thấy giai đoạn' }, { status: 404 });

        const access = await requireTournamentAccess({ tournamentId: stage.tournament_id, need: 'write' });
        if (!access.ok) return access.response;

        const verdict = canTransitionMatch(match.status, to);
        if (!verdict.ok) {
            return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: 400 });
        }
        if (verdict.requiresReason && !reason) {
            return NextResponse.json({
                error: 'Thao tác này phải nhập lý do.',
                code: 'REASON_REQUIRED',
            }, { status: 400 });
        }

        const nowIso = new Date().toISOString();
        const patch = {
            status: to,
            version: Number(match.version) + 1,
            ...timestampsFor(match.status, to, nowIso),
        };
        const nextResultType = resultTypeFor(match.status, to);
        if (nextResultType) patch.result_type = nextResultType;

        let query = db
            .from('tournament_matches')
            .update(patch)
            .eq('id', matchId)
            .eq('group_id', access.groupId);
        if (expectedVersion !== null) query = query.eq('version', expectedVersion);
        else query = query.eq('version', match.version);

        const { data: updated, error: updateErr } = await query.select().maybeSingle();
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
        if (!updated) {
            return NextResponse.json({
                error: 'Trận này vừa được người khác cập nhật. Tải lại rồi thử lại.',
                code: 'MATCH_VERSION_CONFLICT',
            }, { status: 409 });
        }

        // Gọi vào sân thì gán sân luôn, trong cùng thao tác.
        if (courtId !== undefined && match.status === 'pending' && to === 'warmup') {
            const { data: courtRow } = await db
                .from('tournament_courts')
                .select('id, label')
                .eq('id', courtId)
                .eq('group_id', access.groupId)
                .maybeSingle();

            const { error: assignErr } = await db
                .from('tournament_match_assignments')
                .upsert({
                    group_id: access.groupId,
                    tournament_id: stage.tournament_id,
                    division_id: stage.division_id,
                    match_id: Number(matchId),
                    court_id: courtId,
                }, { onConflict: 'match_id' });
            if (assignErr) console.error('Gán sân lỗi:', assignErr.message);

            // matches.court là cột DI SẢN mà trang công khai và vài component cũ
            // vẫn đọc. Ghi kèm nhãn sân để không vỡ, dù nguồn sự thật là
            // tournament_match_assignments.court_id.
            if (courtRow) {
                await db.from('tournament_matches')
                    .update({ court: courtRow.label })
                    .eq('id', matchId).eq('group_id', access.groupId);
            }
        }

        const logged = await writeOperationLog(db, {
            groupId: access.groupId,
            tournamentId: stage.tournament_id,
            divisionId: stage.division_id,
            actor: access.actor || 'admin',
            action: verdict.action,
            targetType: 'match',
            targetId: Number(matchId),
            before: { status: match.status },
            after: { status: to, result_type: nextResultType || match.result_type },
            reason: reason || null,
        });
        if (!logged.ok) console.error('Ghi nhật ký đổi trạng thái trận lỗi:', logged.error);

        return NextResponse.json({ success: true, match: updated });
    } catch (err) {
        console.error('Match transition error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
```

> **Kiểm trước:** `upsert(..., { onConflict: 'match_id' })` cần một unique index trên `tournament_match_assignments.match_id`. Chạy:
> ```sql
> select indexname, indexdef from pg_indexes
> where schemaname='public' and tablename='tournament_match_assignments';
> ```
> Nếu **không có** unique trên `match_id`, thêm vào migration 044 dòng:
> `CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_match_assignments_match ON public.tournament_match_assignments(match_id);`
> rồi apply lại. Bảng đang rỗng nên an toàn.

- [ ] **Step 4: Thêm hàm client**

```js
export function transitionMatch(body) {
    return request('/match-transition', { method: 'POST', body });
}
```

- [ ] **Step 5: Chạy test để thấy nó xanh**

Run: `node tests/tournament/api-match-transition.contract.test.js`
Expected: PASS

- [ ] **Step 6: Kiểm thật trên DB**

Trên một trận test, gọi lần lượt: `pending → warmup` (kèm `court_id`), `warmup → live`, `live → paused`, `paused → live`, rồi `live → finalized`.

Sau mỗi bước xác nhận:

```sql
select id, status, version, warmup_started_at, started_at, ended_at, result_type, court
from tournament_matches where id = <MATCH_ID>;
```

Rồi thử một cạnh cấm: `pending → live`.
Expected: **400** `INVALID_MATCH_TRANSITION`, thông báo nói rõ phải qua khởi động.

Thử `paused → finalized` không kèm `reason`.
Expected: **400** `REASON_REQUIRED`.

- [ ] **Step 7: Commit**

```bash
git add app/api/tournament-v2/match-transition lib/tournamentV2Client.js tests/tournament/api-match-transition.contract.test.js
git commit -m "feat(api): mot cua cho moi doi trang thai tran

Moi canh di qua canTransitionMatch; moc thoi gian va result_type suy tu canh
chu khong do client gui. Ghi co dieu kien tren version -> 409 khi hai nguoi
cung sua. Goi vao san ghi kem nhan san vao cot di san matches.court de trang
cong khai khong vo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task B3: Route `assignments` và `operation-logs`

**Files:**
- Create: `app/api/tournament-v2/assignments/route.js`
- Create: `app/api/tournament-v2/operation-logs/route.js`
- Modify: `tests/tournament/api-courts.contract.test.js`
- Modify: `lib/tournamentV2Client.js`

- [ ] **Step 1: Thêm test thất bại**

Thêm vào `tests/tournament/api-courts.contract.test.js` trước `console.log`:

```js
for (const f of ['app/api/tournament-v2/assignments/route.js', 'app/api/tournament-v2/operation-logs/route.js']) {
  assert(exists(f), `${f} tồn tại`);
  const src = read(f);
  assert(/requireTournamentAccess/.test(src), `${f} có guard`);
  assert(/\.eq\('group_id'/.test(src), `${f} scope theo group_id`);
}
const logs = read('app/api/tournament-v2/operation-logs/route.js');
assert(!/export async function (POST|PATCH|DELETE)/.test(logs), 'nhật ký chỉ đọc, không cho sửa/xoá');
const assigns = read('app/api/tournament-v2/assignments/route.js');
assert(/projectSchedule/.test(assigns), 'trả giờ dự kiến suy ra');
assert(!/scheduled_start:\s*proj|update.*scheduled_start/.test(assigns), 'không lưu giờ dự kiến xuống DB');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/api-courts.contract.test.js`
Expected: FAIL — `app/api/tournament-v2/assignments/route.js tồn tại`

- [ ] **Step 3: Viết `assignments/route.js`**

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { projectSchedule, computeCourtState, averageMatchMinutes } from '@/lib/tournament/courtBoard';

const db = supabaseAdmin || supabaseServer;

const DEFAULT_MATCH_MINUTES = 22;
const DEFAULT_WARMUP_MINUTES = 4;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
        const access = await requireTournamentAccess({ tournamentId, need: 'read' });
        if (!access.ok) return access.response;

        const [tournamentResult, courtResult, stageResult] = await Promise.all([
            db.from('tournaments').select('id, settings')
                .eq('id', tournamentId).eq('group_id', access.groupId).maybeSingle(),
            db.from('tournament_courts').select('id, label, surface, active')
                .eq('group_id', access.groupId).eq('tournament_id', tournamentId).order('label'),
            db.from('tournament_stages').select('id, name, division_id, schedule_format')
                .eq('group_id', access.groupId).eq('tournament_id', tournamentId),
        ]);
        const firstErr = tournamentResult.error || courtResult.error || stageResult.error;
        if (firstErr) return NextResponse.json({ error: firstErr.message }, { status: 500 });

        const ops = ((tournamentResult.data || {}).settings || {}).operations || {};
        const matchMinutes = Number(ops.estimated_match_minutes || DEFAULT_MATCH_MINUTES);
        const warmupMinutes = Number(ops.warmup_minutes || DEFAULT_WARMUP_MINUTES);

        const stageIds = (stageResult.data || []).map((s) => s.id);
        let matches = [];
        if (stageIds.length > 0) {
            const { data, error } = await db
                .from('tournament_matches')
                .select('id, stage_id, round, status, court, match_order, entrant_a_id, entrant_b_id, entry_a_id, entry_b_id, warmup_started_at, started_at, ended_at')
                .eq('group_id', access.groupId)
                .in('stage_id', stageIds)
                .order('match_order', { ascending: true });
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            matches = data || [];
        }

        const { data: assignments, error: assignErr } = await db
            .from('tournament_match_assignments')
            .select('match_id, court_id, scheduled_start, locked')
            .eq('group_id', access.groupId)
            .eq('tournament_id', tournamentId);
        if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });

        const courtByMatch = new Map((assignments || []).map((a) => [a.match_id, a]));
        const matchesByCourt = new Map();
        for (const match of matches) {
            const assign = courtByMatch.get(match.id);
            if (!assign || !assign.court_id) continue;
            if (!matchesByCourt.has(assign.court_id)) matchesByCourt.set(assign.court_id, []);
            matchesByCourt.get(assign.court_id).push(match);
        }

        const queue = matches
            .filter((m) => m.status === 'pending')
            .map((m) => {
                const assign = courtByMatch.get(m.id);
                return {
                    id: m.id,
                    locked_start: assign && assign.locked ? assign.scheduled_start : null,
                };
            });

        const runningByCourt = {};
        for (const [courtId, list] of matchesByCourt.entries()) {
            const running = list.find((m) => m.status === 'live' || m.status === 'paused' || m.status === 'warmup');
            if (running) runningByCourt[courtId] = running;
        }

        // Giờ dự kiến tính khi đọc, KHÔNG ghi xuống DB: nó đổi mỗi lần có trận
        // kết thúc sớm/muộn hoặc sân bật/tắt.
        const projection = projectSchedule({
            courts: courtResult.data || [],
            runningByCourt,
            queue,
            matchMinutes,
            now: Date.now(),
        });

        const courts = (courtResult.data || []).map((court) => ({
            ...court,
            ...computeCourtState(court, matchesByCourt.get(court.id) || [], queue.length),
            matches: matchesByCourt.get(court.id) || [],
        }));

        return NextResponse.json({
            courts,
            queue: queue.map((q) => ({ ...q, projected_start: projection.byMatchId[q.id] || null })),
            matches,
            settings: { matchMinutes, warmupMinutes },
            progress: {
                total: matches.length,
                finalized: matches.filter((m) => m.status === 'finalized').length,
                finish_at: projection.finishAt,
                average_match_minutes: averageMatchMinutes(matches),
            },
        });
    } catch (err) {
        console.error('Assignments GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// Gán hoặc gỡ một trận khỏi sân. Gọi vào sân thì dùng match-transition,
// route này chỉ để đổi sân của trận chưa gọi.
export async function PATCH(request) {
    try {
        const body = await request.json();
        const tournamentId = body?.tournament_id;
        const matchId = body?.match_id;
        if (!tournamentId || !matchId) {
            return NextResponse.json({ error: 'tournament_id và match_id là bắt buộc' }, { status: 400 });
        }
        const access = await requireTournamentAccess({ tournamentId, need: 'write' });
        if (!access.ok) return access.response;

        const { data: match, error: matchErr } = await db
            .from('tournament_matches')
            .select('id, stage_id, status')
            .eq('id', matchId).eq('group_id', access.groupId).maybeSingle();
        if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });
        if (!match) return NextResponse.json({ error: 'Không tìm thấy trận' }, { status: 404 });
        if (match.status !== 'pending') {
            return NextResponse.json({
                error: 'Chỉ đổi sân được cho trận chưa gọi. Trận đang đấu thì tạm dừng trước.',
                code: 'MATCH_NOT_PENDING',
            }, { status: 409 });
        }

        const { data: stage } = await db.from('tournament_stages')
            .select('division_id').eq('id', match.stage_id).maybeSingle();

        const { error } = await db
            .from('tournament_match_assignments')
            .upsert({
                group_id: access.groupId,
                tournament_id: tournamentId,
                division_id: (stage || {}).division_id,
                match_id: Number(matchId),
                court_id: body?.court_id == null ? null : body.court_id,
                scheduled_start: body?.scheduled_start || null,
                locked: body?.locked === true,
            }, { onConflict: 'match_id' });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Assignments PATCH error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
```

- [ ] **Step 4: Viết `operation-logs/route.js`**

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';

const db = supabaseAdmin || supabaseServer;

// Nhật ký CHỈ ĐỌC. Không có POST/PATCH/DELETE — dấu vết thao tác mà sửa được
// thì không còn là dấu vết.
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const tournamentId = searchParams.get('tournamentId');
        const limit = Math.min(Number(searchParams.get('limit') || 100), 500);
        if (!tournamentId) return NextResponse.json({ error: 'tournamentId là bắt buộc' }, { status: 400 });
        const access = await requireTournamentAccess({ tournamentId, need: 'read' });
        if (!access.ok) return access.response;

        const { data, error } = await db
            .from('tournament_operation_logs')
            .select('id, actor, action, target_type, target_id, before, after, reason, created_at')
            .eq('group_id', access.groupId)
            .eq('tournament_id', tournamentId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ logs: data || [] });
    } catch (err) {
        console.error('Operation logs GET error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
```

- [ ] **Step 5: Thêm hàm client**

```js
export async function getCourtBoard(tournamentId) {
    return request('/assignments', { query: { tournamentId } });
}

export function assignMatchCourt(body) {
    return request('/assignments', { method: 'PATCH', body });
}

export async function listOperationLogs(tournamentId, limit) {
    const data = await request('/operation-logs', { query: { tournamentId, limit } });
    return data.logs;
}
```

- [ ] **Step 6: Chạy test và commit**

Run: `node tests/tournament/api-courts.contract.test.js`
Expected: PASS

```bash
git add app/api/tournament-v2/assignments app/api/tournament-v2/operation-logs lib/tournamentV2Client.js tests/tournament/api-courts.contract.test.js
git commit -m "feat(api): bang san, hang doi voi gio du kien, va nhat ky chi doc

Gio du kien tinh khi doc, khong ghi xuong DB. Trang thai san suy tu tran dang
gan. Doi san chi cho tran chua goi. Nhat ky khong co POST/PATCH/DELETE.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# NHÓM C — Shell sidebar và theme

## Task C1: Token tối

**Files:**
- Create: `app/giai-dau/v2/console/shell.css`
- Create: `tests/tournament/ui-shell.contract.test.js`

- [ ] **Step 1: Viết test thất bại**

Create `tests/tournament/ui-shell.contract.test.js`:

```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const css = 'app/giai-dau/v2/console/shell.css';
assert(exists(css), 'shell.css tồn tại');
const s = read(css);

assert(/Montserrat/.test(s), 'font Montserrat theo ADR-006');
assert(!/Outfit/.test(s), 'không dùng Outfit — ADR-006 đã gỡ khỏi sản phẩm');
for (const banned of ['--court-green', '--pickle-lime', '--surface-court', '--live-cyan', '--rally-coral']) {
  assert(!s.includes(banned), `không dùng token khai tử ${banned}`);
}
assert(/--ph-indigo|#6F48C9|#6f48c9/.test(s), 'tím thương hiệu');
assert(/--ops-bg/.test(s), 'khai token nền tối riêng cho bàn điều hành');
assert(/prefers-reduced-motion/.test(s), 'tôn trọng prefers-reduced-motion');

console.log('ui-shell contract ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-shell.contract.test.js`
Expected: FAIL — `shell.css tồn tại`

- [ ] **Step 3: Viết `shell.css`**

Create `app/giai-dau/v2/console/shell.css`:

```css
/* Bàn điều hành giải — nền tối/tím.
   Token dẫn xuất từ bộ --ph-* trong UI-BRAND-SYSTEM.md và ADR-006:
   --ph-ink #28243D, --ph-indigo #6F48C9, --ph-lavender #EEE9FF,
   --ph-gold #FFC95E, --ph-cyan #A8DFE9, --ph-coral #FF8B83.

   NGOẠI LỆ CÓ CHỦ Ý: UI-BRAND-SYSTEM.md dòng 34 cấm nền đen đặc trong màn
   hình vận hành. Bàn điều hành phá lệ vì đây là màn hình đứng lâu trong nhà
   thi đấu, cần tương phản cao và đọc được từ xa. Ngoại lệ này đã được ghi
   vào brand system (xem Task C4).

   Các giá trị dưới đây là dẫn xuất TẠM cho console. Khi spec design-system
   2026-09-08 lên (app/styles/tokens.css), chuyển hết vào đó. */

.ops-shell {
    --ops-bg: #0A0812;
    --ops-surface: #151125;
    --ops-surface-2: #1E1932;
    --ops-surface-3: #2A2344;
    --ops-line: #2A2442;
    --ops-line-2: #3E3560;
    --ops-ink: #EFECF9;
    --ops-ink-2: #A9A2C4;
    --ops-ink-3: #7A7398;
    --ops-indigo: #6F48C9;
    --ops-indigo-lit: #A98BFF;
    --ops-indigo-soft: rgba(111, 72, 201, 0.26);
    --ops-lavender: #CFC2FF;
    --ops-gold: #FFC95E;
    --ops-gold-soft: rgba(255, 201, 94, 0.16);
    --ops-cyan: #8FE6F7;
    --ops-cyan-soft: rgba(143, 230, 247, 0.14);
    --ops-coral: #FF8B83;
    --ops-coral-soft: rgba(255, 139, 131, 0.16);
    --ops-r-sm: 12px;
    --ops-r-md: 18px;
    --ops-r-lg: 24px;

    font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--ops-bg);
    color: var(--ops-ink);
    min-height: 100vh;
    display: grid;
    grid-template-columns: 262px minmax(0, 1fr);
}

.ops-shell *,
.ops-shell *::before,
.ops-shell *::after { box-sizing: border-box; }

.ops-shell :focus-visible {
    outline: 3px solid var(--ops-gold);
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    .ops-side { transition: none !important; }
    .ops-live-dot i { animation: none !important; }
}
```

> Phần layout còn lại (sidebar, topbar, thẻ sân…) viết ở Task C2 và D1–D3, thêm dần vào file này.

- [ ] **Step 4: Nạp font Montserrat**

Kiểm `app/layout.js` xem font đang nạp thế nào. Nếu đang nạp `Outfit` qua `next/font` hoặc `<link>`, **thêm** Montserrat song song (đừng gỡ Outfit ở bước này — việc gỡ toàn cục thuộc plan design-system, gỡ ở đây sẽ làm vỡ mọi trang khác). Ghi chú `/* Montserrat cho console điều hành; gỡ Outfit khi plan design-system lên */`.

- [ ] **Step 5: Chạy test và commit**

Run: `node tests/tournament/ui-shell.contract.test.js`
Expected: `ui-shell contract ok`

```bash
git add app/giai-dau/v2/console/shell.css app/layout.js tests/tournament/ui-shell.contract.test.js
git commit -m "feat(giai-dau): token toi/tim cho ban dieu hanh

Dan xuat tu bo --ph-* theo ADR-006; font Montserrat, khong dung Outfit va cac
token da khai tu. Ghi ro day la ngoai le co chu y so voi UI-BRAND-SYSTEM.md
dong 34, va la ban tam cho toi khi app/styles/tokens.css ra doi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task C2: `ConsoleShell` — sidebar 8 bước

**Files:**
- Create: `app/giai-dau/v2/console/ConsoleShell.js`
- Modify: `app/giai-dau/v2/console/shell.css`
- Modify: `tests/tournament/ui-shell.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

Thêm vào `tests/tournament/ui-shell.contract.test.js` trước `console.log`:

```js
const shell = 'app/giai-dau/v2/console/ConsoleShell.js';
assert(exists(shell), 'ConsoleShell tồn tại');
const j = read(shell);
assert(/'use client'|"use client"/.test(j), 'client component');
for (const label of ['Cấu hình giải', 'Sân & sơ đồ', 'VĐV & cặp đấu', 'Bốc thăm', 'Trung tâm điều hành', 'Lịch thi đấu', 'Bảng đấu', 'Nhật ký']) {
  assert(j.includes(label), `sidebar có bước "${label}"`);
}
assert(/LIVE/.test(j), 'bước 5 có nhãn LIVE');
assert(/step=/.test(j), 'điều hướng bằng tham số step');
assert(/LEGACY_TAB_TO_STEP|tabParam/.test(j), 'ánh xạ ?tab= cũ sang ?step= mới');
assert(/drawer/.test(j), 'dưới 900px sidebar thành drawer');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-shell.contract.test.js`
Expected: FAIL — `ConsoleShell tồn tại`

- [ ] **Step 3: Viết `ConsoleShell.js`**

```js
'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import './shell.css';

export const STEPS = [
    { key: 'config', n: 1, phase: 'prep', label: 'Cấu hình giải & số ván' },
    { key: 'courts', n: 2, phase: 'prep', label: 'Sân & sơ đồ sân đấu' },
    { key: 'athletes', n: 3, phase: 'prep', label: 'VĐV & cặp đấu' },
    { key: 'draw', n: 4, phase: 'prep', label: 'Bốc thăm & chốt lịch' },
    { key: 'control', n: 5, phase: 'live', label: 'Trung tâm điều hành' },
    { key: 'schedule', n: 6, phase: 'after', label: 'Lịch thi đấu & kết quả' },
    { key: 'standings', n: 7, phase: 'after', label: 'Bảng đấu & xếp hạng' },
    { key: 'log', n: 8, phase: 'after', label: 'Nhật ký thao tác' },
];

// Link cũ dạng ?tab= vẫn phải mở đúng chỗ. Bookmark và link đã chia sẻ
// không được vỡ chỉ vì ta đổi cách điều hướng.
export const LEGACY_TAB_TO_STEP = {
    overview: 'control',
    results: 'schedule',
    standings: 'standings',
    bracket: 'standings',
    teams: 'athletes',
    openreg: 'athletes',
    settings: 'config',
};

export function resolveStepKey(stepParam, tabParam) {
    if (stepParam && STEPS.some((s) => s.key === stepParam)) return stepParam;
    if (tabParam && LEGACY_TAB_TO_STEP[tabParam]) return LEGACY_TAB_TO_STEP[tabParam];
    return 'control';
}

function StepButton({ step, active, done, onClick }) {
    return (
        <button
            type="button"
            className={`ops-step ${done ? 'is-done' : ''}`}
            aria-current={active ? 'true' : 'false'}
            onClick={() => onClick(step.key)}
        >
            <span className="ops-step-n">{done ? '✓' : step.n}</span>
            <span className="ops-step-label">{step.label}</span>
        </button>
    );
}

export default function ConsoleShell({
    tournament,
    tournamentId,
    progress,
    readiness,
    children,
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [drawerOpen, setDrawerOpen] = useState(false);

    const activeKey = resolveStepKey(searchParams.get('step'), searchParams.get('tab'));

    const prepDone = useMemo(
        () => STEPS.filter((s) => s.phase === 'prep' && (readiness || {})[s.key]).length,
        [readiness],
    );

    function go(key) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('step', key);
        params.delete('tab');           // dọn tham số cũ khỏi thanh địa chỉ
        router.push(`?${params.toString()}`);
        setDrawerOpen(false);
    }

    const control = STEPS.find((s) => s.key === 'control');
    const isLive = tournament && tournament.status === 'live';

    return (
        <div className={`ops-shell ${drawerOpen ? 'is-drawer-open' : ''}`}>
            <aside className="ops-side">
                <div className="ops-brand">
                    <div className="ops-brand-mark">PH</div>
                    <div>
                        <b>{tournament ? tournament.name : 'Giải đấu'}</b>
                        <span>Bàn điều hành</span>
                    </div>
                </div>

                <div className="ops-phase">
                    <span>Chuẩn bị</span>
                    <span className="ops-phase-count">{prepDone}/4 xong</span>
                </div>
                {STEPS.filter((s) => s.phase === 'prep').map((step) => (
                    <StepButton
                        key={step.key}
                        step={step}
                        active={activeKey === step.key}
                        done={(readiness || {})[step.key] === true}
                        onClick={go}
                    />
                ))}

                <div className="ops-live-wrap">
                    <div className="ops-live-box">
                        <div className="ops-live-head">
                            <span className="ops-step-n">{control.n}</span>
                            <b>{control.label}</b>
                        </div>
                        <div className="ops-live-meta">
                            {isLive ? (
                                <span className="ops-live-dot"><i />LIVE</span>
                            ) : null}
                            {progress ? (
                                <span>{progress.finalized}/{progress.total} trận</span>
                            ) : null}
                        </div>
                        <button type="button" onClick={() => go('control')}>Vào điều hành</button>
                    </div>
                </div>

                <div className="ops-phase"><span>Trong &amp; sau giải</span></div>
                {STEPS.filter((s) => s.phase === 'after').map((step) => (
                    <StepButton
                        key={step.key}
                        step={step}
                        active={activeKey === step.key}
                        done={false}
                        onClick={go}
                    />
                ))}
            </aside>

            <div className="ops-main">
                <div className="ops-topbar">
                    <button
                        type="button"
                        className="ops-burger"
                        aria-label="Mở menu"
                        onClick={() => setDrawerOpen((v) => !v)}
                    >
                        ☰
                    </button>
                    <span className="ops-topbar-title">
                        {STEPS.find((s) => s.key === activeKey)?.label}
                    </span>
                </div>
                <div className="ops-scroll">{children(activeKey)}</div>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Thêm layout CSS**

Thêm vào `app/giai-dau/v2/console/shell.css`:

```css
.ops-side {
    background: var(--ops-surface);
    border-right: 1px solid var(--ops-line);
    padding: 14px 12px;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}

.ops-brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 13px; border-bottom: 1px solid var(--ops-line); }
.ops-brand-mark { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; background: linear-gradient(135deg, var(--ops-indigo), #9B6BFF); color: #fff; font-weight: 800; }
.ops-brand b { display: block; font-size: 0.93rem; font-weight: 700; }
.ops-brand span { display: block; font-size: 0.69rem; color: var(--ops-ink-3); letter-spacing: 0.09em; text-transform: uppercase; }

.ops-phase { display: flex; align-items: baseline; gap: 8px; padding: 14px 8px 7px; font-size: 0.66rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ops-ink-3); font-weight: 700; }
.ops-phase-count { margin-left: auto; letter-spacing: 0; }

.ops-step { display: flex; align-items: center; gap: 11px; width: 100%; text-align: left; background: none; border: none; color: var(--ops-ink-2); padding: 9px 10px; border-radius: var(--ops-r-sm); font: 500 0.87rem inherit; cursor: pointer; }
.ops-step:hover { background: var(--ops-surface-2); color: var(--ops-ink); }
.ops-step[aria-current='true'] { background: var(--ops-indigo-soft); color: var(--ops-ink); font-weight: 600; box-shadow: inset 2px 0 0 var(--ops-indigo-lit); }
.ops-step-n { width: 22px; height: 22px; border-radius: 8px; flex: 0 0 auto; display: grid; place-items: center; font-weight: 700; font-size: 0.72rem; background: var(--ops-surface-3); color: var(--ops-ink-3); }
.ops-step.is-done .ops-step-n { background: var(--ops-indigo); color: #fff; }
.ops-step[aria-current='true'] .ops-step-n { background: var(--ops-indigo-lit); color: #1B1030; }
.ops-step-label { flex: 1; min-width: 0; }

.ops-live-wrap { margin: 10px 2px; border-radius: var(--ops-r-md); padding: 2px; background: linear-gradient(135deg, var(--ops-indigo), #9B6BFF 55%, var(--ops-coral)); }
.ops-live-box { background: var(--ops-surface); border-radius: 16px; padding: 10px 11px; display: flex; flex-direction: column; gap: 8px; }
.ops-live-head { display: flex; align-items: center; gap: 8px; }
.ops-live-head b { font-size: 0.9rem; }
.ops-live-meta { display: flex; gap: 8px; align-items: center; font-size: 0.7rem; color: var(--ops-ink-3); }
.ops-live-dot { display: inline-flex; align-items: center; gap: 5px; background: var(--ops-coral); color: #3A0F0A; border-radius: 999px; padding: 2px 8px; font-weight: 800; font-size: 0.64rem; letter-spacing: 0.09em; }
.ops-live-dot i { width: 6px; height: 6px; border-radius: 999px; background: #3A0F0A; animation: ops-blip 1.6s infinite; }
@keyframes ops-blip { 50% { opacity: 0.25; } }
.ops-live-box button { border: none; border-radius: 10px; padding: 8px; font: 700 0.8rem inherit; background: linear-gradient(135deg, var(--ops-indigo), #9B6BFF); color: #fff; cursor: pointer; }

.ops-main { display: flex; flex-direction: column; min-width: 0; }
.ops-topbar { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-bottom: 1px solid var(--ops-line); background: var(--ops-surface); }
.ops-topbar-title { font-weight: 700; font-size: 0.95rem; }
.ops-burger { display: none; background: var(--ops-surface-2); border: 1px solid var(--ops-line); color: var(--ops-ink); border-radius: 10px; padding: 7px 11px; cursor: pointer; }
.ops-scroll { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }

@media (max-width: 899px) {
    .ops-shell { grid-template-columns: minmax(0, 1fr); position: relative; }
    .ops-side { position: absolute; inset: 0 auto 0 0; width: 274px; z-index: 50; transform: translateX(-100%); transition: transform 0.22s ease; box-shadow: 26px 0 60px rgba(0, 0, 0, 0.6); }
    .ops-shell.is-drawer-open .ops-side { transform: none; }
    .ops-burger { display: block; }
    .ops-scroll { padding: 13px; gap: 13px; }
}
```

- [ ] **Step 5: Chạy test và commit**

Run: `node tests/tournament/ui-shell.contract.test.js`
Expected: PASS

```bash
git add app/giai-dau/v2/console/ConsoleShell.js app/giai-dau/v2/console/shell.css tests/tournament/ui-shell.contract.test.js
git commit -m "feat(giai-dau): shell sidebar theo lo trinh to chuc giai 8 buoc

Buoc 5 tach thanh khoi rieng vien gradient co nhan LIVE. Link cu dang ?tab=
duoc anh xa sang ?step= nen bookmark khong vo. Duoi 900px sidebar thanh drawer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task C3: Chuyển 7 tab cũ vào 8 bước

**Files:**
- Modify: `app/giai-dau/v2/console/TournamentConsoleV2.js`
- Modify: `tests/tournament/ui-console.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

Thêm vào `tests/tournament/ui-console.contract.test.js`:

```js
assert(/ConsoleShell/.test(s), 'console dùng shell sidebar');
assert(!/v2-tabbar/.test(s), 'không còn thanh 7 tab ngang');
for (const tab of ['SettingsTab', 'TeamsTab', 'ResultsTab', 'StandingsTab', 'BracketTab', 'OpenRegTab']) {
  assert(new RegExp(tab).test(s), `${tab} cũ vẫn được dùng lại, không viết lại`);
}
assert(/CourtsStep|ControlStep|LogStep/.test(s), 'ba màn mới được mount');
assert(/readiness/.test(s), 'tính điều kiện xong của 4 bước chuẩn bị');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-console.contract.test.js`
Expected: FAIL — `console dùng shell sidebar`

- [ ] **Step 3: Viết lại thân `TournamentConsoleV2.js`**

Giữ nguyên toàn bộ phần nạp dữ liệu (`load`, state, `activeStage`, `isAdmin`). Chỉ thay phần `return`:

```js
import ConsoleShell from './ConsoleShell';
import CourtsStep from './steps/CourtsStep';
import ControlStep from './steps/ControlStep';
import LogStep from './steps/LogStep';
```

```js
    // Điều kiện "xong" của 4 bước chuẩn bị. Đây là CHỈ DẤU, không phải cổng
    // chặn — BTC vẫn bấm vào bước bất kỳ.
    const readiness = {
        config: Boolean(tournament) && stages.length > 0,
        courts: courtCount > 0,
        athletes: entrantCount >= 2,
        draw: stages.length > 0 && stages.every((s) => (s.match_count || 0) > 0),
    };

    const stepProps = {
        tournamentId,
        tournament,
        stageId: activeStageId,
        stage: activeStage,
        stages,
        isAdmin,
        reload: load,
    };

    return (
        <ConsoleShell
            tournament={tournament}
            tournamentId={tournamentId}
            progress={progress}
            readiness={readiness}
        >
            {(step) => (
                <>
                    {stages.length > 1 && step !== 'control' && step !== 'log' ? (
                        <div className="ops-stage-picker" role="tablist" aria-label="Giai đoạn">
                            {stages.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    aria-pressed={String(activeStageId) === String(s.id)}
                                    onClick={() => setActiveStageId(s.id)}
                                >
                                    {s.name}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {step === 'config' ? <SettingsTab {...stepProps} /> : null}
                    {step === 'courts' ? <CourtsStep {...stepProps} /> : null}
                    {step === 'athletes' ? (
                        <>
                            <TeamsTab {...stepProps} />
                            {isCommunity ? <OpenRegTab {...stepProps} /> : null}
                        </>
                    ) : null}
                    {step === 'draw' ? <OverviewTab {...stepProps} /> : null}
                    {step === 'control' ? <ControlStep {...stepProps} /> : null}
                    {step === 'schedule' ? <ResultsTab {...stepProps} /> : null}
                    {step === 'standings' ? (
                        <>
                            <StandingsTab {...stepProps} />
                            <BracketTab {...stepProps} />
                        </>
                    ) : null}
                    {step === 'log' ? <LogStep {...stepProps} /> : null}
                </>
            )}
        </ConsoleShell>
    );
```

> `courtCount`, `entrantCount`, `progress` chưa có. Thêm ba state và nạp chúng trong `load()` bằng `getCourtBoard(tournamentId)` — nó đã trả đủ `courts`, `progress` và danh sách trận. `entrantCount` lấy từ `listEntrants` hoặc số hàng của `TeamsTab`; nếu chưa có hàm sẵn thì tạm để `readiness.athletes = true` và ghi `// TODO: đếm VĐV khi bước 3 được viết lại` — **KHÔNG** để `TODO` ở bất kỳ chỗ nào khác.

- [ ] **Step 4: Chạy test và kiểm link cũ**

Run: `node tests/tournament/ui-console.contract.test.js`
Expected: PASS

Mở thủ công `/giai-dau/v2?t=<ID>&tab=results`.
Expected: mở đúng **bước 6 · Lịch thi đấu & kết quả**, thanh địa chỉ đổi thành `?step=schedule`.

- [ ] **Step 5: Commit**

```bash
git add app/giai-dau/v2/console/TournamentConsoleV2.js tests/tournament/ui-console.contract.test.js
git commit -m "refactor(giai-dau): console 7 tab thanh shell sidebar 8 buoc

Sau tab cu duoc mount lai nguyen ven vao dung buoc, khong viet lai. Link cu
?tab=results tu chuyen sang ?step=schedule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task C4: Đo tương phản và ghi ngoại lệ vào brand system

Đây **không phải** việc làm cho có. Spec design-system đo `--ph-cyan` chỉ ~1.3:1 và `--ph-coral` ~2.5:1 **trên nền trắng** và cấm dùng chúng cho chữ. Bàn điều hành dùng chúng làm chữ trên nền đen — phép đo hoàn toàn khác, phải đo lại chứ không suy diễn.

**Files:**
- Modify: `docs/pickhub-core/UI-BRAND-SYSTEM.md`
- Create: `evidence/spec2-contrast-2026-09-09.md`

- [ ] **Step 1: Đo 6 cặp màu/nền**

Dùng bất kỳ công cụ tính tỉ lệ tương phản WCAG. Đo:

| Chữ | Nền | Ngưỡng |
|---|---|---|
| `--ops-cyan #8FE6F7` | `--ops-surface #151125` | 4.5:1 |
| `--ops-gold #FFC95E` | `--ops-surface #151125` | 4.5:1 |
| `--ops-coral #FF8B83` | `--ops-surface #151125` | 4.5:1 |
| `--ops-ink-2 #A9A2C4` | `--ops-bg #0A0812` | 4.5:1 |
| `--ops-ink-3 #7A7398` | `--ops-bg #0A0812` | 3:1 (chỉ dùng cho chữ phụ không mang thông tin quyết định) |
| `--ops-lavender #CFC2FF` | `--ops-indigo-soft` trên `--ops-surface` | 4.5:1 |

- [ ] **Step 2: Ghi kết quả và chỉnh sắc độ nếu trượt**

Create `evidence/spec2-contrast-2026-09-09.md` với bảng 6 dòng: cặp màu, tỉ lệ đo được, đạt/trượt, giá trị đã chỉnh (nếu có).

Cặp nào **trượt** thì chỉnh sắc độ trong `shell.css` cho tới khi đạt, rồi đo lại và ghi cả hai lần vào file bằng chứng. Không được để một cặp trượt mà đi tiếp.

- [ ] **Step 3: Ghi ngoại lệ vào brand system**

Thêm vào `docs/pickhub-core/UI-BRAND-SYSTEM.md`, ngay dưới dòng 34:

```markdown
> **Ngoại lệ đã duyệt — bàn điều hành giải (`.ops-shell`).** Màn hình này dùng
> nền đen ám tím `#0A0812`, trái với quy tắc "không dùng nền đen hoặc navy đặc
> trong các màn hình vận hành" ở trên. Lý do: đây là màn hình BTC đứng/ngồi
> nhìn liên tục nhiều giờ trong nhà thi đấu, cần tương phản cao và đọc được từ
> xa; nền sáng gây chói dưới đèn thi đấu. Ngoại lệ chỉ áp dụng cho console điều
> hành, không lan sang trang công khai hay các màn quản lý CLB.
>
> Trên nền tối, `--ph-cyan` và `--ph-coral` **được phép dùng cho chữ** vì phép
> đo khác hẳn nền trắng. Kết quả đo: `evidence/spec2-contrast-2026-09-09.md`.
> Mọi màn tối mới phải đo lại, không suy ra từ con số đo trên nền sáng.
```

- [ ] **Step 4: Commit**

```bash
git add docs/pickhub-core/UI-BRAND-SYSTEM.md app/giai-dau/v2/console/shell.css evidence/spec2-contrast-2026-09-09.md
git commit -m "docs(brand): ghi ngoai le nen den cho ban dieu hanh + bang chung do tuong phan

Khong im lang lam trai tai lieu. Do lai 6 cap mau/nen tren nen toi vi con so
trong spec design-system la do tren nen trang.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# NHÓM D — Ba màn hình

## Task D1: Bước 2 — Sân & sơ đồ sân đấu

**Files:**
- Create: `app/giai-dau/v2/console/steps/CourtsStep.js`
- Modify: `app/giai-dau/v2/console/shell.css`
- Create: `tests/tournament/ui-courts-step.contract.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/giai-dau/v2/console/steps/CourtsStep.js';
assert(exists(f), 'CourtsStep tồn tại');
const s = read(f);
assert(/'use client'|"use client"/.test(s), 'client component');
assert(/listCourts|getCourtBoard/.test(s), 'gọi qua client wrapper');
assert(!/supabase/i.test(s), 'không truy vấn Supabase trực tiếp');
assert(/Số sân/.test(s), 'khối cấu hình số sân');
assert(/ước tính hoàn tất|Ước tính hoàn tất/.test(s), 'ô hệ quả nói rõ ảnh hưởng tới giờ tan giải');
assert(/Hàng đợi/.test(s), 'khối hàng đợi trận chờ');
assert(/lý do|Lý do/.test(s), 'tắt sân bắt nhập lý do');
assert(!/#[0-9a-fA-F]{6}/.test(s), 'không hardcode màu');

console.log('ui-courts-step contract ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-courts-step.contract.test.js`
Expected: FAIL

- [ ] **Step 3: Viết `CourtsStep.js`**

```js
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    listVenues, saveVenue, listCourts, saveCourt, setCourtActive, getCourtBoard,
} from '@/lib/tournamentV2Client';

function fmtClock(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CourtsStep({ tournamentId, isAdmin }) {
    const [board, setBoard] = useState(null);
    const [venues, setVenues] = useState([]);
    const [courts, setCourts] = useState([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setError('');
        try {
            const [v, c, b] = await Promise.all([
                listVenues(tournamentId),
                listCourts(tournamentId),
                getCourtBoard(tournamentId),
            ]);
            setVenues(v || []);
            setCourts(c || []);
            setBoard(b);
        } catch (err) {
            setError(err.message || 'Không tải được dữ liệu sân.');
        }
    }, [tournamentId]);

    useEffect(() => { load(); }, [load]);

    async function addCourt() {
        let venueId = venues[0]?.id;
        setBusy(true);
        try {
            if (!venueId) {
                const created = await saveVenue({ tournament_id: tournamentId, name: 'Địa điểm thi đấu' });
                venueId = created.venue.id;
            }
            const nextIndex = courts.length + 1;
            await saveCourt({
                tournament_id: tournamentId,
                venue_id: venueId,
                label: `Sân ${String(nextIndex).padStart(2, '0')}`,
            });
            await load();
        } catch (err) {
            setError(err.message || 'Không thêm được sân.');
        } finally { setBusy(false); }
    }

    async function toggle(court) {
        const next = !court.active;
        let reason = '';
        if (!next) {
            reason = window.prompt(`Vì sao ngưng dùng ${court.label}?`) || '';
            if (!reason.trim()) return;
        }
        setBusy(true);
        try {
            await setCourtActive({ tournament_id: tournamentId, id: court.id, active: next, reason });
            await load();
        } catch (err) {
            setError(err.message || 'Không đổi được trạng thái sân.');
        } finally { setBusy(false); }
    }

    const activeCount = courts.filter((c) => c.active).length;
    const progress = board?.progress;
    const minutes = board?.settings?.matchMinutes || 22;
    const remaining = progress ? progress.total - progress.finalized : 0;
    // Cho BTC thấy ngay hệ quả của việc bớt một sân, không bắt họ tự nhẩm.
    const finishWithOneLess = activeCount > 1 && remaining > 0
        ? Math.ceil(remaining / (activeCount - 1)) * minutes - Math.ceil(remaining / activeCount) * minutes
        : null;

    return (
        <div className="ops-block-list">
            {error ? <p className="ops-error">{error}</p> : null}

            <section className="ops-block">
                <h3>Số sân dành cho giải</h3>
                <p className="ops-muted">
                    Số sân quyết định giờ tan giải, không phải khai báo cho có.
                </p>
                <div className="ops-court-count">
                    <b>{activeCount}</b> sân đang dùng / {courts.length} sân đã khai báo
                    {isAdmin ? (
                        <button type="button" disabled={busy} onClick={addCourt}>+ Thêm sân</button>
                    ) : null}
                </div>
                {progress ? (
                    <div className="ops-impact">
                        Đang bố trí <b>{activeCount} sân</b> cho <b>{remaining} trận còn lại</b> →
                        ước tính hoàn tất <b>{fmtClock(progress.finish_at)}</b>.
                        {finishWithOneLess ? (
                            <> Bớt một sân sẽ lùi thêm khoảng <b>{finishWithOneLess} phút</b>.</>
                        ) : null}
                        {progress.average_match_minutes ? (
                            <> Thời lượng trận trung bình thực tế: <b>{progress.average_match_minutes} phút</b>.</>
                        ) : null}
                    </div>
                ) : null}
            </section>

            <section className="ops-block">
                <h3>Danh sách sân</h3>
                {courts.length === 0 ? (
                    <p className="ops-muted">Chưa khai báo sân nào. Thêm sân để sinh được lịch có giờ dự kiến.</p>
                ) : courts.map((court) => (
                    <div key={court.id} className="ops-court-row">
                        <div>
                            <b>{court.label}</b>
                            <span>{court.surface || 'Chưa ghi mặt sân'}</span>
                        </div>
                        {isAdmin ? (
                            <button
                                type="button"
                                className={`ops-toggle ${court.active ? '' : 'is-off'}`}
                                disabled={busy}
                                onClick={() => toggle(court)}
                            >
                                {court.active ? 'Đang dùng' : 'Ngưng dùng'}
                            </button>
                        ) : (
                            <span className="ops-muted">{court.active ? 'Đang dùng' : 'Ngưng dùng'}</span>
                        )}
                    </div>
                ))}
            </section>

            <section className="ops-block">
                <h3>Hàng đợi trận chờ</h3>
                {!board || board.queue.length === 0 ? (
                    <p className="ops-muted">Không còn trận nào chờ.</p>
                ) : board.queue.slice(0, 12).map((item, index) => (
                    <div key={item.id} className="ops-queue-row">
                        <span className="ops-queue-n">{index + 1}</span>
                        <span>Trận #{item.id}</span>
                        <span className="ops-queue-time">
                            {item.locked_start ? `ghim ${fmtClock(Date.parse(item.locked_start))}` : `dk ${fmtClock(item.projected_start)}`}
                        </span>
                    </div>
                ))}
                <p className="ops-muted">
                    Giờ dự kiến (dk) tính từ số sân đang dùng × thời lượng trận, tự dịch khi trận thực tế lệch giờ.
                </p>
            </section>
        </div>
    );
}
```

> `window.prompt` dùng ở đây là **tạm**. Spec design-system 2026-09-08 nêu `window.prompt` là lỗi mobile cần bỏ. Ghi vào commit message rằng đây là nợ, thay bằng modal khi `primitives.css` có sẵn.

- [ ] **Step 4: Thêm CSS cho các lớp `ops-block`, `ops-court-*`, `ops-queue-*`, `ops-impact`, `ops-toggle`, `ops-muted`, `ops-error` vào `shell.css`**

Dùng đúng token `--ops-*` đã khai ở Task C1. `.ops-impact` dùng viền `--ops-gold` và nền `--ops-gold-soft`.

- [ ] **Step 5: Chạy test và commit**

Run: `node tests/tournament/ui-courts-step.contract.test.js`
Expected: PASS

```bash
git add app/giai-dau/v2/console/steps/CourtsStep.js app/giai-dau/v2/console/shell.css tests/tournament/ui-courts-step.contract.test.js
git commit -m "feat(giai-dau): buoc 2 - san va so do san dau

O he qua noi thang so san anh huong gio tan giai the nao. Tat san bat ly do.
No ky thuat: dung window.prompt tam, thay bang modal khi primitives.css co san.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task D2: Bước 5 — Trung tâm điều hành

**Files:**
- Create: `app/giai-dau/v2/console/steps/ControlStep.js`
- Modify: `app/giai-dau/v2/console/shell.css`
- Create: `tests/tournament/ui-control-step.contract.test.js`

- [ ] **Step 1: Viết test thất bại**

```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/giai-dau/v2/console/steps/ControlStep.js';
assert(exists(f), 'ControlStep tồn tại');
const s = read(f);
assert(/transitionMatch/.test(s), 'đổi trạng thái qua route một cửa');
assert(/matchElapsed/.test(s), 'đồng hồ trận dùng hàm thuần');
assert(/Gọi vào sân/.test(s), 'nút gọi vào sân');
assert(/Bắt đầu đấu/.test(s), 'nút bắt đầu đấu');
assert(/Tạm dừng/.test(s), 'nút tạm dừng');
assert(/mic|Thẻ đọc|đọc mic/.test(s), 'thẻ đọc mic');
assert(!/speechSynthesis|SpeechSynthesis/.test(s), 'KHÔNG có giọng đọc máy — đã chốt là BTC tự đọc');
assert(/Thời lượng trận trung bình|trung bình/.test(s), 'số liệu thật thay cho chạm/rally');
assert(!/DUPR/.test(s), 'không có DUPR — dùng chỉ số nội bộ');
assert(!/Live Stream|livestream/i.test(s), 'không có live stream');
assert(!/#[0-9a-fA-F]{6}/.test(s), 'không hardcode màu');

console.log('ui-control-step contract ok');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-control-step.contract.test.js`
Expected: FAIL

- [ ] **Step 3: Viết `ControlStep.js`**

Component gồm bốn phần, theo đúng spec mục 6.1:

1. **Dải tiến độ** — `progress.finalized/total`, `fmtClock(progress.finish_at)`, `progress.average_match_minutes`. Ba số này lấy thẳng từ `getCourtBoard`. **Không** hiện chỉ số nào không có dữ liệu thật.
2. **Lưới thẻ sân** — mỗi sân một thẻ, class theo `court.state` (`playing` / `warming` / `needs_call` / `idle` / `off`). Thẻ hiện: nhãn sân, nhãn nội dung + bảng của trận đang ở đó, đồng hồ từ `matchElapsed(match, Date.now(), { warmupMinutes })`, hai đội và tỉ số, và nút theo trạng thái:
   - `playing` → **Ghi điểm** (mở `ResultsTab` ở bước 6 hoặc modal nhập điểm) và **Tạm dừng** (`transitionMatch` sang `paused`).
   - `warming` → **Bắt đầu đấu** (sang `live`) và **+2 phút** (gọi `transitionMatch` không được — đây chỉ là hiển thị; dời `warmup_started_at` cần một endpoint riêng. **Bỏ nút +2 phút ở bản này**, ghi vào phần "chưa làm" cuối plan).
   - `needs_call` → **Gọi vào sân ngay**: mở thẻ đọc mic, sau khi BTC bấm xác nhận thì gọi `transitionMatch({ match_id, to: 'warmup', court_id })`.
   - `off` → không nút nào.
3. **Thẻ đọc mic** — overlay chữ lớn: tên hai đội + CLB, số sân, nội dung/bảng, luật vòng. Nút "Đã gọi — chuyển sân sang Khởi động" mới thực sự đổi trạng thái. **Không** có `speechSynthesis`.
4. **Đồng hồ chạy** — một `setInterval` 1 giây cập nhật `now` trong state; dọn bằng `clearInterval` trong hàm dọn của `useEffect`.

Đặt `const [now, setNow] = useState(() => Date.now());` và:

```js
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
```

Mọi lời gọi đổi trạng thái đều gửi kèm `expected_version: match.version` và bắt lỗi `MATCH_VERSION_CONFLICT` bằng cách tải lại bảng sân rồi báo "Trận vừa được cập nhật, đã tải lại."

- [ ] **Step 4: Thêm CSS thẻ sân vào `shell.css`**

Viền trái 3px theo trạng thái: `playing` → `--ops-cyan`, `warming` → `--ops-gold`, `needs_call` → `--ops-coral`, `idle`/`off` → `--ops-line-2`. Lưới: 1 cột dưới 640px, 2 cột từ 640px, 4 cột từ 1240px.

- [ ] **Step 5: Chạy test và kiểm bằng trình duyệt**

Run: `node tests/tournament/ui-control-step.contract.test.js`
Expected: PASS

Trên dữ liệu test, chạy **trọn một trận**: Gọi vào sân → thẻ đọc mic → xác nhận → Bắt đầu đấu → Tạm dừng → Đấu tiếp → Ghi điểm → Chốt. Sau mỗi bước xác nhận `tournament_matches.status` và mốc thời gian trên DB.

Kiểm ở **390px / 834px / ≥1280px**.

- [ ] **Step 6: Commit**

```bash
git add app/giai-dau/v2/console/steps/ControlStep.js app/giai-dau/v2/console/shell.css tests/tournament/ui-control-step.contract.test.js
git commit -m "feat(giai-dau): buoc 5 - trung tam dieu hanh

Bang san 4 trang thai suy tu tran, dong ho tran, the doc mic (khong co giong
doc may). Ba so lieu deu co du lieu that: tien do, uoc tinh hoan tat, thoi
luong tran trung binh. Da bo cham/rally, DUPR va live stream khoi thiet ke goc.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task D3: Bước 8 — Nhật ký thao tác

**Files:**
- Create: `app/giai-dau/v2/console/steps/LogStep.js`
- Modify: `app/giai-dau/v2/console/shell.css`
- Modify: `tests/tournament/ui-shell.contract.test.js`

- [ ] **Step 1: Thêm test thất bại**

```js
const logStep = 'app/giai-dau/v2/console/steps/LogStep.js';
assert(exists(logStep), 'LogStep tồn tại');
const lg = read(logStep);
assert(/listOperationLogs/.test(lg), 'đọc nhật ký qua client wrapper');
assert(/Trước → Sau|Trước|Sau/.test(lg), 'cột trước/sau');
assert(/Lý do/.test(lg), 'cột lý do');
assert(!/xoá|Xoá|delete/i.test(lg), 'nhật ký chỉ đọc, không có nút xoá');
```

- [ ] **Step 2: Chạy test để thấy nó đỏ**

Run: `node tests/tournament/ui-shell.contract.test.js`
Expected: FAIL — `LogStep tồn tại`

- [ ] **Step 3: Viết `LogStep.js`**

Bảng năm cột: **Lúc · Người làm · Việc · Trước → Sau · Lý do**. Nhãn `action` dịch sang tiếng Việt bằng một map:

```js
const ACTION_LABELS = {
    tournament_status_changed: 'Đổi trạng thái giải',
    court_toggled: 'Bật/tắt sân',
    match_called: 'Gọi vào sân',
    match_call_cancelled: 'Huỷ gọi sân',
    match_started: 'Bắt đầu đấu',
    match_paused: 'Tạm dừng',
    match_resumed: 'Đấu tiếp',
    match_finalized: 'Chốt trận',
    match_walkover: 'Xử thắng (không ra sân)',
    match_retired: 'Bỏ cuộc giữa chừng',
};
```

Nhãn không có trong map thì hiện thẳng giá trị `action` — thà thấy chuỗi lạ còn hơn giấu mất một dòng nhật ký.

Bảng nằm trong `<div className="ops-table-wrap">` có `overflow-x: auto`.

- [ ] **Step 4: Chạy test và commit**

Run: `node tests/tournament/ui-shell.contract.test.js`
Expected: PASS

```bash
git add app/giai-dau/v2/console/steps/LogStep.js app/giai-dau/v2/console/shell.css tests/tournament/ui-shell.contract.test.js
git commit -m "feat(giai-dau): buoc 8 - nhat ky thao tac chi doc

Nhan action nao chua dich thi hien thang gia tri goc, khong giau mat dong nhat ky.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task D4: Hồi quy và bằng chứng

- [ ] **Step 1: Nối test mới vào `package.json`**

```json
    "test:t-ops-ui": "node tests/tournament/ui-shell.contract.test.js && node tests/tournament/ui-courts-step.contract.test.js && node tests/tournament/ui-control-step.contract.test.js && node tests/tournament/api-courts.contract.test.js && node tests/tournament/api-match-transition.contract.test.js",
```

Thêm `npm run test:t-ops-ui` vào `test:tournament`.

- [ ] **Step 2: Chạy**

Run: `npm run test:tournament`
Expected: exit 0.

Run: `npm run test:regression`
Expected: exit 0.

Run: `npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Ghi bằng chứng và commit**

```bash
npm run test:regression > evidence/spec2-regression-2026-09-09.txt 2>&1
npm run build > evidence/spec2-build-2026-09-09.txt 2>&1
git add package.json evidence/spec2-regression-2026-09-09.txt evidence/spec2-build-2026-09-09.txt
git commit -m "test(giai-dau): noi test ban dieu hanh vao bo chung + bang chung

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review — đối chiếu spec

| Mục spec | Task phủ |
|---|---|
| 2A · Shell sidebar + theme tối | C1, C2 |
| 2B · Bước 2 sân | D1 |
| 2C · Bước 5 điều hành | D2 |
| 2D · Vòng đời trận + đồng hồ | A3, B2, D2 |
| 2E · Nhập tỉ số theo luật vòng | Plan Spec 1 Task 5 đã làm; D2 chỉ mở đường vào |
| 2F · Bỏ cuộc / walkover | A3 (`resultTypeFor`), B2 (bắt lý do) |
| 2G · Bước 8 nhật ký | A2 (bảng ở 043), B3 (API), D3 (UI) |
| 2H · Chuyển 7 tab, giữ link cũ | C2 (`LEGACY_TAB_TO_STEP`), C3 |
| 4 · Điều kiện "xong" 4 bước chuẩn bị | C3 (`readiness`) |
| 5.4 · Giờ dự kiến suy ra không lưu | A4, B3 |
| 5.5 · `matches.court` di sản ghi kèm | B2 |
| 6.2 · Trạng thái sân suy ra | A4, D2 |
| 6.3 · 8 cạnh, lý do bắt buộc | A3, B2 |
| 7 · Cạnh tranh ghi bằng `version` | B2 |
| 8 · Migration 044 | A2 |
| 10 · Montserrat, token `--ph-*`, đo tương phản, ghi ngoại lệ | C1, C4 |
| 11 · Dọn code Phase 4 | A1 |

**Cố ý chưa làm, ghi lại để không rơi mất:**
- **Nút "+2 phút"** ở thẻ sân khởi động — cần một endpoint dời `warmup_started_at`, không nằm trong 8 cạnh. Thêm khi có nhu cầu thật.
- **Modal thay `window.prompt`** ở D1 — chờ `app/styles/primitives.css` của plan design-system.
- **Đếm VĐV cho `readiness.athletes`** ở C3 — chờ bước 3 được viết lại.

**Người thực thi phải tự kiểm:** unique index trên `tournament_match_assignments.match_id` (B2 Step 3); tên trường định danh người dùng từ `requireTournamentAccess()` (dùng ở `access.actor` trong B1, B2).
