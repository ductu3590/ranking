# Multi-tenant Phase 5 — Per-club Bank Webhook Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Route incoming SePay bank-transfer webhooks to the correct club by the receiving bank **account number**, and let each club register its own account(s) — so auto fund-recording works per club instead of always landing in the default club.

**Architecture:** A new `group_bank_accounts` table maps a globally-unique `account_number` → `group_id`. The public SePay webhook (`app/api/webhook/route.js`) looks up the payload's `accountNumber` in that table to resolve `group_id` (falling back to the default club when unmatched, so the existing club keeps working during transition). Admins manage their accounts via new guarded `/api/club/bank-accounts` routes surfaced in the club settings page. This is opt-in: a club with no registered account simply gets no auto-routing.

**Tech Stack:** Next.js 14 App Router, Supabase (service-role client `supabaseServer`/`supabaseAdmin`, RLS), Node test scripts.

**Decisions (from user):** Phase 5 = bank webhook only (billing deferred). Routing model = **each club registers its own bank account number**; webhook matches by `accountNumber`.

---

## Background (read before starting)

- The webhook `app/api/webhook/route.js` is PUBLIC (SePay → our endpoint, no auth) and uses `supabaseServer` (service role, bypasses RLS). It currently hardcodes `const groupId = DEFAULT_GROUP_ID;` (line ~35) then `parseTransaction(content, amount, accountName, huongGiaoDich, groupId)` and inserts into `quy_pickleball` with that `group_id`.
- SePay payload fields (per the comment in the route): `id, gateway, transactionDate, accountNumber, subAccount, code, content, transferType, description, transferAmount, accumulated, referenceCode`. The **receiving** bank account is `accountNumber`.
- RLS is live (Phase 2). New tables must enable RLS + an admin policy; the service-role webhook bypasses RLS so it can still read/insert.
- `requireGroupAdmin()` (`lib/groupSession.js`) → `{ ok, response, groupId }`. `supabaseAdmin` = service-role client.
- The club settings UI is `app/admin/ClubSettings.js` (Phase 3), reachable at `/admin?section=settings`.
- `DEFAULT_GROUP_ID` is exported from `lib/groupConstants.js` (value 1 = Pickleball 246 Club).

**Transition behavior:** unmatched `accountNumber` → falls back to `DEFAULT_GROUP_ID` (the existing club) and logs a warning. This prevents a regression for the live club before it registers its account. Once multiple clubs exist, each registers its own account so transfers match precisely; truly-unknown transfers still land in the default club for an admin to recategorize.

**Deployment note:** Migration 010 is additive (new table + RLS on an empty table) → safe to apply to production immediately; it does NOT break the live app. The webhook code change only takes effect after the user deploys; until then the live webhook keeps routing to the default club (no breakage). So there is NO breaking gate this phase.

---

## Task 1: group_bank_accounts table + RLS (migration 010)

**Files:**
- Create: `database/migrations/010_group_bank_accounts.sql`
- Create: `tests/multitenant-phase5.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/multitenant-phase5.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const m010 = read('database/migrations/010_group_bank_accounts.sql');
assert(
    m010.includes('CREATE TABLE IF NOT EXISTS group_bank_accounts') &&
    m010.includes('account_number text') &&
    m010.includes('UNIQUE (account_number)') &&
    m010.includes('REFERENCES groups') &&
    m010.includes('ENABLE ROW LEVEL SECURITY') &&
    m010.includes('gm.user_id = auth.uid()'),
    'Migration 010 should create group_bank_accounts with a unique account_number, FK to groups, and RLS scoped by membership.'
);

console.log('multitenant phase 5 contract ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase5.test.js`
Expected: FAIL — ENOENT for `010_group_bank_accounts.sql`.

- [ ] **Step 3: Write the migration**

Create `database/migrations/010_group_bank_accounts.sql`:

```sql
-- Phase 5: per-club bank accounts for routing SePay webhooks.
-- account_number is globally unique so an incoming transfer maps to exactly one club.

CREATE TABLE IF NOT EXISTS group_bank_accounts (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id       bigint NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    account_number text   NOT NULL,
    bank_name      text,
    label          text,
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_number)
);

CREATE INDEX IF NOT EXISTS idx_group_bank_accounts_group_id ON group_bank_accounts (group_id);

ALTER TABLE group_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY group_bank_accounts_by_group ON group_bank_accounts FOR ALL TO authenticated
    USING (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()))
    WITH CHECK (group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/multitenant-phase5.test.js`
