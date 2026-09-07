# Tournament Open Registration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho giải Cộng đồng ở chế độ Công khai nhận VĐV tự đăng ký qua link (đơn/đôi), có hạn/sức chứa/waitlist, ghép cặp, chống trùng theo SĐT, và bảng duyệt của BTC.

**Architecture:** Domain thuần trong `lib/tournament/openRegistration.js` (CommonJS, không I/O). API route handlers Next.js 14 (public không auth, gated theo `public_slug` + cờ mở; admin qua guard) đọc/ghi Supabase, scope `group_id`. UI React client fetch qua `lib/tournamentV2Client.js`. Dùng lại `tournament_registrations`; thêm bảng members + pair_invites + cấu hình mở đăng ký trên divisions (migration 042).

**Tech Stack:** Next.js 14 App Router (JS thuần), Supabase (supabaseAdmin), node assert tests (`tests/open-registration/*.test.js`), CSS thuần bám token PickHub.

**Spec:** `docs/superpowers/specs/2026-09-07-tournament-open-registration-design.md`. Mockup đã duyệt: `directory`, `reg-detail-v4`, `btc-board-v3`, `reg-status` (phiên brainstorm `.superpowers/`).

**Nhánh:** `spec/tournament-open-registration`.

**Quy ước bắt buộc (skill pickhub-engineering):** mọi bảng có `group_id`; API admin dùng `requireValidatedGroupAdmin`/`requireTournamentAccess`; public route KHÔNG tin group_id từ client, resolve qua `public_slug` với `.in('visibility', ['unlisted','public'])`; migration đặt trong `database/migrations/NNN_*.sql`, idempotent (`if not exists`), KHÔNG `DROP`/`TRUNCATE`; test là node script, thêm vào `package.json`.

**Áp migration:** dùng Supabase MCP `apply_migration` (project uhhlelemewilgsdijwja) hoặc chạy SQL trực tiếp; KHÔNG yêu cầu user copy thủ công. Sau khi tạo file 042, áp bằng MCP rồi ghi evidence.

---

## Phase A — Data model (migration 042)

### Task A1: Migration mở đăng ký

**Files:**
- Create: `database/migrations/042_open_registration.sql`

- [x] **Step 1: Viết migration**

```sql
-- 042_open_registration.sql
-- Đăng ký mở giải cộng đồng: cấu hình mở trên division, trường tự-đăng-ký trên
-- registrations, bảng members của một đăng ký, và lời mời ghép cặp.
-- Idempotent; không DROP/TRUNCATE.

-- A. Cấu hình mở đăng ký theo nội dung (division)
alter table tournament_divisions add column if not exists registration_open boolean not null default false;
alter table tournament_divisions add column if not exists registration_capacity integer;
alter table tournament_divisions add column if not exists registration_deadline timestamptz;
alter table tournament_divisions add column if not exists allow_late_registration boolean not null default false;
alter table tournament_divisions add column if not exists gender_mode text not null default 'any';
alter table tournament_divisions add column if not exists age_min integer;
alter table tournament_divisions add column if not exists age_max integer;
alter table tournament_divisions add column if not exists entry_fee integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_divisions_gender_mode_chk') then
    alter table tournament_divisions add constraint tournament_divisions_gender_mode_chk
      check (gender_mode in ('any','male','female','mixed'));
  end if;
end $$;

-- B. Trường tự-đăng-ký trên registrations
alter table tournament_registrations add column if not exists origin text not null default 'btc';
alter table tournament_registrations add column if not exists contact_phone_norm text;
alter table tournament_registrations add column if not exists self_declared_club text;
alter table tournament_registrations add column if not exists needs_partner boolean not null default false;
alter table tournament_registrations add column if not exists track_token text;
alter table tournament_registrations add column if not exists admitted_at timestamptz;
alter table tournament_registrations add column if not exists queue_seq bigserial;
alter table tournament_registrations add column if not exists merged_into bigint references tournament_registrations(id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_registrations_origin_chk') then
    alter table tournament_registrations add constraint tournament_registrations_origin_chk
      check (origin in ('btc','public_self'));
  end if;
end $$;

-- tournament_club_id chỉ được null khi origin='public_self'
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tournament_registrations_public_club_chk') then
    alter table tournament_registrations add constraint tournament_registrations_public_club_chk
      check (tournament_club_id is not null or origin = 'public_self');
  end if;
end $$;

create unique index if not exists tournament_registrations_track_token_uidx
  on tournament_registrations(track_token) where track_token is not null;

-- C. Members của một đăng ký (đơn=1, đôi=1..2)
create table if not exists tournament_registration_members (
  id bigserial primary key,
  group_id bigint not null,
  registration_id bigint not null references tournament_registrations(id) on delete cascade,
  seat smallint not null check (seat in (1,2)),
  full_name text not null,
  phone_norm text not null,
  self_declared_phr numeric,
  gender text check (gender in ('male','female')),
  dob date,
  created_at timestamptz not null default now(),
  unique (registration_id, seat)
);
create index if not exists trm_group_idx on tournament_registration_members(group_id);
create index if not exists trm_registration_idx on tournament_registration_members(registration_id);
create index if not exists trm_phone_idx on tournament_registration_members(group_id, phone_norm);

-- D. Lời mời ghép cặp (VĐV tự rủ)
create table if not exists tournament_pair_invites (
  id bigserial primary key,
  group_id bigint not null,
  division_id bigint not null references tournament_divisions(id) on delete cascade,
  from_registration_id bigint not null references tournament_registrations(id) on delete cascade,
  to_registration_id bigint not null references tournament_registrations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists tpi_group_div_idx on tournament_pair_invites(group_id, division_id);
create index if not exists tpi_to_idx on tournament_pair_invites(to_registration_id, status);
```

- [x] **Step 2: Áp migration qua Supabase MCP**

Dùng MCP `apply_migration` với name `042_open_registration` và nội dung file. Nếu MCP không sẵn, chạy SQL trực tiếp trên project. KHÔNG nhờ user chạy tay.

- [x] **Step 3: Xác minh cột/bảng tồn tại**

Chạy (MCP `execute_sql`):
```sql
select column_name from information_schema.columns where table_name='tournament_divisions' and column_name in ('registration_open','registration_capacity','gender_mode');
select to_regclass('public.tournament_registration_members'), to_regclass('public.tournament_pair_invites');
```
Expected: 3 dòng cột + 2 regclass không null.

- [x] **Step 4: Commit**

```bash
git add database/migrations/042_open_registration.sql
git commit -m "feat(open-reg): migration 042 — cấu hình mở đăng ký + members + pair invites"
```

---

## Phase B — Domain thuần (`lib/tournament/openRegistration.js`)

Tạo file domain + test script. Thêm script test vào `package.json`.

### Task B0: Khung test + script

**Files:**
- Create: `tests/open-registration/domain.test.js`
- Modify: `package.json` (thêm script)

- [x] **Step 1: Tạo test rỗng chạy được**

```js
// tests/open-registration/domain.test.js
const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };
const dom = require('../../lib/tournament/openRegistration');
// các test bổ sung ở các task sau
console.log('open-registration domain: OK (khung)');
```

- [x] **Step 2: Thêm script vào package.json**

Trong `"scripts"` thêm:
```json
"test:open-registration": "node tests/open-registration/domain.test.js && node tests/open-registration/api.contract.test.js && node tests/open-registration/ui.contract.test.js"
```

- [x] **Step 3: Chạy — kỳ vọng lỗi (chưa có module)**

Run: `node tests/open-registration/domain.test.js`
Expected: FAIL `Cannot find module ... openRegistration`.

### Task B1: `normalizePhone`

**Files:**
- Create: `lib/tournament/openRegistration.js`
- Test: `tests/open-registration/domain.test.js`

- [x] **Step 1: Viết test (đỏ)**

Thêm vào `domain.test.js` (trước dòng console.log cuối):
```js
assert(dom.normalizePhone(' 0912 345 678 ') === '0912345678', 'chuẩn hoá bỏ khoảng trắng');
assert(dom.normalizePhone('+84912345678') === '0912345678', '+84 -> 0');
assert(dom.normalizePhone('84912345678') === '0912345678', '84 -> 0');
let threw = false; try { dom.normalizePhone('abc'); } catch (e) { threw = e.code === 'INVALID_PHONE'; }
assert(threw, 'SĐT rác ném INVALID_PHONE');
```

- [x] **Step 2: Chạy — đỏ**

Run: `node tests/open-registration/domain.test.js`
Expected: FAIL tại normalizePhone.

- [x] **Step 3: Cài đặt**

