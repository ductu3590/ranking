# Tournament Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin?section=tournament` as a mobile-first List → tabbed Console, and make every operational API per-tournament (`tournament_id`), fixing the panels currently broken against the real schema.

**Architecture:** Master-detail. A tournament list screen; tapping a tournament opens a console with tabs (Tổng quan · Cài đặt · Đội & VĐV · Pairings · Trận đấu), driven by `?t=<id>&tab=...`. Backend threads `tournamentId` through overview/settings/teams/toggles/reorder/reset, mirroring the already-correct `auto-assign` route. Settings move to per-`(group_id, tournament_id)` key-value rows. Pairings tab is read-only this round.

**Tech Stack:** Next.js 14 App Router (JS, `'use client'`), Supabase, plain-Node grep-contract tests (`tests/*.test.js` run via `node`), CSS modules-by-import.

**Reference facts (verified against DB `uhhlelemewilgsdijwja`):**
- `tournament_settings` = key-value (`setting_key`, `setting_value` jsonb). Unique index is `unique_setting(tournament_id, setting_key)` — missing `group_id`.
- `tournament_pairings` = FK shape (`team_id`, `player1_id`, `player2_id`).
- `auto-assign` (`app/api/tournaments/auto-assign/route.js`) is the correct per-tournament pattern: validate tournament belongs to group, then `.eq('group_id', …).eq('tournament_id', tournamentId)`.
- Tests are source-grep contracts: read a file, `assert(content.includes(...))`. Match this style.

**Test runner note:** each test file is registered in `package.json` scripts and run with `node tests/<file>.test.js`. Add new scripts where indicated.

---

## Phase 0 — Schema fix

### Task 0: Fix `tournament_settings` unique index (group_id-aware)

**Files:**
- Create: `database/migrations/013_tournament_settings_group_unique.sql`
- Apply: via Supabase MCP `apply_migration` (project `uhhlelemewilgsdijwja`) OR `supabase db push`
- Test: `tests/tournament-admin-redesign.test.js` (new — first assertion)

- [ ] **Step 1: Write the failing test**

Create `tests/tournament-admin-redesign.test.js`:

```js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

assert(exists('database/migrations/013_tournament_settings_group_unique.sql'),
    'Migration 013 should exist.');
const m013 = read('database/migrations/013_tournament_settings_group_unique.sql');
assert(/drop\s+index/i.test(m013) && m013.includes('unique_setting'),
    'Migration 013 should drop the old unique_setting index.');
assert(/group_id,\s*tournament_id,\s*setting_key/i.test(m013),
    'Migration 013 should create a unique index on (group_id, tournament_id, setting_key).');

console.log('tournament admin redesign contract ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/tournament-admin-redesign.test.js`
Expected: FAIL with "Migration 013 should exist."

- [ ] **Step 3: Create the migration**

Create `database/migrations/013_tournament_settings_group_unique.sql`:

```sql
-- 013: tournament_settings must be unique per (group_id, tournament_id, setting_key).
-- Fixes: (1) toggle-round1/toggle-pairings-lock upserts use onConflict
-- 'group_id,tournament_id,setting_key' but no matching unique index existed;
-- (2) multi-tenant collision where two clubs both with tournament_id=1 shared a row.

DROP INDEX IF EXISTS unique_setting;
ALTER TABLE tournament_settings
    DROP CONSTRAINT IF EXISTS unique_setting;

CREATE UNIQUE INDEX IF NOT EXISTS unique_setting_group_tournament_key
    ON tournament_settings (group_id, tournament_id, setting_key);
```

- [ ] **Step 4: Apply the migration to the database**

Use Supabase MCP `apply_migration` with name `tournament_settings_group_unique` and the SQL above (project `uhhlelemewilgsdijwja`). Verify:

Run (MCP `execute_sql`): `select indexname from pg_indexes where tablename='tournament_settings';`
Expected: includes `unique_setting_group_tournament_key`, no `unique_setting`.

- [ ] **Step 5: Register and run the test**

Add to `package.json` scripts: `"test:tournament-admin-redesign": "node tests/tournament-admin-redesign.test.js"`

Run: `node tests/tournament-admin-redesign.test.js`
Expected: PASS — "tournament admin redesign contract ok"

- [ ] **Step 6: Commit**

```bash
git add database/migrations/013_tournament_settings_group_unique.sql tests/tournament-admin-redesign.test.js package.json
git commit -m "fix(tournament): unique tournament_settings per (group, tournament, key)"
```

---

## Phase 1 — Backend: thread `tournamentId` through operational APIs

> Pattern for all GET routes: read `tournamentId` from query (`new URL(request.url).searchParams`). For POST/PUT: read from body. Validate it is a positive integer; 400 if missing. Always filter `.eq('group_id', groupId).eq('tournament_id', tournamentId)`.

### Task 1: Rewrite settings route to per-tournament key-value

**Files:**
- Modify (full replace): `app/api/tournament/admin/settings/route.js`
- Test: append to `tests/tournament-admin-redesign.test.js`

- [ ] **Step 1: Write the failing test** (append before the final `console.log`)

```js
const settingsRoute = read('app/api/tournament/admin/settings/route.js');
assert(settingsRoute.includes("'round1_reveal_time'") &&
    settingsRoute.includes("'total_courts'") &&
    settingsRoute.includes('setting_key') && settingsRoute.includes('setting_value'),
    'Settings route should read/write key-value settings, not flat columns.');
assert(settingsRoute.includes('tournamentId') &&
    settingsRoute.includes(".eq('tournament_id'"),
    'Settings route should be scoped by tournamentId.');
assert(settingsRoute.includes("onConflict: 'group_id,tournament_id,setting_key'"),
    'Settings upsert should target the group-aware unique index.');
assert(!settingsRoute.includes('tournament_name') && !settingsRoute.includes("order('created_at'"),
    'Settings route should drop dead flat-column logic.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/tournament-admin-redesign.test.js`
Expected: FAIL on the settings assertions.

- [ ] **Step 3: Replace the route**

Full new `app/api/tournament/admin/settings/route.js`:

