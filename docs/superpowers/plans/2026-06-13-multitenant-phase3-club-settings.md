# Multi-tenant Phase 3 — Club Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give each club admin a self-service settings screen to rename their club, change the shared member password, and regenerate the join code + QR — all RLS-safe.

**Architecture:** A new admin-only section in the unified admin center (`/admin?section=settings`) renders a `ClubSettings` client component. All reads/writes go through new server routes under `/api/club/settings` that use the service-role key and are guarded by `requireGroupAdmin()` (which now strictly requires an admin group session). Member-password hashing and code-uniqueness/QR generation stay server-side.

**Tech Stack:** Next.js 14 App Router, Supabase (service-role client `supabaseAdmin`), `qrcode`, pbkdf2 hashing (`lib/groupAuth.hashPassword`), Node test scripts.

**Scope (per user decisions):** Club settings ONLY — rename/description, change member password, regenerate code+QR. NO email-dependent features (no password reset / no email invites). NO co-admin invites. NO captain-auth unification. Admin member CRUD already exists in `app/quy/admin/page.js` and is out of scope.

---

## Background (read before starting)

- RLS is live (Phase 2). `groups` has policy `groups_admin_all` allowing authenticated admins to access only their own club rows. Server routes use `supabaseAdmin` (service role, bypasses RLS) and gate on `requireGroupAdmin()`.
- `requireGroupAdmin()` (in `lib/groupSession.js`) returns `{ ok: true, session, groupId }` for an admin group session, else `{ ok: false, response }` (403). Use `adminCheck.groupId` as the club id.
- `lib/groupAuth.js` exports `generateGroupCode()`, `normalizeGroupCode(code)`, and `hashPassword(password)` (pbkdf2 → `pbkdf2:120000:salt:hash`).
- The create-group route (`app/api/groups/route.js`) already builds a join URL `${origin}/join?group=<code>` and a QR via `QRCode.toDataURL(joinUrl, { margin: 1, width: 320, color: { dark: '#101820', light: '#ffffff' } })`. Reuse the same shape.
- The unified admin center (`app/admin/page.js`) renders tabs via the `section` search param: `fund` (default) and `tournament`. It uses `setSection(next)` → `router.push('/admin?section=' + next)`. We add a third section `settings`.
- Regenerating the code only changes `groups.code`; `group_id` is unchanged so data access and the admin's session are unaffected. The badge shows the club NAME (not code), so no stale-UI problem. Old join links/Q**R stop working** — the UI must warn the admin.

---

## Task 1: Club settings read + update API

**Files:**
- Create: `app/api/club/settings/route.js`
- Create: `tests/multitenant-phase3.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/multitenant-phase3.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const settings = read('app/api/club/settings/route.js');
assert(
    settings.includes('export async function GET') &&
    settings.includes('export async function PATCH') &&
    settings.includes('requireGroupAdmin') &&
    settings.includes('hashPassword') &&
    settings.includes('member_password_hash'),
    'Settings route should expose admin-guarded GET + PATCH and hash the member password.'
);

console.log('multitenant phase 3 contract ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase3.test.js`
Expected: FAIL — ENOENT for `app/api/club/settings/route.js`.

- [ ] **Step 3: Create the route**

Create `app/api/club/settings/route.js`:

```javascript
import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGroupAdmin } from '@/lib/groupSession';
import { hashPassword } from '@/lib/groupAuth';

async function buildJoin(request, code) {
    const origin = request.headers.get('origin') || new URL(request.url).origin;
    const joinUrl = `${origin}/join?group=${code}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
        margin: 1,
        width: 320,
        color: { dark: '#101820', light: '#ffffff' },
    });
    return { joinUrl, qrCodeDataUrl };
}

export async function GET(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const { data: group, error } = await supabaseAdmin
        .from('groups')
        .select('id, code, name, description')
        .eq('id', adminCheck.groupId)
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const { joinUrl, qrCodeDataUrl } = await buildJoin(request, group.code);
    return NextResponse.json({ group, joinUrl, qrCodeDataUrl });
}