```js
'use strict';

class OpenRegError extends Error {
  constructor(code, message) { super(message); this.name = 'OpenRegError'; this.code = code; }
}
function fail(code, message) { throw new OpenRegError(code, message); }

function normalizePhone(raw) {
  let digits = String(raw == null ? '' : raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('84') && digits.length >= 11) digits = '0' + digits.slice(2);
  digits = digits.replace(/\D/g, '');
  if (!/^0\d{8,10}$/.test(digits)) fail('INVALID_PHONE', 'Số điện thoại không hợp lệ');
  return digits;
}

module.exports = { OpenRegError, normalizePhone };
```

- [x] **Step 4: Chạy — xanh**

Run: `node tests/open-registration/domain.test.js`
Expected: PASS tới hết.

- [x] **Step 5: Commit**

```bash
git add lib/tournament/openRegistration.js tests/open-registration/domain.test.js package.json
git commit -m "feat(open-reg): domain normalizePhone (TDD)"
```

### Task B2: `requiredMemberFields(division)`

**Files:** Modify `lib/tournament/openRegistration.js`; Test `tests/open-registration/domain.test.js`

- [x] **Step 1: Test (đỏ)**

```js
assert(JSON.stringify(dom.requiredMemberFields({})) === JSON.stringify({ phr:false, gender:false, dob:false }), 'mặc định không trường phụ');
assert(dom.requiredMemberFields({ rating_cap: 4.8 }).phr === true, 'có rating_cap -> hỏi PHR');
assert(dom.requiredMemberFields({ gender_mode: 'mixed' }).gender === true, 'mixed -> hỏi giới tính');
assert(dom.requiredMemberFields({ gender_mode: 'male' }).gender === false, 'single-gender không hỏi');
assert(dom.requiredMemberFields({ age_min: 40 }).dob === true, 'có giới hạn tuổi -> hỏi ngày sinh');
```

- [x] **Step 2: Chạy — đỏ.** Run: `node tests/open-registration/domain.test.js` → FAIL.

- [x] **Step 3: Cài đặt** (thêm hàm + export)

```js
function requiredMemberFields(division = {}) {
  return {
    phr: division.rating_cap != null,
    gender: division.gender_mode === 'mixed',
    dob: division.age_min != null || division.age_max != null,
  };
}
```
Thêm `requiredMemberFields` vào `module.exports`.

- [x] **Step 4: Chạy — xanh.**

- [x] **Step 5: Commit** `git commit -am "feat(open-reg): requiredMemberFields (TDD)"`

### Task B3: `isRegistrationOpen(tournament, division, nowISO)`

**Files:** Modify domain + test.

- [x] **Step 1: Test (đỏ)**

```js
const T = { organizer_mode:'community', open_registration:true };
const D = { registration_open:true, registration_deadline:'2026-09-20T00:00:00Z', allow_late_registration:false };
assert(dom.isRegistrationOpen(T, D, '2026-09-10T00:00:00Z').ok === true, 'trong hạn -> mở');
assert(dom.isRegistrationOpen(T, D, '2026-09-21T00:00:00Z').ok === false, 'quá hạn -> đóng');
assert(dom.isRegistrationOpen(T, { ...D, allow_late_registration:true }, '2026-09-21T00:00:00Z').ok === true, 'nhận muộn -> mở');
assert(dom.isRegistrationOpen({ ...T, open_registration:false }, D, '2026-09-10T00:00:00Z').ok === false, 'giải chưa mở');
assert(dom.isRegistrationOpen({ ...T, organizer_mode:'internal' }, D, '2026-09-10T00:00:00Z').ok === false, 'không phải cộng đồng');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

```js
function isRegistrationOpen(tournament = {}, division = {}, nowISO) {
  if (tournament.organizer_mode !== 'community') return { ok:false, reason:'NOT_COMMUNITY' };
  if (!tournament.open_registration) return { ok:false, reason:'TOURNAMENT_CLOSED' };
  if (!division.registration_open) return { ok:false, reason:'DIVISION_CLOSED' };
  if (division.registration_deadline && !division.allow_late_registration) {
    const now = new Date(nowISO).getTime();
    const deadline = new Date(division.registration_deadline).getTime();
    if (Number.isFinite(now) && Number.isFinite(deadline) && now > deadline) return { ok:false, reason:'DEADLINE_PASSED' };
  }
  return { ok:true };
}
```
Export thêm `isRegistrationOpen`.

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): isRegistrationOpen (TDD)"`

### Task B4: `validateSubmission({ division, members })`

**Files:** Modify domain + test.

- [x] **Step 1: Test (đỏ)**

```js
const singles = { entrant_type:'individual', gender_mode:'any' };
const okSingle = dom.validateSubmission({ division: singles, members:[{ full_name:'A', phone:'0912345678' }] });
assert(okSingle.members.length === 1 && okSingle.members[0].phone_norm === '0912345678', 'đơn 1 member hợp lệ');

const doubles = { entrant_type:'pair', gender_mode:'mixed', rating_cap:4.8 };
let e1=false; try { dom.validateSubmission({ division:doubles, members:[{ full_name:'A', phone:'0912345678', gender:'male' },{ full_name:'B', phone:'0912345678', gender:'female' }] }); } catch(e){ e1 = e.code==='DUPLICATE_IN_PAIR'; }
assert(e1, 'hai người trùng SĐT trong cặp -> lỗi');

let e2=false; try { dom.validateSubmission({ division:doubles, members:[{ full_name:'A', phone:'0912345678', gender:'male' },{ full_name:'B', phone:'0912345679', gender:'male' }] }); } catch(e){ e2 = e.code==='MIXED_GENDER_REQUIRED'; }
assert(e2, 'mixed cần 1 nam 1 nữ');

const solo = dom.validateSubmission({ division:doubles, members:[{ full_name:'A', phone:'0912345678', gender:'male' }] });
assert(solo.needs_partner === true, 'đôi điền 1 -> needs_partner');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

```js
function validateSubmission({ division = {}, members = [] } = {}) {
  const isPair = division.entrant_type === 'pair';
  const need = requiredMemberFields(division);
  const clean = (members || []).filter((m) => m && (String(m.full_name || '').trim() || m.phone));
  if (!clean.length) fail('NO_MEMBER', 'Cần ít nhất một VĐV');
  if (!isPair && clean.length !== 1) fail('SINGLES_ONE_MEMBER', 'Nội dung đơn chỉ một VĐV');
  if (isPair && clean.length > 2) fail('PAIR_MAX_TWO', 'Cặp tối đa 2 VĐV');

  const out = clean.map((m, i) => {
    const full_name = String(m.full_name || '').trim();
    if (!full_name) fail('NAME_REQUIRED', 'Thiếu họ tên');
    const phone_norm = normalizePhone(m.phone);
    const rec = { seat: i + 1, full_name, phone_norm };
    if (need.phr) rec.self_declared_phr = m.phr == null || m.phr === '' ? null : Number(m.phr);
    if (need.gender) {
      if (!['male', 'female'].includes(m.gender)) fail('GENDER_REQUIRED', 'Thiếu giới tính');
      rec.gender = m.gender;
    }
    if (need.dob) {
      if (!m.dob) fail('DOB_REQUIRED', 'Thiếu ngày sinh');
      rec.dob = m.dob;
    }
    return rec;
  });

  if (out.length === 2 && out[0].phone_norm === out[1].phone_norm) fail('DUPLICATE_IN_PAIR', 'Hai VĐV trùng số điện thoại');
  if (isPair && out.length === 2 && division.gender_mode === 'mixed') {
    const genders = out.map((m) => m.gender).sort().join(',');
    if (genders !== 'female,male') fail('MIXED_GENDER_REQUIRED', 'Nội dung Nam-Nữ cần một nam và một nữ');
  }
  return { members: out, needs_partner: isPair && out.length === 1, contact_phone_norm: out[0].phone_norm };
}
```
Export thêm `validateSubmission`.

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): validateSubmission (TDD)"`

### Task B5: `transitionOpenRegistration` + `waitlistView`

**Files:** Modify domain + test.

- [x] **Step 1: Test (đỏ)**