Expected: PASS — `multitenant phase 5 contract ok`.

- [ ] **Step 5: Register script + commit**

In `package.json` `scripts`, add `"test:phase5": "node tests/multitenant-phase5.test.js"` after `"test:phase3"`.

```bash
git add database/migrations/010_group_bank_accounts.sql tests/multitenant-phase5.test.js package.json
git commit -m "feat: add group_bank_accounts table for webhook routing"
```

> NOTE: Applying migration 010 to Supabase is done by the controller (additive/safe), not the implementer.

---

## Task 2: Route the webhook by account number

**Files:**
- Modify: `app/api/webhook/route.js`
- Modify: `tests/multitenant-phase5.test.js`

- [ ] **Step 1: Add the failing test**

In `tests/multitenant-phase5.test.js`, insert before the final `console.log`:

```javascript
const webhook = read('app/api/webhook/route.js');
assert(
    webhook.includes('group_bank_accounts') &&
    webhook.includes('accountNumber') &&
    webhook.includes('account_number') &&
    !webhook.includes('const groupId = DEFAULT_GROUP_ID;'),
    'Webhook should resolve group_id from group_bank_accounts by accountNumber (not hardcode the default).'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase5.test.js`
Expected: FAIL — webhook still hardcodes the default group.

- [ ] **Step 3: Modify the webhook**

