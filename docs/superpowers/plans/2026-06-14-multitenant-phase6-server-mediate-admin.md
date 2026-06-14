# Multi-tenant Phase 6 — Server-mediate Admin Pages (Option B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the admin pages work through server API routes (service-role key, `requireGroupAdmin`-guarded) instead of querying Supabase directly from the browser — so a club admin only needs the group code + admin password (the signed `group_session` cookie), with no Supabase Auth dependency. RLS becomes a pure backstop (anon denied).

**Architecture:** Unify on ONE auth mechanism for everyone: the signed `group_session` HTTP-only cookie (member or admin role). All data access — member AND admin — goes through Next.js server routes using the service-role key, scoped by `getGroupIdForDatabase()` and gated (for writes) by `requireGroupAdmin()`. The browser never holds a privileged DB key; RLS denies the anon key. This removes the need for admins to have Supabase Auth sessions and fixes the "admin-by-code from the homepage lands on a broken /admin" gap.

**Tech Stack:** Next.js 14 App Router, Supabase service-role client (`supabaseAdmin`), `group_session` cookie helpers (`lib/groupSession.js`), Node test scripts.

---

## Background (read before starting)

- RLS is live. The anon browser client is denied. Member pages already go through `/api/club/*` (service key + cookie). The two ADMIN pages still query Supabase directly from the browser and therefore only work if the admin has a Supabase Auth JWT (the `/login` path). Option B removes that requirement.
- `requireGroupAdmin()` (`lib/groupSession.js`) → `{ ok:true, session, groupId }` for an admin `group_session` cookie, else `{ ok:false, response }` (403). `getGroupIdForDatabase()` returns the current group id from the cookie. `supabaseAdmin` = service-role client (bypasses RLS).
- Existing reusable routes: `GET /api/club/transactions` (returns `{ transactions }`), `GET /api/club/members` (returns `{ members }` all, ordered by full_name).
- After this phase, the homepage "Tham gia nhóm" with the admin password (role=admin) lands on a fully-working `/admin` with NO Supabase session — because every admin operation now flows through cookie-authorized server routes.

**Admin operation inventory (must each get a server route):**

`app/quy/admin/page.js` (Fund admin):
| Handler | Current direct call | New route |
|---|---|---|
| `loadTransactions` | `quy_pickleball` select | reuse `GET /api/club/transactions` |
| `loadMembers` | `club_members` select | reuse `GET /api/club/members` |
| `updateTransaction(id, updates)` | `quy_pickleball` update | `PATCH /api/club/transactions` |
| `handleBulkUpdate` | `quy_pickleball` update `.in(ids)` | `PATCH /api/club/transactions` |
| `addExpenseTransaction` (Thu/Chi) | `quy_pickleball` insert | `POST /api/club/transactions` |
| `addMember` | `club_members` insert | `POST /api/club/members` |
| `updateMember` | `club_members` update | `PATCH /api/club/members` |
| `deleteMember(id)` | `club_members` delete | `DELETE /api/club/members?id=` |

`app/giai-dau/admin/page.js` (Tournament admin):
| Handler | Current direct call | New route |
|---|---|---|
| `loadTeams` / `loadMatches` / `loadPairings` / `loadStats` | `tournament_*` selects | `GET /api/tournament/admin/overview` |
| `handleResetTournament` | `tournament_*` deletes | `POST /api/tournament/admin/reset` |
| settings / reveal-round1 | already via `/api/tournament/admin/*` | unchanged |

---

## Task 1: Extend the club transactions API (create + update/bulk)

**Files:**
- Modify: `app/api/club/transactions/route.js`
- Create: `tests/multitenant-phase6.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/multitenant-phase6.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const tx = read('app/api/club/transactions/route.js');
assert(
    tx.includes('export async function POST') &&
    tx.includes('export async function PATCH') &&
    tx.includes('requireGroupAdmin') &&
    tx.includes('MANUAL_THU') &&
    tx.includes('MANUAL_CHI'),
    'Club transactions route should support admin-guarded manual create (Thu/Chi) and update/bulk.'
);

console.log('multitenant phase 6 contract ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase6.test.js`
Expected: FAIL — route has no POST/PATCH yet.

- [ ] **Step 3: Extend the route**