```js
import { supabaseServer } from '@/lib/supabaseServer';
import { getGroupIdForDatabase, requireGroupAdmin } from '@/lib/groupSession';
import { NextResponse } from 'next/server';

const SETTING_KEYS = [
    'round1_reveal_time',
    'start_time',
    'end_time',
    'total_courts',
    'match_duration_minutes',
    'break_duration_minutes',
];

function readTournamentId(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(request) {
    try {
        const groupId = getGroupIdForDatabase();
        const tournamentId = readTournamentId(new URL(request.url).searchParams.get('tournamentId'));
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
        }
        const { data, error } = await supabaseServer
            .from('tournament_settings')
            .select('setting_key, setting_value')
            .eq('group_id', groupId)
            .eq('tournament_id', tournamentId)
            .in('setting_key', SETTING_KEYS);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const settings = {};
        for (const row of data || []) settings[row.setting_key] = row.setting_value;
        return NextResponse.json({ settings });
    } catch (err) {
        console.error('Settings GET error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const adminCheck = requireGroupAdmin();
        if (!adminCheck.ok) return adminCheck.response;
        const groupId = getGroupIdForDatabase();
        const body = await request.json();
        const tournamentId = readTournamentId(body?.tournamentId);
        if (!tournamentId) {
            return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
        }
        const rows = SETTING_KEYS
            .filter((key) => key in body)
            .map((key) => ({
                group_id: groupId,
                tournament_id: tournamentId,
                setting_key: key,
                setting_value: body[key] ?? null,
                updated_at: new Date().toISOString(),
            }));
        if (rows.length > 0) {
            const { error } = await supabaseServer
                .from('tournament_settings')
                .upsert(rows, { onConflict: 'group_id,tournament_id,setting_key' });
            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        }
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Settings POST error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/tournament-admin-redesign.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/tournament/admin/settings/route.js tests/tournament-admin-redesign.test.js
git commit -m "fix(tournament): per-tournament key-value settings route"
```

### Task 2: Scope overview, teams, toggles, reorder, reset by `tournamentId`

**Files:**
- Modify: `app/api/tournament/admin/overview/route.js`
- Modify: `app/api/tournament/teams/route.js`
- Modify: `app/api/tournament/admin/toggle-round1/route.js`
- Modify: `app/api/tournament/admin/toggle-pairings-lock/route.js`
- Modify: `app/api/tournament/admin/reorder/route.js`
- Modify: `app/api/tournament/admin/reset/route.js`
- Test: append to `tests/tournament-admin-redesign.test.js`

- [ ] **Step 1: Write the failing test** (append before final `console.log`)

```js
for (const f of [
    'app/api/tournament/admin/overview/route.js',
    'app/api/tournament/teams/route.js',
    'app/api/tournament/admin/toggle-round1/route.js',
    'app/api/tournament/admin/toggle-pairings-lock/route.js',
    'app/api/tournament/admin/reorder/route.js',
    'app/api/tournament/admin/reset/route.js',
]) {
    const c = read(f);
    assert(c.includes('tournamentId') && c.includes(".eq('tournament_id'"),
        `${f} should be scoped by tournamentId.`);
}
const reset = read('app/api/tournament/admin/reset/route.js');
assert(!reset.includes('00000000-0000-0000-0000-000000000000'),
    'reset route should not use the UUID sentinel against integer ids.');
const teams = read('app/api/tournament/teams/route.js');
assert(!teams.includes(".eq('tournament_id', 1)"),
    'teams route should not hardcode tournament_id = 1.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/tournament-admin-redesign.test.js`
Expected: FAIL on the route-scoping assertions.

- [ ] **Step 3a: overview route** — `app/api/tournament/admin/overview/route.js`

Change the signature and add the filter to all four queries. Replace:

```js
export async function GET() {
    const groupId = getGroupIdForDatabase();
```

with:

```js
export async function GET(request) {
    const groupId = getGroupIdForDatabase();
    const tournamentId = Number(new URL(request.url).searchParams.get('tournamentId'));
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
        return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
    }
```

Then on each of the four `supabaseAdmin.from('tournament_*')` query chains, add `.eq('tournament_id', tournamentId)` immediately after the existing `.eq('group_id', groupId)` line.

- [ ] **Step 3b: teams route** — `app/api/tournament/teams/route.js`

Replace `export async function GET() {` with `export async function GET(request) {`. Compute once near the top of the `try`:

```js
const tournamentId = Number(new URL(request.url).searchParams.get('tournamentId')) || 1;
```

Replace every `.eq('tournament_id', 1)` (both the main block and the fallback block) with `.eq('tournament_id', tournamentId)`.

- [ ] **Step 3c: toggle-round1 route** — `app/api/tournament/admin/toggle-round1/route.js`

In `POST`, read `tournamentId` from the body and use it in the upsert. Replace:

```js
        const { reveal } = await request.json();
```

with:

```js
        const { reveal, tournamentId } = await request.json();
        const tid = Number(tournamentId);
        if (!Number.isFinite(tid) || tid <= 0) {
            return NextResponse.json({ success: false, error: 'tournamentId is required' }, { status: 400 });
        }
```

In the upsert object, replace `tournament_id: 1,` with `tournament_id: tid,`.

In `GET`, replace `export async function GET() {` with `export async function GET(request) {` and add, after `const groupId = getGroupIdForDatabase();`:

```js
        const tournamentId = Number(new URL(request.url).searchParams.get('tournamentId')) || 1;
```

Add `.eq('tournament_id', tournamentId)` after the `.eq('group_id', groupId)` in the GET select.

- [ ] **Step 3d: toggle-pairings-lock route** — `app/api/tournament/admin/toggle-pairings-lock/route.js`

In `POST`: after `const groupId = getGroupIdForDatabase();` add:

```js
        const { tournamentId } = await request.json().catch(() => ({}));
        const tid = Number(tournamentId);
        if (!Number.isFinite(tid) || tid <= 0) {
            return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
        }
```

Add `.eq('tournament_id', tid)` after `.eq('group_id', groupId)` in the fetch select. In the upsert object replace `tournament_id: 1,` with `tournament_id: tid,`.

In `GET`: change to `GET(request)`, add `const tournamentId = Number(new URL(request.url).searchParams.get('tournamentId')) || 1;` after `const groupId = ...`, and add `.eq('tournament_id', tournamentId)` after `.eq('group_id', groupId)` in the select.