In `app/api/webhook/route.js`, replace the single line:
```javascript
        // 2. Parse transaction
        const groupId = DEFAULT_GROUP_ID;
```
with this block (resolve the club from the receiving account number, fall back to the default club when unmatched):
```javascript
        // 2. Resolve which club this transfer belongs to, by the receiving bank account.
        const accountNumber = String(data.accountNumber || data.subAccount || '').trim();
        let groupId = DEFAULT_GROUP_ID;
        if (accountNumber) {
            const { data: bankAccount } = await supabaseServer
                .from('group_bank_accounts')
                .select('group_id')
                .eq('account_number', accountNumber)
                .eq('is_active', true)
                .maybeSingle();
            if (bankAccount) {
                groupId = bankAccount.group_id;
            } else {
                console.warn(`No club registered for accountNumber "${accountNumber}" — falling back to default group.`);
            }
        }
```
Leave the rest unchanged (the existing `parseTransaction(..., groupId)` and the insert using `group_id: groupId` already consume `groupId`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/multitenant-phase5.test.js`
Expected: PASS.

- [ ] **Step 5: Build + commit**

Run: `npm run build` (expect compile, no errors).

```bash
git add app/api/webhook/route.js tests/multitenant-phase5.test.js
git commit -m "feat: route SePay webhook to the club owning the receiving account"
```

---

## Task 3: Bank-account management API

**Files:**
- Create: `app/api/club/bank-accounts/route.js`
- Modify: `tests/multitenant-phase5.test.js`

- [ ] **Step 1: Add the failing test**

In `tests/multitenant-phase5.test.js`, insert before the final `console.log`:

```javascript
const bankApi = read('app/api/club/bank-accounts/route.js');
assert(
    bankApi.includes('export async function GET') &&
    bankApi.includes('export async function POST') &&
    bankApi.includes('export async function DELETE') &&
    bankApi.includes('requireGroupAdmin') &&
    bankApi.includes('group_bank_accounts'),
    'Bank-accounts route should expose admin-guarded GET/POST/DELETE on group_bank_accounts.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase5.test.js`
Expected: FAIL — ENOENT for the bank-accounts route.

- [ ] **Step 3: Create the route**

Create `app/api/club/bank-accounts/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireGroupAdmin } from '@/lib/groupSession';

export async function GET() {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const { data, error } = await supabaseAdmin
        .from('group_bank_accounts')
        .select('id, account_number, bank_name, label, is_active, created_at')
        .eq('group_id', adminCheck.groupId)
        .order('created_at', { ascending: true });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ accounts: data || [] });
}

export async function POST(request) {
    const adminCheck = requireGroupAdmin();
    if (!adminCheck.ok) return adminCheck.response;

    const body = await request.json();
    const accountNumber = String(body?.accountNumber || '').trim();
    if (!accountNumber) {
        return NextResponse.json({ error: 'Số tài khoản là bắt buộc.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from('group_bank_accounts')
        .insert({
            group_id: adminCheck.groupId,
            account_number: accountNumber,
            bank_name: (body?.bankName || '').trim() || null,
            label: (body?.label || '').trim() || null,
        })
        .select('id, account_number, bank_name, label, is_active, created_at')
        .single();
    if (error) {
        if (error.code === '23505') {
            return NextResponse.json({ error: 'Số tài khoản này đã được đăng ký (có thể bởi CLB khác).' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ account: data });
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
        .from('group_bank_accounts')
        .delete()
        .eq('id', id)
        .eq('group_id', adminCheck.groupId);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/multitenant-phase5.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/club/bank-accounts/route.js tests/multitenant-phase5.test.js
git commit -m "feat: add admin-guarded bank-account management API"
```

---

## Task 4: Bank-accounts UI in club settings

**Files:**
- Modify: `app/admin/ClubSettings.js`
- Modify: `app/admin/club-settings.css`
- Modify: `tests/multitenant-phase5.test.js`

- [ ] **Step 1: Add the failing test**

In `tests/multitenant-phase5.test.js`, insert before the final `console.log`:

```javascript
const settingsUi = read('app/admin/ClubSettings.js');
assert(
    settingsUi.includes('/api/club/bank-accounts') &&
    settingsUi.includes('Tài khoản ngân hàng'),
    'ClubSettings should manage bank accounts for auto fund collection.'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/multitenant-phase5.test.js`
Expected: FAIL — ClubSettings has no bank-accounts section.

- [ ] **Step 3: Read `app/admin/ClubSettings.js`, then extend it**

Read the file. It is a client component with state (`group`, `qr`, `form`, etc.), a `loadSettings()` effect, `handleSave`, `handleRegenerate`, and a render with a settings form + a code/QR card. Make these additions (do not remove existing behavior):

(a) Add state near the other `useState` calls:
```javascript
    const [bankAccounts, setBankAccounts] = useState([]);
    const [bankForm, setBankForm] = useState({ accountNumber: '', bankName: '' });
```

(b) Call a loader from the existing mount `useEffect` (add `loadBankAccounts();` next to `loadSettings();`), and add the functions:
```javascript
    async function loadBankAccounts() {
        const res = await fetch('/api/club/bank-accounts');
        const data = await res.json();
        if (res.ok) setBankAccounts(data.accounts || []);
    }

    async function handleAddBank(event) {
        event.preventDefault();
        if (!bankForm.accountNumber.trim()) return;
        setError('');
        setNotice('');
        const res = await fetch('/api/club/bank-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountNumber: bankForm.accountNumber, bankName: bankForm.bankName }),
        });
        const data = await res.json();
        if (res.ok) {
            setBankAccounts((prev) => [...prev, data.account]);
            setBankForm({ accountNumber: '', bankName: '' });
            setNotice('Đã thêm tài khoản ngân hàng.');
        } else {
            setError(data.error || 'Không thêm được tài khoản.');
        }
    }

    async function handleDeleteBank(id) {
        if (!confirm('Xóa tài khoản ngân hàng này khỏi thu quỹ tự động?')) return;
        const res = await fetch(`/api/club/bank-accounts?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
            setBankAccounts((prev) => prev.filter((a) => a.id !== id));
        }
    }
