# Multi-tenant Phase 2 — Data Isolation Implementation Plan

> **Lưu ý quyết định sản phẩm hiện hành (2026-09-03):** Đây là kế hoạch kỹ
> thuật lịch sử cho data isolation. Các task provision Supabase Auth/group
> owner account trong tài liệu này không còn là yêu cầu trải nghiệm Phase 2.
> Baseline PickHub là Mã CLB + mật khẩu cho cả member và trưởng nhóm theo
> `docs/pickhub-core/decisions/ADR-003-club-code-password-first-access.md`.
> Chỉ tái sử dụng phần RLS/isolation sau khi đối chiếu với Phase 2 core mới;
> không tự chạy các bước tạo account nếu chưa có ADR và product approval.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every club's data genuinely isolated at the database level so untrusted clubs can sign up safely — by enabling Row Level Security (RLS), authenticating club admins through Supabase Auth, and serving member pages through the server instead of the browser's anon key.

**Architecture:** One identity system. **Admins/owners** are Supabase Auth users (email + password) linked to clubs via a new `group_members` table; their browser uses an authenticated Supabase session, so RLS policies filter rows by membership. **Members** have no account — they sign in with the club code + member password (the existing signed `group_session` cookie) and all their data is served by Next.js server routes using the service-role key. RLS denies the anon key entirely, which closes the current cross-club leak.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + Auth + RLS), `@supabase/supabase-js`, Node test scripts (`node tests/*.js`), pbkdf2 (existing member password hashing).

---

## Background & Current State (read before starting)

- All tables are currently **UNRESTRICTED** (no RLS). The browser uses the **anon key** (`lib/supabaseClient.js`) and client pages query Supabase directly. Isolation is only the app-level `.eq('group_id', …)` convention — trivially bypassable. This is the leak this plan closes.
- New group flow already exists: `groups` table, signed HMAC `group_session` cookie (`lib/groupSession.js`), create/join APIs (`app/api/groups/*`), `group_id` on all tables (migration `007`).
- Legacy Supabase Auth is used by the tournament **captain** flow (`app/giai-dau/captain/page.js`) and `/login`.
- `requireGroupAdmin()` has a **legacy fallback** that allows writes when no session exists — must be removed.
- `lib/supabaseServer.js` silently **falls back to the anon key** when the service key is missing — must hard-fail in production.

**Client-side direct DB call inventory (must be migrated or authenticated before RLS is enabled):**

| File | Tables accessed (line refs) | Audience after Phase 2 |
|---|---|---|
| `app/quy/page.js` | `quy_pickleball` (54,62), `fund_events` (96,115,165,179,253,256), `club_members` (136,145), `fund_event_participants` (203,227) | **Member** → server-mediated |
| `app/quy/members/page.js` | `club_members` (20,29) | **Member** → server-mediated |
| `app/quy/admin/page.js` | `quy_pickleball`, `club_members` (many) | **Admin** → authenticated Supabase session |
| `app/giai-dau/admin/page.js` | `tournament_*` (96–135, 198–201) | **Admin** → authenticated Supabase session |

**Architecture decision — two trusted data paths, RLS as the hard backstop:**
1. **Admin path:** admin signs in with Supabase Auth → the `supabase` browser client carries their JWT → RLS allows only rows whose `group_id` is in their `group_members`. Existing admin `.from(...)` calls keep working once auth + RLS + membership exist. Keep the `.eq('group_id')` filters as defense-in-depth.
2. **Member path:** member signs in with code + password → signed `group_session` cookie → member data served by `/api/club/*` routes using the **service-role** key (bypasses RLS), scoped by `getGroupIdForDatabase()`.
3. **Anon key:** denied by RLS (no policy for the `anon` role). The browser can no longer read another club's data under any circumstance.

**Sequencing rule:** RLS is enabled (Task 8) **only after** admin auth (Tasks 3–4) and member server-mediation (Tasks 5–7) are in place, otherwise the app breaks. Do the tasks in order.

**Owner email for the existing club:** the existing `Pickleball 246 Club` (`P246CLUB`) owner account uses `mrtu.yb@gmail.com` (Task 11). Confirm before running that task.

---

## Task 1: Membership table (migration 008)