export async function PATCH(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const updates = {};
    if (typeof body?.name === 'string' && body.name.trim()) {
        updates.name = body.name.trim();
    }
    if (typeof body?.description === 'string') {
        updates.description = body.description.trim() || null;
    }
    if (typeof body?.memberPassword === 'string' && body.memberPassword) {
        if (body.memberPassword.length < 4) {
            return NextResponse.json({ error: 'Mật khẩu thành viên cần ít nhất 4 ký tự.' }, { status: 400 });
        }
        updates.member_password_hash = hashPassword(body.memberPassword);
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Không có thay đổi.' }, { status: 400 });
    }

    const { data: group, error } = await supabaseAdmin
        .from('groups')
        .update(updates)
        .eq('id', adminCheck.groupId)
        .select('id, code, name, description')
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ group });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/multitenant-phase3.test.js`
Expected: PASS — `multitenant phase 3 contract ok`.

- [ ] **Step 5: Register the script and commit**

In `package.json` `scripts`, add `"test:phase3": "node tests/multitenant-phase3.test.js"` right after `"test:isolation"` (valid JSON, trailing comma on the previous line).

```bash
git add app/api/club/settings/route.js tests/multitenant-phase3.test.js package.json
git commit -m "feat: add admin-guarded club settings read/update API"
```

---

## Task 2: Regenerate join code API

**Files:**
- Create: `app/api/club/settings/regenerate-code/route.js`
- Modify: `tests/multitenant-phase3.test.js`

- [ ] **Step 1: Add the failing test**

In `tests/multitenant-phase3.test.js`, insert before the final `console.log`:

```javascript
const regen = read('app/api/club/settings/regenerate-code/route.js');
assert(
    regen.includes('export async function POST') &&
    regen.includes('requireGroupAdmin') &&
    regen.includes('generateGroupCode') &&
    regen.includes('QRCode.toDataURL'),
    'Regenerate-code route should be admin-guarded and return a new unique code + QR.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase3.test.js`
Expected: FAIL — ENOENT for the regenerate-code route.

- [ ] **Step 3: Create the route**

Create `app/api/club/settings/regenerate-code/route.js`:

```javascript
import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGroupAdmin } from '@/lib/groupSession';
import { generateGroupCode, normalizeGroupCode } from '@/lib/groupAuth';

async function createUniqueGroupCode() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = normalizeGroupCode(generateGroupCode());
        const { data, error } = await supabaseAdmin
            .from('groups')
            .select('id')
            .eq('code', code)
            .maybeSingle();
        if (error) throw error;
        if (!data) return code;
    }
    throw new Error('Không thể tạo mã nhóm duy nhất. Vui lòng thử lại.');
}

export async function POST(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const code = await createUniqueGroupCode();
    const { data: group, error } = await supabaseAdmin
        .from('groups')
        .update({ code })
        .eq('id', adminCheck.groupId)
        .select('id, code, name')
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const origin = request.headers.get('origin') || new URL(request.url).origin;
    const joinUrl = `${origin}/join?group=${group.code}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
        margin: 1,
        width: 320,
        color: { dark: '#101820', light: '#ffffff' },
    });
    return NextResponse.json({ code: group.code, joinUrl, qrCodeDataUrl });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/multitenant-phase3.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/club/settings/regenerate-code/route.js tests/multitenant-phase3.test.js