```js
assert(dom.transitionOpenRegistration('submitted','admit') === 'approved', 'admit');
assert(dom.transitionOpenRegistration('approved','remove') === 'submitted', 'remove trả về chờ');
assert(dom.transitionOpenRegistration('rejected','restore') === 'submitted', 'restore');
assert(dom.transitionOpenRegistration('awaiting_partner','pair') === 'submitted', 'ghép xong vào chờ');
let te=false; try { dom.transitionOpenRegistration('approved','admit'); } catch(e){ te = e.code==='INVALID_TRANSITION'; }
assert(te, 'transition sai bị chặn');

// waitlist: capacity 2, approved 1 -> còn 1 suất; 3 submitted xếp theo queue_seq
const view = dom.waitlistView({ capacity:2, approvedCount:1, pending:[{id:10,queue_seq:1},{id:11,queue_seq:2},{id:12,queue_seq:3}] });
assert(view.freeSlots === 1, 'còn 1 suất');
assert(view.rows[0].isWaitlist === false && view.rows[1].isWaitlist === true && view.rows[1].position === 1, 'dòng 2 là waitlist #1');
assert(view.rows[2].position === 2, 'dòng 3 waitlist #2');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

```js
const OPEN_TRANSITIONS = {
  awaiting_partner: { pair: 'submitted', withdraw: 'withdrawn', merge: 'merged' },
  submitted: { admit: 'approved', reject: 'rejected', withdraw: 'withdrawn' },
  approved: { remove: 'submitted', withdraw: 'withdrawn' },
  rejected: { restore: 'submitted' },
  withdrawn: {}, merged: {},
};
function transitionOpenRegistration(status, action) {
  const next = OPEN_TRANSITIONS[status] && OPEN_TRANSITIONS[status][action];
  if (!next) fail('INVALID_TRANSITION', `${status} không thể ${action}`);
  return next;
}

function waitlistView({ capacity = null, approvedCount = 0, pending = [] } = {}) {
  const ordered = pending.slice().sort((a, b) => Number(a.queue_seq || 0) - Number(b.queue_seq || 0));
  const freeSlots = capacity == null ? Infinity : Math.max(0, Number(capacity) - Number(approvedCount));
  let admittable = freeSlots;
  let wlPos = 0;
  const rows = ordered.map((r) => {
    if (admittable > 0) { admittable -= 1; return { ...r, isWaitlist: false, position: null }; }
    wlPos += 1; return { ...r, isWaitlist: true, position: wlPos };
  });
  return { freeSlots: capacity == null ? null : freeSlots, rows };
}
function canAdmit({ capacity = null, approvedCount = 0 } = {}) {
  return capacity == null || Number(approvedCount) < Number(capacity);
}
```
Export thêm `transitionOpenRegistration`, `waitlistView`, `canAdmit`.

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): transitions + waitlistView (TDD)"`

### Task B6: `buildPairFromSolos(primary, secondary, division)`

**Files:** Modify domain + test.

- [x] **Step 1: Test (đỏ)**

```js
const div = { entrant_type:'pair', gender_mode:'mixed' };
const A = { id:1, members:[{ seat:1, full_name:'A', phone_norm:'0912345678', gender:'male' }] };
const B = { id:2, members:[{ seat:1, full_name:'B', phone_norm:'0912345679', gender:'female' }] };
const pair = dom.buildPairFromSolos(A, B, div);
assert(pair.primary_id === 1 && pair.merged_id === 2, 'A là entry chính, B bị gộp');
assert(pair.members.length === 2 && pair.members[1].seat === 2, 'B thành seat 2');
let pe=false; try { dom.buildPairFromSolos(A, { id:3, members:[{ seat:1, full_name:'C', phone_norm:'0912345678', gender:'female' }] }, div); } catch(e){ pe = e.code==='DUPLICATE_IN_PAIR'; }
assert(pe, 'ghép trùng SĐT bị chặn');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

```js
function buildPairFromSolos(primary, secondary, division = {}) {
  const m1 = (primary.members || [])[0];
  const m2 = (secondary.members || [])[0];
  if (!m1 || !m2) fail('SOLO_MEMBER_REQUIRED', 'Mỗi bên cần đúng một VĐV');
  if (m1.phone_norm === m2.phone_norm) fail('DUPLICATE_IN_PAIR', 'Hai VĐV trùng số điện thoại');
  const members = [{ ...m1, seat: 1 }, { ...m2, seat: 2 }];
  if (division.gender_mode === 'mixed') {
    const g = members.map((m) => m.gender).sort().join(',');
    if (g !== 'female,male') fail('MIXED_GENDER_REQUIRED', 'Nội dung Nam-Nữ cần một nam và một nữ');
  }
  return { primary_id: primary.id, merged_id: secondary.id, members };
}
```
Export thêm `buildPairFromSolos`.

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): buildPairFromSolos (TDD)"`

---

## Phase C — API công khai (không auth, gated theo slug)

Contract test đọc source (theo phong cách `tests/**/*.contract.test.js` hiện có) + assert hành vi gate.

### Task C0: Khung contract test API

**Files:** Create `tests/open-registration/api.contract.test.js`

- [x] **Step 1: Viết khung**

```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };
// assert bổ sung ở các task sau
console.log('open-registration api contract: OK (khung)');
```

- [x] **Step 2: Chạy** `node tests/open-registration/api.contract.test.js` → PASS (khung).

### Task C1: GET danh sách giải cộng đồng

**Files:**
- Create: `app/api/tournament-v2/public/community/route.js`
- Test: `tests/open-registration/api.contract.test.js`

- [x] **Step 1: Test (đỏ)**

```js
const f = 'app/api/tournament-v2/public/community/route.js';
assert(exists(f), 'route community tồn tại');
const s = read(f);
assert(!s.includes('requireValidatedGroupAdmin'), 'public: không dùng admin guard');
assert(s.includes("organizer_mode") && s.includes("open_registration"), 'lọc giải cộng đồng đang mở');
assert(/visibility/.test(s), 'chỉ giải unlisted/public');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';

const db = supabaseAdmin || supabaseServer;

// Danh sách giải Cộng đồng đang mở đăng ký + các nội dung mở. Công khai, không auth.
export async function GET() {
  try {
    const { data: tournaments, error } = await db
      .from('tournaments')
      .select('id, public_slug, name, location, event_date, organizer_mode, open_registration, visibility')
      .eq('organizer_mode', 'community')
      .eq('open_registration', true)
      .in('visibility', ['unlisted', 'public'])
      .order('event_date', { ascending: true });
    if (error) throw error;
    const ids = (tournaments || []).map((t) => t.id);
    let divisions = [];
    if (ids.length) {
      const { data, error: dErr } = await db
        .from('tournament_divisions')
        .select('id, tournament_id, name, entrant_type, play_type, registration_open, registration_capacity, registration_deadline')
        .in('tournament_id', ids)
        .eq('registration_open', true);
      if (dErr) throw dErr;
      divisions = data || [];
    }
    const byT = new Map();
    for (const d of divisions) {
      if (!byT.has(d.tournament_id)) byT.set(d.tournament_id, []);
      byT.get(d.tournament_id).push(d);
    }
    const list = (tournaments || [])
      .map((t) => ({ ...t, divisions: byT.get(t.id) || [] }))
      .filter((t) => t.divisions.length > 0);
    return NextResponse.json({ tournaments: list });
  } catch (err) {
    console.error('public/community GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): API danh sách giải cộng đồng"`

### Task C2: GET chi tiết nội dung để đăng ký

**Files:**
- Create: `app/api/tournament-v2/public/registration/route.js` (GET + POST)
- Test: `tests/open-registration/api.contract.test.js`

- [x] **Step 1: Test (đỏ)**

```js
const rf = 'app/api/tournament-v2/public/registration/route.js';
assert(exists(rf), 'route registration tồn tại');
const rs = read(rf);
assert(/export async function GET/.test(rs) && /export async function POST/.test(rs), 'có GET + POST');
assert(rs.includes('public_slug'), 'resolve theo slug');
assert(rs.includes('isRegistrationOpen'), 'POST kiểm tra cổng mở');
assert(rs.includes('validateSubmission'), 'POST dùng validateSubmission domain');
assert(rs.includes('contact_phone_norm'), 'chống trùng theo SĐT');
assert(!rs.includes('requireValidatedGroupAdmin'), 'public: không admin guard');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

```js
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { normalizePublicSlug } from '@/lib/tournament/publicSnapshot';
import { isRegistrationOpen, validateSubmission, requiredMemberFields, OpenRegError } from '@/lib/tournament/openRegistration';

const db = supabaseAdmin || supabaseServer;

async function resolveContext(slug, divisionId) {
  const { data: tournament } = await db.from('tournaments')
    .select('id, group_id, public_slug, name, location, event_date, organizer_mode, open_registration, visibility')
    .eq('public_slug', slug).in('visibility', ['unlisted', 'public']).maybeSingle();
  if (!tournament) return { error: NextResponse.json({ error: 'Giải không tồn tại' }, { status: 404 }) };
  const { data: division } = await db.from('tournament_divisions')
    .select('id, tournament_id, name, entrant_type, play_type, registration_open, registration_capacity, registration_deadline, allow_late_registration, gender_mode, age_min, age_max, entry_fee, rating_policy, rating_cap')
    .eq('id', divisionId).eq('tournament_id', tournament.id).maybeSingle();
  if (!division) return { error: NextResponse.json({ error: 'Nội dung không tồn tại' }, { status: 404 }) };
  return { tournament, division };
}