`app/api/club/transactions/route.js` currently has only a `GET` (using `getGroupIdForDatabase` + `supabaseAdmin`). Keep that `GET`. Add `requireGroupAdmin` to the imports line `import { getGroupIdForDatabase } from '@/lib/groupSession';` → `import { getGroupIdForDatabase, requireGroupAdmin } from '@/lib/groupSession';`. Then append these two handlers:

```javascript
const ALLOWED_UPDATE_FIELDS = [
    'loai_giao_dich',
    'huong_giao_dich',
    'is_manually_categorized',
    'nguoi_nop',
    'noi_dung_goc',
    'admin_note',
    'so_tien',
];

export async function POST(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const amount = Math.abs(parseFloat(body?.so_tien) || 0);
    if (!amount) {
        return NextResponse.json({ error: 'Số tiền không hợp lệ.' }, { status: 400 });
    }
    if (!String(body?.noi_dung || '').trim()) {
        return NextResponse.json({ error: 'Nội dung là bắt buộc.' }, { status: 400 });
    }

    const isIncome = body?.direction === 'in';
    const row = {
        group_id: adminCheck.groupId,
        ma_giao_dich: `${isIncome ? 'MANUAL_THU' : 'MANUAL_CHI'}_${Date.now()}`,
        so_tien: isIncome ? amount : -amount,
        noi_dung_goc: String(body.noi_dung).trim(),
        nguoi_nop: 'THỦ QUỸ',
        loai_giao_dich: body?.loai_giao_dich || 'khac',
        huong_giao_dich: isIncome ? 'in' : 'out',
        is_manually_categorized: true,
        admin_note: String(body?.ghi_chu || '').trim() || null,
        confidence_score: 100,
        parsing_method: 'manual',
        created_at: body?.ngay_giao_dich
            ? new Date(body.ngay_giao_dich).toISOString()
            : new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from('quy_pickleball').insert([row]);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

export async function PATCH(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) {
        return NextResponse.json({ error: 'Thiếu danh sách giao dịch.' }, { status: 400 });
    }

    const updates = {};
    for (const key of ALLOWED_UPDATE_FIELDS) {
        if (body?.updates && key in body.updates) {
            updates[key] = body.updates[key];
        }
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Không có trường hợp lệ để cập nhật.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from('quy_pickleball')
        .update(updates)
        .in('id', ids)
        .eq('group_id', adminCheck.groupId);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test → PASS**

Run: `node tests/multitenant-phase6.test.js` → `multitenant phase 6 contract ok`.

- [ ] **Step 5: Register script + commit**

In `package.json` `scripts`, add `"test:phase6": "node tests/multitenant-phase6.test.js"` after `"test:phase5"`.

```bash
git add app/api/club/transactions/route.js tests/multitenant-phase6.test.js package.json
git commit -m "feat: add admin-guarded create/update on club transactions API"
```

---

## Task 2: Extend the club members API (create/update/delete)

**Files:**
- Modify: `app/api/club/members/route.js`
- Modify: `tests/multitenant-phase6.test.js`

- [ ] **Step 1: Add the failing test** (before the final `console.log` in `tests/multitenant-phase6.test.js`):

```javascript
const mem = read('app/api/club/members/route.js');
assert(
    mem.includes('export async function POST') &&
    mem.includes('export async function PATCH') &&
    mem.includes('export async function DELETE') &&
    mem.includes('requireGroupAdmin'),
    'Club members route should support admin-guarded create/update/delete.'
);
```

- [ ] **Step 2: Run → FAIL.** `node tests/multitenant-phase6.test.js`.

- [ ] **Step 3: Extend the route.** `app/api/club/members/route.js` has only `GET`. Keep it. Change the groupSession import to also import `requireGroupAdmin`. Append:

```javascript
export async function POST(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const fullName = String(body?.full_name || '').trim();
    if (!fullName) {
        return NextResponse.json({ error: 'Tên thành viên là bắt buộc.' }, { status: 400 });
    }
    const aliases = Array.isArray(body?.aliases) && body.aliases.length > 0 ? body.aliases : null;

    const { data, error } = await supabaseAdmin
        .from('club_members')
        .insert([{ group_id: adminCheck.groupId, full_name: fullName.toUpperCase(), aliases }])
        .select('id, full_name, aliases, is_active')
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ member: data });
}