- [ ] **Step 3e: reorder route** — `app/api/tournament/admin/reorder/route.js`

After `const { round, teamCode, newOrder } = body;` add:

```js
        const tournamentId = Number(body?.tournamentId);
        if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
            return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
        }
```

Add `.eq('tournament_id', tournamentId)` to the team lookup (after `.eq('group_id', groupId)`) and to both pairing update chains (after each `.eq('group_id', groupId)`).

- [ ] **Step 3f: reset route** — `app/api/tournament/admin/reset/route.js`

Full replace:

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGroupAdmin } from '@/lib/groupSession';

export async function POST(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;
    const groupId = adminCheck.groupId;

    const body = await request.json().catch(() => ({}));
    const tournamentId = Number(body?.tournamentId);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
        return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
    }

    for (const table of ['tournament_matches', 'tournament_pairings', 'tournament_players', 'tournament_teams', 'tournament_settings']) {
        const { error } = await supabaseAdmin
            .from(table)
            .delete()
            .eq('group_id', groupId)
            .eq('tournament_id', tournamentId);
        if (error) {
            return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
        }
    }
    return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/tournament-admin-redesign.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/tournament
git commit -m "feat(tournament): scope operational APIs by tournamentId"
```

---

## Phase 2 — Frontend: List → Console with tabs

> The page is rendered embedded by `app/admin/page.js` via `<AdminTournamentPanel embedded />`. We keep that entry component but turn it into a router that shows the list or the console based on `?t=` / `?tab=`. New presentational pieces live in `app/giai-dau/admin/components/`. CSS classes referenced (`btn-primary`, `btn-secondary`, `btn-action`, `btn-danger`, `stat-card`, `status-pill`, `form-row`, `form-group`, `tournament-admin-card`, etc.) already exist in `app/giai-dau/admin/admin-tournament.css`; new class names below get appended to that file in Task 8.

### Task 3: Add console-aware routing to `app/admin/page.js`

**Files:**
- Modify: `app/admin/page.js` (lines 31-33, 78-98)
- Test: append to `tests/tournament-admin-redesign.test.js`

- [ ] **Step 1: Write the failing test**

```js
const adminCenter = read('app/admin/page.js');
assert(adminCenter.includes("searchParams.get('t')") &&
    adminCenter.includes("searchParams.get('tab')"),
    'Admin center should read tournament id (t) and tab from the URL.');
assert(!adminCenter.includes('admin-center-subtabs'),
    'Admin center should drop the hardcoded overview/pairings subtabs.');
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Edit `app/admin/page.js`**

Replace the `setTournamentView` function (lines 31-33) with:

```js
    const tournamentId = searchParams.get('t') || '';
    const tab = searchParams.get('tab') || (searchParams.get('view') === 'pairings' ? 'pairings' : 'overview');
```

Replace the whole `{section === 'tournament' && ( ... )}` block (lines 78-98) with:

```js
                {section === 'tournament' && (
                    <section className="admin-center-panel">
                        <AdminTournamentPanel embedded tournamentId={tournamentId} tab={tab} />
                    </section>
                )}
```

Remove the now-unused `view` const (line 25) and the `AdminPairingsPage` import (line 9) only if no longer referenced (PairingsTab in Task 7 does not use it).

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.js tests/tournament-admin-redesign.test.js
git commit -m "feat(admin): route tournament section to list vs console via URL"
```

### Task 4: `AdminTournamentPanel` becomes list/console orchestrator + `TournamentList`

**Files:**
- Modify (rewrite): `app/giai-dau/admin/page.js`
- Create: `app/giai-dau/admin/components/TournamentList.js`
- Test: append to `tests/tournament-admin-redesign.test.js`

- [ ] **Step 1: Write the failing test**

```js
assert(exists('app/giai-dau/admin/components/TournamentList.js'),
    'TournamentList component should exist.');
const panel = read('app/giai-dau/admin/page.js');
assert(panel.includes('tournamentId') && panel.includes('TournamentConsole') &&
    panel.includes('TournamentList'),
    'Panel should switch between TournamentList and TournamentConsole.');
const list = read('app/giai-dau/admin/components/TournamentList.js');
assert(list.includes('section=tournament&t=') && list.includes('Tạo'),
    'TournamentList should link into a console and offer create.');
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3a: Create `app/giai-dau/admin/components/TournamentList.js`**

```js
'use client';

import { useRouter } from 'next/navigation';

const FORMAT_LABELS = {
    mlp_team: 'MLP Team',
    doubles_round_robin: 'Đôi vòng tròn',
    group_playoff: 'Vòng bảng + Playoff',
    knockout: 'Loại trực tiếp',
};

const STATUS_FILTERS = [
    { value: 'all', label: 'Tất cả' },
    { value: 'active', label: 'Đang diễn ra' },
    { value: 'draft', label: 'Nháp' },
    { value: 'completed', label: 'Hoàn thành' },
];

export default function TournamentList({ tournaments, statusFilter, onFilter }) {
    const router = useRouter();
    const visible = statusFilter === 'all'
        ? tournaments
        : tournaments.filter((t) => (t.status || 'draft') === statusFilter);

    return (
        <div className="tournament-list-view">
            <div className="section-title-row">
                <div>
                    <h2>Giải đấu</h2>
                    <p>Chọn một giải để quản lý, hoặc tạo giải mới.</p>
                </div>
                <button
                    type="button"
                    className="btn-primary"
                    onClick={() => router.push('/admin?section=tournament&action=create')}
                >
                    + Tạo
                </button>
            </div>

            <div className="tournament-filter-chips">
                {STATUS_FILTERS.map((f) => (
                    <button
                        key={f.value}
                        type="button"
                        className={statusFilter === f.value ? 'chip active' : 'chip'}
                        onClick={() => onFilter(f.value)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="tournament-list">
                {visible.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        className="tournament-row"
                        onClick={() => router.push(`/admin?section=tournament&t=${t.id}`)}
                    >
                        <div className="tournament-row-main">
                            <div className="card-topline">
                                <span className={`status-pill status-${t.status || 'draft'}`}>
                                    {t.status || 'draft'}
                                </span>
                                <span>{t.event_date || '—'}</span>
                            </div>
                            <h3>{t.name}</h3>
                            <p>{FORMAT_LABELS[t.tournament_format] || 'MLP Team'} · {t.team_size || 4} VĐV/team</p>
                        </div>
                        <span className="tournament-row-chevron" aria-hidden="true">›</span>
                    </button>
                ))}
                {visible.length === 0 ? <p className="empty-state">Chưa có giải đấu nào.</p> : null}
            </div>
        </div>
    );
}
```