async function countByStatus(divisionId) {
  const { data } = await db.from('tournament_registrations')
    .select('id, status').eq('division_id', divisionId);
  const rows = data || [];
  return {
    approved: rows.filter((r) => r.status === 'approved').length,
    active: rows.filter((r) => ['submitted', 'approved', 'awaiting_partner'].includes(r.status)).length,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = normalizePublicSlug(searchParams.get('slug'));
    const divisionId = searchParams.get('divisionId');
    if (!slug || !divisionId) return NextResponse.json({ error: 'slug và divisionId là bắt buộc' }, { status: 400 });
    const ctx = await resolveContext(slug, divisionId);
    if (ctx.error) return ctx.error;
    const counts = await countByStatus(divisionId);
    return NextResponse.json({
      tournament: { name: ctx.tournament.name, location: ctx.tournament.location, event_date: ctx.tournament.event_date, public_slug: ctx.tournament.public_slug },
      division: ctx.division,
      fields: requiredMemberFields(ctx.division),
      capacity: ctx.division.registration_capacity ?? null,
      registered: counts.approved,
      open: isRegistrationOpen(ctx.tournament, ctx.division, new Date().toISOString()),
    });
  } catch (err) {
    console.error('public/registration GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body && body.company) return NextResponse.json({ error: 'invalid' }, { status: 400 }); // honeypot
    const slug = normalizePublicSlug(body.slug);
    const divisionId = body.divisionId;
    if (!slug || !divisionId) return NextResponse.json({ error: 'slug và divisionId là bắt buộc' }, { status: 400 });
    const ctx = await resolveContext(slug, divisionId);
    if (ctx.error) return ctx.error;

    const gate = isRegistrationOpen(ctx.tournament, ctx.division, new Date().toISOString());
    if (!gate.ok) return NextResponse.json({ error: 'Đăng ký đã đóng', code: gate.reason }, { status: 409 });

    let payload;
    try {
      payload = validateSubmission({ division: ctx.division, members: body.members || [] });
    } catch (e) {
      if (e instanceof OpenRegError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
      throw e;
    }

    // Chống trùng theo SĐT trong cùng nội dung (trạng thái đang hoạt động).
    const phones = payload.members.map((m) => m.phone_norm);
    const { data: activeRegs } = await db.from('tournament_registrations')
      .select('id').eq('division_id', divisionId).in('status', ['submitted', 'approved', 'awaiting_partner']);
    const activeIds = (activeRegs || []).map((r) => r.id);
    if (activeIds.length) {
      const { data: dupMembers } = await db.from('tournament_registration_members')
        .select('phone_norm').in('registration_id', activeIds).in('phone_norm', phones);
      if ((dupMembers || []).length) return NextResponse.json({ error: 'Số điện thoại đã đăng ký nội dung này', code: 'DUPLICATE_PHONE' }, { status: 409 });
    }

    const token = randomUUID().replace(/-/g, '');
    const status = payload.needs_partner ? 'awaiting_partner' : 'submitted';
    const { data: reg, error: regErr } = await db.from('tournament_registrations').insert({
      group_id: ctx.tournament.group_id,
      division_id: ctx.division.id,
      tournament_club_id: null,
      entrant_type: ctx.division.entrant_type,
      status,
      origin: 'public_self',
      contact_phone_norm: payload.contact_phone_norm,
      self_declared_club: body.self_declared_club || null,
      needs_partner: payload.needs_partner,
      track_token: token,
    }).select('id, status, needs_partner, track_token').single();
    if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

    const memberRows = payload.members.map((m) => ({ ...m, group_id: ctx.tournament.group_id, registration_id: reg.id }));
    const { error: mErr } = await db.from('tournament_registration_members').insert(memberRows);
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    return NextResponse.json({ success: true, registration: reg, track_token: token });
  } catch (err) {
    console.error('public/registration POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): API chi tiết + nộp đăng ký công khai"`

### Task C3: GET trạng thái theo token/SĐT

**Files:**
- Create: `app/api/tournament-v2/public/registration/status/route.js`
- Test: `tests/open-registration/api.contract.test.js`

- [x] **Step 1: Test (đỏ)**

```js
const sf = 'app/api/tournament-v2/public/registration/status/route.js';
assert(exists(sf), 'route status tồn tại');
const ss = read(sf);
assert(ss.includes('track_token') && ss.includes('phone'), 'tra theo token hoặc SĐT');
assert(!/phr_rating|self_declared_phr/.test(ss) || ss.includes('// only own'), 'không lộ PHR người khác (chỉ trạng thái)');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { normalizePublicSlug } from '@/lib/tournament/publicSnapshot';
import { normalizePhone, waitlistView } from '@/lib/tournament/openRegistration';

const db = supabaseAdmin || supabaseServer;

// Trạng thái tối thiểu cho VĐV: theo track_token, hoặc theo slug + SĐT.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    let regs = [];
    if (token) {
      const { data } = await db.from('tournament_registrations')
        .select('id, division_id, status, needs_partner, queue_seq, contact_phone_norm')
        .eq('track_token', token);
      regs = data || [];
    } else {
      const slug = normalizePublicSlug(searchParams.get('slug'));
      let phone; try { phone = normalizePhone(searchParams.get('phone')); } catch { phone = null; }
      if (!slug || !phone) return NextResponse.json({ error: 'Cần token, hoặc slug + SĐT hợp lệ' }, { status: 400 });
      const { data: t } = await db.from('tournaments').select('id').eq('public_slug', slug).in('visibility', ['unlisted', 'public']).maybeSingle();
      if (!t) return NextResponse.json({ registrations: [] });
      const { data: divs } = await db.from('tournament_divisions').select('id').eq('tournament_id', t.id);
      const divIds = (divs || []).map((d) => d.id);
      if (!divIds.length) return NextResponse.json({ registrations: [] });
      const { data } = await db.from('tournament_registrations')
        .select('id, division_id, status, needs_partner, queue_seq, contact_phone_norm')
        .in('division_id', divIds).eq('contact_phone_norm', phone);
      regs = data || [];
    }
    // Tính vị trí waitlist cho các đăng ký submitted.
    const out = [];
    for (const r of regs) {
      let waitlist = null;
      if (r.status === 'submitted') {
        const { data: div } = await db.from('tournament_divisions').select('registration_capacity').eq('id', r.division_id).maybeSingle();
        const { data: sib } = await db.from('tournament_registrations').select('id, status, queue_seq').eq('division_id', r.division_id).in('status', ['submitted', 'approved']);
        const approvedCount = (sib || []).filter((x) => x.status === 'approved').length;
        const pending = (sib || []).filter((x) => x.status === 'submitted');
        const view = waitlistView({ capacity: div?.registration_capacity ?? null, approvedCount, pending });
        const me = view.rows.find((x) => String(x.id) === String(r.id));
        waitlist = me && me.isWaitlist ? me.position : null;
      }
      out.push({ id: r.id, division_id: r.division_id, status: r.status, needs_partner: r.needs_partner, waitlist_position: waitlist });
    }
    return NextResponse.json({ registrations: out });
  } catch (err) {
    console.error('public/registration/status GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): API trạng thái theo token/SĐT"`

### Task C4: Pair-invite công khai (VĐV tự rủ)

**Files:**
- Create: `app/api/tournament-v2/public/pair-invite/route.js` (POST tạo lời mời, PATCH accept/decline)
- Test: `tests/open-registration/api.contract.test.js`

- [x] **Step 1: Test (đỏ)**

```js
const pf = 'app/api/tournament-v2/public/pair-invite/route.js';
assert(exists(pf), 'route pair-invite tồn tại');
const ps = read(pf);
assert(/export async function POST/.test(ps) && /export async function PATCH/.test(ps), 'POST tạo + PATCH phản hồi');
assert(ps.includes('track_token'), 'xác thực bằng token của VĐV');
assert(ps.includes('tournament_pair_invites'), 'ghi bảng lời mời');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';

const db = supabaseAdmin || supabaseServer;

async function regByToken(token) {
  if (!token) return null;
  const { data } = await db.from('tournament_registrations')
    .select('id, group_id, division_id, status, needs_partner').eq('track_token', token).maybeSingle();
  return data || null;
}

// VĐV A (token) rủ VĐV lẻ B (to_registration_id) trong cùng nội dung.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const from = await regByToken(body.token);
    if (!from) return NextResponse.json({ error: 'Token không hợp lệ' }, { status: 403 });
    if (from.status !== 'awaiting_partner') return NextResponse.json({ error: 'Bạn không ở trạng thái chờ ghép' }, { status: 409 });
    const { data: to } = await db.from('tournament_registrations')
      .select('id, division_id, status').eq('id', body.targetRegistrationId).maybeSingle();
    if (!to || to.division_id !== from.division_id || to.status !== 'awaiting_partner') {
      return NextResponse.json({ error: 'VĐV được mời không hợp lệ' }, { status: 400 });
    }
    const { data, error } = await db.from('tournament_pair_invites').insert({
      group_id: from.group_id, division_id: from.division_id,
      from_registration_id: from.id, to_registration_id: to.id, status: 'pending',
    }).select('id, status').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, invite: data });
  } catch (err) {
    console.error('pair-invite POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// VĐV B (token) chấp nhận/từ chối lời mời. Chấp nhận -> chờ BTC duyệt cặp.
export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const me = await regByToken(body.token);
    if (!me) return NextResponse.json({ error: 'Token không hợp lệ' }, { status: 403 });
    const { data: invite } = await db.from('tournament_pair_invites')
      .select('id, to_registration_id, status').eq('id', body.inviteId).maybeSingle();
    if (!invite || String(invite.to_registration_id) !== String(me.id)) {
      return NextResponse.json({ error: 'Lời mời không hợp lệ' }, { status: 400 });
    }
    const action = body.action === 'accept' ? 'accepted' : body.action === 'decline' ? 'declined' : null;
    if (!action) return NextResponse.json({ error: 'action không hợp lệ' }, { status: 400 });
    const { error } = await db.from('tournament_pair_invites').update({ status: action }).eq('id', invite.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Chấp nhận: đánh dấu để BTC duyệt cặp (BTC thực hiện gộp ở admin API).
    return NextResponse.json({ success: true, invite_status: action });
  } catch (err) {
    console.error('pair-invite PATCH error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): API lời mời ghép cặp (VĐV tự rủ)"`

---

## Phase D — API admin (mở rộng route sẵn có)

### Task D1: Cấu hình mở đăng ký trên division (PATCH)

**Files:**
- Modify: `app/api/tournament-v2/divisions/route.js` (PATCH nhận thêm field cấu hình)
- Test: `tests/open-registration/api.contract.test.js`

- [x] **Step 1: Test (đỏ)**

```js
const df = 'app/api/tournament-v2/divisions/route.js';
const ds = read(df);
for (const k of ['registration_open','registration_capacity','registration_deadline','allow_late_registration','gender_mode']) {
  assert(ds.includes(k), 'divisions PATCH nhận ' + k);
}
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

Trong `PATCH` của `divisions/route.js`, khi build object cập nhật, thêm các field mở đăng ký nếu có trong body (giữ nguyên guard `requireValidatedGroupAdmin` + scope `group_id` sẵn có):
```js
const REG_FIELDS = ['registration_open', 'registration_capacity', 'registration_deadline', 'allow_late_registration', 'gender_mode', 'age_min', 'age_max', 'entry_fee'];
for (const key of REG_FIELDS) {
  if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key] === '' ? null : body[key];
}
```
(Đặt sau khi khởi tạo `patch` và trước `.update(patch)`. Nếu file dùng tên biến khác cho object cập nhật, đổi cho khớp.)

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): divisions PATCH cấu hình mở đăng ký"`

### Task D2: Bảng duyệt — GET nhóm theo trạng thái + waitlist

**Files:**
- Create: `app/api/tournament-v2/registrations/board/route.js`
- Test: `tests/open-registration/api.contract.test.js`

- [x] **Step 1: Test (đỏ)**

```js
const bf = 'app/api/tournament-v2/registrations/board/route.js';
assert(exists(bf), 'route board tồn tại');
const bs = read(bf);
assert(bs.includes('requireValidatedGroupAdmin') || bs.includes('requireTournamentAccess'), 'admin guard');
assert(bs.includes('waitlistView'), 'dùng waitlistView domain');
assert(bs.includes("'approved'") && bs.includes("'submitted'") && bs.includes("'awaiting_partner'"), 'phân nhóm trạng thái');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireTournamentAccess } from '@/lib/tournament/accessRuntime';
import { waitlistView } from '@/lib/tournament/openRegistration';

const db = supabaseAdmin || supabaseServer;

// Dữ liệu cho bảng duyệt BTC của một nội dung: đã vào giải, chờ xử lý (kèm waitlist),
// hồ chờ ghép, từ chối. Admin, scope group_id.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const divisionId = searchParams.get('divisionId');
    if (!divisionId) return NextResponse.json({ error: 'divisionId là bắt buộc' }, { status: 400 });
    const access = await requireTournamentAccess({ divisionId, need: 'read' });
    if (!access.ok) return access.response;

    const { data: division } = await db.from('tournament_divisions')
      .select('id, name, entrant_type, registration_capacity, registration_deadline, allow_late_registration, gender_mode')
      .eq('id', divisionId).eq('group_id', access.groupId).maybeSingle();
    if (!division) return NextResponse.json({ error: 'Không tìm thấy nội dung' }, { status: 404 });

    const { data: regs } = await db.from('tournament_registrations')
      .select('id, status, needs_partner, queue_seq, contact_phone_norm, self_declared_club, origin, created_at')
      .eq('group_id', access.groupId).eq('division_id', divisionId);
    const ids = (regs || []).map((r) => r.id);
    const { data: members } = ids.length
      ? await db.from('tournament_registration_members').select('registration_id, seat, full_name, phone_norm, self_declared_phr, gender').in('registration_id', ids)
      : { data: [] };
    const membersByReg = new Map();
    for (const m of members || []) {
      if (!membersByReg.has(m.registration_id)) membersByReg.set(m.registration_id, []);
      membersByReg.get(m.registration_id).push(m);
    }
    const decorate = (r) => ({ ...r, members: (membersByReg.get(r.id) || []).sort((a, b) => a.seat - b.seat) });

    const all = (regs || []).map(decorate);
    const approved = all.filter((r) => r.status === 'approved');
    const pending = all.filter((r) => r.status === 'submitted');
    const awaiting = all.filter((r) => r.status === 'awaiting_partner');
    const rejected = all.filter((r) => r.status === 'rejected');
    const view = waitlistView({ capacity: division.registration_capacity ?? null, approvedCount: approved.length, pending });

    return NextResponse.json({
      division,
      approved,
      pending: view.rows.map((row) => decorate(row)),
      awaiting_partner: awaiting,
      rejected,
      free_slots: view.freeSlots,
    });
  } catch (err) {
    console.error('registrations/board GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): API bảng duyệt (nhóm trạng thái + waitlist)"`

### Task D3: Hành động BTC (PATCH registrations)

**Files:**
- Modify: `app/api/tournament-v2/registrations/route.js` (thêm nhánh action open-reg)
- Test: `tests/open-registration/api.contract.test.js`

- [x] **Step 1: Test (đỏ)**

```js
const regf = 'app/api/tournament-v2/registrations/route.js';
const regs2 = read(regf);
for (const a of ['admit','remove','restore','pair','approve_pair']) assert(regs2.includes(a), 'PATCH hỗ trợ action ' + a);
assert(regs2.includes('canAdmit') || regs2.includes('transitionOpenRegistration'), 'dùng domain open-reg');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

Ở đầu `registrations/route.js` thêm import:
```js
import { transitionOpenRegistration, canAdmit, buildPairFromSolos } from '@/lib/tournament/openRegistration';
```
Trong `PATCH`, sau khi lấy `current` và `access`, thêm nhánh xử lý các action open-reg TRƯỚC nhánh `transitionRegistration` cũ (giữ nguyên nhánh cũ cho luồng interclub):
```js
const OPEN_ACTIONS = new Set(['admit', 'remove', 'restore', 'reject_open', 'withdraw_open']);
if (OPEN_ACTIONS.has(body.action)) {
  // admit cần còn suất
  if (body.action === 'admit') {
    const { data: division } = await db.from('tournament_divisions')
      .select('registration_capacity').eq('id', current.division_id).eq('group_id', access.groupId).maybeSingle();
    const { data: appr } = await db.from('tournament_registrations')
      .select('id').eq('division_id', current.division_id).eq('status', 'approved');
    if (!canAdmit({ capacity: division?.registration_capacity ?? null, approvedCount: (appr || []).length })) {
      return NextResponse.json({ error: 'Đã đầy sức chứa', code: 'CAPACITY_FULL' }, { status: 409 });
    }
  }
  const map = { admit: 'admit', remove: 'remove', restore: 'restore', reject_open: 'reject', withdraw_open: 'withdraw' };
  let nextStatus;
  try { nextStatus = transitionOpenRegistration(current.status, map[body.action]); }
  catch (e) { return NextResponse.json({ error: e.message, code: e.code }, { status: 409 }); }
  const patch = { status: nextStatus, version: Number(current.version || 1) + 1, updated_at: new Date().toISOString() };
  if (body.action === 'admit') patch.admitted_at = new Date().toISOString();
  const { data, error } = await db.from('tournament_registrations')
    .update(patch).eq('id', current.id).eq('group_id', access.groupId).select('id, status').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, registration: data });
}

if (body.action === 'pair' || body.action === 'approve_pair') {
  // BTC ghép hai solo (pair) hoặc duyệt cặp do VĐV rủ (approve_pair): gộp secondary vào current.
  const secondaryId = body.action === 'pair' ? body.secondaryId : body.secondaryId;
  const load = async (id) => {
    const { data: reg } = await db.from('tournament_registrations').select('id, division_id, status').eq('id', id).eq('group_id', access.groupId).maybeSingle();
    const { data: mem } = await db.from('tournament_registration_members').select('seat, full_name, phone_norm, self_declared_phr, gender').eq('registration_id', id);
    return reg ? { ...reg, members: mem || [] } : null;
  };
  const primary = await load(current.id);
  const secondary = await load(secondaryId);
  if (!primary || !secondary || primary.division_id !== secondary.division_id) return NextResponse.json({ error: 'Cặp không hợp lệ' }, { status: 400 });
  const { data: division } = await db.from('tournament_divisions').select('gender_mode, entrant_type').eq('id', primary.division_id).maybeSingle();
  let pair;
  try { pair = buildPairFromSolos(primary, secondary, division || {}); }
  catch (e) { return NextResponse.json({ error: e.message, code: e.code }, { status: 400 }); }
  // Thêm member seat 2 (từ secondary), đóng secondary, đưa primary vào hàng chờ.
  const seat2 = pair.members[1];
  await db.from('tournament_registration_members').insert({ group_id: access.groupId, registration_id: primary.id, seat: 2, full_name: seat2.full_name, phone_norm: seat2.phone_norm, self_declared_phr: seat2.self_declared_phr ?? null, gender: seat2.gender ?? null });
  await db.from('tournament_registrations').update({ status: 'merged', merged_into: primary.id, updated_at: new Date().toISOString() }).eq('id', secondary.id).eq('group_id', access.groupId);
  const { data: updated, error: upErr } = await db.from('tournament_registrations').update({ status: 'submitted', needs_partner: false, updated_at: new Date().toISOString() }).eq('id', primary.id).eq('group_id', access.groupId).select('id, status').single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  await db.from('tournament_pair_invites').update({ status: 'accepted' }).eq('from_registration_id', primary.id).eq('to_registration_id', secondary.id);
  return NextResponse.json({ success: true, registration: updated });
}
```

- [x] **Step 4: Chạy — xanh.**

- [x] **Step 5: Regression interclub (không vỡ luồng cũ)**

Run: `node tests/phase3/interclub-competition.test.js && node tests/phase3/interclub-ui.test.js`
Expected: PASS (nhánh action cũ giữ nguyên).

- [x] **Step 6: Commit** `git commit -am "feat(open-reg): PATCH admit/remove/restore/pair/approve_pair"`

---

## Phase E — Client helpers

### Task E1: Thêm hàm vào `lib/tournamentV2Client.js`

**Files:**
- Modify: `lib/tournamentV2Client.js`
- Test: `tests/open-registration/api.contract.test.js`

- [x] **Step 1: Test (đỏ)**

```js
const cl = read('lib/tournamentV2Client.js');
for (const fn of ['listCommunityTournaments','getPublicRegistration','submitPublicRegistration','getRegistrationStatus','sendPairInvite','respondPairInvite','getRegistrationBoard','reviewOpenRegistration']) {
  assert(cl.includes('export function ' + fn) || cl.includes('export async function ' + fn), 'client có ' + fn);
}
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt** (thêm cuối file, dùng `request` sẵn có)

```js
// --- Đăng ký mở giải cộng đồng ---
export async function listCommunityTournaments() {
  const data = await request('/public/community', { cache: 'no-store' });
  return data.tournaments || [];
}
export function getPublicRegistration(slug, divisionId) {
  return request('/public/registration', { query: { slug, divisionId }, cache: 'no-store' });
}
export function submitPublicRegistration(body) {
  return request('/public/registration', { method: 'POST', body });
}
export function getRegistrationStatus(query) {
  return request('/public/registration/status', { query, cache: 'no-store' });
}
export function sendPairInvite(body) {
  return request('/public/pair-invite', { method: 'POST', body });
}
export function respondPairInvite(body) {
  return request('/public/pair-invite', { method: 'PATCH', body });
}
export function getRegistrationBoard(divisionId) {
  return request('/registrations/board', { query: { divisionId }, cache: 'no-store' });
}
export function reviewOpenRegistration(body) {
  return request('/registrations', { method: 'PATCH', body });
}
```

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): client helpers"`

---

## Phase F — UI công khai (React client)

Tạo CSS dùng chung + 3 trang. Bám markup/màu 4 mockup đã duyệt (dark PickHub). Route công khai đặt dưới `app/dk/` (đăng ký mở).

### Task F0: CSS công khai

**Files:** Create `app/dk/openreg.css`

- [x] **Step 1: Viết CSS** (token dark PickHub — trích từ mockup đã duyệt)

```css
.or-wrap{--bg:#0d0d12;--panel:#15151c;--card:#1b1b24;--line:#2b2b36;--ink:#ecebf2;--muted:#8b8b9a;
  --indigo:#7b5be6;--indigo-soft:rgba(123,91,230,.16);--surface:#14141a;--green:#59c98b;--amber:#f0a020;--coral:#ff8b83;
  background:var(--bg);color:var(--ink);min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.or-topnav{display:flex;align-items:center;gap:12px;background:#0a0a0e;border-bottom:1px solid var(--line);padding:0 24px;height:58px}
.or-page{max-width:1200px;margin:0 auto;padding:20px 20px 48px}
.or-tcard{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-bottom:16px}
.or-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px;align-items:start}
@media (max-width:880px){.or-grid{grid-template-columns:1fr}}
.or-lbl{font-size:.72rem;color:var(--muted);font-weight:700;margin:0 0 5px;display:block}
.or-inp,.or-sel{width:100%;background:var(--surface);border:1px solid var(--line);color:var(--ink);border-radius:9px;padding:10px 12px;font:inherit;font-size:.9rem;outline:none}
.or-inp:focus,.or-sel:focus{border-color:var(--indigo)}
.or-cta{border:0;background:var(--indigo);color:#fff;font:inherit;font-weight:700;padding:12px 20px;border-radius:10px;cursor:pointer}
.or-cta:disabled{opacity:.5;cursor:not-allowed}
.or-btn-wl{background:transparent;border:1px solid #4b3f7a;color:#b9a9ff}
.or-slot{border:1px solid var(--line);border-radius:14px;padding:13px;margin-bottom:11px;background:var(--card)}
.or-slot.partner{border-style:dashed;border-color:var(--indigo);background:var(--indigo-soft)}
.or-notice{border-radius:10px;padding:10px 12px;font-size:.82rem;margin:10px 0}
.or-notice.err{background:rgba(255,139,131,.12);border:1px solid #7a3a36;color:#ffb0aa}
.or-notice.ok{background:rgba(89,201,139,.12);border:1px solid #2f6b4c;color:#8fe0b1}
```

- [x] **Step 2: Commit** `git add app/dk/openreg.css && git commit -m "feat(open-reg): css công khai"`

### Task F1: Trang danh sách giải cộng đồng

**Files:**
- Create: `app/dk/page.js`
- Test: `tests/open-registration/ui.contract.test.js`

- [x] **Step 1: Khung ui contract test + assert (đỏ)**

Tạo `tests/open-registration/ui.contract.test.js`:
```js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

assert(exists('app/dk/page.js'), 'trang danh sách tồn tại');
const dir = read('app/dk/page.js');
assert(dir.includes('listCommunityTournaments'), 'gọi listCommunityTournaments');
assert(dir.includes('Đăng ký') && dir.includes('cộng đồng'), 'nhãn danh sách');
console.log('open-registration ui contract: OK');
```

- [x] **Step 2: Chạy — đỏ.** Run: `node tests/open-registration/ui.contract.test.js`

- [x] **Step 3: Cài đặt**

```jsx
'use client';
import { useEffect, useState } from 'react';
import { listCommunityTournaments } from '@/lib/tournamentV2Client';
import './openreg.css';

export default function CommunityListPage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listCommunityTournaments()
      .then((rows) => { if (alive) setTournaments(rows); })
      .catch(() => { if (alive) setTournaments([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return (
    <div className="or-wrap">
      <div className="or-topnav"><b>PickHub</b> · Giải cộng đồng</div>
      <div className="or-page">
        <h1>Giải cộng đồng đang mở đăng ký</h1>
        {loading ? <p>Đang tải…</p> : tournaments.length === 0 ? <p>Chưa có giải nào mở đăng ký.</p> : tournaments.map((t) => (
          <div key={t.id} className="or-tcard">
            <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t.name}</div>
              <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>📍 {t.location || '—'} · 🗓 {t.event_date || ''}</div>
            </div>
            <div style={{ padding: '4px 12px 12px' }}>
              {t.divisions.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 6px', borderTop: '1px solid var(--line)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{d.entrant_type === 'pair' ? 'Đôi' : 'Đơn'}</div>
                  </div>
                  <a className="or-cta" href={`/dk/${t.public_slug}/${d.id}`}>Đăng ký</a>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): trang danh sách giải cộng đồng"`

### Task F2: Trang đăng ký chi tiết một nội dung

**Files:**
- Create: `app/dk/[slug]/[division]/page.js`
- Test: `tests/open-registration/ui.contract.test.js`

- [x] **Step 1: Test (đỏ)** — thêm assert:
```js
assert(exists('app/dk/[slug]/[division]/page.js'), 'trang đăng ký chi tiết tồn tại');
const det = read('app/dk/[slug]/[division]/page.js');
assert(det.includes('getPublicRegistration') && det.includes('submitPublicRegistration'), 'fetch chi tiết + nộp');
assert(det.includes('VĐV 1') || det.includes('Vận động viên 1'), 'khối VĐV 1');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt** (form đơn/đôi, trường theo `fields`)

```jsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getPublicRegistration, submitPublicRegistration } from '@/lib/tournamentV2Client';
import '../../openreg.css';

