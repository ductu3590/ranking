# Multi-tenant Phase 4 — Club Branding + Admin Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each club show its own name + logo on member-facing pages, and let a club admin change their own login password from the settings screen.

**Architecture:** Add a nullable `groups.logo_url` (data-URL) column. A public `GET /api/club/branding` resolves the active group from the signed cookie (or default) and returns `{ name, logoUrl }` via the service-role client. `HomeHeader` fetches it to brand every page. The existing admin-guarded `PATCH /api/club/settings` is extended to save `logoUrl`. `ClubSettings` gains a canvas-based logo uploader and a password-change form that calls Supabase Auth directly from the browser.

**Tech Stack:** Next.js 14 App Router, Supabase (`supabaseAdmin` service-role + `supabase` browser client), HTML canvas for client-side image resize, Node test scripts.

---

## Background (read before starting)

- `groups` columns today: `id, code, name, description, admin_password_hash, member_password_hash, created_at, updated_at` (see `database/migrations/007_multigroup_phase1.sql`). The default club is `id=1` "Pickleball 246 Club".
- `getEffectiveGroupContext()` (in `lib/groupSession.js`) returns the signed-cookie group context, or a default `{ group_id: DEFAULT_GROUP_ID, ... }` for anonymous visitors. Use it in the public branding route so members AND logged-out visitors get branding.
- `requireGroupAdmin()` returns `{ ok, session, groupId }` or `{ ok:false, response }` (403). Admin-only routes gate on it and scope by `adminCheck.groupId`.
- `supabaseAdmin` (in `lib/supabaseAdmin.js`) is the service-role client; it bypasses RLS — required because members are not authenticated Supabase users.
- The browser Supabase client is exported as `supabase` from `lib/supabaseClient.js`. After `/login`, supabase-js persists the admin's session, so `supabase.auth.updateUser({ password })` works client-side with no email/SMTP.
- `components/HomeHeader.js` is a client component that currently hard-codes `🏓 PICKLEBALL 246 CLUB`. It is the shared header for member and admin pages.
- `app/admin/ClubSettings.js` already loads `/api/club/settings`, has a `handleSave` PATCH, and shared `error`/`notice` state. We extend it; do not rewrite it.

---

## Task 1: Branding column, read API, and write API

**Files:**
- Create: `database/migrations/011_group_branding.sql`
- Create: `app/api/club/branding/route.js`
- Modify: `app/api/club/settings/route.js`
- Create: `tests/multitenant-phase4.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/multitenant-phase4.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const migration = read('database/migrations/011_group_branding.sql');
assert(
    migration.includes('logo_url') && migration.includes('ALTER TABLE groups'),
    'Migration 011 should add groups.logo_url.'
);

const branding = read('app/api/club/branding/route.js');
assert(
    branding.includes('export async function GET') &&
    branding.includes('getEffectiveGroupContext') &&
    branding.includes('supabaseAdmin') &&
    branding.includes('logoUrl'),
    'Branding route should expose a public GET resolving the active group and returning logoUrl.'
);

const settings = read('app/api/club/settings/route.js');
assert(
    settings.includes('logoUrl') && settings.includes('logo_url'),
    'Settings PATCH should accept logoUrl and write logo_url.'
);

console.log('multitenant phase 4 contract ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase4.test.js`
Expected: FAIL — ENOENT for `database/migrations/011_group_branding.sql`.

- [ ] **Step 3: Create the migration**

Create `database/migrations/011_group_branding.sql`:

```sql
-- Phase 4: per-club branding. A nullable data-URL logo; the club display name
-- reuses groups.name. Additive + nullable → safe to apply before code deploy.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN groups.logo_url IS 'Logo CLB lưu dạng data-URL (đã nén ≤256px) hiển thị trên header';
```

- [ ] **Step 4: Create the branding read route**