- [ ] **Step 3b: Rewrite `app/giai-dau/admin/page.js`** as the orchestrator. Keep `fetchJson`, `DEFAULT_TOURNAMENT_FORM`, `TOURNAMENT_FORMAT_OPTIONS`, `ASSIGNMENT_MODE_OPTIONS`, `getTournamentFormFromRecord` exports/consts. New body:

```js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentGroupClient } from '@/lib/groupClient';
import TournamentList from './components/TournamentList';
import TournamentForm from './components/TournamentForm';
import TournamentConsole from './components/TournamentConsole';
import './admin-tournament.css';

async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const { timeoutMs = 10000, ...fetchOptions } = options;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        return { res, data };
    } catch (error) {
        return { res: { ok: false }, data: { error: error.name === 'AbortError' ? 'Request timed out' : error.message } };
    } finally {
        clearTimeout(timeout);
    }
}

export default function AdminTournamentPanel({ embedded = false, tournamentId = '', tab = 'overview' }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [tournaments, setTournaments] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all');
    const [notice, setNotice] = useState('');

    const action = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('action')
        : null;

    useEffect(() => {
        if (!embedded) { router.replace('/admin?section=tournament'); return; }
        const group = getCurrentGroupClient();
        if (group.role !== 'admin') { router.replace('/'); return; }
        loadTournaments();
    }, [embedded, router]);

    async function loadTournaments() {
        setLoading(true);
        const { res, data } = await fetchJson('/api/tournaments');
        if (res.ok) setTournaments(data.tournaments || []);
        setLoading(false);
    }

    if (loading) return <div className="admin-tournament-loading">⏳ Đang tải...</div>;

    const current = tournaments.find((t) => String(t.id) === String(tournamentId));

    if (action === 'create' || (action === 'edit' && current)) {
        return (
            <div className="admin-tournament-container embedded">
                <TournamentForm
                    fetchJson={fetchJson}
                    editing={action === 'edit' ? current : null}
                    onDone={async () => { await loadTournaments(); router.push('/admin?section=tournament'); }}
                    onCancel={() => router.push('/admin?section=tournament')}
                />
            </div>
        );
    }

    if (tournamentId && current) {
        return (
            <div className="admin-tournament-container embedded">
                <TournamentConsole
                    tournament={current}
                    tab={tab}
                    fetchJson={fetchJson}
                    onTournamentsChanged={loadTournaments}
                />
            </div>
        );
    }

    return (
        <div className="admin-tournament-container embedded">
            {tournamentId && !current ? <p className="tournament-notice">Không tìm thấy giải đấu.</p> : null}
            {notice ? <p className="tournament-notice">{notice}</p> : null}
            <TournamentList tournaments={tournaments} statusFilter={statusFilter} onFilter={setStatusFilter} />
        </div>
    );
}

export { fetchJson };
```

- [ ] **Step 4: Run test** — Expected: FAIL only on missing `TournamentForm`/`TournamentConsole` imports at runtime is fine for the grep test, but the grep test for Task 4 should PASS. Verify:

Run: `node tests/tournament-admin-redesign.test.js`
Expected: PASS for Task 4 assertions (the file references the names). (Tasks 5-7 create the imported files.)

- [ ] **Step 5: Commit**

```bash
git add app/giai-dau/admin/page.js app/giai-dau/admin/components/TournamentList.js tests/tournament-admin-redesign.test.js
git commit -m "feat(tournament): list/console orchestrator + tournament list view"
```

### Task 5: `TournamentForm` (create/edit metadata, full-screen)

**Files:**
- Create: `app/giai-dau/admin/components/TournamentForm.js`
- Test: append to `tests/tournament-admin-redesign.test.js`

- [ ] **Step 1: Write the failing test**

```js
assert(exists('app/giai-dau/admin/components/TournamentForm.js'),
    'TournamentForm component should exist.');
const form = read('app/giai-dau/admin/components/TournamentForm.js');
assert(form.includes("'/api/tournaments'") && form.includes('PATCH') && form.includes('POST') &&
    form.includes('tournament_format') && form.includes('assignment_mode'),
    'TournamentForm should create/update tournaments with format + assignment mode.');
for (const label of ['MLP Team Match', 'Đánh đôi vòng tròn', 'Vòng bảng + Playoff', 'Loại trực tiếp']) {
    assert(form.includes(label), `TournamentForm should include "${label}".`);
}
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Create `app/giai-dau/admin/components/TournamentForm.js`**

```js
'use client';

import { useState } from 'react';

const TOURNAMENT_FORMAT_OPTIONS = [
    { value: 'mlp_team', label: 'MLP Team Match', description: 'Thi đấu theo team, mặc định 2 team đối đầu.' },
    { value: 'doubles_round_robin', label: 'Đánh đôi vòng tròn', description: 'Chia cặp ngẫu nhiên và đánh round robin.' },
    { value: 'group_playoff', label: 'Vòng bảng + Playoff', description: 'Vòng bảng chọn đội/cặp vào playoff.' },
    { value: 'knockout', label: 'Loại trực tiếp', description: 'Thua bị loại, phù hợp giải nhanh.' },
];

const ASSIGNMENT_MODE_OPTIONS = [
    { value: 'random', label: 'Chia ngẫu nhiên' },
    { value: 'balanced', label: 'Chia cân bằng theo trình độ' },
    { value: 'manual', label: 'Admin tự kéo thả' },
    { value: 'strong_weak', label: 'Chia cặp ngẫu nhiên mạnh-yếu' },
];

function fromRecord(t) {
    return {
        name: t?.name || '', description: t?.description || '', event_date: t?.event_date || '',
        location: t?.location || '', status: t?.status || 'draft',
        tournament_format: t?.tournament_format || 'mlp_team', assignment_mode: t?.assignment_mode || 'random',
        team_size: t?.team_size || 4, teams_per_match: t?.teams_per_match || 2,
    };
}