const emptyMember = () => ({ full_name: '', phone: '', phr: '', gender: '', dob: '' });

export default function RegisterDivisionPage() {
  const params = useParams();
  const slug = params.slug;
  const divisionId = params.division;
  const [info, setInfo] = useState(null);
  const [m1, setM1] = useState(emptyMember());
  const [m2, setM2] = useState(emptyMember());
  const [notice, setNotice] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getPublicRegistration(slug, divisionId).then((d) => { if (alive) setInfo(d); }).catch((e) => { if (alive) setNotice(e.message); });
    return () => { alive = false; };
  }, [slug, divisionId]);

  if (!info) return <div className="or-wrap"><div className="or-page">{notice || 'Đang tải…'}</div></div>;
  const isPair = info.division.entrant_type === 'pair';
  const fields = info.fields;

  const memberPayload = (m) => {
    const out = { full_name: m.full_name, phone: m.phone };
    if (fields.phr) out.phr = m.phr;
    if (fields.gender) out.gender = m.gender;
    if (fields.dob) out.dob = m.dob;
    return out;
  };

  async function submit() {
    setNotice(''); setBusy(true);
    try {
      const members = [memberPayload(m1)];
      if (isPair && (m2.full_name || m2.phone)) members.push(memberPayload(m2));
      const res = await submitPublicRegistration({ slug, divisionId, members, self_declared_club: m1.club });
      setDone(res.track_token);
    } catch (e) { setNotice(e.message || 'Không gửi được đăng ký'); }
    finally { setBusy(false); }
  }

  if (done) return (
    <div className="or-wrap"><div className="or-page">
      <div className="or-notice ok">✓ Đã nhận đăng ký. Theo dõi trạng thái tại: <a href={`/dk/theo-doi?token=${done}`}>link này</a>.</div>
    </div></div>
  );

  const memberBlock = (m, setM, label, partner) => (
    <div className={`or-slot ${partner ? 'partner' : ''}`}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      {partner ? <div style={{ fontSize: '.78rem', color: '#c9bcff', marginBottom: 8 }}>Để trống = đăng ký một mình, vào hồ chờ ghép.</div> : null}
      <div style={{ marginBottom: 10 }}><label className="or-lbl">Họ tên{partner ? '' : ' *'}</label><input className="or-inp" value={m.full_name} onChange={(e) => setM({ ...m, full_name: e.target.value })} /></div>
      <div style={{ marginBottom: 10 }}><label className="or-lbl">Số điện thoại{partner ? '' : ' *'}</label><input className="or-inp" value={m.phone} onChange={(e) => setM({ ...m, phone: e.target.value })} /></div>
      {fields.phr ? <div style={{ marginBottom: 10 }}><label className="or-lbl">Điểm trình (PHR) — tự khai</label><input className="or-inp" value={m.phr} onChange={(e) => setM({ ...m, phr: e.target.value })} /></div> : null}
      {fields.gender ? <div style={{ marginBottom: 10 }}><label className="or-lbl">Giới tính{partner ? '' : ' *'}</label><select className="or-sel" value={m.gender} onChange={(e) => setM({ ...m, gender: e.target.value })}><option value="">-- Chọn --</option><option value="male">Nam</option><option value="female">Nữ</option></select></div> : null}
      {fields.dob ? <div><label className="or-lbl">Ngày sinh{partner ? '' : ' *'}</label><input className="or-inp" type="date" value={m.dob} onChange={(e) => setM({ ...m, dob: e.target.value })} /></div> : null}
    </div>
  );

  return (
    <div className="or-wrap">
      <div className="or-topnav"><b>PickHub</b> · Đăng ký</div>
      <div className="or-page">
        <div className="or-grid">
          <div className="or-tcard" style={{ padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>{info.tournament.name} — {info.division.name}</h2>
            <div style={{ color: 'var(--muted)', fontSize: '.88rem', lineHeight: 1.8 }}>
              <div>📍 {info.tournament.location || '—'}</div>
              <div>🗓 {info.tournament.event_date || ''}</div>
              <div>🎯 {isPair ? 'Đôi' : 'Đơn'} · Đã đăng ký {info.registered}{info.capacity != null ? `/${info.capacity}` : ''}</div>
            </div>
            {!info.open.ok ? <div className="or-notice err">Đăng ký đã đóng.</div> : null}
          </div>
          <div className="or-tcard" style={{ padding: 18 }}>
            {memberBlock(m1, setM1, isPair ? 'Vận động viên 1 (bạn)' : 'Vận động viên', false)}
            {isPair ? memberBlock(m2, setM2, 'Vận động viên 2 — partner', true) : null}
            {notice ? <div className="or-notice err">{notice}</div> : null}
            <button className="or-cta" style={{ width: '100%' }} disabled={busy || !info.open.ok} onClick={submit}>{busy ? 'Đang gửi…' : 'Gửi đăng ký'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): trang đăng ký chi tiết (đơn/đôi theo cấu hình)"`

### Task F3: Trang theo dõi trạng thái

**Files:**
- Create: `app/dk/theo-doi/page.js`
- Test: `tests/open-registration/ui.contract.test.js`

- [x] **Step 1: Test (đỏ)** — thêm assert:
```js
assert(exists('app/dk/theo-doi/page.js'), 'trang theo dõi tồn tại');
const tr = read('app/dk/theo-doi/page.js');
assert(tr.includes('getRegistrationStatus'), 'fetch trạng thái');
assert(tr.includes('waitlist') || tr.includes('Waitlist'), 'hiển thị waitlist');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt**

```jsx
'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getRegistrationStatus } from '@/lib/tournamentV2Client';
import '../openreg.css';

const LABEL = { awaiting_partner: 'Đang chờ ghép cặp', submitted: 'Đang chờ BTC duyệt', approved: 'Đã vào giải', rejected: 'Bị từ chối', withdrawn: 'Đã rút', merged: 'Đã ghép cặp' };

export default function TrackPage() {
  const sp = useSearchParams();
  const token = sp.get('token');
  const [phone, setPhone] = useState('');
  const [slug, setSlug] = useState(sp.get('slug') || '');
  const [regs, setRegs] = useState(null);

  useEffect(() => { if (token) getRegistrationStatus({ token }).then((d) => setRegs(d.registrations)).catch(() => setRegs([])); }, [token]);

  async function lookup() {
    try { const d = await getRegistrationStatus({ slug, phone }); setRegs(d.registrations); }
    catch { setRegs([]); }
  }

  return (
    <div className="or-wrap">
      <div className="or-topnav"><b>PickHub</b> · Theo dõi đăng ký</div>
      <div className="or-page">
        <h1>Đăng ký của bạn</h1>
        {!token ? (
          <div className="or-tcard" style={{ padding: 16, maxWidth: 480 }}>
            <label className="or-lbl">Slug giải</label>
            <input className="or-inp" value={slug} onChange={(e) => setSlug(e.target.value)} style={{ marginBottom: 10 }} />
            <label className="or-lbl">Số điện thoại</label>
            <input className="or-inp" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ marginBottom: 12 }} />
            <button className="or-cta" onClick={lookup}>Tra cứu</button>
          </div>
        ) : null}
        {regs == null ? <p>Đang tải…</p> : regs.length === 0 ? <p>Không tìm thấy đăng ký.</p> : regs.map((r) => (
          <div key={r.id} className="or-tcard" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700 }}>{LABEL[r.status] || r.status}
              {r.status === 'submitted' && r.waitlist_position ? ` — Waitlist #${r.waitlist_position}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [x] **Step 4: Chạy — xanh.** — [ ] **Step 5: Commit** `git commit -am "feat(open-reg): trang theo dõi trạng thái"`

---

## Phase G — UI admin (bảng duyệt trong console)

### Task G1: Tab "Đăng ký & duyệt" trong console giải

**Files:**
- Create: `app/giai-dau/v2/console/tabs/OpenRegTab.js`
- Modify: `app/giai-dau/v2/console/TournamentConsoleV2.js` (thêm tab khi giải là community + có nội dung mở)
- Test: `tests/open-registration/ui.contract.test.js`

- [x] **Step 1: Test (đỏ)** — thêm assert:
```js
assert(exists('app/giai-dau/v2/console/tabs/OpenRegTab.js'), 'tab bảng duyệt tồn tại');
const tab = read('app/giai-dau/v2/console/tabs/OpenRegTab.js');
assert(tab.includes('getRegistrationBoard') && tab.includes('reviewOpenRegistration'), 'fetch board + hành động');
assert(tab.includes('Đã vào giải') && tab.includes('Chờ xử lý'), 'khối đã vào giải + chờ xử lý');
assert(tab.includes('Nhận vào giải'), 'nút nhận vào giải');
```

- [x] **Step 2: Chạy — đỏ.**

- [x] **Step 3: Cài đặt** `OpenRegTab.js`

```jsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { getRegistrationBoard, reviewOpenRegistration } from '@/lib/tournamentV2Client';

const nameOf = (r) => (r.members || []).map((m) => m.full_name).join(' / ') || '(chưa có tên)';

export default function OpenRegTab({ divisionId }) {
  const [board, setBoard] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { if (divisionId) getRegistrationBoard(divisionId).then(setBoard).catch(() => setBoard(null)); }, [divisionId]);
  useEffect(() => { load(); }, [load]);

  async function act(id, action, extra) {
    setBusy(true);
    try { await reviewOpenRegistration({ id, action, ...(extra || {}) }); load(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  }
  if (!board) return <div style={{ padding: 16 }}>Chọn nội dung để xem đăng ký…</div>;

  const Row = ({ r, actions }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 6px', borderTop: '1px solid var(--w3-line, #2b2b36)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{nameOf(r)}{r.isWaitlist ? ` · waitlist #${r.position}` : ''}</div>
        <div style={{ fontSize: '.75rem', color: 'var(--w3-muted,#8b8b9a)' }}>{r.contact_phone_norm} · {r.self_declared_club || '—'}</div>
      </div>
      {actions}
    </div>
  );

  return (
    <div style={{ padding: 12 }}>
      <h3>Đã vào giải · {board.approved.length}{board.division.registration_capacity != null ? `/${board.division.registration_capacity}` : ''}</h3>
      {board.approved.map((r) => <Row key={r.id} r={r} actions={<button disabled={busy} onClick={() => act(r.id, 'remove')}>Đưa ra khỏi giải</button>} />)}

      <h3 style={{ marginTop: 18 }}>Chờ xử lý · {board.pending.length}{board.free_slots != null ? ` · còn ${board.free_slots} suất` : ''}</h3>
      {board.pending.map((r) => (
        <Row key={r.id} r={r} actions={<>
          <button disabled={busy || r.isWaitlist} onClick={() => act(r.id, 'admit')}>Nhận vào giải</button>
          <button disabled={busy} onClick={() => act(r.id, 'reject_open')}>Từ chối</button>
        </>} />
      ))}

      <h3 style={{ marginTop: 18 }}>Hồ chờ ghép · {board.awaiting_partner.length}</h3>
      {board.awaiting_partner.map((r) => <Row key={r.id} r={r} actions={<span style={{ fontSize: '.76rem', color: 'var(--w3-muted,#8b8b9a)' }}>đăng ký một mình</span>} />)}

      <h3 style={{ marginTop: 18 }}>Từ chối · {board.rejected.length}</h3>
      {board.rejected.map((r) => <Row key={r.id} r={r} actions={<button disabled={busy} onClick={() => act(r.id, 'restore')}>Khôi phục về chờ</button>} />)}
    </div>
  );
}
```

- [x] **Step 4: Nối tab vào `TournamentConsoleV2.js`**

Import `OpenRegTab` và thêm mục tab `{ key: 'openreg', label: 'Đăng ký & duyệt' }` (chỉ hiện khi `tournament.organizer_mode === 'community'`), render `<OpenRegTab divisionId={selectedDivisionId} />` khi tab active. (Bám đúng cấu trúc mảng tab + switch render hiện có trong file.)

- [x] **Step 5: Chạy ui contract — xanh.** Run: `node tests/open-registration/ui.contract.test.js`

- [x] **Step 6: Commit** `git commit -am "feat(open-reg): tab bảng duyệt BTC trong console"`

---

## Phase H — Regression, build, evidence

### Task H1: Chạy toàn bộ test open-reg + build

- [x] **Step 1:** Run: `npm run test:open-registration` → Expected: 3 dòng "OK".
- [x] **Step 2:** Run: `npm run test:phase3-interclub` → Expected: PASS (không vỡ luồng cũ).
- [x] **Step 3:** Run: `npm run build` → Expected: build thành công, có route `/dk`, `/dk/[slug]/[division]`, `/dk/theo-doi`, và các `/api/tournament-v2/public/*`.
- [x] **Step 4: Thêm vào regression** — Modify `package.json`: nối `&& npm run test:open-registration` vào cuối `test:regression`.
- [x] **Step 5: Commit** `git commit -am "test(open-reg): nối vào regression + xác minh build"`

### Task H2: Kiểm thử thực tế (Supabase hiện hữu) + evidence

- [x] **Step 1:** Tạo giải test scope `group_id` riêng (tên có tiền tố "TEST-open-reg"), một nội dung đôi mixed có cap, bật `registration_open`.
- [x] **Step 2:** Gọi API công khai nộp 1 đăng ký đôi hoàn chỉnh + 1 solo; kiểm tra chống trùng SĐT (nộp lại cùng SĐT → 409).
- [x] **Step 3:** BTC admit tới đầy cap → dòng kế thành waitlist; remove 1 → waitlist kéo được.
- [x] **Step 4:** Ghi evidence vào `evidence/open-registration-<ngày>.md` (log request/response + ảnh màn nếu có). Dọn dữ liệu test bằng thao tác an toàn (update status/withdraw; KHÔNG DROP/TRUNCATE) sau khi xác nhận không đụng dữ liệu thật.
- [x] **Step 5: Commit** `git add evidence/ && git commit -m "docs(open-reg): evidence kiểm thử tích hợp"`

---

## Ghi chú thực thi

- Engine mới (mục 2 lộ trình) đang do IDE khác làm — KHÔNG đụng `lib/tournament/engines/*` ở plan này.
- Nội dung Đội/MLP cộng đồng (admin CLB đăng ký) là nhánh authenticated riêng — KHÔNG nằm trong plan này; trang `/dk/[slug]/[division]` chỉ phục vụ nội dung đơn/đôi (entrant_type individual/pair). Với division team, hiển thị thông báo "đăng ký theo CLB" (thêm guard nhỏ ở Task F2 nếu gặp).

- **Rate-limit endpoint công khai** (spec mục 10): Task C2 đã có honeypot. Trước khi lên production, bọc `POST /public/registration` và `POST /public/pair-invite` bằng bộ giới hạn tần suất sẵn có của dự án — tham chiếu `tests/phase1/rate-limit.test.js` để biết tiện ích/đường dẫn limiter, áp theo IP + SĐT chuẩn hoá. Đây là một task riêng (C5) khi xác định đúng API limiter, không chặn các task khác.

- **UI tự rủ ghép cặp** (spec mục 8, `reg-status` mockup): API đã đủ (Task C4 `sendPairInvite`/`respondPairInvite`; C3 trả `needs_partner`). Phần giao diện trên trang theo dõi (nút "Rủ ghép" chọn VĐV lẻ khác + Đồng ý/Từ chối lời mời) là **task nối tiếp F4** sau khi F3 chạy — tách ra để F1–F3 giao được sớm. BTC ghép/duyệt cặp (D3) đã đủ để vận hành ngay cả khi F4 chưa làm.