Create `app/api/club/branding/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getEffectiveGroupContext } from '@/lib/groupSession';

// Public: members and logged-out visitors read their active club's branding.
// Only non-sensitive fields (name, logo) are exposed.
export async function GET() {
    const context = getEffectiveGroupContext();
    const { data: group, error } = await supabaseAdmin
        .from('groups')
        .select('id, name, logo_url')
        .eq('id', context.group_id)
        .single();
    if (error) {
        return NextResponse.json({ name: context.group_name || null, logoUrl: null });
    }
    return NextResponse.json({ name: group.name, logoUrl: group.logo_url || null });
}
```

- [ ] **Step 5: Extend the settings PATCH to save the logo**

In `app/api/club/settings/route.js`, inside `PATCH`, after the `memberPassword` block (the `if (typeof body?.memberPassword ...)` block ending at line ~51) and before the `if (Object.keys(updates).length === 0)` check, insert:

```javascript
    if ('logoUrl' in (body || {})) {
        const logoUrl = body.logoUrl;
        if (logoUrl === null || logoUrl === '') {
            updates.logo_url = null;
        } else if (typeof logoUrl === 'string') {
            if (logoUrl.length > 100000) {
                return NextResponse.json({ error: 'Logo quá lớn — hãy chọn ảnh nhỏ hơn.' }, { status: 400 });
            }
            updates.logo_url = logoUrl;
        }
    }
```

Then change the two `.select('id, code, name, description')` calls in this file to `.select('id, code, name, description, logo_url')` so the returned group includes the logo (GET at line ~24 and the PATCH update at line ~60).

- [ ] **Step 6: Run test to verify it passes**

Run: `node tests/multitenant-phase4.test.js`
Expected: PASS — `multitenant phase 4 contract ok`.

- [ ] **Step 7: Register the script and commit**

In `package.json` `scripts`, add `"test:phase4": "node tests/multitenant-phase4.test.js"` right after the `"test:phase5"` line (add a comma to the `test:phase5` line; keep valid JSON).

```bash
git add database/migrations/011_group_branding.sql app/api/club/branding/route.js app/api/club/settings/route.js tests/multitenant-phase4.test.js package.json
git commit -m "feat: add club branding column, public branding API, and logo save"
```

---

## Task 2: Render branding in HomeHeader

**Files:**
- Modify: `components/HomeHeader.js`
- Modify: `tests/multitenant-phase4.test.js`

- [ ] **Step 1: Add the failing test**

In `tests/multitenant-phase4.test.js`, insert before the final `console.log`:

```javascript
const header = read('components/HomeHeader.js');
assert(
    header.includes('/api/club/branding') &&
    header.includes('useState') &&
    header.includes('useEffect'),
    'HomeHeader should fetch /api/club/branding and render club name + logo.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase4.test.js`
Expected: FAIL — `HomeHeader should fetch /api/club/branding...`.

- [ ] **Step 3: Update HomeHeader**

Replace the entire contents of `components/HomeHeader.js` with:

```javascript
'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import UserStatusBadge from './UserStatusBadge';
import './HomeHeader.css';

export default function HomeHeader({ showAdmin = true }) {
    const pathname = usePathname();
    const [branding, setBranding] = useState({ name: 'Pickleball 246 Club', logoUrl: null });

    useEffect(() => {
        let active = true;
        fetch('/api/club/branding')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (active && data && data.name) {
                    setBranding({ name: data.name, logoUrl: data.logoUrl || null });
                }
            })
            .catch(() => {});
        return () => { active = false; };
    }, []);

    const navLinks = [
        { href: '/quy', label: '💰 Quản lý quỹ' },
        { href: '/quy/members', label: '👥 Thành viên' },
        { href: '/giai-dau', label: '🏆 Giải đấu', className: 'tournament-link' },
    ];

    return (
        <header className="home-header">
            <div className="header-container">
                <div className="header-logo">
                    <a href="/quy">
                        {branding.logoUrl && (
                            <img className="header-logo-img" src={branding.logoUrl} alt={branding.name} />
                        )}
                        <h1>{branding.name.toUpperCase()}</h1>
                    </a>
                </div>

                <nav className="header-nav">
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className={`nav-link ${isActivePath(pathname, link.href) ? 'active' : ''} ${link.className || ''}`}
                        >
                            {link.label}
                        </a>
                    ))}
                    {showAdmin && (
                        <a href="/admin" className={`nav-link admin-link ${isActivePath(pathname, '/admin') ? 'active' : ''}`}>
                            ⚙️ Quản trị
                        </a>
                    )}
                </nav>

                <div className="header-right">
                    <UserStatusBadge />
                </div>
            </div>
        </header>
    );
}

function isActivePath(pathname, href) {
    if (pathname === href) return true;
    if (href === '/giai-dau') return pathname.startsWith('/giai-dau/');
    if (href === '/quy') return false;
    return pathname.startsWith(`${href}/`);
}
```