git commit -m "feat: add admin-guarded join-code regeneration API"
```

---

## Task 3: ClubSettings component

**Files:**
- Create: `app/admin/ClubSettings.js`
- Create: `app/admin/club-settings.css`
- Modify: `tests/multitenant-phase3.test.js`

- [ ] **Step 1: Add the failing test**

In `tests/multitenant-phase3.test.js`, insert before the final `console.log`:

```javascript
const comp = read('app/admin/ClubSettings.js');
assert(
    comp.includes("'use client'") &&
    comp.includes('/api/club/settings') &&
    comp.includes('/api/club/settings/regenerate-code') &&
    comp.includes('Tạo lại mã'),
    'ClubSettings should load settings and support rename, member-password change, and code regeneration.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase3.test.js`
Expected: FAIL — ENOENT for `app/admin/ClubSettings.js`.

- [ ] **Step 3: Create the component**

Create `app/admin/ClubSettings.js`:

```javascript
'use client';

import { useEffect, useState } from 'react';
import './club-settings.css';

export default function ClubSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [group, setGroup] = useState(null);
    const [qr, setQr] = useState({ joinUrl: '', qrCodeDataUrl: '' });
    const [form, setForm] = useState({ name: '', description: '', memberPassword: '' });

    useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        setLoading(true);
        const res = await fetch('/api/club/settings');
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setQr({ joinUrl: data.joinUrl, qrCodeDataUrl: data.qrCodeDataUrl });
            setForm({ name: data.group.name || '', description: data.group.description || '', memberPassword: '' });
        } else {
            setError(data.error || 'Không tải được cài đặt.');
        }
        setLoading(false);
    }

    async function handleSave(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        setNotice('');
        const payload = { name: form.name, description: form.description };
        if (form.memberPassword) payload.memberPassword = form.memberPassword;
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setForm((prev) => ({ ...prev, memberPassword: '' }));
            setNotice('Đã lưu thay đổi.');
        } else {
            setError(data.error || 'Không lưu được.');
        }
        setSaving(false);
    }

    async function handleRegenerate() {
        if (!confirm('Tạo lại mã nhóm? Mã và mã QR cũ sẽ NGỪNG hoạt động. Bạn cần gửi mã mới cho thành viên.')) return;
        setSaving(true);
        setError('');
        setNotice('');
        const res = await fetch('/api/club/settings/regenerate-code', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            setGroup((prev) => ({ ...prev, code: data.code }));
            setQr({ joinUrl: data.joinUrl, qrCodeDataUrl: data.qrCodeDataUrl });
            setNotice('Đã tạo mã mới. Hãy gửi lại cho thành viên.');
        } else {
            setError(data.error || 'Không tạo lại được mã.');
        }
        setSaving(false);
    }

    if (loading) {
        return <div className="club-settings-loading">⏳ Đang tải cài đặt...</div>;
    }
    if (!group) {
        return <div className="club-settings-error">{error || 'Không có dữ liệu.'}</div>;
    }

    return (
        <div className="club-settings">
            {error && <p className="club-settings-msg error">{error}</p>}
            {notice && <p className="club-settings-msg ok">{notice}</p>}

            <form className="club-settings-form" onSubmit={handleSave}>
                <label>
                    Tên CLB
                    <input
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        required
                    />
                </label>
                <label>
                    Mô tả
                    <textarea
                        rows="3"
                        value={form.description}
                        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    />
                </label>
                <label>
                    Đổi mật khẩu thành viên (để trống nếu không đổi)
                    <input
                        type="password"
                        value={form.memberPassword}
                        onChange={(e) => setForm((p) => ({ ...p, memberPassword: e.target.value }))}
                        minLength="4"
                        placeholder="••••"
                    />
                </label>
                <button type="submit" className="club-settings-save" disabled={saving}>
                    {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
            </form>

            <div className="club-settings-code">
                <p className="club-settings-code-label">Mã nhóm</p>
                <strong className="club-settings-code-value">{group.code}</strong>
                {qr.qrCodeDataUrl && (
                    <img src={qr.qrCodeDataUrl} alt={`QR tham gia ${group.code}`} />
                )}
                <button type="button" className="club-settings-regen" onClick={handleRegenerate} disabled={saving}>
                    Tạo lại mã
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Create the stylesheet**

Create `app/admin/club-settings.css`:

```css
.club-settings {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 520px;
}

.club-settings-loading,
.club-settings-error {
    padding: 24px;
    text-align: center;
    color: #6b7280;
}

.club-settings-msg {
    margin: 0;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 650;
}

.club-settings-msg.error {
    background: #fff2ef;
    color: #c43c2e;
    border: 1px solid rgba(231, 76, 60, .22);
}

.club-settings-msg.ok {
    background: #eef8f2;
    color: #0f8c59;
    border: 1px solid rgba(15, 168, 103, .25);
}

.club-settings-form {
    display: grid;
    gap: 14px;
}

.club-settings-form label {
    display: grid;
    gap: 7px;
    color: #343a45;
    font-size: 13px;
    font-weight: 700;
}

.club-settings-form input,
.club-settings-form textarea {
    width: 100%;
    border: 1px solid #dfe4ed;
    border-radius: 12px;
    padding: 12px 13px;
    color: #20242c;
    background: #f8fafc;
    font: inherit;
    font-size: 16px;
    outline: none;
}

.club-settings-form input:focus,
.club-settings-form textarea:focus {
    border-color: #20ad72;
    box-shadow: 0 0 0 3px rgba(32, 173, 114, .16);
}

.club-settings-save,
.club-settings-regen {
    min-height: 44px;
    border: 0;
    border-radius: 12px;
    padding: 0 18px;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
}

.club-settings-save {
    background: linear-gradient(145deg, #35d678, #0fa867);
    color: #fff;
}

.club-settings-save:disabled {
    opacity: .7;
    cursor: wait;
}

.club-settings-code {
    border: 1px solid #e9edf3;
    border-radius: 16px;
    padding: 18px;
    text-align: center;
    background: #fff;
}

.club-settings-code-label {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: .08em;
    font-size: 12px;
    font-weight: 800;
    color: #6a7180;
}

.club-settings-code-value {
    display: block;
    margin-top: 4px;
    font-size: 26px;
    letter-spacing: .08em;
    color: #20242c;
}

.club-settings-code img {
    width: 180px;
    height: 180px;
    display: block;
    margin: 14px auto;
    border: 1px solid #edf0f5;
    border-radius: 14px;
}

.club-settings-regen {
    background: #eef1f6;
    color: #596170;
    border: 1px solid #dfe4ed;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/multitenant-phase3.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/admin/ClubSettings.js app/admin/club-settings.css tests/multitenant-phase3.test.js
git commit -m "feat: add ClubSettings admin component"
```

---

## Task 4: Wire settings into the admin center

**Files:**
- Modify: `app/admin/page.js`
- Modify: `tests/multitenant-phase3.test.js`

- [ ] **Step 1: Add the failing test**

In `tests/multitenant-phase3.test.js`, insert before the final `console.log`:

```javascript
const adminCenter = read('app/admin/page.js');
assert(
    adminCenter.includes('ClubSettings') &&
    adminCenter.includes("section === 'settings'") &&
    adminCenter.includes('Cài đặt'),
    'Admin center should render a Cài đặt (settings) section using ClubSettings.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase3.test.js`
Expected: FAIL — `app/admin/page.js` has no `ClubSettings`.

- [ ] **Step 3: Read the admin center, then wire it in**

Read `app/admin/page.js`. It imports panels and renders an `admin-center-tabs` nav with two buttons (Quỹ / Giải đấu) and a body that switches on `section`. Make these changes:

(a) Add the import near the other imports:
```javascript
import ClubSettings from '@/app/admin/ClubSettings';
```

(b) In the `admin-center-tabs` nav, add a third tab button after the "Giải đấu" button:
```jsx
                    <button
                        type="button"
                        className={section === 'settings' ? 'active' : ''}
                        onClick={() => setSection('settings')}
                    >
                        Cài đặt
                    </button>
```

(c) In the body that switches on `section` (currently `section === 'fund' ? <FundAdminPage embedded /> : <tournament panel>`), restructure so settings renders its own panel. Replace the conditional body with:
```jsx
                {section === 'fund' && <FundAdminPage embedded />}
                {section === 'settings' && (
                    <section className="admin-center-panel">
                        <ClubSettings />
                    </section>
                )}
                {section === 'tournament' && (
                    <section className="admin-center-panel">
                        <div className="admin-center-subtabs">
                            <button
                                type="button"
                                className={view !== 'pairings' ? 'active' : ''}
                                onClick={() => setTournamentView('overview')}
                            >
                                Tổng quan
                            </button>
                            <button
                                type="button"
                                className={view === 'pairings' ? 'active' : ''}
                                onClick={() => setTournamentView('pairings')}
                            >
                                Pairings
                            </button>
                        </div>
                        {view === 'pairings' ? <AdminPairingsPage embedded /> : <AdminTournamentPanel embedded />}
                    </section>
                )}
```
Keep the existing `FundAdminPage`, `AdminTournamentPanel`, `AdminPairingsPage` imports and the `setSection`/`setTournamentView`/`section`/`view` logic intact.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/multitenant-phase3.test.js`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: compiles with no errors (lint warnings OK).

- [ ] **Step 6: Commit**

```bash
git add app/admin/page.js tests/multitenant-phase3.test.js
git commit -m "feat: surface club settings tab in the admin center"
```

---

## Task 5: Verification

**Files:** none (verification)

- [ ] **Step 1: Run all node tests**

```bash
npm run test:phase3 && npm run test:phase2 && npm run test:isolation && npm run test:teamfund && npm run test:admin-auth && npm run test:debug-guard && npm run test:mobile-nav && npm run test:tournament-dashboard && npm run test:admin-center
```
Expected: every script prints its `... ok` line.

- [ ] **Step 2: Build**

Run: `npm run build` → compiles, no errors.

- [ ] **Step 3: Manual check (dev server against prod DB, admin logged in)**

Sign in at `/login` as the club admin, open `/admin`, click **Cài đặt**:
- Settings load (name, description, current code, QR).
- Change the name + Save → success notice; reload shows the new name; the header badge reflects it after re-login.
- Set a new member password + Save → then join as member at `/` with the new password works (old member password no longer works).
- Click **Tạo lại mã** → confirm → new code + QR appear; joining with the OLD code fails, the NEW code works.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-Review Notes

- **Scope coverage:** rename/description → Task 1 PATCH; member password change → Task 1 PATCH (`memberPassword` → `hashPassword`); regenerate code+QR → Task 2; UI → Tasks 3–4. Email-dependent features intentionally excluded per decision.
- **Security:** every settings route calls `requireGroupAdmin()` first and scopes by `adminCheck.groupId`; non-admins get 403. Hashing and code generation are server-side only.
- **Type consistency:** `requireGroupAdmin()` → `adminCheck.ok` / `adminCheck.response` / `adminCheck.groupId`; `hashPassword`, `generateGroupCode`, `normalizeGroupCode` match `lib/groupAuth.js` exports; component fetches `/api/club/settings` (GET, PATCH) and `/api/club/settings/regenerate-code` (POST).
- **Known caveat (documented in Background):** regenerating the code invalidates old join links/QR; the UI warns via a confirm dialog.