export async function PATCH(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const id = body?.id;
    if (!id) {
        return NextResponse.json({ error: 'Thiếu id thành viên.' }, { status: 400 });
    }
    const updates = {};
    if (Array.isArray(body?.aliases)) {
        updates.aliases = body.aliases.length > 0 ? body.aliases : null;
    }
    if (typeof body?.is_active === 'boolean') {
        updates.is_active = body.is_active;
    }
    if (typeof body?.full_name === 'string' && body.full_name.trim()) {
        updates.full_name = body.full_name.trim().toUpperCase();
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Không có thay đổi.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from('club_members')
        .update(updates)
        .eq('id', id)
        .eq('group_id', adminCheck.groupId);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'Thiếu id.' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
        .from('club_members')
        .delete()
        .eq('id', id)
        .eq('group_id', adminCheck.groupId);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit:**
```bash
git add app/api/club/members/route.js tests/multitenant-phase6.test.js
git commit -m "feat: add admin-guarded create/update/delete on club members API"
```

---

## Task 3: Tournament admin overview + reset API

**Files:**
- Create: `app/api/tournament/admin/overview/route.js`
- Create: `app/api/tournament/admin/reset/route.js`
- Modify: `tests/multitenant-phase6.test.js`

- [ ] **Step 1: Add the failing test** (before the final `console.log`):

```javascript
const overview = read('app/api/tournament/admin/overview/route.js');
assert(
    overview.includes('export async function GET') &&
    overview.includes('getGroupIdForDatabase') &&
    overview.includes('tournament_teams') &&
    overview.includes('tournament_pairings'),
    'Tournament overview route should return teams/matches/pairings/stats scoped to the group.'
);
const reset = read('app/api/tournament/admin/reset/route.js');
assert(
    reset.includes('export async function POST') &&
    reset.includes('requireGroupAdmin') &&
    reset.includes('tournament_matches'),
    'Tournament reset route should be admin-guarded and delete tournament data for the group.'
);
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Create the overview route** `app/api/tournament/admin/overview/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase } from '@/lib/groupSession';

export async function GET() {
    const groupId = getGroupIdForDatabase();

    const [teamsRes, matchesRes, pairingsRes, playersRes] = await Promise.all([
        supabaseAdmin
            .from('tournament_teams')
            .select('*')
            .eq('group_id', groupId)
            .order('team_code', { ascending: true }),
        supabaseAdmin
            .from('tournament_matches')
            .select('*')
            .eq('group_id', groupId)
            .order('round', { ascending: true })
            .order('match_order', { ascending: true }),
        supabaseAdmin
            .from('tournament_pairings')
            .select(`
                *,
                player1:tournament_players!tournament_pairings_player1_id_fkey(full_name),
                player2:tournament_players!tournament_pairings_player2_id_fkey(full_name)
            `)
            .eq('group_id', groupId)
            .order('round', { ascending: true })
            .order('team_code', { ascending: true })
            .order('pair_order', { ascending: true }),
        supabaseAdmin
            .from('tournament_players')
            .select('id')
            .eq('group_id', groupId),
    ]);

    const matches = matchesRes.data || [];
    const pairings = pairingsRes.data || [];
    const stats = {
        totalPlayers: (playersRes.data || []).length,
        totalMatches: matches.length,
        completedMatches: matches.filter((m) => m.match_status === 'completed').length,
        pendingSubmissions: pairings.filter((p) => p.submission_status === 'draft').length,
    };

    return NextResponse.json({
        teams: teamsRes.data || [],
        matches,
        pairings,
        stats,
    });
}
```

> NOTE: if `loadTeams` in `app/giai-dau/admin/page.js` orders teams by a different column than `team_code`, match that column here. Read the file to confirm before finalizing.

- [ ] **Step 4: Create the reset route** `app/api/tournament/admin/reset/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGroupAdmin } from '@/lib/groupSession';

const SENTINEL = '00000000-0000-0000-0000-000000000000';