- [ ] **Step 4: Add logo image styling**

Append to `components/HomeHeader.css`:

```css
.header-logo a {
    display: inline-flex;
    align-items: center;
    gap: 10px;
}

.header-logo-img {
    height: 34px;
    width: 34px;
    object-fit: contain;
    border-radius: 8px;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/multitenant-phase4.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/HomeHeader.js components/HomeHeader.css tests/multitenant-phase4.test.js
git commit -m "feat: render per-club name + logo in HomeHeader"
```

---

## Task 3: Logo uploader + password change in ClubSettings

**Files:**
- Modify: `app/admin/ClubSettings.js`
- Modify: `app/admin/club-settings.css`
- Modify: `tests/multitenant-phase4.test.js`

- [ ] **Step 1: Add the failing test**

In `tests/multitenant-phase4.test.js`, insert before the final `console.log`:

```javascript
const clubSettings = read('app/admin/ClubSettings.js');
assert(
    clubSettings.includes("from '@/lib/supabaseClient'") &&
    clubSettings.includes('supabase.auth.updateUser') &&
    clubSettings.includes('toDataURL') &&
    clubSettings.includes('logoUrl'),
    'ClubSettings should support logo upload (canvas resize) and admin password change.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase4.test.js`
Expected: FAIL — `ClubSettings should support logo upload...`.

- [ ] **Step 3: Add the supabase import**

In `app/admin/ClubSettings.js`, change the top imports. Replace:

```javascript
import { useEffect, useState } from 'react';
import './club-settings.css';
```

with:

```javascript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import './club-settings.css';
```

- [ ] **Step 4: Add logo + password state**

In `app/admin/ClubSettings.js`, immediately after the line `const [form, setForm] = useState({ name: '', description: '', memberPassword: '' });`, add:

```javascript
    const [logoUrl, setLogoUrl] = useState(null);
    const [passwordForm, setPasswordForm] = useState({ next: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);
```

- [ ] **Step 5: Load the current logo on settings load**

In `loadSettings`, inside the `if (res.ok) {` block, after `setForm({ ... });`, add:

```javascript
            setLogoUrl(data.group.logo_url || null);
```

- [ ] **Step 6: Send the logo with the existing save**

In `handleSave`, change the line `const payload = { name: form.name, description: form.description };` to:

```javascript
        const payload = { name: form.name, description: form.description, logoUrl };
```

- [ ] **Step 7: Add the logo-resize handler and the password handler**

In `app/admin/ClubSettings.js`, insert these two functions right before the `if (loading) {` early-return block:

```javascript
    function handleLogoFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const MAX = 256;
                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                let dataUrl = canvas.toDataURL('image/webp', 0.8);
                if (!dataUrl.startsWith('data:image/webp')) {
                    dataUrl = canvas.toDataURL('image/png');
                }
                if (dataUrl.length > 100000) {
                    setError('Logo quá lớn sau khi nén — hãy chọn ảnh đơn giản hơn.');
                    return;
                }
                setError('');
                setLogoUrl(dataUrl);
                setNotice('Đã chọn logo — bấm "Lưu thay đổi" để áp dụng.');
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    async function handleChangePassword(event) {
        event.preventDefault();
        setError('');
        setNotice('');
        if (passwordForm.next.length < 6) {
            setError('Mật khẩu đăng nhập cần ít nhất 6 ký tự.');
            return;
        }
        if (passwordForm.next !== passwordForm.confirm) {
            setError('Mật khẩu xác nhận không khớp.');
            return;
        }
        setChangingPassword(true);
        const { error: authError } = await supabase.auth.updateUser({ password: passwordForm.next });
        if (authError) {
            setError(authError.message || 'Không đổi được mật khẩu.');
        } else {
            setPasswordForm({ next: '', confirm: '' });
            setNotice('Đã đổi mật khẩu đăng nhập.');
        }
        setChangingPassword(false);
    }
```

- [ ] **Step 8: Add the logo control to the settings form**

In `app/admin/ClubSettings.js`, inside the `<form className="club-settings-form" onSubmit={handleSave}>`, insert this block right before the `<button type="submit" className="club-settings-save" ...>`:

```jsx
                <div className="club-settings-logo">
                    <span className="club-settings-logo-label">Logo CLB</span>
                    <div className="club-settings-logo-row">
                        {logoUrl ? (
                            <img className="club-settings-logo-preview" src={logoUrl} alt="Logo CLB" />
                        ) : (
                            <span className="club-settings-logo-empty">Chưa có logo</span>
                        )}
                        <div className="club-settings-logo-actions">
                            <label className="club-settings-logo-pick">
                                Chọn ảnh
                                <input type="file" accept="image/*" onChange={handleLogoFile} hidden />
                            </label>
                            {logoUrl && (
                                <button
                                    type="button"
                                    className="club-settings-logo-remove"
                                    onClick={() => { setLogoUrl(null); setNotice('Đã bỏ logo — bấm "Lưu thay đổi" để áp dụng.'); }}
                                >
                                    Xóa logo
                                </button>
                            )}
                        </div>
                    </div>
                </div>
```

- [ ] **Step 9: Add the password-change section**

In `app/admin/ClubSettings.js`, insert this block right after the closing `</div>` of `club-settings-code` (the block that ends with the "Tạo lại mã" button), i.e. before the `club-settings-sepay` block:

```jsx
            <form className="club-settings-account" onSubmit={handleChangePassword}>
                <p className="club-settings-account-title">Tài khoản đăng nhập</p>
                <p className="club-settings-account-hint">Đổi mật khẩu đăng nhập admin của bạn.</p>
                <label>
                    Mật khẩu mới
                    <input
                        type="password"
                        value={passwordForm.next}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
                        minLength="6"
                        placeholder="••••••"
                    />
                </label>
                <label>
                    Xác nhận mật khẩu
                    <input
                        type="password"
                        value={passwordForm.confirm}
                        onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                        minLength="6"
                        placeholder="••••••"
                    />
                </label>
                <button type="submit" className="club-settings-save" disabled={changingPassword}>
                    {changingPassword ? 'Đang đổi...' : 'Đổi mật khẩu'}
                </button>
            </form>
```

- [ ] **Step 10: Add styling**

Append to `app/admin/club-settings.css`:

```css
.club-settings-logo {
    display: grid;
    gap: 8px;
}

.club-settings-logo-label {
    color: #343a45;
    font-size: 13px;
    font-weight: 700;
}

.club-settings-logo-row {
    display: flex;
    align-items: center;
    gap: 14px;
}

.club-settings-logo-preview {
    width: 56px;
    height: 56px;
    object-fit: contain;
    border: 1px solid #e9edf3;
    border-radius: 12px;
    background: #fff;
}

.club-settings-logo-empty {
    color: #9aa1ad;
    font-size: 13px;
}

.club-settings-logo-actions {
    display: flex;
    gap: 8px;
    align-items: center;
}

.club-settings-logo-pick {
    display: inline-flex;
    align-items: center;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 10px;
    background: #eef1f6;
    border: 1px solid #dfe4ed;
    color: #424b58;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
}

.club-settings-logo-remove {
    min-height: 38px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid #f0d4cf;
    background: #fff2ef;
    color: #c43c2e;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
}

.club-settings-account {
    display: grid;
    gap: 14px;
    border: 1px solid #e9edf3;
    border-radius: 16px;
    padding: 18px;
    background: #fff;
}

.club-settings-account-title {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
    color: #20242c;
}

.club-settings-account-hint {
    margin: -6px 0 0;
    font-size: 13px;
    color: #6a7180;
}

.club-settings-account label {
    display: grid;
    gap: 7px;
    color: #343a45;
    font-size: 13px;
    font-weight: 700;
}

.club-settings-account input {
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

.club-settings-account input:focus {
    border-color: #20ad72;
    box-shadow: 0 0 0 3px rgba(32, 173, 114, .16);
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `node tests/multitenant-phase4.test.js`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add app/admin/ClubSettings.js app/admin/club-settings.css tests/multitenant-phase4.test.js
git commit -m "feat: add logo uploader and admin password change to club settings"
```

---

## Task 4: Verification

**Files:** none (verification)

- [ ] **Step 1: Run all node tests**

```bash
npm run test:phase4 && npm run test:phase5 && npm run test:phase3 && npm run test:phase2 && npm run test:isolation && npm run test:teamfund && npm run test:admin-auth && npm run test:debug-guard && npm run test:mobile-nav && npm run test:tournament-dashboard && npm run test:admin-center
```
Expected: every script prints its `... ok` line.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compiles with no errors (lint warnings OK).

- [ ] **Step 3: Apply migration 011 to prod**

Apply `database/migrations/011_group_branding.sql` via the Supabase MCP (`apply_migration`, name `group_branding`). It only adds a nullable column → safe before the Vercel deploy.

- [ ] **Step 4: Manual check (dev server against prod DB, admin logged in)**

Sign in at `/login`, open `/admin` → **Cài đặt**:
- Choose a logo image → preview appears → **Lưu thay đổi** → reload a member page (`/quy`): header shows the new logo + club name.
- **Xóa logo** → Lưu → header shows name only.
- Under **Tài khoản đăng nhập**: set a new password (≥6, matching confirm) → success notice → log out → log back in with the new password.
- Visit `/quy` while logged out: header still shows the default club name (branding falls back gracefully).

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** `groups.logo_url` → Task 1 Step 3; branding GET → Task 1 Step 4; settings PATCH `logoUrl` + size guard → Task 1 Step 5; HomeHeader render → Task 2; canvas-resize logo upload → Task 3 Steps 7–8; admin password via `supabase.auth.updateUser` → Task 3 Steps 7,9; tests → all tasks; `test:phase4` script → Task 1 Step 7; migration safety/manual verify → Task 4.
- **Type/name consistency:** state `logoUrl`/`setLogoUrl`, `passwordForm`/`setPasswordForm`, `changingPassword`; handlers `handleLogoFile`, `handleChangePassword`; branding route returns `{ name, logoUrl }` consumed by HomeHeader (`data.logoUrl`) and ClubSettings reads `data.group.logo_url` (DB column) — PATCH/GET now `select` `logo_url`. Settings payload key `logoUrl` matches the PATCH handler's `body.logoUrl`.
- **Security:** branding GET exposes only `name` + `logoUrl` and is scoped to the cookie/default group; all writes stay behind `requireGroupAdmin()`; password change runs through the admin's own authenticated Supabase session (no privilege escalation, no SMTP needed).
- **Known caveats:** color theming, per-club `<title>`, and logo on join/hero pages are intentionally out of scope; the data-URL logo is capped at 100 KB both client- and server-side.