export default function TournamentForm({ fetchJson, editing, onDone, onCancel }) {
    const [form, setForm] = useState(fromRecord(editing));
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const set = (k, v) => setForm((c) => ({ ...c, [k]: v }));

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.name.trim()) { setNotice('Vui lòng nhập tên giải đấu.'); return; }
        setSaving(true);
        const payload = {
            ...form, id: editing?.id,
            team_size: Number(form.team_size) || 4,
            teams_per_match: Number(form.teams_per_match) || 2,
            scoring_config: { winScore: 21, dreamBreaker: form.tournament_format === 'mlp_team' },
        };
        const { res, data } = await fetchJson('/api/tournaments', {
            method: editing ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        setSaving(false);
        if (!res.ok) { setNotice(data.error || 'Không lưu được giải đấu.'); return; }
        onDone();
    }

    return (
        <form className="tournament-editor" onSubmit={handleSubmit}>
            <div className="section-title-row">
                <h2>{editing ? 'Sửa giải đấu' : 'Tạo giải đấu'}</h2>
            </div>
            {notice ? <p className="tournament-notice">{notice}</p> : null}

            <div className="form-row">
                <div className="form-group">
                    <label>Tên giải đấu</label>
                    <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="HANA MLP Cup 2026" />
                </div>
                <div className="form-group">
                    <label>Ngày thi đấu</label>
                    <input type="date" value={form.event_date || ''} onChange={(e) => set('event_date', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Trạng thái</label>
                    <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                        <option value="draft">Nháp</option>
                        <option value="active">Đang diễn ra</option>
                        <option value="completed">Hoàn thành</option>
                    </select>
                </div>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label>Địa điểm</label>
                    <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="CLB Pickleball 246" />
                </div>
                <div className="form-group">
                    <label>Số VĐV mỗi team/cặp</label>
                    <input type="number" min="2" max="12" value={form.team_size} onChange={(e) => set('team_size', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Số team đối đầu</label>
                    <input type="number" min="2" max="8" value={form.teams_per_match} onChange={(e) => set('teams_per_match', e.target.value)} />
                </div>
            </div>

            <div className="form-group">
                <label>Mô tả</label>
                <input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Mô tả ngắn về giải đấu" />
            </div>

            <div className="format-grid">
                {TOURNAMENT_FORMAT_OPTIONS.map((fmt) => (
                    <button key={fmt.value} type="button"
                        className={form.tournament_format === fmt.value ? 'format-card active' : 'format-card'}
                        onClick={() => set('tournament_format', fmt.value)}>
                        <strong>{fmt.label}</strong>
                        <span>{fmt.description}</span>
                    </button>
                ))}
            </div>

            <div className="assignment-modes">
                {ASSIGNMENT_MODE_OPTIONS.map((mode) => (
                    <label key={mode.value} className="assignment-mode">
                        <input type="radio" name="assignment_mode" value={mode.value}
                            checked={form.assignment_mode === mode.value}
                            onChange={(e) => set('assignment_mode', e.target.value)} />
                        {mode.label}
                    </label>
                ))}
            </div>

            <div className="editor-actions">
                <button type="button" className="btn-secondary" onClick={onCancel}>Hủy</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Đang lưu...' : 'Lưu giải đấu'}
                </button>
            </div>
        </form>
    );
}
```

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/giai-dau/admin/components/TournamentForm.js tests/tournament-admin-redesign.test.js
git commit -m "feat(tournament): full-screen create/edit form component"
```

### Task 6: `TournamentConsole` (header + next-step strip + tab bar)

**Files:**
- Create: `app/giai-dau/admin/components/TournamentConsole.js`
- Test: append to `tests/tournament-admin-redesign.test.js`

- [ ] **Step 1: Write the failing test**

```js
assert(exists('app/giai-dau/admin/components/TournamentConsole.js'),
    'TournamentConsole component should exist.');
const console_ = read('app/giai-dau/admin/components/TournamentConsole.js');
for (const t of ['Tổng quan', 'Cài đặt', 'Đội', 'Pairings', 'Trận đấu']) {
    assert(console_.includes(t), `Console tab bar should include "${t}".`);
}
assert(console_.includes('OverviewTab') && console_.includes('SettingsTab') &&
    console_.includes('TeamsTab') && console_.includes('PairingsTab') && console_.includes('MatchesTab'),
    'Console should render all five tab components.');
assert(console_.includes('/api/tournament/admin/reset') && console_.includes('tournamentId'),
    'Console overflow should reset scoped to this tournament.');
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Create `app/giai-dau/admin/components/TournamentConsole.js`**

```js
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import OverviewTab from './tabs/OverviewTab';
import SettingsTab from './tabs/SettingsTab';
import TeamsTab from './tabs/TeamsTab';
import PairingsTab from './tabs/PairingsTab';
import MatchesTab from './tabs/MatchesTab';

const TABS = [
    { value: 'overview', label: 'Tổng quan' },
    { value: 'settings', label: 'Cài đặt' },
    { value: 'teams', label: 'Đội & VĐV' },
    { value: 'pairings', label: 'Pairings' },
    { value: 'matches', label: 'Trận đấu' },
];

export default function TournamentConsole({ tournament, tab, fetchJson, onTournamentsChanged }) {
    const router = useRouter();
    const [overview, setOverview] = useState({ teams: [], matches: [], pairings: [], stats: {} });
    const [menuOpen, setMenuOpen] = useState(false);
    const id = tournament.id;

    const loadOverview = useCallback(async () => {
        const { res, data } = await fetchJson(`/api/tournament/admin/overview?tournamentId=${id}`);
        if (res.ok) setOverview(data);
    }, [fetchJson, id]);

    useEffect(() => { loadOverview(); }, [loadOverview]);

    function go(nextTab) {
        router.push(`/admin?section=tournament&t=${id}&tab=${nextTab}`);
    }

    async function handleReset() {
        if (!confirm('⚠️ Xóa TOÀN BỘ đội/cặp/trận/cài đặt của GIẢI NÀY? (không ảnh hưởng giải khác)')) return;
        if (!confirm('Xác nhận lần cuối cho giải này?')) return;
        const { res, data } = await fetchJson('/api/tournament/admin/reset', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tournamentId: id }),
        });
        if (!res.ok) { alert('Lỗi reset: ' + (data.error || '')); return; }
        await loadOverview();
        setMenuOpen(false);
    }

    const tabProps = { tournament, fetchJson, overview, reloadOverview: loadOverview };

    return (
        <div className="tournament-console">
            <div className="console-header">
                <button type="button" className="console-back" aria-label="Quay lại"
                    onClick={() => router.push('/admin?section=tournament')}>←</button>
                <div className="console-title">{tournament.name}</div>
                <span className={`status-pill status-${tournament.status || 'draft'}`}>{tournament.status || 'draft'}</span>
                <button type="button" className="console-menu-btn" aria-label="Thêm"
                    onClick={() => setMenuOpen((v) => !v)}>⋮</button>
            </div>

            {menuOpen ? (
                <div className="console-menu">
                    <button type="button" onClick={() => router.push(`/admin?section=tournament&t=${id}&action=edit`)}>Sửa thông tin</button>
                    <button type="button" onClick={() => router.push(`/giai-dau/${id}/live`)}>Xem Live</button>
                    <button type="button" className="danger" onClick={handleReset}>Reset giải</button>
                </div>
            ) : null}

            <NextStepStrip tournament={tournament} overview={overview} onGo={go} />

            <div className="console-tabs" role="tablist">
                {TABS.map((t) => (
                    <button key={t.value} type="button"
                        className={tab === t.value ? 'active' : ''} onClick={() => go(t.value)}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="console-tab-body">
                {tab === 'overview' && <OverviewTab {...tabProps} />}
                {tab === 'settings' && <SettingsTab {...tabProps} />}
                {tab === 'teams' && <TeamsTab {...tabProps} onTournamentsChanged={onTournamentsChanged} />}
                {tab === 'pairings' && <PairingsTab {...tabProps} />}
                {tab === 'matches' && <MatchesTab {...tabProps} />}
            </div>
        </div>
    );
}

function NextStepStrip({ overview, onGo }) {
    const teams = overview.teams || [];
    const stats = overview.stats || {};
    let step = null;
    if (teams.length === 0) step = { label: 'Chia đội / cặp', tab: 'teams' };
    else if ((stats.totalMatches || 0) === 0) step = { label: 'Sắp xếp pairings', tab: 'pairings' };
    else if ((stats.completedMatches || 0) < (stats.totalMatches || 0)) step = { label: 'Cập nhật cài đặt thi đấu', tab: 'settings' };
    if (!step) return null;
    return (
        <div className="next-step-strip">
            <div>
                <span className="next-step-label">Bước tiếp theo</span>
                <strong>{step.label}</strong>
            </div>
            <button type="button" className="btn-primary" onClick={() => onGo(step.tab)}>Đi tới</button>
        </div>
    );
}
```

- [ ] **Step 4: Run test** — Expected: PASS for Task 6 assertions (tab files created in Task 7).

- [ ] **Step 5: Commit**

```bash
git add app/giai-dau/admin/components/TournamentConsole.js tests/tournament-admin-redesign.test.js
git commit -m "feat(tournament): console shell with tabs, next-step strip, overflow menu"
```

### Task 7: The five tab components

**Files:**
- Create: `app/giai-dau/admin/components/tabs/OverviewTab.js`
- Create: `app/giai-dau/admin/components/tabs/SettingsTab.js`
- Create: `app/giai-dau/admin/components/tabs/TeamsTab.js`
- Create: `app/giai-dau/admin/components/tabs/PairingsTab.js`
- Create: `app/giai-dau/admin/components/tabs/MatchesTab.js`
- Test: append to `tests/tournament-admin-redesign.test.js`

- [ ] **Step 1: Write the failing test**

```js
for (const f of ['OverviewTab', 'SettingsTab', 'TeamsTab', 'PairingsTab', 'MatchesTab']) {
    assert(exists(`app/giai-dau/admin/components/tabs/${f}.js`), `${f} should exist.`);
}
const settingsTab = read('app/giai-dau/admin/components/tabs/SettingsTab.js');
assert(settingsTab.includes('/api/tournament/admin/settings') &&
    settingsTab.includes('round1_reveal_time') && settingsTab.includes('total_courts') &&
    settingsTab.includes('tournamentId'),
    'SettingsTab should save per-tournament key-value settings.');
const teamsTab = read('app/giai-dau/admin/components/tabs/TeamsTab.js');
assert(teamsTab.includes('/api/tournaments/auto-assign') && teamsTab.includes('tournamentId'),
    'TeamsTab should auto-assign scoped to this tournament.');
const pairingsTab = read('app/giai-dau/admin/components/tabs/PairingsTab.js');
assert(pairingsTab.includes('read-only') || pairingsTab.includes('chỉ xem'),
    'PairingsTab should be read-only this round.');
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3a: `OverviewTab.js`**

```js
'use client';

export default function OverviewTab({ overview }) {
    const s = overview.stats || {};
    const cards = [
        { icon: '👥', value: s.totalPlayers || 0, label: 'Người chơi' },
        { icon: '🎯', value: s.totalMatches || 0, label: 'Trận đấu' },
        { icon: '✅', value: s.completedMatches || 0, label: 'Hoàn thành' },
        { icon: '⏳', value: s.pendingSubmissions || 0, label: 'Chờ duyệt' },
    ];
    const matches = overview.matches || [];
    return (
        <div className="tab-overview">
            <div className="stats-grid">
                {cards.map((c) => (
                    <div key={c.label} className="stat-card">
                        <div className="stat-icon">{c.icon}</div>
                        <div className="stat-value">{c.value}</div>
                        <div className="stat-label">{c.label}</div>
                    </div>
                ))}
            </div>
            <div className="matches-summary">
                {[1, 2, 3].map((round) => {
                    const rm = matches.filter((m) => m.round_number === round);
                    const done = rm.filter((m) => m.match_status === 'completed').length;
                    const pct = rm.length ? (done / rm.length) * 100 : 0;
                    return (
                        <div key={round} className="round-summary">
                            <h3>Round {round}</h3>
                            <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                            <p>{done} / {rm.length} trận</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
```

- [ ] **Step 3b: `SettingsTab.js`**

```js
'use client';

import { useState, useEffect } from 'react';

const DEFAULTS = {
    round1_reveal_time: '', start_time: '', end_time: '',
    total_courts: 2, match_duration_minutes: 15, break_duration_minutes: 5,
};

export default function SettingsTab({ tournament, fetchJson }) {
    const id = tournament.id;
    const [form, setForm] = useState(DEFAULTS);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const set = (k, v) => setForm((c) => ({ ...c, [k]: v }));

    useEffect(() => {
        let active = true;
        (async () => {
            const { res, data } = await fetchJson(`/api/tournament/admin/settings?tournamentId=${id}`);
            if (active && res.ok) setForm({ ...DEFAULTS, ...(data.settings || {}) });
        })();
        return () => { active = false; };
    }, [fetchJson, id]);

    async function handleSave(e) {
        e.preventDefault();
        setSaving(true);
        const { res, data } = await fetchJson('/api/tournament/admin/settings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tournamentId: id,
                ...form,
                total_courts: Number(form.total_courts) || 0,
                match_duration_minutes: Number(form.match_duration_minutes) || 0,
                break_duration_minutes: Number(form.break_duration_minutes) || 0,
            }),
        });
        setSaving(false);
        setNotice(res.ok ? 'Đã lưu cài đặt.' : (data.error || 'Lỗi lưu cài đặt.'));
    }

    return (
        <form className="settings-form" onSubmit={handleSave}>
            {notice ? <p className="tournament-notice">{notice}</p> : null}
            <div className="form-row">
                <div className="form-group">
                    <label>Giờ công bố Round 1</label>
                    <input type="datetime-local" value={form.round1_reveal_time || ''}
                        onChange={(e) => set('round1_reveal_time', e.target.value)} />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Giờ bắt đầu</label>
                    <input type="time" value={form.start_time || ''} onChange={(e) => set('start_time', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Giờ kết thúc</label>
                    <input type="time" value={form.end_time || ''} onChange={(e) => set('end_time', e.target.value)} />
                </div>
            </div>
            <div className="form-row">
                <div className="form-group">
                    <label>Số sân</label>
                    <input type="number" min="1" max="8" value={form.total_courts}
                        onChange={(e) => set('total_courts', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Thời gian mỗi trận (phút)</label>
                    <input type="number" min="5" max="60" value={form.match_duration_minutes}
                        onChange={(e) => set('match_duration_minutes', e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Thời gian nghỉ (phút)</label>
                    <input type="number" min="0" max="30" value={form.break_duration_minutes}
                        onChange={(e) => set('break_duration_minutes', e.target.value)} />
                </div>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : '💾 Lưu cài đặt'}
            </button>
        </form>
    );
}
```

- [ ] **Step 3c: `TeamsTab.js`**

```js
'use client';

import { useState } from 'react';

export default function TeamsTab({ tournament, fetchJson, overview, reloadOverview }) {
    const id = tournament.id;
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const teams = overview.teams || [];
    const isTeam = (tournament.tournament_format || 'mlp_team') === 'mlp_team';

    async function handleAutoAssign() {
        setBusy(true);
        const { res, data } = await fetchJson('/api/tournaments/auto-assign', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tournamentId: id,
                format: tournament.tournament_format || 'mlp_team',
                teamSize: tournament.team_size || 4,
                teamsPerMatch: tournament.teams_per_match || 2,
            }),
        });
        setBusy(false);
        if (!res.ok) { setNotice(data.error || 'Không chia được.'); return; }
        setNotice(isTeam ? 'Đã chia team ngẫu nhiên.' : 'Đã chia cặp ngẫu nhiên.');
        await reloadOverview();
    }

    return (
        <div className="tab-teams">
            <div className="section-title-row">
                <h2>Đội & VĐV</h2>
                <button type="button" className="btn-primary" disabled={busy} onClick={handleAutoAssign}>
                    {busy ? 'Đang chia...' : (isTeam ? 'Chia team ngẫu nhiên' : 'Chia cặp ngẫu nhiên')}
                </button>
            </div>
            {notice ? <p className="tournament-notice">{notice}</p> : null}
            <div className="teams-grid">
                {teams.map((team) => (
                    <div key={team.id} className={`team-card team-${team.team_code}`}>
                        <h3>{team.team_name}</h3>
                        <p className="team-players">{team.players?.length || 0} người chơi</p>
                        <ul className="team-player-list">
                            {(team.players || []).map((p) => <li key={p.id}>{p.player_name}</li>)}
                        </ul>
                    </div>
                ))}
                {teams.length === 0 ? <p className="empty-state">Chưa có đội nào. Bấm chia để tạo.</p> : null}
            </div>
        </div>
    );
}
```

- [ ] **Step 3d: `PairingsTab.js`** (read-only this round)

```js
'use client';

const TEAM_LABELS = { blue: 'TEAM XANH', red: 'TEAM ĐỎ' };

export default function PairingsTab({ overview }) {
    const pairings = overview.pairings || [];
    const teams = overview.teams || [];
    const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
    const rounds = [1, 2, 3];

    return (
        <div className="tab-pairings">
            {/* read-only: editor will be rebuilt against the FK schema in a later round */}
            <p className="tournament-notice">Chế độ chỉ xem (read-only). Trình sắp cặp sẽ làm ở đợt sau.</p>
            {rounds.map((round) => {
                const rp = pairings.filter((p) => p.round_number === round);
                if (rp.length === 0) return null;
                return (
                    <div key={round} className="pairings-round">
                        <h3>Round {round}</h3>
                        <ul className="pairings-list">
                            {rp.map((p) => {
                                const team = teamById[p.team_id];
                                const code = team?.team_code;
                                const label = TEAM_LABELS[code] || team?.team_name || '—';
                                return (
                                    <li key={p.id}>
                                        <span className={`pairing-team team-${code}`}>{label}</span>
                                        <span>{p.player1?.player_name || '?'} &amp; {p.player2?.player_name || '?'}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                );
            })}
            {pairings.length === 0 ? <p className="empty-state">Chưa có pairing nào.</p> : null}
        </div>
    );
}
```

- [ ] **Step 3e: `MatchesTab.js`**

```js
'use client';

export default function MatchesTab({ overview }) {
    const matches = overview.matches || [];
    const rounds = [1, 2, 3];
    return (
        <div className="tab-matches">
            {rounds.map((round) => {
                const rm = matches.filter((m) => m.round_number === round);
                if (rm.length === 0) return null;
                return (
                    <div key={round} className="matches-round">
                        <h3>Round {round}</h3>
                        <ul className="matches-list">
                            {rm.map((m) => (
                                <li key={m.id} className={`match-row match-${m.match_status}`}>
                                    <span>Trận {m.match_number}{m.court_number ? ` · Sân ${m.court_number}` : ''}</span>
                                    <span>{m.blue_score} - {m.red_score}</span>
                                    <span className="match-status">{m.match_status}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
            {matches.length === 0 ? <p className="empty-state">Chưa có trận đấu nào.</p> : null}
        </div>
    );
}
```

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/giai-dau/admin/components/tabs tests/tournament-admin-redesign.test.js
git commit -m "feat(tournament): overview/settings/teams/pairings(read-only)/matches tabs"
```

### Task 8: Console + list CSS (mobile-first)

**Files:**
- Modify (append): `app/giai-dau/admin/admin-tournament.css`
- Test: append to `tests/tournament-admin-redesign.test.js`

- [ ] **Step 1: Write the failing test**

```js
const css = read('app/giai-dau/admin/admin-tournament.css');
for (const cls of ['.console-tabs', '.next-step-strip', '.tournament-row', '.tournament-filter-chips', '.console-header']) {
    assert(css.includes(cls), `admin-tournament.css should style ${cls}.`);
}
```

- [ ] **Step 2: Run test** — Expected: FAIL.

- [ ] **Step 3: Append to `app/giai-dau/admin/admin-tournament.css`**

```css
/* === Redesign: list + console (mobile-first) === */
.tournament-filter-chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
.tournament-filter-chips .chip { padding: 6px 12px; border-radius: 999px; border: 1px solid #d0d5dd; background: #fff; font-size: 13px; }
.tournament-filter-chips .chip.active { background: #111827; color: #fff; border-color: #111827; }

.tournament-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 14px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; margin-bottom: 10px; }
.tournament-row-main { flex: 1; min-width: 0; }
.tournament-row-main h3 { margin: 4px 0 2px; font-size: 16px; }
.tournament-row-main p { margin: 0; font-size: 13px; color: #6b7280; }
.tournament-row-chevron { font-size: 22px; color: #9ca3af; }

.console-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.console-back, .console-menu-btn { font-size: 20px; background: none; border: none; padding: 4px 8px; cursor: pointer; }
.console-title { flex: 1; min-width: 0; font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.console-menu { display: flex; flex-direction: column; align-items: stretch; gap: 2px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 6px; margin-bottom: 12px; background: #fff; }
.console-menu button { text-align: left; padding: 10px 12px; background: none; border: none; border-radius: 8px; font-size: 14px; }
.console-menu button:hover { background: #f3f4f6; }
.console-menu button.danger { color: #b91c1c; }

.next-step-strip { display: flex; align-items: center; gap: 10px; background: #eff6ff; border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; }
.next-step-strip > div { flex: 1; display: flex; flex-direction: column; }
.next-step-label { font-size: 11px; color: #1d4ed8; }

.console-tabs { display: flex; gap: 16px; overflow-x: auto; border-bottom: 1px solid #e5e7eb; margin-bottom: 14px; }
.console-tabs button { white-space: nowrap; padding: 10px 0; background: none; border: none; border-bottom: 2px solid transparent; font-size: 14px; color: #6b7280; }
.console-tabs button.active { color: #111827; border-bottom-color: #111827; font-weight: 600; }

.team-player-list { list-style: none; padding: 0; margin: 8px 0 0; font-size: 13px; }
.pairings-list, .matches-list { list-style: none; padding: 0; margin: 0; }
.pairings-list li, .matches-list li { display: flex; gap: 10px; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
```

- [ ] **Step 4: Run test** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/giai-dau/admin/admin-tournament.css tests/tournament-admin-redesign.test.js
git commit -m "style(tournament): mobile-first list + console styles"
```

---

## Phase 3 — Verification

### Task 9: Full contract test + existing suites

- [ ] **Step 1: Run the new contract test**

Run: `node tests/tournament-admin-redesign.test.js`
Expected: PASS — "tournament admin redesign contract ok"

- [ ] **Step 2: Run the related existing suites and reconcile**

Run: `node tests/tournament-management-v2.test.js` and `node tests/unified-admin-center.test.js`
Expected: They may FAIL because they assert old strings (e.g. `admin-center-subtabs`, the monolithic `app/giai-dau/admin/page.js` containing `handleSaveTournament`). Update those assertions to match the new structure — point them at the new component files (`TournamentForm.js` for `handleSaveTournament`/`handleDeleteTournament`/`handleAutoAssign`; drop `admin-center-subtabs`). Re-run until PASS.

- [ ] **Step 3: Commit any test reconciliations**

```bash
git add tests/
git commit -m "test: reconcile tournament/admin-center contracts with redesign"
```

### Task 10: Manual mobile verification (preview)

- [ ] **Step 1:** Start the dev server (`preview_start`) and open `/admin?section=tournament`.
- [ ] **Step 2:** `preview_resize` to ~390px width (mobile). `preview_console_logs` — expect no errors.
- [ ] **Step 3:** Create two tournaments with different formats (e.g. one `mlp_team`, one `doubles_round_robin`) via the create form.
- [ ] **Step 4:** Open tournament A → Teams tab → "Chia team/cặp". Confirm teams appear. Open Settings → save courts/time → reload → values persist. `preview_snapshot`.
- [ ] **Step 5:** Open tournament B → confirm its Teams/Settings/Overview are EMPTY/independent of A (the core success criterion).
- [ ] **Step 6:** `preview_screenshot` of the list and a console for the final summary.

---

## Notes for the executor
- Do NOT touch `app/api/tournament/live/*` or the broken `app/api/tournament/admin/pairings/route.js` this round — pairings editing is deferred. The read-only PairingsTab uses overview data only.
- `is_active` from the old settings form is intentionally dropped — tournament on/off is `tournaments.status` edited in `TournamentForm`.
- When in doubt about the per-tournament query pattern, copy `app/api/tournaments/auto-assign/route.js`.