```

(c) In the returned JSX, add this section immediately AFTER the `<div className="club-settings-code"> ... </div>` block (still inside the top-level `<div className="club-settings">`):
```jsx
            <div className="club-settings-bank">
                <p className="club-settings-bank-title">Tài khoản ngân hàng (thu quỹ tự động)</p>
                <p className="club-settings-bank-hint">
                    Khai số tài khoản nhận tiền của CLB. Chuyển khoản vào tài khoản này sẽ tự động ghi nhận vào quỹ CLB.
                </p>
                {bankAccounts.length > 0 ? (
                    <ul className="club-settings-bank-list">
                        {bankAccounts.map((a) => (
                            <li key={a.id}>
                                <span className="bank-acc-number">{a.account_number}</span>
                                {a.bank_name && <span className="bank-acc-name">{a.bank_name}</span>}
                                <button type="button" className="bank-acc-del" onClick={() => handleDeleteBank(a.id)}>
                                    Xóa
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="club-settings-bank-empty">Chưa có tài khoản nào — thu quỹ tự động đang tắt.</p>
                )}
                <form className="club-settings-bank-form" onSubmit={handleAddBank}>
                    <input
                        value={bankForm.accountNumber}
                        onChange={(e) => setBankForm((p) => ({ ...p, accountNumber: e.target.value }))}
                        placeholder="Số tài khoản"
                    />
                    <input
                        value={bankForm.bankName}
                        onChange={(e) => setBankForm((p) => ({ ...p, bankName: e.target.value }))}
                        placeholder="Tên ngân hàng (tùy chọn)"
                    />
                    <button type="submit">Thêm</button>
                </form>
            </div>
```

- [ ] **Step 4: Add styles**

Append to `app/admin/club-settings.css`:
```css
.club-settings-bank {
    border: 1px solid #e9edf3;
    border-radius: 16px;
    padding: 18px;
    background: #fff;
}

.club-settings-bank-title {
    margin: 0 0 4px;
    font-weight: 800;
    color: #20242c;
}

.club-settings-bank-hint {
    margin: 0 0 12px;
    font-size: 12px;
    color: #6a7180;
}

.club-settings-bank-list {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: grid;
    gap: 8px;
}

.club-settings-bank-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid #edf0f5;
    border-radius: 10px;
    background: #f8fafc;
}

.bank-acc-number {
    font-weight: 800;
    color: #20242c;
}

.bank-acc-name {
    font-size: 12px;
    color: #6a7180;
}

.bank-acc-del {
    margin-left: auto;
    border: 0;
    background: #fff2ef;
    color: #c43c2e;
    border-radius: 8px;
    padding: 6px 10px;
    font-weight: 700;
    cursor: pointer;
}

.club-settings-bank-empty {
    margin: 0 0 12px;
    font-size: 13px;
    color: #858b98;
}

.club-settings-bank-form {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.club-settings-bank-form input {
    flex: 1 1 140px;
    border: 1px solid #dfe4ed;
    border-radius: 10px;
    padding: 10px 12px;
    font: inherit;
    font-size: 16px;
    background: #f8fafc;
}

.club-settings-bank-form button {
    border: 0;
    border-radius: 10px;
    padding: 0 18px;
    min-height: 42px;
    font-weight: 800;
    color: #fff;
    background: linear-gradient(145deg, #35d678, #0fa867);
    cursor: pointer;
}
```

- [ ] **Step 5: Run test + build**

Run: `node tests/multitenant-phase5.test.js` → PASS.
Run: `npm run build` → compiles, no errors.

- [ ] **Step 6: Commit**

```bash
git add app/admin/ClubSettings.js app/admin/club-settings.css tests/multitenant-phase5.test.js
git commit -m "feat: manage club bank accounts in settings for auto fund collection"
```

---

## Task 5: Verification + push

**Files:** none (verification)

- [ ] **Step 1: Run all node tests**

```bash
npm run test:phase5 && npm run test:phase3 && npm run test:phase2 && npm run test:isolation && npm run test:teamfund && npm run test:admin-auth && npm run test:debug-guard && npm run test:mobile-nav && npm run test:tournament-dashboard && npm run test:admin-center
```
Expected: every script prints its `... ok` line.

- [ ] **Step 2: Build**

Run: `npm run build` → compiles, no errors.

- [ ] **Step 3: Manual check (controller, dev server + admin cookie)**

With migration 010 applied (controller step): as an admin, open `/admin?section=settings`:
- The "Tài khoản ngân hàng" section loads (empty initially).
- Add an account number → it appears in the list; adding the SAME number again → 409 error message.
- Delete it → it disappears.
- Simulate a webhook POST (e.g. via `/api/debug/webhook-inspect` or a direct POST to `/api/webhook` in dev) with `accountNumber` matching a registered account → the transaction is attributed to that club's `group_id`; with an unknown `accountNumber` → falls back to the default club (warning logged).

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-Review Notes

- **Scope coverage:** per-club account registration → Tasks 1,3,4; webhook routing by `accountNumber` → Task 2; opt-in (no account = no routing, with default fallback) → Task 2 + UI empty state. Billing intentionally deferred.
- **Security:** management routes are `requireGroupAdmin`-guarded and scoped by `adminCheck.groupId`; `account_number` is globally `UNIQUE` so it can't be hijacked by another club (insert returns 409). The public webhook stays unauthenticated by design and uses the service role.
- **Type consistency:** `group_bank_accounts(group_id, account_number, bank_name, label, is_active)`; API uses `accountNumber`/`bankName` in request bodies; webhook reads `data.accountNumber`. `requireGroupAdmin()` → `adminCheck.ok/response/groupId`.
- **No breaking gate:** migration 010 is additive; the webhook keeps a default-club fallback so nothing breaks before deploy.