export async function POST() {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;
    const groupId = adminCheck.groupId;

    for (const table of ['tournament_matches', 'tournament_pairings', 'tournament_players', 'tournament_teams']) {
        const { error } = await supabaseAdmin
            .from(table)
            .delete()
            .eq('group_id', groupId)
            .neq('id', SENTINEL);
        if (error) {
            return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
        }
    }
    return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run → PASS.** **Step 6: Commit:**
```bash
git add app/api/tournament/admin/overview/route.js app/api/tournament/admin/reset/route.js tests/multitenant-phase6.test.js
git commit -m "feat: add admin-guarded tournament overview and reset APIs"
```

---

## Task 4: Convert the fund admin page to server routes

**Files:**
- Modify: `app/quy/admin/page.js`
- Modify: `tests/multitenant-phase6.test.js`

- [ ] **Step 1: Add the failing test** (before the final `console.log`):

```javascript
const fundAdmin = read('app/quy/admin/page.js');
assert(
    !fundAdmin.includes('@/lib/supabaseClient') && !fundAdmin.includes('.from('),
    'Fund admin page should not query Supabase directly.'
);
assert(
    fundAdmin.includes('/api/club/transactions') && fundAdmin.includes('/api/club/members'),
    'Fund admin page should use the club server APIs.'
);
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Read `app/quy/admin/page.js` fully, then convert.** Remove `import { supabase } from '@/lib/supabaseClient';`. Keep `getCurrentGroupIdClient`/`getCurrentGroupClient`/`isMissingGroupColumnError` only if still used (the loaders below drop `getCurrentGroupIdClient`; remove it if no other use). Replace each handler body:

`loadTransactions`:
```javascript
    async function loadTransactions() {
        const res = await fetch('/api/club/transactions');
        const data = await res.json();
        setTransactions(res.ok ? (data.transactions || []) : []);
    }
```

`loadMembers`:
```javascript
    async function loadMembers() {
        const res = await fetch('/api/club/members');
        const data = await res.json();
        setMembers(res.ok ? (data.members || []) : []);
    }
```

`updateTransaction`:
```javascript
    async function updateTransaction(id, updates) {
        const res = await fetch('/api/club/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [id], updates }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi cập nhật: ' + (data.error || ''));
        } else {
            loadTransactions();
            setEditingTransaction(null);
        }
    }
```

`handleBulkUpdate` (keep the validation/confirm; replace the DB call):
```javascript
        const res = await fetch('/api/club/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ids: selectedTransactions,
                updates: { loai_giao_dich: bulkEditCategory, is_manually_categorized: true },
            }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi: ' + (data.error || ''));
            return;
        }
```
(then keep the existing success path: reload, clear selection, etc. — replace whatever followed the old `if (error)` block accordingly.)

`addExpenseTransaction` (the Thu/Chi manual insert) — replace the insert + result handling:
```javascript
        const res = await fetch('/api/club/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                direction: expenseForm.direction,
                so_tien: expenseForm.so_tien,
                loai_giao_dich: expenseForm.loai_giao_dich,
                noi_dung: expenseForm.noi_dung,
                ngay_giao_dich: expenseForm.ngay_giao_dich,
                ghi_chu: expenseForm.ghi_chu,
            }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi thêm giao dịch: ' + (data.error || ''));
        } else {
            const isIncome = expenseForm.direction === 'in';
            alert(isIncome ? 'Đã thêm giao dịch thu thành công!' : 'Đã thêm giao dịch chi thành công!');
            setAddingExpense(false);
            setExpenseForm({ direction: 'out', so_tien: '', loai_giao_dich: 'khac', noi_dung: '', ngay_giao_dich: new Date().toISOString().split('T')[0], ghi_chu: '' });
            loadTransactions();
        }
```

`addMember`:
```javascript
        const res = await fetch('/api/club/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: newMember.full_name, aliases: aliasesArray }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi thêm thành viên: ' + (data.error || ''));
        } else {
            loadMembers();
            setAddingMember(false);
            setNewMember({ full_name: '', aliasesText: '' });
        }
```

`updateMember`:
```javascript
        const res = await fetch('/api/club/members', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingMember.id, aliases: aliasesArray, is_active: editMemberForm.is_active }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi cập nhật: ' + (data.error || ''));
        } else {
            loadMembers();
            setEditingMember(null);
            setEditMemberForm({});
        }