**Files:**
- Create: `database/migrations/008_group_members.sql`
- Test: `tests/multitenant-phase2.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/multitenant-phase2.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const m008 = read('database/migrations/008_group_members.sql');
assert(
    m008.includes('CREATE TABLE IF NOT EXISTS group_members') &&
    m008.includes('user_id uuid') &&
    m008.includes('REFERENCES auth.users') &&
    m008.includes('group_id') &&
    m008.includes("role") &&
    m008.includes('UNIQUE (group_id, user_id)'),
    'Migration 008 should create group_members linking auth.users to groups with a role and a unique membership.'
);

console.log('multitenant phase 2 contract ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase2.test.js`
Expected: FAIL — `Cannot find module`/`ENOENT` for `008_group_members.sql`.

- [ ] **Step 3: Write the migration**

Create `database/migrations/008_group_members.sql`:

```sql
-- Phase 2: club membership for Supabase Auth users (admins/owners).
-- Members (code + password) are NOT stored here; their access is server-mediated.

CREATE TABLE IF NOT EXISTS group_members (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id     bigint NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    user_id      uuid   NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    role         text   NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members (user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members (group_id);
```

- [ ] **Step 4: Apply the migration to Supabase**

Apply `database/migrations/008_group_members.sql` against project `Ranking 246` (`uhhlelemewilgsdijwja`) using the Supabase apply_migration tool (name: `008_group_members`). Verify with: `SELECT table_name FROM information_schema.tables WHERE table_name = 'group_members';` → expect one row.

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/multitenant-phase2.test.js`
Expected: PASS — `multitenant phase 2 contract ok`.

- [ ] **Step 6: Register the test script and commit**

In `package.json` `scripts`, add: `"test:phase2": "node tests/multitenant-phase2.test.js"`.

```bash
git add database/migrations/008_group_members.sql tests/multitenant-phase2.test.js package.json
git commit -m "feat: add group_members table for club admin identity"
```

---

## Task 2: Membership server helper

**Files:**
- Create: `lib/membership.js`
- Modify: `tests/multitenant-phase2.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/multitenant-phase2.test.js` before the final `console.log`:

```javascript
const membership = read('lib/membership.js');
assert(
    membership.includes('export async function getAdminGroupIds') &&
    membership.includes('export async function isGroupAdmin') &&
    membership.includes("from('group_members')"),
    'lib/membership.js should resolve a user\'s admin group ids and check admin membership.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase2.test.js`
Expected: FAIL — `ENOENT` for `lib/membership.js`.

- [ ] **Step 3: Write the helper**

Create `lib/membership.js`:

```javascript
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Returns the list of group ids a Supabase Auth user administers.
export async function getAdminGroupIds(userId) {
    if (!userId) return [];
    const { data, error } = await supabaseAdmin
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId);
    if (error) throw error;
    return (data || []).map((row) => row.group_id);
}

// True when the user is an admin/owner of the given group.
export async function isGroupAdmin(userId, groupId) {
    if (!userId || !groupId) return false;
    const { data, error } = await supabaseAdmin
        .from('group_members')
        .select('id')
        .eq('user_id', userId)
        .eq('group_id', groupId)
        .maybeSingle();
    if (error) throw error;
    return Boolean(data);
}

// Links a Supabase user to a group as owner/admin (idempotent).
export async function addGroupMember(userId, groupId, role = 'admin') {
    const { error } = await supabaseAdmin
        .from('group_members')
        .upsert({ user_id: userId, group_id: groupId, role }, { onConflict: 'group_id,user_id' });
    if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/multitenant-phase2.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/membership.js tests/multitenant-phase2.test.js
git commit -m "feat: add membership helpers for club admins"
```

---

## Task 3: Group creation provisions a Supabase admin account

**Files:**
- Modify: `app/api/groups/route.js`
- Modify: `app/page.js` (create form: add email field)
- Modify: `tests/multitenant-phase2.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/multitenant-phase2.test.js` before the final `console.log`:

```javascript
const createGroupRoute = read('app/api/groups/route.js');
assert(
    createGroupRoute.includes('auth.admin.createUser') &&
    createGroupRoute.includes('addGroupMember') &&
    createGroupRoute.includes('adminEmail'),
    'Group creation should create a Supabase admin user and an owner membership.'
);
const homePage = read('app/page.js');
assert(
    homePage.includes('adminEmail'),
    'Create-group form should collect the admin email.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase2.test.js`
Expected: FAIL — `auth.admin.createUser` not found in `app/api/groups/route.js`.

- [ ] **Step 3: Read the current create route**

Run: `Read app/api/groups/route.js` (full file) to see how it currently hashes passwords, generates the code/QR, and returns the payload. Preserve all of that; you are only adding admin-user provisioning.

- [ ] **Step 4: Add the admin email field to the create form**

In `app/page.js`:
- Add `adminEmail: ''` to `EMPTY_CREATE_FORM`.
- Add an email `<label>`/`<input type="email" required>` bound to `createForm.adminEmail` (via `updateCreateForm('adminEmail', …)`) inside the create `<form>`, above "Mật khẩu admin".

```jsx
<label>
    Email quản trị
    <input
        type="email"
        value={createForm.adminEmail}
        onChange={(event) => updateCreateForm('adminEmail', event.target.value)}
        placeholder="admin@clb.com"
        required
    />
</label>
```

- [ ] **Step 5: Provision the admin user in the create route**

In `app/api/groups/route.js`:
- Import at top: `import { addGroupMember } from '@/lib/membership';` and `import { supabaseAdmin } from '@/lib/supabaseAdmin';`
- Read `adminEmail` from the request body alongside the existing fields.
- After the group row is inserted and you have its `id`, create the admin auth user and membership:

```javascript
const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword, // same value already collected for admin
    email_confirm: true,
    user_metadata: { default_group_id: group.id },
});
if (authError) {
    // Roll back the group so a failed signup doesn't leave an orphan club.
    await supabaseAdmin.from('groups').delete().eq('id', group.id);
    return NextResponse.json({ error: 'Email đã tồn tại hoặc không hợp lệ.' }, { status: 400 });
}
await addGroupMember(created.user.id, group.id, 'owner');
```

Keep returning the existing `{ group, role: 'admin', qrCodeDataUrl, joinUrl }` payload.

- [ ] **Step 6: Run the structural test**

Run: `node tests/multitenant-phase2.test.js`
Expected: PASS.

- [ ] **Step 7: Manual end-to-end check**

Start the dev server (preview_start). On `/`, open "Tạo nhóm mới", fill name + a new email + admin/member passwords, submit. Expected: success popup with code + QR. Verify in Supabase: `SELECT * FROM group_members;` shows one `owner` row, and the email appears in Auth → Users.

- [ ] **Step 8: Commit**

```bash
git add app/api/groups/route.js app/page.js tests/multitenant-phase2.test.js
git commit -m "feat: provision a Supabase admin account when creating a club"
```

---

## Task 4: Admin login resolves group context

**Files:**
- Modify: `app/login/page.js`
- Create: `app/api/groups/session/admin/route.js`
- Modify: `tests/multitenant-phase2.test.js`

**Why:** After an admin signs in with Supabase Auth, the app must (a) know which club they administer and (b) set the same `group_session` cookie + `teamfund-current-group` localStorage the rest of the app reads, so the admin's club context is consistent and the server routes/RLS agree.

- [ ] **Step 1: Add the failing test**

Append to `tests/multitenant-phase2.test.js` before the final `console.log`:

```javascript
const adminSessionRoute = read('app/api/groups/session/admin/route.js');
assert(
    adminSessionRoute.includes('getAdminGroupIds') &&
    adminSessionRoute.includes('signGroupSession') &&
    adminSessionRoute.includes('setGroupSessionCookie'),
    'Admin session route should mint a group_session cookie from the user\'s membership.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase2.test.js`
Expected: FAIL — `ENOENT` for the admin session route.

- [ ] **Step 3: Create the admin session route**

Create `app/api/groups/session/admin/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminGroupIds } from '@/lib/membership';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { setGroupSessionCookie, signGroupSession } from '@/lib/groupSession';

// Exchanges a Supabase access token for a group_session cookie scoped to the
// admin's club. Body: { accessToken }.
export async function POST(request) {
    const { accessToken } = await request.json();
    if (!accessToken) {
        return NextResponse.json({ error: 'Thiếu access token.' }, { status: 400 });
    }

    const authClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );
    const { data: { user }, error } = await authClient.auth.getUser();
    if (error || !user) {
        return NextResponse.json({ error: 'Phiên không hợp lệ.' }, { status: 401 });
    }

    const groupIds = await getAdminGroupIds(user.id);
    if (groupIds.length === 0) {
        return NextResponse.json({ error: 'Tài khoản chưa thuộc CLB nào.' }, { status: 403 });
    }

    const { data: group } = await supabaseAdmin
        .from('groups')
        .select('id, code, name')
        .eq('id', groupIds[0])
        .single();

    const response = NextResponse.json({
        group: { id: group.id, code: group.code, name: group.name },
        role: 'admin',
        redirectTo: '/admin',
    });
    setGroupSessionCookie(response, signGroupSession({
        groupId: group.id,
        groupCode: group.code,
        groupName: group.name,
        role: 'admin',
    }));
    return response;
}
```

- [ ] **Step 4: Wire `/login` to call it**

Read `app/login/page.js` first. After a successful `supabase.auth.signInWithPassword`, before any redirect:
- POST the returned `data.session.access_token` to `/api/groups/session/admin`.
- On success, store the returned group into `localStorage` under `teamfund-current-group` (`{ ...group, role: 'admin' }`) and `router.push('/admin')`.
- If that call returns 403 (no membership — e.g. a tournament captain), fall back to the existing captain redirect logic already in the file.

```javascript
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) { /* keep existing error handling */ return; }

const res = await fetch('/api/groups/session/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: data.session.access_token }),
});
if (res.ok) {
    const payload = await res.json();
    window.localStorage.setItem('teamfund-current-group', JSON.stringify({ ...payload.group, role: 'admin' }));
    router.push(payload.redirectTo || '/admin');
    return;
}
// else: not a club admin → keep the existing captain/legacy redirect below.
```

- [ ] **Step 5: Run the structural test**

Run: `node tests/multitenant-phase2.test.js`
Expected: PASS.

- [ ] **Step 6: Manual check**

With the dev server running and the club created in Task 3, go to `/login`, sign in with that admin email/password. Expected: lands on `/admin`, badge shows the club name + "Quản trị viên", and the fund/tournament admin data loads (still via the authenticated `supabase` client — RLS not yet on, so this works either way; it must keep working after Task 8).

- [ ] **Step 7: Commit**

```bash
git add app/api/groups/session/admin/route.js app/login/page.js tests/multitenant-phase2.test.js
git commit -m "feat: resolve admin club context from membership on login"
```

---

## Task 5: Member-facing read API routes

**Files:**
- Create: `app/api/club/transactions/route.js`
- Create: `app/api/club/members/route.js`
- Create: `app/api/club/events/route.js`
- Modify: `tests/multitenant-phase2.test.js`

**Why:** Members have no Supabase session, so after RLS is enabled their browser cannot read the DB. These routes read with the service key, scoped to the member's club via the signed cookie.

- [ ] **Step 1: Add the failing test**

Append to `tests/multitenant-phase2.test.js` before the final `console.log`:

```javascript
for (const route of [
    'app/api/club/transactions/route.js',
    'app/api/club/members/route.js',
    'app/api/club/events/route.js',
]) {
    const src = read(route);
    assert(
        src.includes('getGroupIdForDatabase') && src.includes(".eq('group_id', groupId)"),
        `${route} should scope reads to the current group via the signed cookie.`
    );
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase2.test.js`
Expected: FAIL — `ENOENT` for `app/api/club/transactions/route.js`.

- [ ] **Step 3: Create the transactions route**

Create `app/api/club/transactions/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase } from '@/lib/groupSession';

export async function GET() {
    const groupId = getGroupIdForDatabase();
    const { data, error } = await supabaseAdmin
        .from('quy_pickleball')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ transactions: data || [] });
}
```

- [ ] **Step 4: Create the members route**

Create `app/api/club/members/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase } from '@/lib/groupSession';

export async function GET() {
    const groupId = getGroupIdForDatabase();
    const { data, error } = await supabaseAdmin
        .from('club_members')
        .select('*')
        .eq('group_id', groupId)
        .order('full_name', { ascending: true });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ members: data || [] });
}
```

- [ ] **Step 5: Create the events route (events + participants)**

Create `app/api/club/events/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getGroupIdForDatabase } from '@/lib/groupSession';

export async function GET() {
    const groupId = getGroupIdForDatabase();
    const { data: events, error } = await supabaseAdmin
        .from('fund_events')
        .select('*')
        .eq('group_id', groupId)
        .order('event_date', { ascending: false });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const eventIds = (events || []).map((e) => e.id);
    let participants = [];
    if (eventIds.length > 0) {
        const { data: parts, error: pErr } = await supabaseAdmin
            .from('fund_event_participants')
            .select('*')
            .in('event_id', eventIds);
        if (pErr) {
            return NextResponse.json({ error: pErr.message }, { status: 500 });
        }
        participants = parts || [];
    }
    return NextResponse.json({ events: events || [], participants });
}
```

- [ ] **Step 6: Run the structural test**

Run: `node tests/multitenant-phase2.test.js`
Expected: PASS.

- [ ] **Step 7: Manual check**

With a member `group_session` cookie set (join the club as member, or set it via the join flow), hit `http://localhost:<port>/api/club/transactions` in the browser. Expected: JSON `{ transactions: [...] }` scoped to that club.

- [ ] **Step 8: Commit**

```bash
git add app/api/club/ tests/multitenant-phase2.test.js
git commit -m "feat: add server-mediated club read APIs for members"
```

---

## Task 6: Convert the member fund page to server-mediated reads

**Files:**
- Modify: `app/quy/page.js`
- Modify: `tests/multitenant-phase2.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/multitenant-phase2.test.js` before the final `console.log`:

```javascript
const quyPage = read('app/quy/page.js');
assert(
    !quyPage.includes("supabase\n") && !quyPage.includes('.from('),
    'app/quy/page.js should not query Supabase directly from the browser.'
);
assert(
    quyPage.includes('/api/club/transactions') &&
    quyPage.includes('/api/club/events') &&
    quyPage.includes('/api/club/members'),
    'app/quy/page.js should read club data through the server APIs.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase2.test.js`
Expected: FAIL — `app/quy/page.js` still contains `.from(`.

- [ ] **Step 3: Read the page and replace each loader**

Read `app/quy/page.js` fully. Replace the data loaders so they `fetch` the new routes instead of calling `supabase.from(...)`. Concretely:

- `loadTransactions()` → 
  ```javascript
  async function loadTransactions() {
      setLoadingTx(true);
      const res = await fetch('/api/club/transactions');
      const data = await res.json();
      setTransactions(res.ok ? (data.transactions || []) : []);
      setLoadingTx(false);
  }
  ```
- `loadEvents()` → fetch `/api/club/events`, then `setEvents(data.events || [])` and store `data.participants` into the participants state the component already uses (replace the existing `fund_events` + `fund_event_participants` queries at lines ~96–227).
- `loadMembers()` → fetch `/api/club/members`, `setMembers(data.members || [])` (replace `club_members` queries at lines ~136–145).
- Remove the `supabase.auth.getSession()` user fetch at line ~40; the badge already derives identity from `teamfund-current-group`.
- The create-event (POST) and delete-event paths at lines ~165–256 are **admin write actions** that do not belong on the member page. Remove the create/delete UI and handlers from this member page (they remain available in `/admin`). Delete the `fund_events.delete()` calls (lines 253, 256) and the create-event modal block.
- Remove `import { supabase } from '@/lib/supabaseClient';` and the now-unused `getCurrentGroupIdClient`/`isMissingGroupColumnError` imports if no longer referenced.

- [ ] **Step 4: Run the structural test**

Run: `node tests/multitenant-phase2.test.js`
Expected: PASS.

- [ ] **Step 5: Manual check**

As a member (member cookie set), open `/quy`. Expected: transactions, events, and members render (fetched from `/api/club/*`); no console errors; no create/delete-event controls.

- [ ] **Step 6: Commit**

```bash
git add app/quy/page.js tests/multitenant-phase2.test.js
git commit -m "refactor: serve member fund page via server APIs"
```

---

## Task 7: Convert the member roster page to server-mediated reads

**Files:**
- Modify: `app/quy/members/page.js`
- Modify: `tests/multitenant-phase2.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/multitenant-phase2.test.js` before the final `console.log`:

```javascript
const membersPage = read('app/quy/members/page.js');
assert(
    !membersPage.includes('.from(') && membersPage.includes('/api/club/members'),
    'app/quy/members/page.js should read members through the server API.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase2.test.js`
Expected: FAIL — file still contains `.from(`.

- [ ] **Step 3: Replace the loader**

Read `app/quy/members/page.js`. Replace the `club_members` query (lines ~20–29) with:

```javascript
const res = await fetch('/api/club/members');
const data = await res.json();
setMembers(res.ok ? (data.members || []) : []);
```

Remove the `import { supabase } from '@/lib/supabaseClient';` and unused group helper imports.

- [ ] **Step 4: Run the structural test**

Run: `node tests/multitenant-phase2.test.js`
Expected: PASS.

- [ ] **Step 5: Manual check**

Open `/quy/members` as a member. Expected: roster renders, no console errors.

- [ ] **Step 6: Commit**

```bash
git add app/quy/members/page.js tests/multitenant-phase2.test.js
git commit -m "refactor: serve member roster via server API"
```

---

## Task 8: Enable RLS and policies (migration 009)

**Files:**
- Create: `database/migrations/009_enable_rls.sql`
- Modify: `tests/multitenant-phase2.test.js`

**Prerequisite:** Tasks 3–7 are merged and verified. Admin pages use an authenticated Supabase session; member pages use `/api/club/*`. Only now is it safe to deny the anon key.

- [ ] **Step 1: Add the failing test**

Append to `tests/multitenant-phase2.test.js` before the final `console.log`:

```javascript
const rls = read('database/migrations/009_enable_rls.sql');
for (const table of [
    'groups', 'group_members', 'club_members', 'quy_pickleball', 'fund_events',
    'fund_event_participants', 'tournaments', 'tournament_teams', 'tournament_players',
    'tournament_pairings', 'tournament_matches', 'tournament_settings',
]) {
    assert(
        rls.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
        `Migration 009 should enable RLS on ${table}.`
    );
}
assert(
    rls.includes('group_members gm') && rls.includes('gm.user_id = auth.uid()'),
    'RLS policies should scope access by the caller\'s group_members rows.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase2.test.js`
Expected: FAIL — `ENOENT` for `009_enable_rls.sql`.

- [ ] **Step 3: Write the RLS migration**

Create `database/migrations/009_enable_rls.sql`:

```sql
-- Phase 2: lock down all tables with RLS. The anon role gets NO policy and is
-- therefore denied. Authenticated admins see only the clubs they belong to
-- (via group_members). The service_role key bypasses RLS for server routes.

-- Helper: membership predicate is inlined per table for clarity.

-- groups: an admin can see/manage groups they are a member of.
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY groups_admin_all ON groups
    FOR ALL TO authenticated
    USING (id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

-- group_members: a user can read their own membership rows.
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY group_members_self ON group_members
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Data tables: access limited to the caller's clubs.
-- Repeat the same policy for each group_id-scoped table.
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY club_members_by_group ON club_members FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE quy_pickleball ENABLE ROW LEVEL SECURITY;
CREATE POLICY quy_pickleball_by_group ON quy_pickleball FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE fund_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fund_events_by_group ON fund_events FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournaments_by_group ON tournaments FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournament_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_teams_by_group ON tournament_teams FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_players_by_group ON tournament_players FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournament_pairings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_pairings_by_group ON tournament_pairings FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_matches_by_group ON tournament_matches FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

ALTER TABLE tournament_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_settings_by_group ON tournament_settings FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));

-- fund_event_participants has no group_id; scope it through its parent event.
ALTER TABLE fund_event_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY fund_event_participants_by_group ON fund_event_participants FOR ALL TO authenticated
    USING (event_id IN (
        SELECT fe.id FROM fund_events fe
        WHERE fe.group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid())
    ))
    WITH CHECK (event_id IN (
        SELECT fe.id FROM fund_events fe
        WHERE fe.group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid())
    ));
```

- [ ] **Step 4: Verify `fund_event_participants` has no `group_id`**

Run via Supabase: `SELECT column_name FROM information_schema.columns WHERE table_name = 'fund_event_participants';`. If a `group_id` column **does** exist, replace its policy with the same direct `group_id IN (...)` form used by the other tables. Otherwise keep the parent-event form above.

- [ ] **Step 5: Apply the migration to Supabase**

Apply `database/migrations/009_enable_rls.sql` (name: `009_enable_rls`) to project `uhhlelemewilgsdijwja`. Verify: `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('quy_pickleball','groups','group_members');` → `relrowsecurity = true` for each. In the Table Editor the `UNRESTRICTED` badges should be gone.

- [ ] **Step 6: Run the structural test**

Run: `node tests/multitenant-phase2.test.js`
Expected: PASS.

- [ ] **Step 7: Smoke test both paths against the live DB**

- Admin: sign in at `/login`, open `/admin` → fund + members + tournament data still load (authenticated session satisfies RLS via membership).
- Member: open `/quy` → data still loads (served by `/api/club/*` with service key).
- Anon leak check: in a logged-out browser console, run
  `await (await fetch('/api/club/transactions')).json()` with no cookie → should be the default group only or empty; and a direct anon query must return nothing (verified properly in Task 10).

- [ ] **Step 8: Commit**

```bash
git add database/migrations/009_enable_rls.sql tests/multitenant-phase2.test.js
git commit -m "feat: enable RLS and per-club access policies"
```

---

## Task 9: Remove the legacy auth fallbacks

**Files:**
- Modify: `lib/groupSession.js` (`requireGroupAdmin`)
- Modify: `lib/supabaseServer.js`
- Modify: `tests/multitenant-phase2.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/multitenant-phase2.test.js` before the final `console.log`:

```javascript
const groupSessionSrc = read('lib/groupSession.js');
assert(
    !groupSessionSrc.includes('legacyFallback'),
    'requireGroupAdmin should not silently allow no-session writes.'
);
const serverSrc = read('lib/supabaseServer.js');
assert(
    serverSrc.includes('NODE_ENV') && serverSrc.includes('SUPABASE_SERVICE_ROLE_KEY'),
    'supabaseServer should hard-fail in production when the service key is missing.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase2.test.js`
Expected: FAIL — `legacyFallback` still present.

- [ ] **Step 3: Tighten `requireGroupAdmin`**

In `lib/groupSession.js`, replace the body of `requireGroupAdmin()` so a missing/non-admin session is rejected:

```javascript
export function requireGroupAdmin() {
    const session = getGroupSessionFromCookies();
    if (session?.role === 'admin') {
        return { ok: true, session, groupId: session.group_id };
    }
    return {
        ok: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }),
    };
}
```

- [ ] **Step 4: Hard-fail missing service key in production**

In `lib/supabaseServer.js`, replace the anon-key fallback with:

```javascript
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in production');
    }
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY missing — using anon key (dev only).');
}
```

- [ ] **Step 5: Run the structural + existing contract tests**

Run: `node tests/multitenant-phase2.test.js` → PASS.
Run: `node tests/teamfund-phase1.test.js` → the phase-1 test asserts admin write routes use `requireGroupAdmin` + `adminCheck.response`; confirm it still passes. If the phase-1 test referenced the legacy fallback, update it.

- [ ] **Step 6: Commit**

```bash
git add lib/groupSession.js lib/supabaseServer.js tests/multitenant-phase2.test.js
git commit -m "fix: remove legacy auth fallbacks that bypassed isolation"
```

---

## Task 10: Cross-club data-isolation integration test

**Files:**
- Create: `tests/isolation.integration.test.js`
- Modify: `package.json`

**Why:** The static tests check code shape; this proves the database actually denies cross-club reads via the anon key.

- [ ] **Step 1: Write the failing test**

Create `tests/isolation.integration.test.js`:

```javascript
// Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in env.
const { createClient } = require('@supabase/supabase-js');

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
        console.error('FAIL: missing Supabase env vars');
        process.exit(1);
    }
    const anonClient = createClient(url, anon);

    // With RLS on and no auth session, the anon role must read ZERO rows.
    const { data, error } = await anonClient.from('quy_pickleball').select('id').limit(5);
    if (error && /permission|rls|policy/i.test(error.message)) {
        console.log('isolation ok (anon denied)');
        return;
    }
    if (Array.isArray(data) && data.length === 0) {
        console.log('isolation ok (anon sees no rows)');
        return;
    }
    console.error(`FAIL: anon client read ${data ? data.length : '?'} rows — RLS not isolating`);
    process.exit(1);
}

main();
```

- [ ] **Step 2: Run test to verify it fails (before Task 8 RLS) / passes (after)**

Run: `node tests/isolation.integration.test.js` (with env vars set).
Expected **before** RLS (run against a pre-009 state if available): FAIL — anon reads rows.
Expected **after** Task 8 applied: PASS — `isolation ok`.

- [ ] **Step 3: Register the script**

In `package.json` `scripts` add: `"test:isolation": "node tests/isolation.integration.test.js"`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:isolation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/isolation.integration.test.js package.json
git commit -m "test: prove anon key is denied cross-club reads under RLS"
```

---

## Task 11: Backfill the existing club's owner account

**Files:** none (data operation against Supabase)

**Why:** `Pickleball 246 Club` predates Supabase-Auth admins. Create an owner account so the existing club can be administered under the new model.

- [ ] **Step 1: Confirm the owner email**

Use `mrtu.yb@gmail.com` (the project owner). Confirm before proceeding.

- [ ] **Step 2: Create the auth user**

Via the Supabase MCP (project `uhhlelemewilgsdijwja`), create the user with the Auth admin API equivalent, or run SQL through `auth.users` is not allowed directly — instead create the user using the dashboard Auth → Add user, OR add a one-off script step calling `supabaseAdmin.auth.admin.createUser({ email: 'mrtu.yb@gmail.com', password: '<chosen>', email_confirm: true })`. Record the returned `user.id`.

- [ ] **Step 3: Link membership**

Run via execute_sql:

```sql
INSERT INTO group_members (group_id, user_id, role)
SELECT g.id, '<USER_ID_FROM_STEP_2>'::uuid, 'owner'
FROM groups g WHERE g.code = 'P246CLUB'
ON CONFLICT (group_id, user_id) DO NOTHING;
```

- [ ] **Step 4: Verify**

`SELECT gm.role, g.code FROM group_members gm JOIN groups g ON g.id = gm.group_id;` → expect `owner | P246CLUB`. Then sign in at `/login` with that email → lands on `/admin` for Pickleball 246 Club.

- [ ] **Step 5: (No commit — data only)** Record the outcome in the PR description.

---

## Task 12: Full verification and build

**Files:** none (verification)

- [ ] **Step 1: Run every node test**

```bash
npm run test:phase2 && npm run test:teamfund && npm run test:admin-auth && npm run test:debug-guard && npm run test:isolation && npm run test:mobile-nav && npm run test:tournament-dashboard && npm run test:admin-center
```
Expected: every script prints its `... ok` line.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: compiles with no errors (pre-existing React-hook lint warnings are acceptable).

- [ ] **Step 3: Manual matrix in the browser**

| Scenario | Expected |
|---|---|
| Admin login → `/admin` | Fund + members + tournament data load |
| Member join → `/quy` | Data loads via `/api/club/*`, no create/delete-event controls |
| Member opens `/admin` | Redirected to `/` |
| Logged-out direct anon query | Zero rows (Task 10 passes) |
| Logout from `/admin` | Cookie cleared, back to `/` |

- [ ] **Step 4: Open a PR**

```bash
git push -u origin <branch>
gh pr create --title "Multi-tenant Phase 2: data isolation (RLS + admin auth)" --body "Implements docs/superpowers/plans/2026-06-13-multitenant-phase2-data-isolation.md. Enables RLS on all tables, authenticates club admins via Supabase Auth + group_members, serves member pages through /api/club/* with the service key, and removes the legacy auth fallbacks."
```

---

## Out of scope (future phases — separate plans)

- **Phase 3:** member self-service accounts beyond shared password, password reset UI, club settings page, invite/approve members, unify the tournament-captain auth into `group_members`.
- **Phase 4:** super-admin console, audit log, club transfer/delete, branding/logo, legal (terms/privacy/data deletion).
- **Phase 5:** per-club bank-account mapping + webhook routing (turn the current hardcoded `DEFAULT_GROUP_ID` in `app/api/webhook/route.js` into a `group_bank_accounts` lookup, with an enable/disable toggle per club), plan limits + billing.

---

## Self-Review Notes

- **Spec coverage:** B1 (RLS + move client queries off anon key) → Tasks 5–8; B2 (legacy fallbacks) → Task 9; hybrid accounts (admin email, member code) → Tasks 3–7; Supabase Auth + RLS → Tasks 3,4,8; data migration of existing club → Task 11; isolation proof → Task 10. Webhook per-club (decision: optional) and billing (deferred) are explicitly Phase 5.
- **Ordering risk:** RLS (Task 8) intentionally follows the access-path tasks; enabling it earlier breaks the app.
- **Type consistency:** `group_members(group_id, user_id, role)`, `addGroupMember`, `getAdminGroupIds`, `isGroupAdmin`, `getGroupIdForDatabase`, `signGroupSession`/`setGroupSessionCookie` are used consistently across tasks.