```

`deleteMember`:
```javascript
    async function deleteMember(id) {
        if (!confirm('Bạn có chắc muốn xóa thành viên này?')) return;
        const res = await fetch(`/api/club/members?id=${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi xóa: ' + (data.error || ''));
        } else {
            loadMembers();
        }
    }
```

After editing, grep the file to confirm zero `supabase`, `.from(`, and `getCurrentGroupIdClient` references remain (unless `getCurrentGroupClient` is still used by `checkAuth`).

ALSO update `tests/admin-auth.test.js`: it currently asserts `app/quy/admin/page.js` includes `'MANUAL_THU'` (from the earlier manual-Thu work). That literal moves to the API route now, so the page no longer contains it. Change that assertion to drop the `MANUAL_THU` check and keep only the page-level evidence that still exists:
```javascript
const fundAdmin = read('app/quy/admin/page.js');
assert(
    fundAdmin.includes('💰 Thu') && fundAdmin.includes('direction'),
    'Fund admin should support manual income (Thu) entry, not just expense.'
);
```
(`MANUAL_THU` is now covered by the Phase 6 transactions-route test.) Add `tests/admin-auth.test.js` to this task's commit.

- [ ] **Step 4: Run → PASS.** **Step 5: Build:** `npm run build` (stop any running dev server first to avoid corrupting `.next`). **Step 6: Commit:**
```bash
git add app/quy/admin/page.js tests/multitenant-phase6.test.js
git commit -m "refactor: serve fund admin page via server APIs"
```

---

## Task 5: Convert the tournament admin page to server routes

**Files:**
- Modify: `app/giai-dau/admin/page.js`
- Modify: `tests/multitenant-phase6.test.js`

- [ ] **Step 1: Add the failing test** (before the final `console.log`):

```javascript
const tourAdmin = read('app/giai-dau/admin/page.js');
assert(
    !tourAdmin.includes('@/lib/supabaseClient') && !tourAdmin.includes('.from('),
    'Tournament admin page should not query Supabase directly.'
);
assert(
    tourAdmin.includes('/api/tournament/admin/overview') && tourAdmin.includes('/api/tournament/admin/reset'),
    'Tournament admin page should use the overview and reset APIs.'
);
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Read `app/giai-dau/admin/page.js` fully, then convert.** Remove `import { supabase } from '@/lib/supabaseClient';` (keep `getCurrentGroupClient` used by `checkAuth`; remove `getCurrentGroupIdClient` if no longer used). Replace the four loaders (`loadTeams`, `loadMatches`, `loadPairings`, `loadStats`) with a single overview fetch, and merge it into `loadData`. Concretely:
  - Replace the bodies of `loadTeams`, `loadMatches`, `loadPairings`, `loadStats` by deleting them, and change `loadData` to:
```javascript
    async function loadData() {
        setLoading(true);
        await Promise.all([loadSettings(), loadOverview()]);
        setLoading(false);
    }

    async function loadOverview() {
        const res = await fetch('/api/tournament/admin/overview');
        const data = await res.json();
        if (res.ok) {
            setTeams(data.teams || []);
            setMatches(data.matches || []);
            setPairings(data.pairings || []);
            setStats(data.stats || { totalPlayers: 0, totalMatches: 0, completedMatches: 0, pendingSubmissions: 0 });
        }
    }
```
  (Keep `loadSettings` as-is — it already uses `/api/tournament/admin/settings`.) If `loadData` previously called `loadTeams/loadMatches/loadPairings/loadStats`, replace those calls with `loadOverview()`.
  - Replace `handleResetTournament`'s four `supabase.from(...).delete()` calls with:
```javascript
        const res = await fetch('/api/tournament/admin/reset', { method: 'POST' });
        if (!res.ok) {
            const data = await res.json();
            alert('Lỗi reset: ' + (data.error || ''));
            return;
        }
        alert('Đã reset giải đấu!');
        loadData();
```

After editing, grep to confirm no `supabase` / `.from(` remain.

- [ ] **Step 4: Run → PASS.** **Step 5: Build** (dev server stopped). **Step 6: Commit:**
```bash
git add app/giai-dau/admin/page.js tests/multitenant-phase6.test.js
git commit -m "refactor: serve tournament admin page via server APIs"
```

---

## Task 6: Nav components read role from the group session

**Files:**
- Modify: `components/MobileBottomNav.js`
- Modify: `components/TournamentModuleNav.js`
- Modify: `tests/multitenant-phase6.test.js`

**Why:** These gate admin nav items on `supabase.auth.getUser()`. Under Option B admins have no Supabase session, so they must derive the role from the `group_session` (via `getCurrentGroupClient()` from `lib/groupClient.js`, which reads `teamfund-current-group` localStorage) — the same source `UserStatusBadge` already uses.

- [ ] **Step 1: Add the failing test** (before the final `console.log`):

```javascript
for (const f of ['components/MobileBottomNav.js', 'components/TournamentModuleNav.js']) {
    const src = read(f);
    assert(
        src.includes('getCurrentGroupClient') && !src.includes('supabase.auth'),
        `${f} should derive role from the group session, not Supabase Auth.`
    );
}
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Read each file and convert.** In both `components/MobileBottomNav.js` and `components/TournamentModuleNav.js`: remove `import { supabase } from '@/lib/supabaseClient';`, add `import { getCurrentGroupClient } from '@/lib/groupClient';`, and replace the `supabase.auth.getUser()` role-detection (currently something like setting an `isAdmin`/role state from `user.user_metadata.role`) with a synchronous read in the mount effect:
```javascript
        const group = getCurrentGroupClient();
        setIsAdmin(group.role === 'admin');
```
Match the existing state setter name in each file (it may be `setIsAdmin`, `setRole`, or similar — read the file and keep its existing state variable; only change the SOURCE of the role from Supabase Auth to `getCurrentGroupClient()`). Keep all rendering/markup unchanged. If a file shows tournament-specific items for captains, preserve that branch but note captains still use Supabase Auth — only the club-admin detection moves to the group session. (If the component does not reference captains, just use the group role.)

- [ ] **Step 4: Run → PASS.** **Step 5: Build** (dev server stopped). **Step 6: Commit:**
```bash
git add components/MobileBottomNav.js components/TournamentModuleNav.js tests/multitenant-phase6.test.js
git commit -m "feat: nav components derive admin role from the group session"
```

---

## Task 7: Admin password change via the group hash (replace Supabase Auth)

**Files:**
- Modify: `app/api/club/settings/route.js`
- Modify: `app/admin/ClubSettings.js`
- Modify: `tests/multitenant-phase6.test.js`

**Why:** Phase 4 added admin-password change via `supabase.auth.updateUser({ password })`, which depends on Supabase Auth. Under Option B admins log in with the club code + the group's admin password (`groups.admin_password_hash`). So "change admin password" must update `groups.admin_password_hash` (like the member password) through a guarded server route, and `ClubSettings` must drop its Supabase-Auth dependency.

- [ ] **Step 1: Add the failing test** (before the final `console.log` in `tests/multitenant-phase6.test.js`):

```javascript
const settingsRoute = read('app/api/club/settings/route.js');
assert(
    settingsRoute.includes('adminPassword') && settingsRoute.includes('admin_password_hash'),
    'Settings PATCH should let an admin change the group admin password (hashed).'
);
const settingsUi = read('app/admin/ClubSettings.js');
assert(
    !settingsUi.includes('supabase.auth') && settingsUi.includes('adminPassword'),
    'ClubSettings should change the admin password via the server route, not Supabase Auth.'
);
```

- [ ] **Step 2: Run → FAIL.** `node tests/multitenant-phase6.test.js`.

- [ ] **Step 3: Extend the settings PATCH.** In `app/api/club/settings/route.js`, the `PATCH` handler already builds an `updates` object (handling `name`, `description`, `memberPassword` → `member_password_hash` via `hashPassword`, and Phase 4's `logoUrl`). Add an admin-password branch alongside the member-password one:

```javascript
    if (typeof body?.adminPassword === 'string' && body.adminPassword) {
        if (body.adminPassword.length < 6) {
            return NextResponse.json({ error: 'Mật khẩu admin cần ít nhất 6 ký tự.' }, { status: 400 });
        }
        updates.admin_password_hash = hashPassword(body.adminPassword);
    }
```

(`hashPassword` is already imported in this file for the member password. If not, add `import { hashPassword } from '@/lib/groupAuth';`.)

- [ ] **Step 4: Convert the ClubSettings password handler.** In `app/admin/ClubSettings.js`:
  - Find the password-change handler (it calls `await supabase.auth.updateUser({ password: passwordForm.next })`). Replace that call + its result handling with:
```javascript
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminPassword: passwordForm.next }),
        });
        if (!res.ok) {
            const data = await res.json();
            setError(data.error || 'Không đổi được mật khẩu.');
        } else {
            setPasswordForm({ next: '', confirm: '' });
            setNotice('Đã đổi mật khẩu đăng nhập admin.');
        }
        setChangingPassword(false);
```
  (Preserve the existing validation: min-6 and next===confirm checks before the fetch, and the `setChangingPassword(true)` before it.)
  - Remove `import { supabase } from '@/lib/supabaseClient';` if that was the ONLY use of `supabase` in the file (grep to confirm no other `supabase.` references remain; the logo uploader and other handlers use fetch, not supabase).
  - Update the section hint text if it says "Đổi mật khẩu đăng nhập admin" — keep it; it is still accurate (now the club admin password).

- [ ] **Step 5: Run → PASS.** Run `node tests/multitenant-phase6.test.js`. Also run `npm run test:phase4` (the other session's test) to ensure the branding/account assertions still pass; if Phase 4's test asserted `supabase.auth.updateUser` specifically, update that assertion to match the new server-route approach.

- [ ] **Step 6: Build** (dev server stopped) + **commit:**
```bash
git add app/api/club/settings/route.js app/admin/ClubSettings.js tests/multitenant-phase6.test.js
git commit -m "feat: change admin password via group hash instead of Supabase Auth"
```

---

## Task 8: Verification + push

**Files:** none (verification)

- [ ] **Step 1: Run all node tests**
```bash
npm run test:phase6 && npm run test:phase5 && npm run test:phase3 && npm run test:phase2 && npm run test:isolation && npm run test:teamfund && npm run test:admin-auth && npm run test:debug-guard && npm run test:mobile-nav && npm run test:tournament-dashboard && npm run test:admin-center
```
Expected: every script prints its `... ok` line. (If `test:phase4` exists from another session, run it too.)

- [ ] **Step 2: Build** — `npm run build` (no dev server running) → compiles, no errors.

- [ ] **Step 3: Manual matrix (dev server + admin group-session cookie — NO Supabase login)**

Join from the homepage with the club code + **admin** password, then:
| Scenario | Expected |
|---|---|
| `/admin` Quỹ tab | transactions + members load (via `/api/club/*`) |
| Add Thu / Chi, edit a transaction, bulk-categorize | succeed via API |
| Add / edit / delete a member | succeed via API |
| `/admin` Giải đấu tab | teams/matches/pairings/stats load; reset works |
| Bottom nav / tournament nav | admin items visible (role from group session) |
| Anon (logged out) direct query | still denied (RLS) — `npm run test:isolation` passes |

This confirms the admin experience works with NO Supabase Auth session — the homepage admin-by-code path is now whole.

- [ ] **Step 4: Push** — `git push origin main`.

---

## Out of scope / notes

- `/login` (Supabase Auth email) and the create-flow `signInWithPassword` (Task 13) still work and are harmless — admins simply no longer NEED them. Removing Supabase-Auth admin provisioning entirely (group creation, `/login`) is a separate cleanup; leave it for now (it enables future per-individual identity / password reset if email is added later).
- Tournament **captain** auth still uses Supabase Auth; unchanged (its data already flows through `/api/tournament/*` service-role routes).

## Self-Review Notes

- **Spec coverage:** every direct `supabase.from(...)` in the two admin pages maps to a server route (Tasks 1–3) and a page conversion (Tasks 4–5); nav role source fixed (Task 6). The homepage admin-by-code gap is closed because admin operations now honor the cookie server-side.
- **Security:** all new write routes call `requireGroupAdmin()` and scope by `adminCheck.groupId`; transaction PATCH whitelists updatable fields. Reads use `getGroupIdForDatabase()`. RLS still denies the anon key (backstop).
- **Type consistency:** `requireGroupAdmin()` → `adminCheck.ok/response/groupId`; transactions PATCH body `{ ids, updates }`; POST body `{ direction, so_tien, loai_giao_dich, noi_dung, ngay_giao_dich, ghi_chu }`; members POST `{ full_name, aliases }`, PATCH `{ id, aliases, is_active, full_name }`, DELETE `?id=`.
