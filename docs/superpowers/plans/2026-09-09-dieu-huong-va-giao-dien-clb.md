# Điều hướng và giao diện không gian CLB — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gỡ `/admin?section=roster` và `/admin?section=fund`, đưa thao tác quản trị về đúng trang nội dung và phân quyền bằng vai trò; đồng thời dựng shell sidebar desktop theo bộ thiết kế đã duyệt.

**Architecture:** Mỗi trang là **một URL, hai diện mạo** — nút thao tác hiện/ẩn theo `permissions` mà `/api/groups/session` trả về, không tách URL riêng cho admin. Điều hướng và breadcrumb đều suy ra từ một nguồn duy nhất là `lib/globalNavigation.js`. Shell (`AppShell` + `SideRail` + `AppTopBar`) bọc mọi trang qua layout, page không tự dựng header.

**Tech Stack:** Next.js 14 App Router (JavaScript thuần, không TypeScript), Supabase, CSS thuần theo token `--ph-*`, test bằng `node:assert` chạy trực tiếp qua `node`.

**Spec:** [`docs/superpowers/specs/2026-09-09-dieu-huong-va-giao-dien-clb-design.md`](../specs/2026-09-09-dieu-huong-va-giao-dien-clb-design.md)
**Mockup đã duyệt:** `_workspace/mockup-ui-2026-09-09.html` — mở bằng trình duyệt để đối chiếu bố cục và CSS.

---

## Quy ước bắt buộc

Đọc `.claude/skills/pickhub-engineering` trước khi bắt đầu. Vài điểm hay sai:

- **JavaScript thuần.** Không `.ts`, không `.tsx`, không type annotation.
- **Không truy vấn Supabase từ component.** Mọi thứ đi qua route handler trong `app/api/`.
- **Tiếng Việt có dấu** cho mọi chuỗi hiển thị.
- **Không hardcode màu hex** trong CSS mới — `tests/ph-design-system.test.js` sẽ đỏ. Mọi màu qua `var(--ph-*)`.
- **Test chạy bằng `node`**, không có Jest/Vitest. Ví dụ: `node tests/global-navigation.test.js`.
- Commit sau mỗi task. Message tiếng Việt không dấu (theo lịch sử repo).

## Bản đồ file

### Tạo mới

| File | Trách nhiệm |
|---|---|
| `app/thanh-vien/page.js`, `members.css` | Danh bạ thành viên (chuyển từ `app/quy/members/`) |
| `app/thanh-vien/[membershipId]/page.js` | Hồ sơ một VĐV |
| `app/thanh-vien/layout.js` | Bọc `AppShell` |
| `app/bxh/page.js`, `page.css` | BXH (chuyển từ `app/quy/bxh/`) |
| `app/bxh/layout.js` | Bọc `AppShell` |
| `components/pickhub/AppTopBar.js`, `.css` | Breadcrumb + chip CLB |
| `components/pickhub/MemberProfileView.js`, `.css` | Hồ sơ VĐV, dùng chung 2 route |
| `components/pickhub/fund/FundTransactionList.js`, `.css` | Danh sách giao dịch dạng dòng-thẻ |
| `components/pickhub/fund/FundEntryForm.js` | Modal ghi thu/chi |
| `components/pickhub/fund/FundTransactionEditor.js` | Modal sửa giao dịch |
| `components/pickhub/ClubSettingsNav.js`, `.css` | Sub-menu neo của trang cấu hình |
| `app/api/club/fund-qr/route.js` | Đọc QR cho thành viên đã đăng nhập |
| `database/migrations/044_group_fund_qr.sql` | Cột `groups.fund_qr_url` |
| `tests/club-space-navigation.test.js` | Hợp đồng điều hướng + breadcrumb mới |
| `tests/club-space-roles.test.js` | Hợp đồng phân quyền theo vai trò trên từng trang |

### Sửa

| File | Việc |
|---|---|
| `app/styles/tokens.css` | Thêm 2 token radius |
| `lib/globalNavigation.js` | href mới + bảng tra breadcrumb |
| `next.config.js` | Sửa/thêm redirect |
| `components/pickhub/SideRail.js`, `AppShell.js`, `AppShell.css` | Dựng lại shell |
| `components/pickhub/AssignTransactionDialog.js` | Nhận thẳng transaction |
| `app/quy/page.js`, `page.css` | Lớp thao tác admin + thẻ Quỹ phạt + QR |
| `app/admin/page.js`, `ClubSettings.js`, `club-settings.css` | Bỏ tab, chia 7 mục |
| `app/thong-tin/page.js` | Dùng `MemberProfileView` |
| `app/api/club/settings/route.js` | Nhận/trả `fundQrUrl` |
| 7 file test ở mục 13 của spec | Cập nhật đường dẫn |

### Xoá

| File | Lý do |
|---|---|
| `app/quy/members/`, `app/quy/bxh/` | Đã chuyển đi |
| `app/quy/admin/` | Chức năng đã về `/quy` và `/thanh-vien` |
| `app/api/club/settings/regenerate-code/route.js` | Mã CLB cố định |

---

# PHASE A — Nền tảng điều hướng

Sau phase này mọi URL đã đúng chỗ và toàn bộ test cũ xanh trở lại. Chưa đổi giao diện.

---

### Task 1: Token radius mới

**Files:**
- Modify: `app/styles/tokens.css`
- Test: `tests/ph-design-system.test.js` (chỉ chạy, không sửa)

- [ ] **Step 1: Thêm token**

Trong `app/styles/tokens.css`, tìm khối `/* Hinh khoi */` và sửa thành:

```css
  /* Hinh khoi */
  --ph-radius-xs: 8px;
  --ph-radius-sm: 12px;
  --ph-radius-card: 16px;
  --ph-radius-md: 20px;
  --ph-radius-lg: 28px;
  --ph-shadow-soft: 0 8px 24px rgba(40, 36, 61, .06);
  --ph-shadow: 0 16px 40px rgba(40, 36, 61, .08);
  --ph-focus-ring: 0 0 0 3px rgba(111, 72, 201, .35);
```

Chỉ **thêm** `--ph-radius-xs` và `--ph-radius-card`. Không đổi giá trị nào đang có — `--ph-radius-sm`, `--ph-radius-md`, `--ph-radius-lg` giữ nguyên vì nhiều CSS hiện hữu đang dùng.

- [ ] **Step 2: Chạy test hệ thiết kế**

Run: `npm run test:ph-ui`
Expected: `ph-design-system: PASS`

- [ ] **Step 3: Commit**

```bash
git add app/styles/tokens.css
git commit -m "feat(tokens): them radius xs va card theo bo thiet ke moi"
```

---

### Task 2: `lib/globalNavigation.js` — href mới và bảng tra breadcrumb

**Files:**
- Modify: `lib/globalNavigation.js`
- Modify: `tests/global-navigation.test.js`
- Modify: `tests/phase1/navigation-role.test.js`
- Create: `tests/club-space-navigation.test.js`

- [ ] **Step 1: Viết test mới cho breadcrumb**

Tạo `tests/club-space-navigation.test.js`:

```js
const assert = require('assert');
const navigation = require('../lib/globalNavigation');

const { getBreadcrumbLabel, getGlobalNavLinksForRole, isGlobalNavActive } = navigation;

assert.strictEqual(typeof getBreadcrumbLabel, 'function', 'Navigation phai xuat ham tra nhan breadcrumb.');

assert.strictEqual(getBreadcrumbLabel('/quy'), 'Tổng quan quỹ');
assert.strictEqual(getBreadcrumbLabel('/bxh'), 'BXH đóng góp');
assert.strictEqual(getBreadcrumbLabel('/thanh-vien'), 'Thành viên CLB');
assert.strictEqual(getBreadcrumbLabel('/thanh-vien/42'), 'Hồ sơ vận động viên');
assert.strictEqual(getBreadcrumbLabel('/giai-dau'), 'Giải đấu');
assert.strictEqual(getBreadcrumbLabel('/giai-dau/v2/console'), 'Giải đấu');
assert.strictEqual(getBreadcrumbLabel('/admin'), 'Cấu hình CLB');
assert.strictEqual(getBreadcrumbLabel('/thong-tin'), 'Hồ sơ cá nhân');
assert.strictEqual(getBreadcrumbLabel('/khong-ton-tai'), '', 'Duong dan la phai tra chuoi rong, khong duoc nem loi.');
assert.strictEqual(getBreadcrumbLabel(undefined), '', 'Pathname undefined phai tra chuoi rong.');

// Duong dan moi phai active dung
assert.strictEqual(isGlobalNavActive('/thanh-vien', '/thanh-vien'), true);
assert.strictEqual(isGlobalNavActive('/thanh-vien/42', '/thanh-vien'), true, 'Trang ho so phai lam sang muc Thanh vien.');
assert.strictEqual(isGlobalNavActive('/bxh', '/bxh'), true);
assert.strictEqual(isGlobalNavActive('/thanh-vien', '/quy'), false, 'Quy khong duoc active tren trang Thanh vien.');
assert.strictEqual(isGlobalNavActive('/bxh', '/quy'), false, 'Quy khong duoc active tren trang BXH.');

// Khong con duong dan cu
for (const links of [getGlobalNavLinksForRole('member'), getGlobalNavLinksForRole('admin')]) {
    for (const link of links) {
        assert(!link.href.startsWith('/quy/'), `Menu khong duoc con tro toi ${link.href}`);
    }
}

console.log('club space navigation contract ok');
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `node tests/club-space-navigation.test.js`
Expected: FAIL — `Navigation phai xuat ham tra nhan breadcrumb.`

- [ ] **Step 3: Viết lại `lib/globalNavigation.js`**

```js
const PRIMARY_NAV_LINKS = [
    { href: '/quy', label: 'Quỹ', icon: '💰' },
    { href: '/thanh-vien', label: 'Thành viên', icon: '👥' },
    { href: '/bxh', label: 'BXH', icon: '🥇', featured: true },
    { href: '/giai-dau', label: 'Giải', icon: '🏆' },
];

const MEMBER_INFO_LINK = { href: '/thong-tin', label: 'Thông tin', icon: '👤' };
const ADMIN_SETTINGS_LINK = { href: '/admin', label: 'Cấu hình', icon: '⚙️' };
const GLOBAL_NAV_LINKS = [...PRIMARY_NAV_LINKS, ADMIN_SETTINGS_LINK];

// Nhan breadcrumb suy ra tu pathname, khong truyen prop tu tung page.
// Thu tu quan trong: muc cu the hon phai dung truoc muc tong quat hon.
const BREADCRUMB_RULES = [
    { prefix: '/thanh-vien/', label: 'Hồ sơ vận động viên' },
    { prefix: '/thanh-vien', label: 'Thành viên CLB' },
    { prefix: '/bxh', label: 'BXH đóng góp' },
    { prefix: '/giai-dau', label: 'Giải đấu' },
    { prefix: '/thong-tin', label: 'Hồ sơ cá nhân' },
    { prefix: '/admin', label: 'Cấu hình CLB' },
    { prefix: '/quy', label: 'Tổng quan quỹ' },
];

function getBreadcrumbLabel(pathname) {
    if (typeof pathname !== 'string' || !pathname) return '';
    const rule = BREADCRUMB_RULES.find((item) => pathname === item.prefix || pathname.startsWith(item.prefix));
    return rule ? rule.label : '';
}

function isGlobalNavActive(pathname, href) {
    if (pathname === href) return true;
    if (href === '/quy') return false;
    return pathname.startsWith(`${href}/`);
}

function getGlobalNavLinksForRole(role) {
    if (role === 'admin') return GLOBAL_NAV_LINKS;
    return [...PRIMARY_NAV_LINKS, MEMBER_INFO_LINK];
}

module.exports = {
    GLOBAL_NAV_LINKS,
    getGlobalNavLinksForRole,
    getBreadcrumbLabel,
    isGlobalNavActive,
};
```

Lưu ý `'/thanh-vien/'` (có gạch chéo cuối) phải đứng **trước** `'/thanh-vien'`, nếu không `/thanh-vien/42` sẽ khớp nhầm nhãn danh sách.

- [ ] **Step 4: Chạy test mới**

Run: `node tests/club-space-navigation.test.js`
Expected: `club space navigation contract ok`

- [ ] **Step 5: Cập nhật `tests/global-navigation.test.js`**

Sửa mảng kỳ vọng (dòng 6–16) thành:

```js
assert.deepStrictEqual(
    GLOBAL_NAV_LINKS.map(({ href, label, icon }) => ({ href, label, icon })),
    [
        { href: '/quy', label: 'Quỹ', icon: '💰' },
        { href: '/thanh-vien', label: 'Thành viên', icon: '👥' },
        { href: '/bxh', label: 'BXH', icon: '🥇' },
        { href: '/giai-dau', label: 'Giải', icon: '🏆' },
        { href: '/admin', label: 'Cấu hình', icon: '⚙️' },
    ],
    'Menu chính phải có đúng năm mục theo thứ tự đã duyệt.'
);
```

Và ba assert `isGlobalNavActive` (dòng 18–20) thành:

```js
assert.strictEqual(isGlobalNavActive('/bxh', '/bxh'), true, 'BXH phải active trên trang chính.');
assert.strictEqual(isGlobalNavActive('/bxh/chi-tiet', '/bxh'), true, 'BXH phải active trên trang con.');
assert.strictEqual(isGlobalNavActive('/thanh-vien', '/quy'), false, 'Quỹ không được active trên trang Thành viên.');
```

- [ ] **Step 6: Cập nhật `tests/phase1/navigation-role.test.js`**

Sửa mảng href của member (dòng 15–19) thành:

```js
assert.deepStrictEqual(
    memberLinks.map((link) => link.href),
    ['/quy', '/thanh-vien', '/bxh', '/giai-dau', '/thong-tin'],
    'Members must get the five-tab navigation with Thông tin instead of admin settings.'
);
```

- [ ] **Step 7: Chạy cả ba test**

Run: `node tests/global-navigation.test.js && node tests/phase1/navigation-role.test.js && node tests/club-space-navigation.test.js`
Expected: ba dòng ok liên tiếp

- [ ] **Step 8: Commit**

```bash
git add lib/globalNavigation.js tests/global-navigation.test.js tests/phase1/navigation-role.test.js tests/club-space-navigation.test.js
git commit -m "feat(nav): doi href sang /thanh-vien va /bxh, them bang tra breadcrumb"
```

---

### Task 3: Chuyển `/quy/members` sang `/thanh-vien`

**Files:**
- Create: `app/thanh-vien/page.js`, `app/thanh-vien/members.css`, `app/thanh-vien/layout.js`
- Delete: `app/quy/members/`
- Modify: `next.config.js`
- Modify: `tests/multitenant-phase2.test.js`, `tests/mobile-bottom-tabs.test.js`, `tests/pickhub-ui-phase2.test.js`

- [ ] **Step 1: Chuyển file bằng `git mv` để giữ lịch sử**

```bash
mkdir -p app/thanh-vien
git mv app/quy/members/page.js app/thanh-vien/page.js
git mv app/quy/members/members.css app/thanh-vien/members.css
rmdir app/quy/members
```

- [ ] **Step 2: Thêm layout bọc AppShell**

Tạo `app/thanh-vien/layout.js`:

```js
import AppShell from '@/components/pickhub/AppShell';

export default function ThanhVienLayout({ children }) {
    return <AppShell>{children}</AppShell>;
}
```

Trang này trước đây nằm dưới `app/quy/` nên được `app/quy/layout.js` bọc `AppShell`. Chuyển ra ngoài thì mất, phải khai lại.

- [ ] **Step 3: Sửa link Cấu hình trong trang**

Trong `app/thanh-vien/page.js`, tìm dòng có `href: '/admin?section=settings'` và đổi thành `href: '/admin'`.

- [ ] **Step 4: Sửa redirect trong `next.config.js`**

Thay khối `// Members` bằng:

```js
            // Thanh vien: /members va /quy/members deu tro thang toi /thanh-vien.
            // Khong de /members -> /quy/members -> /thanh-vien (hai chang).
            {
                source: '/members',
                destination: '/thanh-vien',
                permanent: true,
            },
            {
                source: '/quy/members',
                destination: '/thanh-vien',
                permanent: true,
            },
```

- [ ] **Step 5: Cập nhật ba test tham chiếu đường dẫn cũ**

`tests/multitenant-phase2.test.js` — sửa cả ba chỗ:

```js
const membersPage = read('app/thanh-vien/page.js');
assert(
    !membersPage.includes('@/lib/supabaseClient') && !membersPage.includes('.from('),
    'app/thanh-vien/page.js should not query Supabase directly.'
);
assert(
    membersPage.includes('/api/identity/roster'),
    'app/thanh-vien/page.js should read athlete/membership roster through the Phase 2 server API.'
);
```

`tests/mobile-bottom-tabs.test.js` — sửa dòng đọc file:

```js
const quyMembersPageJs = read('app/thanh-vien/page.js');
```

và sửa hai chuỗi nhãn kỳ vọng (chúng dùng label chứ không dùng href nên **không đổi**) — kiểm lại dòng có `'Quỹ|Thành viên|BXH|Giải|Thông tin'`, giữ nguyên.

`tests/pickhub-ui-phase2.test.js` — sửa hai mảng nav:

```js
assert.deepEqual(
  navigation.getGlobalNavLinksForRole('member').map(({ href, label }) => ({ href, label })),
  [
    { href: '/quy', label: 'Quỹ' },
    { href: '/thanh-vien', label: 'Thành viên' },
    { href: '/bxh', label: 'BXH' },
    { href: '/giai-dau', label: 'Giải' },
    { href: '/thong-tin', label: 'Thông tin' },
  ],
  'member navigation keeps five tabs with BXH centered and Thông tin last'
);
assert.deepEqual(
  navigation.getGlobalNavLinksForRole('admin').map(({ href, label }) => ({ href, label })),
  [
    { href: '/quy', label: 'Quỹ' },
    { href: '/thanh-vien', label: 'Thành viên' },
    { href: '/bxh', label: 'BXH' },
    { href: '/giai-dau', label: 'Giải' },
    { href: '/admin', label: 'Cấu hình' },
  ],
  'leader navigation keeps Cấu hình as the fifth tab'
);
```

và sửa dòng đọc roster:

```js
const rosterPage = read('app/thanh-vien/page.js');
```

- [ ] **Step 6: Chạy test**

Run: `npm run test:phase2 && npm run test:mobile-nav && node tests/pickhub-ui-phase2.test.js`
Expected: ba dòng ok. Nếu `pickhub-ui-phase2` báo thiếu `app/quy/admin/page.js` thì đó là Task 14, chưa đụng ở đây — file vẫn còn nên phải xanh.

- [ ] **Step 7: Build để chắc route mới nhận diện đúng**

Run: `npm run build`
Expected: trong bảng route có `/thanh-vien`, không còn `/quy/members`

- [ ] **Step 8: Commit**

```bash
git add -A app/thanh-vien app/quy next.config.js tests/
git commit -m "refactor(route): chuyen /quy/members sang /thanh-vien"
```

---

### Task 4: Chuyển `/quy/bxh` sang `/bxh`

**Files:**
- Create: `app/bxh/page.js`, `app/bxh/page.css`, `app/bxh/layout.js`
- Delete: `app/quy/bxh/`
- Modify: `next.config.js`, `tests/ph-design-system.test.js`

- [ ] **Step 1: Chuyển file**

```bash
mkdir -p app/bxh
git mv app/quy/bxh/page.js app/bxh/page.js
git mv app/quy/bxh/page.css app/bxh/page.css
rmdir app/quy/bxh
```

- [ ] **Step 2: Thêm layout**

Tạo `app/bxh/layout.js`:

```js
import AppShell from '@/components/pickhub/AppShell';

export default function BxhLayout({ children }) {
    return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 3: Sửa link sổ quỹ trong trang**

Trong `app/bxh/page.js` tìm `<a href="/admin?section=fund">Mở sổ quỹ để xử lý</a>` và đổi `href` thành `/quy`.

- [ ] **Step 4: Thêm redirect**

Trong `next.config.js`, thêm ngay sau khối `/quy/members`:

```js
            {
                source: '/quy/bxh',
                destination: '/bxh',
                permanent: true,
            },
```

- [ ] **Step 5: Cập nhật `tests/ph-design-system.test.js`**

Sửa dòng 88:

```js
const NEW_CSS_FILES = ['app/styles/primitives.css', 'components/pickhub/AppShell.css', 'app/bxh/page.css'];
```

- [ ] **Step 6: Chạy test và build**

Run: `npm run test:ph-ui && npm run build`
Expected: `ph-design-system: PASS`, bảng route có `/bxh`, không còn `/quy/bxh`

- [ ] **Step 7: Commit**

```bash
git add -A app/bxh app/quy next.config.js tests/ph-design-system.test.js
git commit -m "refactor(route): chuyen /quy/bxh sang /bxh"
```

---

### Task 5: `/admin` bỏ tab và chuyển hướng section cũ

**Files:**
- Modify: `app/admin/page.js`
- Modify: `app/admin/admin-center.css`
- Modify: `tests/pickhub-ui-phase2.browser.test.js`

- [ ] **Step 1: Viết lại `app/admin/page.js`**

```js
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppShell from '@/components/pickhub/AppShell';
import ClubSettings from '@/app/admin/ClubSettings';
import './admin-center.css';

export default function ClubSettingsPage() {
    return (
        <Suspense fallback={<div className="admin-center-loading">Đang tải cấu hình CLB…</div>}>
            <ClubSettingsPageContent />
        </Suspense>
    );
}

// Hai section cu da duoc go: roster ve /thanh-vien, fund ve /quy.
const LEGACY_SECTION_TARGET = {
    roster: '/thanh-vien',
    fund: '/quy',
};

function ClubSettingsPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const legacySection = searchParams.get('section');
    const legacyTarget = LEGACY_SECTION_TARGET[legacySection] || null;
    const [access, setAccess] = useState({ kind: 'loading' });

    useEffect(() => {
        if (legacyTarget) {
            router.replace(legacyTarget);
            return undefined;
        }
        let active = true;
        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload) => {
                if (!active) return;
                setAccess({ kind: payload.permissions?.canManageSettings ? 'ready' : 'forbidden' });
            })
            .catch(() => { if (active) setAccess({ kind: 'error' }); });
        return () => { active = false; };
    }, [legacyTarget, router]);

    if (legacyTarget) {
        return <AppShell><div className="admin-center-loading">Đang chuyển hướng…</div></AppShell>;
    }

    return (
        <AppShell>
            <div className="admin-center-shell">
                <main className="admin-center">
                    <section className="admin-center-heading">
                        <div>
                            <p className="admin-center-eyebrow">Quản trị</p>
                            <h1>Cấu hình CLB</h1>
                            <p>Thông tin nhận diện, mã truy cập, mật khẩu và kết nối thu quỹ của câu lạc bộ.</p>
                        </div>
                    </section>

                    {access.kind === 'loading' ? <AdminAccessState title="Đang xác thực quyền" message="Máy chủ đang kiểm tra phiên trưởng nhóm…" />
                        : access.kind === 'forbidden' ? <AdminAccessState title="Không có quyền quản trị" message="Hãy nhập Mã CLB và mật khẩu trưởng nhóm để mở Cấu hình." action />
                        : access.kind === 'error' ? <AdminAccessState title="Chưa kiểm tra được quyền" message="Không thể kết nối máy chủ. Vui lòng tải lại trang." />
                        : <ClubSettings />}
                </main>
            </div>
        </AppShell>
    );
}

function AdminAccessState({ title, message, action = false }) {
    return <section className="admin-access-state" role="alert"><span aria-hidden="true">{action ? '!' : '◌'}</span><h2>{title}</h2><p>{message}</p>{action && <a href="/">Nhập lại thông tin CLB</a>}</section>;
}
```

Ba import cũ `FundAdminPage`, `MembersPage`, và khối `admin-center-tabs` đã biến mất — đó là mục đích của task này.

- [ ] **Step 2: Xoá CSS của tab**

Trong `app/admin/admin-center.css`, xoá mọi rule bắt đầu bằng `.admin-center-tabs`. Giữ nguyên `.admin-center-shell`, `.admin-center`, `.admin-center-heading`, `.admin-center-eyebrow`, `.admin-access-state`, `.admin-center-loading`, `.admin-center-panel`.

- [ ] **Step 3: Sửa browser test**

Trong `tests/pickhub-ui-phase2.browser.test.js` (khoảng dòng 97–107), đổi hai lần điều hướng:

```js
    await page.goto(`${baseUrl}/thanh-vien`, { waitUntil: 'networkidle' });
```

```js
    role = 'admin';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/thanh-vien`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Thành viên CLB' }).waitFor();
```

Dòng `await page.getByRole('heading', { name: 'Trung tâm quản trị CLB' }).waitFor();` phải **xoá** — tiêu đề đó không còn tồn tại, và trang danh bạ giờ dùng tiêu đề `Thành viên CLB` cho cả hai vai trò.

- [ ] **Step 4: Kiểm bằng tay**

```bash
npm run dev
```

Mở lần lượt và ghi nhận:
- `/admin?section=roster` → nhảy sang `/thanh-vien`
- `/admin?section=fund` → nhảy sang `/quy`
- `/admin?section=settings` → hiện trang cấu hình (tham số thừa, bị bỏ qua)
- `/admin` → hiện trang cấu hình, **không còn thanh tab**

- [ ] **Step 5: Commit**

```bash
git add app/admin next.config.js tests/pickhub-ui-phase2.browser.test.js
git commit -m "refactor(admin): bo tab, chuyen huong section roster va fund"
```

---

### Task 6: Chốt Phase A — chạy toàn bộ hồi quy

**Files:** không sửa file nào, chỉ chạy.

- [ ] **Step 1: Chạy hồi quy đầy đủ**

Run: `npm run test:regression`
Expected: PASS toàn bộ. Nếu đỏ, sửa test tương ứng theo bảng ở mục 13 của spec rồi chạy lại.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: thành công; bảng route có `/thanh-vien` và `/bxh`, không còn `/quy/members` và `/quy/bxh`

- [ ] **Step 3: Commit nếu có sửa thêm**

```bash
git add -A
git commit -m "test: dong bo test sau khi doi duong dan khong gian CLB"
```

---

# PHASE B — Shell sidebar desktop

**Nguồn CSS:** mọi selector trong phase này đã có sẵn và đã kiểm thị giác trong
`_workspace/mockup-ui-2026-09-09.html`. Mở file đó, chép khối CSS tương ứng, rồi
**thay mọi giá trị màu hex bằng `var(--ph-*)`** — `tests/ph-design-system.test.js`
cấm hex trong `components/pickhub/AppShell.css`.

---

### Task 7: `AppTopBar` — breadcrumb và chip CLB

**Files:**
- Create: `components/pickhub/AppTopBar.js`
- Create: `components/pickhub/AppTopBar.css`

- [ ] **Step 1: Viết component**

Tạo `components/pickhub/AppTopBar.js`:

```js
'use client';

import { usePathname } from 'next/navigation';
import navigation from '@/lib/globalNavigation';
import './AppTopBar.css';

const { getBreadcrumbLabel } = navigation;

export default function AppTopBar({ clubName, clubCode }) {
    const pathname = usePathname();
    const current = getBreadcrumbLabel(pathname);

    return (
        <header className="ph-topbar">
            <div className="ph-topbar__inner">
                <nav className="ph-crumb" aria-label="Vị trí hiện tại">
                    <span>CLB của tôi</span>
                    <span className="ph-crumb__sep" aria-hidden="true">/</span>
                    <span className="ph-crumb__cur">{current}</span>
                </nav>
                {clubName && (
                    <span className="ph-clubchip">
                        <i aria-hidden="true" />
                        {clubName}
                        {clubCode && <code>{clubCode}</code>}
                    </span>
                )}
            </div>
        </header>
    );
}
```

Không có badge vai trò, không có chuông — chuông nằm ở thẻ user trong `SideRail` (Task 8).

- [ ] **Step 2: Viết CSS**

Tạo `components/pickhub/AppTopBar.css`. Chép từ mockup các selector `.ph-topbar`,
`.ph-topbar__inner`, `.ph-crumb`, `.ph-clubchip`, đổi hex sang token:

```css
.ph-topbar { display: none; }

@media (min-width: 1120px) {
  .ph-topbar {
    position: sticky; top: 0; z-index: 40;
    display: flex; align-items: center; height: 64px; padding: 0 28px;
    background: var(--ph-card);
    border-bottom: 1px solid var(--ph-line);
  }
  .ph-topbar__inner {
    display: flex; align-items: center; gap: 14px;
    width: 100%; max-width: 1280px; margin: 0 auto;
  }
}

.ph-crumb { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; font-weight: 700; color: var(--ph-muted); }
.ph-crumb__sep { color: var(--ph-line); }
.ph-crumb__cur { color: var(--ph-text); }

.ph-clubchip {
  margin-left: auto;
  display: flex; align-items: center; gap: 7px;
  padding: 6px 12px; border-radius: 999px;
  background: var(--ph-tint-positive); color: var(--ph-positive);
  font-size: 12px; font-weight: 700;
}
.ph-clubchip i { display: block; width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
.ph-clubchip code { padding: 1px 6px; border-radius: 5px; background: var(--ph-tint-neutral); font-family: inherit; font-size: 11px; font-weight: 800; }
```

Top bar chỉ hiện từ 1120px — dưới mốc đó `HomeHeader` vẫn đảm nhiệm như cũ.

- [ ] **Step 3: Commit**

```bash
git add components/pickhub/AppTopBar.js components/pickhub/AppTopBar.css
git commit -m "feat(shell): them AppTopBar voi breadcrumb suy tu pathname"
```

---

### Task 8: `SideRail` — brand, nav, thẻ user có chuông

**Files:**
- Modify: `components/pickhub/SideRail.js`
- Modify: `components/pickhub/AppShell.css`

- [ ] **Step 1: Viết lại `SideRail.js`**

```js
'use client';

import { usePathname } from 'next/navigation';
import navigation from '@/lib/globalNavigation';
import PhNotificationBell from './PhNotificationBell';

const { getGlobalNavLinksForRole, isGlobalNavActive } = navigation;

function initials(name) {
    if (!name) return 'CL';
    return name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

export default function SideRail({ role, clubName, clubLogoUrl, userName, memberCount }) {
    const pathname = usePathname();
    const links = getGlobalNavLinksForRole(role);
    const isAdmin = role === 'admin';

    return (
        <div className="ph-rail">
            <div className="ph-rail__brand">
                {clubLogoUrl
                    ? <img className="ph-rail__logo" src={clubLogoUrl} alt="" />
                    : <span className="ph-rail__mark" aria-hidden="true">{initials(clubName)}</span>}
                <span className="ph-rail__brandtext">
                    <span className="ph-rail__kicker">Câu lạc bộ</span>
                    <span className="ph-rail__name">{clubName || 'CLB của tôi'}</span>
                </span>
            </div>

            <nav className="ph-rail__nav" aria-label="Điều hướng chính">
                <span className="ph-rail__label">{isAdmin ? 'Menu quản lý' : 'Giao diện thành viên'}</span>
                {links.map((link) => {
                    const active = isGlobalNavActive(pathname, link.href);
                    return (
                        <a
                            key={link.href}
                            href={link.href}
                            className={`ph-rail__link${active ? ' is-active' : ''}`}
                            aria-current={active ? 'page' : undefined}
                        >
                            <span className="ph-rail__ico" aria-hidden="true">{link.icon}</span>
                            <span className="ph-rail__txt">{link.label}</span>
                            {link.href === '/thanh-vien' && Number.isFinite(memberCount) && (
                                <span className="ph-rail__count">{memberCount}</span>
                            )}
                        </a>
                    );
                })}
            </nav>

            <div className="ph-usercard">
                <span className="ph-usercard__av" aria-hidden="true">{initials(userName)}</span>
                <span className="ph-usercard__body">
                    <span className="ph-usercard__name">{userName || (isAdmin ? 'Quản trị viên' : 'Khách CLB')}</span>
                    <span className="ph-usercard__role">{isAdmin ? 'Quản trị viên CLB' : 'Thành viên'}</span>
                </span>
                {isAdmin
                    ? <span className="ph-usercard__bell"><PhNotificationBell /></span>
                    : <span className="ph-usercard__dot" aria-hidden="true" />}
            </div>
        </div>
    );
}
```

`memberCount` là tuỳ chọn — nếu `AppShell` chưa truyền thì badge đếm không hiện,
không vỡ giao diện.

- [ ] **Step 2: Viết lại phần rail trong `AppShell.css`**

Thay toàn bộ nhóm `.ph-rail*` hiện có bằng:

```css
.ph-rail { display: none; }

@media (min-width: 1120px) {
  .ph-rail {
    display: flex; flex-direction: column;
    position: sticky; top: 0; height: 100vh;
    background: var(--ph-card);
    border-right: 1px solid var(--ph-line);
  }
}

.ph-rail__brand { display: flex; align-items: center; gap: 12px; padding: 20px 18px; border-bottom: 1px solid var(--ph-line); }
.ph-rail__mark,
.ph-rail__logo { width: 42px; height: 42px; flex: 0 0 42px; border-radius: var(--ph-radius-sm); object-fit: cover; }
.ph-rail__mark { display: grid; place-items: center; background: var(--ph-indigo); color: var(--ph-card); font-size: 15px; font-weight: 800; }
.ph-rail__brandtext { min-width: 0; }
.ph-rail__kicker { display: block; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--ph-muted); }
.ph-rail__name { display: block; margin-top: 2px; font-size: 14px; font-weight: 800; letter-spacing: -.02em; line-height: 1.25; }

.ph-rail__nav { flex: 1; padding: 18px 12px; overflow-y: auto; }
.ph-rail__label { display: block; padding: 0 10px 10px; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--ph-muted); }
.ph-rail__link { display: flex; align-items: center; gap: 11px; min-height: 44px; padding: 0 10px; margin-bottom: 2px; border-radius: var(--ph-radius-xs); color: var(--ph-ink-2); font-size: 13px; font-weight: 700; text-decoration: none; transition: background .15s, color .15s; }
.ph-rail__link:hover { background: var(--ph-tint-neutral-strong); }
.ph-rail__link.is-active { background: var(--ph-lavender); color: var(--ph-indigo); }
.ph-rail__link:focus-visible { outline: 2px solid var(--ph-indigo); outline-offset: 2px; }
.ph-rail__ico { width: 18px; text-align: center; font-size: 15px; }
.ph-rail__txt { flex: 1; }
.ph-rail__count { padding: 2px 8px; border-radius: 999px; background: var(--ph-tint-neutral); color: var(--ph-ink-2); font-size: 11px; font-weight: 700; }
.ph-rail__link.is-active .ph-rail__count { background: var(--ph-card); color: var(--ph-indigo); }

.ph-usercard { display: flex; align-items: center; gap: 11px; margin: 12px; padding: 12px; border-radius: var(--ph-radius-sm); background: var(--ph-tint-neutral-strong); border: 1px solid var(--ph-line); }
.ph-usercard__av { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 38px; border-radius: 999px; background: var(--ph-lavender); color: var(--ph-indigo); font-size: 12px; font-weight: 800; }
.ph-usercard__body { flex: 1; min-width: 0; }
.ph-usercard__name { display: block; font-size: 13px; font-weight: 800; line-height: 1.2; }
.ph-usercard__role { display: block; margin-top: 2px; font-size: 11px; font-weight: 600; color: var(--ph-muted); }
.ph-usercard__dot { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 999px; background: var(--ph-positive); }
.ph-usercard__bell { flex: 0 0 auto; }
```

`.ph-usercard__bell` chỉ là vỏ bọc — `PhNotificationBell` tự dựng nút bằng
`ph-btn ph-btn--ghost` có sẵn trong `primitives.css`, không cần style lại.

- [ ] **Step 3: Chạy test cấm hex**

Run: `npm run test:ph-ui`
Expected: `ph-design-system: PASS`. Nếu đỏ, tìm hex còn sót trong `AppShell.css` và thay bằng token.

- [ ] **Step 4: Commit**

```bash
git add components/pickhub/SideRail.js components/pickhub/AppShell.css
git commit -m "feat(shell): SideRail co khoi brand, badge dem va the user kem chuong"
```

---

### Task 9: Ghép `AppShell` và ba mốc responsive

**Files:**
- Modify: `components/pickhub/AppShell.js`
- Modify: `components/pickhub/AppShell.css`

- [ ] **Step 1: Viết lại `AppShell.js`**

```js
'use client';

import { useEffect, useState } from 'react';
import HomeHeader from '@/components/HomeHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import SideRail from './SideRail';
import AppTopBar from './AppTopBar';
import './AppShell.css';

export default function AppShell({ children }) {
    const [role, setRole] = useState('member');
    const [club, setClub] = useState({ name: '', code: '', logoUrl: null, userName: '' });

    useEffect(() => {
        let active = true;

        fetch('/api/groups/session', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                if (!active) return;
                const sessionRole = payload?.session?.role;
                if (payload?.permissions?.canViewClub && ['admin', 'member'].includes(sessionRole)) {
                    setRole(sessionRole);
                }
                if (payload?.session) {
                    setClub((current) => ({
                        ...current,
                        name: payload.session.group_name || current.name,
                        code: payload.session.group_code || current.code,
                    }));
                }
            })
            .catch(() => {});

        fetch('/api/club/branding')
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (!active || !data) return;
                setClub((current) => ({
                    ...current,
                    name: data.name || current.name,
                    logoUrl: data.logoUrl || null,
                }));
            })
            .catch(() => {});

        return () => { active = false; };
    }, []);

    return (
        <div className="ph-shell">
            <div className="ph-shell__body">
                <SideRail
                    role={role}
                    clubName={club.name}
                    clubLogoUrl={club.logoUrl}
                    userName={club.userName}
                />
                <div className="ph-shell__col">
                    <HomeHeader />
                    <AppTopBar clubName={club.name} clubCode={club.code} />
                    <main className="ph-shell__main">{children}</main>
                </div>
            </div>
            <MobileBottomNav />
        </div>
    );
}
```

**Lưu ý quan trọng:** `HomeHeader` vẫn được render nhưng CSS sẽ ẩn nó từ 1120px trở lên
(Step 2). Không xoá nó khỏi cây — `tests/global-navigation.test.js` kiểm
`AppShell` phải chứa `SideRail` và `MobileBottomNav`, còn `tests/mobile-bottom-tabs.test.js`
kiểm layout không tự render `HomeHeader`, tức là `AppShell` **phải** là nơi render nó.

`trailing={<PhNotificationBell />}` đã bị bỏ khỏi `HomeHeader` vì chuông chuyển xuống
thẻ user — dưới 1120px chuông nằm trong sidebar đang ẩn. Xử lý ở Step 3.

- [ ] **Step 2: Ba mốc responsive trong `AppShell.css`**

Thêm vào đầu file, trước nhóm `.ph-rail`:

```css
.ph-shell { min-height: 100vh; background: var(--ph-surface); }
.ph-shell__body { display: block; }
.ph-shell__col { display: flex; flex-direction: column; min-width: 0; }
.ph-shell__main { width: min(1280px, 100%); margin: 0 auto; padding: 24px 16px 48px; }

@media (min-width: 768px) {
  .ph-shell__main { padding: 32px 24px 56px; }
}

@media (min-width: 1120px) {
  .ph-shell__body { display: grid; grid-template-columns: 256px minmax(0, 1fr); align-items: start; }
  .ph-shell__main { padding: 28px; }
  /* Tu 1120px tro len: sidebar + top bar thay cho header va bottom nav */
  .ph-shell .home-header { display: none; }
  .ph-shell .mobile-bottom-nav { display: none; }
}
```

`margin: 0 auto` trên `.ph-shell__main` là bắt buộc. Thiếu nó thì trên màn 1900px nội dung
dính sát trái và chừa một mảng trống bên phải — đúng lỗi đã gặp khi dựng mockup.

- [ ] **Step 3: Chuông cho dải dưới 1120px**

`MobileBottomNav` không có chỗ đặt chuông. Giữ chuông trong `HomeHeader` cho dải
< 1120px bằng cách truyền lại prop có điều kiện CSS thay vì điều kiện JS —
trong `AppShell.js` sửa dòng `<HomeHeader />` thành:

```js
                    <HomeHeader trailing={role === 'admin' ? <span className="ph-shell__headerbell"><PhNotificationBell /></span> : null} />
```

thêm import `import PhNotificationBell from './PhNotificationBell';` ở đầu file, và
thêm vào `AppShell.css`:

```css
@media (min-width: 1120px) {
  .ph-shell__headerbell { display: none; }
}
```

Như vậy admin luôn có đúng một chuông: dưới 1120px ở header, từ 1120px ở thẻ user.

- [ ] **Step 4: Kiểm ba mốc bằng tay**

```bash
npm run dev
```

Mở `/quy` và đổi bề rộng cửa sổ:
- 1400px → thấy sidebar trái, top bar có breadcrumb, **không** thấy `HomeHeader` và bottom nav; chuông nằm trong thẻ user
- 900px → **không** sidebar, thấy `HomeHeader` + bottom nav, chuông ở header
- 380px → như 900px, không tràn ngang

- [ ] **Step 5: Chạy test shell**

Run: `node tests/global-navigation.test.js && npm run test:mobile-nav && npm run test:ph-ui`
Expected: ba dòng ok

- [ ] **Step 6: Commit**

```bash
git add components/pickhub/AppShell.js components/pickhub/AppShell.css
git commit -m "feat(shell): ghep sidebar va top bar, chot ba moc responsive"
```

---

# PHASE C — Thao tác quỹ về `/quy`

Đây là phần thay thế `/admin?section=fund`. Sau phase này `app/quy/admin/` bị xoá.

**API đã có đủ, không sửa backend.** Đối chiếu `app/api/club/transactions/route.js`:
`POST` nhận `{ direction, so_tien, loai_giao_dich, noi_dung, ngay_giao_dich, ghi_chu }`;
`PATCH` nhận `{ ids: [...], updates: {...} }`.

---

### Task 10: `AssignTransactionDialog` nhận thẳng một giao dịch

**Files:**
- Modify: `components/pickhub/AssignTransactionDialog.js`
- Modify: `components/pickhub/PhNotificationBell.js`

Hiện component chỉ nhận prop `notification` và đọc `notification.subject_id` +
`notification.payload`. Trang quỹ có sẵn cả object giao dịch nên cần nhận thẳng.

- [ ] **Step 1: Đổi sang prop `transaction`**

Trong `AssignTransactionDialog.js`, thay chữ ký và hai chỗ dùng:

```js
export default function AssignTransactionDialog({ open, transaction, onClose, onAssigned }) {
```

```js
    async function assign(member) {
        setSaving(true);
        setError('');
        const response = await fetch('/api/club/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [transaction.id], updates: { nguoi_nop: member.full_name } }),
        });
        setSaving(false);
        if (!response.ok) { setError('Không gán được, thử lại.'); return; }
        onAssigned(transaction);
    }

    if (!transaction) return null;
    const filtered = members.filter((member) => member.full_name.toLowerCase().includes(query.toLowerCase()));
```

và khối tóm tắt đọc thẳng từ `transaction`:

```js
            <div className="ph-card ph-card--flat">
                <p><strong>{Number(transaction.so_tien || 0).toLocaleString('vi-VN')}đ</strong></p>
                <p>{transaction.noi_dung_goc || '(không có nội dung)'}</p>
                <p>{transaction.created_at ? new Date(transaction.created_at).toLocaleDateString('vi-VN') : ''} · {transaction.ma_giao_dich}</p>
            </div>
```

- [ ] **Step 2: Sửa `PhNotificationBell` cho khớp chữ ký mới**

Notification lưu giao dịch trong `subject_id` + `payload`, nên phải dựng lại object:

```js
            <AssignTransactionDialog
                open={Boolean(assigning)}
                transaction={assigning ? { id: assigning.subject_id, ...(assigning.payload || {}) } : null}
                onClose={() => setAssigning(null)}
                onAssigned={() => { setAssigning(null); load(); }}
            />
```

- [ ] **Step 3: Kiểm bằng tay**

```bash
npm run dev
```

Đăng nhập admin, bấm chuông, chọn một thông báo, bấm "Gán cho thành viên".
Expected: hộp thoại hiện đúng số tiền và nội dung, chọn tên thì gán thành công.

- [ ] **Step 4: Commit**

```bash
git add components/pickhub/AssignTransactionDialog.js components/pickhub/PhNotificationBell.js
git commit -m "refactor(quy): AssignTransactionDialog nhan thang mot giao dich"
```

---

### Task 11: `FundTransactionList` — danh sách dòng-thẻ

**Files:**
- Create: `components/pickhub/fund/FundTransactionList.js`
- Create: `components/pickhub/fund/FundTransactionList.css`

- [ ] **Step 1: Viết component**

```js
'use client';

import './FundTransactionList.css';

function money(value) {
    return Number(value || 0).toLocaleString('vi-VN');
}

function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

const CATEGORY_LABEL = {
    nop_quy: 'Nộp quỹ',
    nop_phat: 'Nộp phạt',
    khac: 'Khác',
};

// Chi dung bien the badge co that trong primitives.css:
// --gold, --positive, --negative, --muted. KHONG co --indigo.
function categoryClass(category) {
    if (category === 'nop_quy') return 'ph-badge ph-badge--positive';
    if (category === 'nop_phat') return 'ph-badge ph-badge--gold';
    return 'ph-badge ph-badge--muted';
}

export default function FundTransactionList({
    transactions,
    canManage = false,
    selectedIds = [],
    onToggleSelect,
    onEdit,
    onAssign,
}) {
    if (transactions.length === 0) {
        return <p className="fund-tx__empty">Không có giao dịch nào khớp bộ lọc.</p>;
    }

    return (
        <div className="fund-tx">
            {transactions.map((item) => {
                const isIncome = item.huong_giao_dich === 'in';
                const unassigned = !item.nguoi_nop;
                return (
                    <article className="fund-tx__row" key={item.id}>
                        {canManage && (
                            <input
                                type="checkbox"
                                className="fund-tx__pick"
                                checked={selectedIds.includes(item.id)}
                                onChange={() => onToggleSelect(item.id)}
                                aria-label={`Chọn giao dịch ${item.ma_giao_dich || item.id}`}
                            />
                        )}
                        <span
                            className={`fund-tx__ico${isIncome ? '' : ' fund-tx__ico--out'}${unassigned ? ' fund-tx__ico--wait' : ''}`}
                            aria-hidden="true"
                        >
                            {unassigned ? '?' : initials(item.nguoi_nop)}
                        </span>
                        <div className="fund-tx__body">
                            <strong className={`fund-tx__name${unassigned ? ' is-muted' : ''}`}>
                                {item.nguoi_nop || 'Chưa gán người nộp'}
                            </strong>
                            <p className="fund-tx__desc" title={item.noi_dung_goc || ''}>{item.noi_dung_goc || '(không có nội dung)'}</p>
                            <span className="fund-tx__meta">
                                {item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : 'chưa rõ thời điểm'}
                            </span>
                        </div>
                        <div className="fund-tx__right">
                            <span className={`fund-tx__amt ${isIncome ? 'is-in' : 'is-out'}`}>
                                {isIncome ? '+' : '−'}{money(Math.abs(item.so_tien))}đ
                            </span>
                            <span className={categoryClass(item.loai_giao_dich)}>
                                {CATEGORY_LABEL[item.loai_giao_dich] || 'Khác'}
                            </span>
                        </div>
                        {canManage && (
                            <div className="fund-tx__acts">
                                {unassigned && (
                                    <button type="button" className="ph-btn ph-btn--primary ph-btn--sm" onClick={() => onAssign(item)}>
                                        Gán người nộp
                                    </button>
                                )}
                                <button type="button" className="ph-btn ph-btn--outline ph-btn--sm" onClick={() => onEdit(item)}>
                                    Sửa
                                </button>
                            </div>
                        )}
                    </article>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 2: Viết CSS**

Tạo `components/pickhub/fund/FundTransactionList.css`:

```css
.fund-tx__empty { padding: 32px 20px; text-align: center; font-size: 13px; font-weight: 600; color: var(--ph-muted); }
.fund-tx { padding: 4px 20px 2px; }
.fund-tx__row { display: flex; align-items: center; gap: 13px; padding: 14px 0; border-bottom: 1px solid var(--ph-line); }
.fund-tx__row:last-child { border-bottom: 0; }
.fund-tx__pick { width: 16px; height: 16px; flex: 0 0 16px; accent-color: var(--ph-indigo); }
.fund-tx__ico { display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 34px; border-radius: 999px; background: var(--ph-tint-positive); color: var(--ph-positive); font-size: 12px; font-weight: 800; }
.fund-tx__ico--out { background: var(--ph-tint-negative); color: var(--ph-negative); }
.fund-tx__ico--wait { background: var(--ph-tint-gold); color: var(--ph-tint-gold-text); }
.fund-tx__body { flex: 1; min-width: 0; }
.fund-tx__name { display: block; font-size: 13px; font-weight: 800; line-height: 1.3; }
.fund-tx__name.is-muted { color: var(--ph-muted); }
.fund-tx__desc { margin: 3px 0 0; font-size: 12px; font-weight: 600; color: var(--ph-ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
.fund-tx__meta { display: block; margin-top: 3px; font-size: 11px; font-weight: 600; color: var(--ph-muted); font-variant-numeric: tabular-nums; }
.fund-tx__right { flex: 0 0 118px; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
.fund-tx__amt { font-size: 14px; font-weight: 800; letter-spacing: -.02em; white-space: nowrap; font-variant-numeric: tabular-nums; }
.fund-tx__amt.is-in { color: var(--ph-positive); }
.fund-tx__amt.is-out { color: var(--ph-negative); }
.fund-tx__acts { flex: 0 0 116px; display: flex; flex-direction: column; gap: 5px; }
.fund-tx__acts .ph-btn { justify-content: center; min-height: 44px; }
.fund-tx__acts .ph-btn:focus-visible { outline: 2px solid var(--ph-indigo); outline-offset: 2px; }

@media (max-width: 719px) {
  .fund-tx__row { flex-wrap: wrap; }
  .fund-tx__body { flex: 1 1 100%; order: 3; }
  .fund-tx__desc { max-width: none; }
  .fund-tx__right { flex: 0 0 auto; }
  .fund-tx__acts { flex: 1 1 100%; order: 4; flex-direction: row; }
}
```

Hai bề rộng cố định `118px` và `116px` là để số tiền của mọi dòng thẳng cột —
thiếu chúng thì dòng có nút "Gán người nộp" sẽ đẩy số tiền lệch sang trái.

- [ ] **Step 3: Chạy test cấm hex**

Run: `npm run test:ph-ui`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/pickhub/fund/
git commit -m "feat(quy): danh sach giao dich dang dong-the thay cho bang"
```

---

### Task 12: `FundEntryForm` — ghi thu và ghi chi

**Files:**
- Create: `components/pickhub/fund/FundEntryForm.js`

- [ ] **Step 1: Viết component**

```js
'use client';

import { useState } from 'react';
import PhModal from '@/components/pickhub/PhModal';

const EMPTY = {
    so_tien: '',
    loai_giao_dich: 'khac',
    noi_dung: '',
    ngay_giao_dich: '',
    ghi_chu: '',
};

export default function FundEntryForm({ open, direction, onClose, onSaved }) {
    const isIncome = direction === 'in';
    const [form, setForm] = useState({
        ...EMPTY,
        loai_giao_dich: isIncome ? 'nop_quy' : 'khac',
        ngay_giao_dich: new Date().toISOString().split('T')[0],
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    function update(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function submit(event) {
        event.preventDefault();
        setError('');
        const amount = Math.abs(Number(String(form.so_tien).replace(/[^\d]/g, '')));
        if (!amount) { setError('Số tiền phải lớn hơn 0.'); return; }
        if (!form.noi_dung.trim()) { setError('Vui lòng nhập nội dung giao dịch.'); return; }

        setSaving(true);
        const response = await fetch('/api/club/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                direction,
                so_tien: amount,
                loai_giao_dich: form.loai_giao_dich,
                noi_dung: form.noi_dung.trim(),
                ngay_giao_dich: form.ngay_giao_dich,
                ghi_chu: form.ghi_chu.trim(),
            }),
        });
        setSaving(false);
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            setError(payload.error || 'Không ghi được giao dịch.');
            return;
        }
        setForm({ ...EMPTY, loai_giao_dich: isIncome ? 'nop_quy' : 'khac', ngay_giao_dich: new Date().toISOString().split('T')[0] });
        onSaved();
    }

    return (
        <PhModal open={open} title={isIncome ? 'Ghi nhận khoản thu' : 'Ghi nhận khoản chi'} onClose={onClose}>
            <form onSubmit={submit}>
                <label className="ph-field">
                    <span className="ph-field__label">Số tiền</span>
                    <input className="ph-field__control" inputMode="numeric" value={form.so_tien} onChange={(event) => update('so_tien', event.target.value)} placeholder="0" />
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Loại giao dịch</span>
                    <select className="ph-field__control" value={form.loai_giao_dich} onChange={(event) => update('loai_giao_dich', event.target.value)}>
                        <option value="nop_quy">Nộp quỹ</option>
                        <option value="nop_phat">Nộp phạt</option>
                        <option value="khac">Khác</option>
                    </select>
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Nội dung</span>
                    <input className="ph-field__control" value={form.noi_dung} onChange={(event) => update('noi_dung', event.target.value)} placeholder={isIncome ? 'VD: Thu quỹ tháng 9' : 'VD: Thanh toán tiền sân tháng 9'} />
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Ngày giao dịch</span>
                    <input className="ph-field__control" type="date" value={form.ngay_giao_dich} onChange={(event) => update('ngay_giao_dich', event.target.value)} />
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Ghi chú</span>
                    <input className="ph-field__control" value={form.ghi_chu} onChange={(event) => update('ghi_chu', event.target.value)} placeholder="Không bắt buộc" />
                </label>
                {error && <p className="ph-field__error" role="alert">{error}</p>}
                <div className="ph-modal__actions">
                    <button type="button" className="ph-btn ph-btn--outline" onClick={onClose} disabled={saving}>Hủy</button>
                    <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>
                        {saving ? 'Đang lưu…' : (isIncome ? 'Ghi khoản thu' : 'Ghi khoản chi')}
                    </button>
                </div>
            </form>
        </PhModal>
    );
}
```

Các class dùng ở trên đã được đối chiếu với `app/styles/primitives.css` và đều có thật:
`ph-field` (72), `ph-field__label` (73), `ph-field__control` (74), `ph-field__error` (75),
`ph-modal__actions` (69), `ph-btn--primary` (9), `ph-btn--outline` (11), `ph-state__text` (80).

**Bảng biến thể có thật — đừng bịa thêm:**
- Nút: `--primary`, `--outline`, `--ghost`, `--danger`, `--sm`, `--block`
- Badge: `--gold`, `--positive`, `--negative`, `--muted` (**không có** `--indigo`)

- [ ] **Step 2: Commit**

```bash
git add components/pickhub/fund/FundEntryForm.js
git commit -m "feat(quy): modal ghi thu va ghi chi"
```

---

### Task 13: `FundTransactionEditor` — sửa giao dịch

**Files:**
- Create: `components/pickhub/fund/FundTransactionEditor.js`

- [ ] **Step 1: Viết component**

```js
'use client';

import { useEffect, useState } from 'react';
import PhModal from '@/components/pickhub/PhModal';

export default function FundTransactionEditor({ open, transaction, members, onClose, onSaved }) {
    const [form, setForm] = useState({ nguoi_nop: '', loai_giao_dich: 'khac', admin_note: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!transaction) return;
        setForm({
            nguoi_nop: transaction.nguoi_nop || '',
            loai_giao_dich: transaction.loai_giao_dich || 'khac',
            admin_note: transaction.admin_note || '',
        });
        setError('');
    }, [transaction]);

    if (!transaction) return null;

    async function submit(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        const response = await fetch('/api/club/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ids: [transaction.id],
                updates: {
                    nguoi_nop: form.nguoi_nop || null,
                    loai_giao_dich: form.loai_giao_dich,
                    admin_note: form.admin_note.trim() || null,
                    is_manually_categorized: true,
                },
            }),
        });
        setSaving(false);
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            setError(payload.error || 'Không lưu được thay đổi.');
            return;
        }
        onSaved();
    }

    return (
        <PhModal open={open} title="Sửa giao dịch" onClose={onClose}>
            <p className="ph-state__text">
                {transaction.ma_giao_dich} · {transaction.created_at ? new Date(transaction.created_at).toLocaleString('vi-VN') : ''}
            </p>
            <form onSubmit={submit}>
                <label className="ph-field">
                    <span className="ph-field__label">Người nộp</span>
                    <select className="ph-field__control" value={form.nguoi_nop} onChange={(event) => setForm((c) => ({ ...c, nguoi_nop: event.target.value }))}>
                        <option value="">— Chưa gán —</option>
                        {members.map((member) => <option key={member.id} value={member.full_name}>{member.full_name}</option>)}
                    </select>
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Loại giao dịch</span>
                    <select className="ph-field__control" value={form.loai_giao_dich} onChange={(event) => setForm((c) => ({ ...c, loai_giao_dich: event.target.value }))}>
                        <option value="nop_quy">Nộp quỹ</option>
                        <option value="nop_phat">Nộp phạt</option>
                        <option value="khac">Khác</option>
                    </select>
                </label>
                <label className="ph-field">
                    <span className="ph-field__label">Ghi chú của thủ quỹ</span>
                    <input className="ph-field__control" value={form.admin_note} onChange={(event) => setForm((c) => ({ ...c, admin_note: event.target.value }))} placeholder="Không bắt buộc" />
                </label>
                {error && <p className="ph-field__error" role="alert">{error}</p>}
                <div className="ph-modal__actions">
                    <button type="button" className="ph-btn ph-btn--outline" onClick={onClose} disabled={saving}>Hủy</button>
                    <button type="submit" className="ph-btn ph-btn--primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
                </div>
            </form>
        </PhModal>
    );
}
```

**Kiểm trước khi viết:** mở `app/api/club/transactions/route.js` và đọc hằng
`ALLOWED_UPDATE_FIELDS`. Bốn trường ở trên (`nguoi_nop`, `loai_giao_dich`,
`admin_note`, `is_manually_categorized`) **phải** nằm trong danh sách đó, nếu không
route sẽ lọc bỏ và trả `Không có trường hợp lệ để cập nhật.` Trường nào thiếu thì
bỏ khỏi form, **không** tự ý thêm vào `ALLOWED_UPDATE_FIELDS`.

- [ ] **Step 2: Commit**

```bash
git add components/pickhub/fund/FundTransactionEditor.js
git commit -m "feat(quy): modal sua giao dich"
```

---

### Task 14: Ghép lớp thao tác vào `/quy`

**Files:**
- Modify: `app/quy/page.js`
- Modify: `app/quy/page.css`
- Create: `tests/club-space-roles.test.js`

- [ ] **Step 1: Viết test hợp đồng phân quyền**

Tạo `tests/club-space-roles.test.js`:

```js
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

// /quy phai gate moi thao tac quy bang canManageFund
const quyPage = read('app/quy/page.js');
assert.match(quyPage, /canManageFund/, '/quy phai doc quyen canManageFund tu session');
assert.match(quyPage, /FundTransactionList/, '/quy phai dung danh sach dong-the');
assert.match(quyPage, /FundEntryForm/, '/quy phai co modal ghi thu\\/chi');
assert.match(quyPage, /FundTransactionEditor/, '/quy phai co modal sua giao dich');
assert.match(quyPage, /AssignTransactionDialog/, '/quy phai co hop thoai gan nguoi nop');
assert.doesNotMatch(quyPage, /<table/, '/quy khong duoc dung bang cho danh sach giao dich');

// /thanh-vien phai gate cot Quan ly bang canManageRoster
const membersPage = read('app/thanh-vien/page.js');
assert.match(membersPage, /canManageRoster/, '/thanh-vien phai doc quyen canManageRoster');

// Hai man hinh trung gian da bi go
assert.equal(exists('app/quy/admin'), false, 'app/quy/admin phai bi xoa');
assert.equal(exists('app/quy/members'), false, 'app/quy/members phai bi xoa');
assert.equal(exists('app/quy/bxh'), false, 'app/quy/bxh phai bi xoa');
assert.equal(
    exists('app/api/club/settings/regenerate-code/route.js'),
    false,
    'endpoint tao lai ma CLB phai bi xoa, khong chi giau nut',
);

const adminPage = read('app/admin/page.js');
assert.doesNotMatch(adminPage, /admin-center-tabs/, '/admin khong con thanh tab');
assert.match(adminPage, /LEGACY_SECTION_TARGET/, '/admin phai chuyen huong section roster va fund cu');

console.log('club space role contract ok');
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node tests/club-space-roles.test.js`
Expected: FAIL — `/quy phai doc quyen canManageFund tu session`

- [ ] **Step 3: Sửa `app/quy/page.js`**

Trang đã có sẵn `isAdmin` từ `payload.permissions?.canManageFund`. Việc cần làm:

1. Thêm import ở đầu file:

```js
import FundTransactionList from '@/components/pickhub/fund/FundTransactionList';
import FundEntryForm from '@/components/pickhub/fund/FundEntryForm';
import FundTransactionEditor from '@/components/pickhub/fund/FundTransactionEditor';
import AssignTransactionDialog from '@/components/pickhub/AssignTransactionDialog';
```

2. Thêm state:

```js
    const [entryDirection, setEntryDirection] = useState(null);   // 'in' | 'out' | null
    const [editingTx, setEditingTx] = useState(null);
    const [assigningTx, setAssigningTx] = useState(null);
    const [selectedTxIds, setSelectedTxIds] = useState([]);
    const [bulkCategory, setBulkCategory] = useState('nop_quy');
    const [filterMember, setFilterMember] = useState('all');
    const [filterCategory, setFilterCategory] = useState('all');
```

3. Thêm `filterMember` và `filterCategory` vào hàm lọc `filteredTx` đang có:

```js
    const filteredTx = transactions.filter(t => {
        if (filterDirection !== 'all' && t.huong_giao_dich !== filterDirection) return false;
        if (filterCategory !== 'all' && t.loai_giao_dich !== filterCategory) return false;
        if (filterMember !== 'all' && t.nguoi_nop !== filterMember) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (t.noi_dung_goc || '').toLowerCase().includes(q)
                || (t.nguoi_nop || '').toLowerCase().includes(q)
                || (t.ma_giao_dich || '').toLowerCase().includes(q);
        }
        return true;
    });
```

4. Thêm thẻ số thứ tư vào `stats`:

```js
    const stats = {
        totalIn: transactions.filter(t => t.huong_giao_dich === 'in').reduce((s, t) => s + (t.so_tien || 0), 0),
        totalOut: transactions.filter(t => t.huong_giao_dich === 'out').reduce((s, t) => s + Math.abs(t.so_tien || 0), 0),
        totalPenalty: transactions.filter(t => t.loai_giao_dich === 'nop_phat').reduce((s, t) => s + Math.abs(t.so_tien || 0), 0),
    };
    stats.balance = stats.totalIn - stats.totalOut;
```

và render thêm một `.stat-card` "Quỹ phạt" hiển thị `formatMoney(stats.totalPenalty)`.

5. Thêm hàm gán loại hàng loạt:

```js
    async function applyBulkCategory() {
        if (selectedTxIds.length === 0) return;
        const response = await fetch('/api/club/transactions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedTxIds, updates: { loai_giao_dich: bulkCategory, is_manually_categorized: true } }),
        });
        if (!response.ok) return;
        setSelectedTxIds([]);
        loadTransactions();
    }
```

6. Thay khối render danh sách giao dịch hiện có bằng:

```js
                {isAdmin && (
                    <div className="fund-toolbar">
                        <button type="button" className="ph-btn ph-btn--outline ph-btn--sm" onClick={() => setEntryDirection('in')}>＋ Ghi thu</button>
                        <button type="button" className="ph-btn ph-btn--outline ph-btn--sm" onClick={() => setEntryDirection('out')}>＋ Ghi chi</button>
                    </div>
                )}

                {isAdmin && selectedTxIds.length > 0 && (
                    <div className="fund-bulkbar" role="group" aria-label="Thao tác nhiều giao dịch">
                        <span>Đã chọn {selectedTxIds.length} giao dịch</span>
                        <select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)} aria-label="Loại giao dịch áp dụng">
                            <option value="nop_quy">Nộp quỹ</option>
                            <option value="nop_phat">Nộp phạt</option>
                            <option value="khac">Khác</option>
                        </select>
                        <button type="button" className="ph-btn ph-btn--primary ph-btn--sm" onClick={applyBulkCategory}>Áp dụng</button>
                        <button type="button" className="ph-btn ph-btn--outline ph-btn--sm" onClick={() => setSelectedTxIds([])}>Bỏ chọn</button>
                    </div>
                )}

                <FundTransactionList
                    transactions={paginatedTx}
                    canManage={isAdmin}
                    selectedIds={selectedTxIds}
                    onToggleSelect={(id) => setSelectedTxIds((current) => (
                        current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
                    ))}
                    onEdit={setEditingTx}
                    onAssign={setAssigningTx}
                />
```

7. Thêm ba modal ở cuối JSX, trước thẻ đóng ngoài cùng:

```js
            <FundEntryForm
                open={Boolean(entryDirection)}
                direction={entryDirection}
                onClose={() => setEntryDirection(null)}
                onSaved={() => { setEntryDirection(null); loadTransactions(); }}
            />
            <FundTransactionEditor
                open={Boolean(editingTx)}
                transaction={editingTx}
                members={members}
                onClose={() => setEditingTx(null)}
                onSaved={() => { setEditingTx(null); loadTransactions(); }}
            />
            <AssignTransactionDialog
                open={Boolean(assigningTx)}
                transaction={assigningTx}
                onClose={() => setAssigningTx(null)}
                onAssigned={() => { setAssigningTx(null); loadTransactions(); }}
            />
```

- [ ] **Step 4: CSS cho toolbar và bulk bar**

Thêm vào `app/quy/page.css`:

```css
.fund-toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 12px; }
.fund-bulkbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 12px 20px; background: var(--ph-tint-indigo); border-block: 1px solid var(--ph-tint-indigo-line); font-size: 12px; font-weight: 700; color: var(--ph-indigo); }
.fund-bulkbar select { margin-left: auto; min-height: 44px; padding: 8px 12px; border: 1px solid var(--ph-tint-indigo-line); border-radius: var(--ph-radius-xs); background: var(--ph-card); font-family: inherit; font-size: 12px; font-weight: 700; }
```

- [ ] **Step 5: Chạy test**

Run: `node tests/club-space-roles.test.js`
Expected: vẫn FAIL ở `app/quy/admin phai bi xoa` — đúng, đó là Task 15. Ba assert đầu về `/quy` phải xanh.

- [ ] **Step 6: Kiểm hai vai trò bằng tay**

```bash
npm run dev
```

- Đăng nhập **admin**, mở `/quy`: thấy `＋ Ghi thu`, `＋ Ghi chi`, ô chọn, nút `Sửa` mỗi dòng, `Gán người nộp` ở dòng chưa có người nộp. Thử ghi một khoản chi 1.000đ rồi xoá lại bằng cách sửa.
- Đăng xuất, đăng nhập **thành viên**, mở `/quy`: **không** thấy bất kỳ nút nào ở trên, không có ô chọn.

- [ ] **Step 7: Commit**

```bash
git add app/quy/page.js app/quy/page.css tests/club-space-roles.test.js
git commit -m "feat(quy): dua thao tac thu chi va gan giao dich ve trang tong quan quy"
```

---

### Task 15: Xoá `app/quy/admin/`

**Files:**
- Delete: `app/quy/admin/page.js`, `app/quy/admin/admin.css`
- Modify: `tests/pickhub-ui-phase2.test.js`

- [ ] **Step 1: Xoá thư mục**

```bash
git rm -r app/quy/admin
```

- [ ] **Step 2: Gỡ tham chiếu trong test**

Trong `tests/pickhub-ui-phase2.test.js`, vòng lặp kiểm `getCurrentGroupClient` đang
liệt kê `'app/quy/admin/page.js'`. Xoá dòng đó, danh sách còn:

```js
for (const file of [
  'components/HomeHeader.js',
  'components/MobileBottomNav.js',
  'components/UserStatusBadge.js',
  'app/quy/page.js',
]) {
  assert.doesNotMatch(read(file), /getCurrentGroupClient/, `${file} must not infer role from localStorage`);
}
```

- [ ] **Step 3: Tìm tham chiếu còn sót**

Run: `grep -rn "quy/admin" app components lib tests next.config.js`
Expected: không có kết quả nào. Nếu còn, sửa hết.

- [ ] **Step 4: Chạy test và build**

Run: `node tests/club-space-roles.test.js && node tests/pickhub-ui-phase2.test.js && npm run build`
Expected: cả ba xanh; `club space role contract ok`

- [ ] **Step 5: Commit**

```bash
git add -A app/quy tests/pickhub-ui-phase2.test.js
git commit -m "chore(quy): xoa man hinh so quy cu app/quy/admin"
```

---

# PHASE D — Danh bạ và hồ sơ VĐV

---

### Task 16: Cột PHR trên `/thanh-vien` — đúng một lượt gọi

**Files:**
- Modify: `app/thanh-vien/page.js`
- Modify: `app/thanh-vien/members.css`

- [ ] **Step 1: Nạp PHR trong `loadRoster`**

`GET /api/identity/assessments` **không truyền `membershipId`** trả về toàn bộ
assessment của CLB, đã sắp `effective_from` giảm dần
(`listMembershipAssessments` trong `lib/repositories/identity/compatibilityRepository.js`).
Vì đã sắp sẵn, bản ghi **đầu tiên** gặp cho mỗi membership chính là bản mới nhất.

Thêm state và ghép vào hàm `loadRoster` đang có:

```js
    const [phrByMembership, setPhrByMembership] = useState({});
```

```js
            const [rosterResponse, assessmentResponse] = await Promise.all([
                fetch('/api/identity/roster', { cache: 'no-store' }),
                fetch('/api/identity/assessments', { cache: 'no-store' }),
            ]);
            const payload = await rosterResponse.json();
            if (!rosterResponse.ok) throw new Error(payload.error || 'Không thể tải danh sách thành viên.');
            setMembers(payload.roster || []);

            // Mot luot goi cho ca CLB. Danh sach da sap effective_from giam dan
            // nen ban ghi dau tien cua moi membership la ban moi nhat.
            const assessmentPayload = await assessmentResponse.json().catch(() => ({}));
            const latest = {};
            for (const item of assessmentPayload.assessments || []) {
                if (latest[item.membershipId] === undefined) latest[item.membershipId] = item.skillLevel;
            }
            setPhrByMembership(latest);
```

**Không** gọi `/api/identity/assessments?membershipId=...` trong vòng lặp — 30 thành viên
sẽ thành 30 request.

- [ ] **Step 2: Thêm hàm nhãn trình độ**

Đặt cạnh `formatPhr` đang có trong file:

```js
function phrLabel(value) {
    if (!Number.isFinite(Number(value))) return 'Chưa đánh giá';
    if (value < 2.5) return 'Tân thủ';
    if (value < 3.2) return 'Cơ bản';
    if (value < 4.5) return 'Khá';
    return 'Nâng cao';
}
```

- [ ] **Step 3: Thêm cột vào bảng**

Trong `<thead>`, chèn `<th>Trình độ PHR</th>` giữa `Biệt danh` và `Trạng thái`.
Trong `<tbody>`, chèn ô tương ứng:

```js
                                <td>{Number.isFinite(Number(phrByMembership[member.id]))
                                    ? <span className="phr-chip">{formatPhr(Number(phrByMembership[member.id]))} · {phrLabel(Number(phrByMembership[member.id]))}</span>
                                    : <span className="phr-chip is-empty">Chưa đánh giá</span>}</td>
```

- [ ] **Step 4: CSS**

Thêm vào `app/thanh-vien/members.css`:

```css
.phr-chip { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px; background: var(--ph-tint-indigo); color: var(--ph-indigo); font-size: 11px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
.phr-chip.is-empty { background: var(--ph-tint-neutral); color: var(--ph-muted); }
```

- [ ] **Step 5: Kiểm số lượng request**

```bash
npm run dev
```

Mở `/thanh-vien` với DevTools tab Network, lọc `assessments`.
Expected: **đúng 1 request**, không phải một request mỗi thành viên.

- [ ] **Step 6: Commit**

```bash
git add app/thanh-vien
git commit -m "feat(thanh-vien): them cot PHR bang mot luot goi assessments"
```

---

### Task 17: Diện mạo thành viên cho `/thanh-vien`

**Files:**
- Modify: `app/thanh-vien/page.js`
- Modify: `app/thanh-vien/members.css`

- [ ] **Step 1: Thêm chip lọc trình độ và nút Xem hồ sơ**

Thêm state:

```js
    const [filterSkill, setFilterSkill] = useState('all');
```

Thêm vào hàm lọc `filtered` đang có (bọc ngoài điều kiện `filterStatus` hiện tại):

```js
    const filtered = useMemo(() => members.filter((member) => {
        const matchStatus = filterStatus === 'active' ? member.status === 'active' : member.status !== 'active';
        if (!matchStatus) return false;
        if (filterSkill === 'all') return true;
        const phr = Number(phrByMembership[member.id]);
        if (!Number.isFinite(phr)) return false;
        if (filterSkill === 'tan-thu') return phr < 2.5;
        if (filterSkill === 'co-ban') return phr >= 2.5 && phr < 3.2;
        return phr >= 3.2;
    }), [members, filterStatus, filterSkill, phrByMembership]);
```

Chip lọc chỉ hiện với thành viên (admin đã có bộ lọc trạng thái riêng):

```js
                {!canManageRoster && state.kind === 'ready' && (
                    <div className="members-skillfilter" role="group" aria-label="Lọc theo trình độ">
                        {[
                            { key: 'all', label: 'Tất cả trình độ' },
                            { key: 'tan-thu', label: 'Tân thủ (1,0–2,5)' },
                            { key: 'co-ban', label: 'Cơ bản (2,5–3,2)' },
                            { key: 'kha', label: 'Khá (3,2 trở lên)' },
                        ].map((chip) => (
                            <button
                                key={chip.key}
                                type="button"
                                className={`skill-chip${filterSkill === chip.key ? ' is-active' : ''}`}
                                aria-pressed={filterSkill === chip.key}
                                onClick={() => setFilterSkill(chip.key)}
                            >{chip.label}</button>
                        ))}
                    </div>
                )}
```

Cột cuối bảng đổi theo vai trò — thay điều kiện `{canManageRoster && <th>Quản lý</th>}` bằng:

```js
                                <th>{canManageRoster ? 'Quản lý' : 'Kết nối'}</th>
```

và ô tương ứng trong `<tbody>`:

```js
                                <td>{canManageRoster ? (
                                    <div className="roster-row-actions">
                                        <button type="button" onClick={() => openEditor(member)}>Chỉnh sửa</button>
                                        {member.status === 'active' && <button type="button" className="is-danger" onClick={() => endMembership(member)}>Kết thúc</button>}
                                    </div>
                                ) : (
                                    <a className="ph-btn ph-btn--outline ph-btn--sm" href={`/thanh-vien/${member.id}`}>Xem hồ sơ</a>
                                )}</td>
```

- [ ] **Step 2: CSS chip**

```css
.members-skillfilter { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.skill-chip { min-height: 44px; padding: 8px 14px; border: 1px solid var(--ph-line); border-radius: 999px; background: var(--ph-card); font-family: inherit; font-size: 12px; font-weight: 700; color: var(--ph-ink-2); cursor: pointer; }
.skill-chip:hover { background: var(--ph-tint-neutral-strong); }
.skill-chip.is-active { background: var(--ph-indigo); border-color: var(--ph-indigo); color: var(--ph-card); }
.skill-chip:focus-visible { outline: 2px solid var(--ph-indigo); outline-offset: 2px; }
```

- [ ] **Step 3: Kiểm hai vai trò**

Mở `/thanh-vien` với vai trò thành viên: thấy chip lọc và nút `Xem hồ sơ`, **không** thấy
cột chọn, nút `Chỉnh sửa`, `Kết thúc`, `＋ Thêm VĐV`.
Với vai trò admin: ngược lại.

- [ ] **Step 4: Commit**

```bash
git add app/thanh-vien
git commit -m "feat(thanh-vien): dien mao thanh vien voi chip loc trinh do va nut xem ho so"
```

---

### Task 18: `MemberProfileView` và route `/thanh-vien/[membershipId]`

**Files:**
- Create: `components/pickhub/MemberProfileView.js`
- Create: `components/pickhub/MemberProfileView.css`
- Create: `app/thanh-vien/[membershipId]/page.js`
- Modify: `app/thong-tin/page.js`

- [ ] **Step 1: Tạo `MemberProfileView`**

Nâng cấp từ `MemberInfoPanel.js` — giữ nguyên `phrLabel` và `viDate` của file cũ,
thêm thang đo và CTA:

```js
import { phrLabel } from './MemberInfoPanel';
import './MemberProfileView.css';

function viDate(value) {
    if (!value) return 'Chưa ghi nhận';
    return new Intl.DateTimeFormat('vi-VN').format(new Date(value));
}

export default function MemberProfileView({
    athleteMembership,
    phrSnapshot = null,
    assessmentHistory = [],
    showLinkCta = false,
}) {
    if (!athleteMembership) return null;
    const athlete = athleteMembership.athlete || {};
    const displayName = athlete.displayName || athleteMembership.alias || 'VĐV';
    const score = Number(phrSnapshot?.skillLevel);
    const hasScore = Number.isFinite(score);
    const percent = hasScore ? Math.min(100, Math.max(0, (score / 5) * 100)) : 0;
    const initials = displayName.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();

    return (
        <div className="member-profile">
            {showLinkCta && (
                <section className="member-cta">
                    <span className="member-cta__ico" aria-hidden="true">🔗</span>
                    <div className="member-cta__body">
                        <span className="member-cta__kicker">Xác thực chính chủ</span>
                        <h3>Bạn chính là {displayName}?</h3>
                        <p>Liên kết tài khoản để tự quản lý chỉ số PHR, xem lịch sử đóng góp quỹ của riêng mình và nhận thông báo trực tiếp.</p>
                    </div>
                    <div className="member-cta__act">
                        <button type="button" className="ph-btn" disabled>Tạo tài khoản &amp; liên kết VĐV này</button>
                        <small>Chưa hoạt động — sẽ mở ở bước sau</small>
                    </div>
                </section>
            )}

            <article className="member-identity-card">
                <span className="member-profile-avatar" aria-hidden="true">{initials}</span>
                <div>
                    <span className="member-kicker">Hồ sơ trong CLB</span>
                    <h2>{displayName}</h2>
                    <p>Biệt danh: <strong>{athleteMembership.alias || 'Chưa đặt'}</strong></p>
                </div>
                <dl className="member-identity-facts">
                    <div><dt>Mã VĐV</dt><dd>{athleteMembership.athleteId}</dd></div>
                    <div><dt>Membership</dt><dd>{athleteMembership.id}</dd></div>
                    <div><dt>Trạng thái</dt><dd>{athleteMembership.status === 'active' ? 'Đang sinh hoạt' : 'Đã kết thúc'}</dd></div>
                    <div><dt>Ngày tham gia</dt><dd>{viDate(athleteMembership.effectiveFrom)}</dd></div>
                </dl>
            </article>

            <div className="member-profile-grid">
                <article className="member-phr-card">
                    <span className="member-kicker">PHR cá nhân</span>
                    <h2>Trình độ hiện tại</h2>
                    {hasScore ? (
                        <>
                            <div className="member-phr-score">
                                <strong>{score.toFixed(1).replace('.', ',')}</strong>
                                <span className="ph-badge ph-badge--muted">{phrLabel(score)}</span>
                            </div>
                            <div className="member-phr-meter" aria-label={`PHR ${score} trên 5`}>
                                <i style={{ width: `${percent}%` }} />
                                <b style={{ left: `${percent}%` }} />
                            </div>
                            <div className="member-phr-scale"><span>1,0 Tân thủ</span><span>2,5</span><span>3,5 Khá</span><span>5,0</span></div>
                            <p>Cập nhật {viDate(phrSnapshot.effectiveFrom || phrSnapshot.assessedAt)} · nguồn CLB.</p>
                        </>
                    ) : (
                        <div className="member-info-empty"><strong>Chưa có PHR</strong><p>Trưởng nhóm chưa ghi nhận đánh giá trình độ cho membership này.</p></div>
                    )}
                </article>

                <article className="member-history-card">
                    <span className="member-kicker">Lịch sử cập nhật</span>
                    <h2>Các mốc trình độ</h2>
                    {assessmentHistory.length > 0 ? (
                        <ol className="member-timeline">
                            {assessmentHistory.map((item, index) => (
                                <li key={item.id}>
                                    <strong>
                                        {phrLabel(item.skillLevel)} · {Number(item.skillLevel).toFixed(1).replace('.', ',')}
                                        {index === 0 && <span className="ph-badge ph-badge--gold">Mới nhất</span>}
                                    </strong>
                                    <span>{viDate(item.effectiveFrom || item.assessedAt)} · {item.source === 'correction' ? 'Hiệu chỉnh' : 'Trưởng nhóm'}</span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <div className="member-info-empty"><strong>Chưa có lịch sử</strong><p>Các lần cập nhật PHR sẽ xuất hiện tại đây.</p></div>
                    )}
                </article>
            </div>

            <aside className="member-privacy-note">
                <strong>Phiên truy cập CLB dùng chung</strong>
                <p>Đây là dữ liệu athlete/membership được chọn trong CLB, không phải xác nhận danh tính cá nhân. Thông tin liên hệ và ghi chú riêng không được hiển thị.</p>
            </aside>
        </div>
    );
}
```

`MemberInfoPanel.js` đã xuất sẵn `phrLabel` ở cuối file (`export { phrLabel };`) nên
import lại được, không cần chép logic.

- [ ] **Step 2: CSS**

Tạo `components/pickhub/MemberProfileView.css`:

```css
.member-profile { display: grid; gap: 18px; }

/* CTA lien ket ho so - nut vo hieu, cho buoc sau */
.member-cta { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; padding: 20px 22px; border-radius: var(--ph-radius-card); background: var(--ph-indigo); color: var(--ph-card); }
.member-cta__ico { display: grid; place-items: center; width: 48px; height: 48px; flex: 0 0 48px; border-radius: var(--ph-radius-sm); background: var(--ph-indigo-hover); font-size: 22px; }
.member-cta__body { flex: 1; min-width: 240px; }
.member-cta__kicker { display: block; font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: var(--ph-lavender); }
.member-cta__body h3 { margin: 4px 0 5px; font-size: 16px; font-weight: 800; letter-spacing: -.025em; }
.member-cta__body p { margin: 0; max-width: 60ch; font-size: 12px; font-weight: 500; line-height: 1.6; color: var(--ph-lavender); }
.member-cta__act { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.member-cta__act .ph-btn { background: var(--ph-card); color: var(--ph-indigo); white-space: nowrap; }
.member-cta__act .ph-btn:disabled { opacity: .92; cursor: not-allowed; }
.member-cta__act small { font-size: 10px; font-weight: 700; color: var(--ph-lavender); }

/* The danh tinh */
.member-identity-card { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; padding: 22px; background: var(--ph-card); border: 1px solid var(--ph-line); border-radius: var(--ph-radius-card); }
.member-profile-avatar { display: grid; place-items: center; width: 62px; height: 62px; flex: 0 0 62px; border-radius: 999px; background: var(--ph-lavender); color: var(--ph-indigo); font-size: 20px; font-weight: 800; }
.member-kicker { display: block; font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: var(--ph-muted); }
.member-identity-card h2 { margin: 4px 0; font-size: 22px; font-weight: 800; letter-spacing: -.03em; }
.member-identity-card p { margin: 0; font-size: 12px; font-weight: 600; color: var(--ph-muted); }
/* flex-basis 460px la bat buoc: thieu no thi khoi thong tin don thanh mot cot
   va de trong mot mang giua the. */
.member-identity-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 12px; margin: 0 0 0 auto; flex: 1 1 460px; max-width: 620px; }
.member-identity-facts > div { padding: 10px 14px; border-radius: var(--ph-radius-xs); background: var(--ph-tint-neutral-strong); border: 1px solid var(--ph-line); }
.member-identity-facts dt { font-size: 10px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--ph-muted); }
.member-identity-facts dd { margin: 4px 0 0; font-size: 13px; font-weight: 800; }

/* PHR va lich su */
.member-profile-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
@media (max-width: 1023px) { .member-profile-grid { grid-template-columns: 1fr; } }
.member-phr-card, .member-history-card { padding: 22px; background: var(--ph-card); border: 1px solid var(--ph-line); border-radius: var(--ph-radius-card); }
.member-phr-card h2, .member-history-card h2 { margin: 4px 0 0; font-size: 17px; font-weight: 800; letter-spacing: -.02em; }
.member-phr-score { display: flex; align-items: baseline; gap: 10px; margin: 14px 0 4px; }
.member-phr-score strong { font-size: 42px; font-weight: 800; letter-spacing: -.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.member-phr-meter { position: relative; height: 8px; margin: 18px 0 8px; border-radius: 999px; background: var(--ph-tint-neutral); }
.member-phr-meter i { display: block; height: 100%; border-radius: 999px; background: var(--ph-indigo); }
.member-phr-meter b { position: absolute; top: -5px; width: 18px; height: 18px; border-radius: 999px; background: var(--ph-card); border: 4px solid var(--ph-indigo); transform: translateX(-9px); }
.member-phr-scale { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; color: var(--ph-muted); }
.member-phr-card p { margin: 16px 0 0; font-size: 12px; font-weight: 600; color: var(--ph-muted); }

.member-timeline { list-style: none; margin: 14px 0 0; padding: 0; }
.member-timeline li { position: relative; padding: 0 0 18px 22px; border-left: 2px solid var(--ph-line); }
.member-timeline li:last-child { padding-bottom: 0; border-left-color: transparent; }
.member-timeline li::before { content: ""; position: absolute; left: -7px; top: 2px; width: 12px; height: 12px; border-radius: 999px; background: var(--ph-card); border: 3px solid var(--ph-line); }
.member-timeline li:first-child::before { border-color: var(--ph-indigo); }
/* strong phai la flex: neu khong, badge "Moi nhat" bi keo dai het dong. */
.member-timeline strong { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; }
.member-timeline span { display: block; margin-top: 3px; font-size: 11px; font-weight: 600; color: var(--ph-muted); line-height: 1.5; }

.member-info-empty { padding: 16px 0 0; }
.member-info-empty strong { display: block; font-size: 13px; font-weight: 800; }
.member-info-empty p { margin: 4px 0 0; font-size: 12px; font-weight: 600; color: var(--ph-muted); }

.member-privacy-note { padding: 16px 18px; border-radius: var(--ph-radius-sm); background: var(--ph-tint-neutral-strong); border: 1px solid var(--ph-line); font-size: 12px; font-weight: 600; color: var(--ph-muted); line-height: 1.6; }
.member-privacy-note strong { display: block; margin-bottom: 4px; color: var(--ph-ink-2); font-weight: 800; }

/* Dung chung voi /thong-tin - chuyen tu app/thong-tin/page.css sang day */
.member-info-page { width: 100%; }
.member-info-heading { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; justify-content: space-between; margin-bottom: 22px; }
.member-info-heading h1 { margin: 6px 0 8px; font-size: 28px; font-weight: 800; letter-spacing: -.03em; }
.member-info-heading > div > span { display: block; font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: var(--ph-muted); }
.member-info-heading p { margin: 0; font-size: 13px; font-weight: 500; color: var(--ph-muted); line-height: 1.55; max-width: 62ch; }
```

Hai comment trong CSS trên đánh dấu đúng hai lỗi đã gặp khi dựng mockup — giữ nguyên
chúng để người sau không xoá nhầm.

Sau khi thêm hai nhóm `.member-info-page` và `.member-info-heading` vào đây,
**xoá chúng khỏi `app/thong-tin/page.css`** để không có hai định nghĩa tranh nhau.

- [ ] **Step 3: Tạo route hồ sơ**

Tạo `app/thanh-vien/[membershipId]/page.js`:

```js
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import MemberProfileView from '@/components/pickhub/MemberProfileView';

export default function MemberProfilePage() {
    const params = useParams();
    const membershipId = String(params?.membershipId || '');
    const [state, setState] = useState({ kind: 'loading', message: 'Đang tải hồ sơ…' });
    const [membership, setMembership] = useState(null);
    const [assessments, setAssessments] = useState([]);
    const [role, setRole] = useState('member');

    useEffect(() => {
        if (!membershipId) return undefined;
        const controller = new AbortController();

        async function load() {
            try {
                const sessionResponse = await fetch('/api/groups/session', { cache: 'no-store', signal: controller.signal });
                const sessionView = await sessionResponse.json();
                if (!sessionView.permissions?.canViewClub) {
                    setState({ kind: 'forbidden', message: 'Phiên CLB không hợp lệ hoặc đã hết hạn.' });
                    return;
                }
                setRole(sessionView.session?.role || 'member');

                const [rosterResponse, assessmentResponse] = await Promise.all([
                    fetch('/api/identity/roster', { cache: 'no-store', signal: controller.signal }),
                    fetch(`/api/identity/assessments?membershipId=${encodeURIComponent(membershipId)}`, { cache: 'no-store', signal: controller.signal }),
                ]);
                const rosterPayload = await rosterResponse.json();
                if (!rosterResponse.ok) throw new Error(rosterPayload.error || 'Không thể tải hồ sơ.');
                const found = (rosterPayload.roster || []).find((item) => String(item.id) === membershipId);
                if (!found) {
                    setState({ kind: 'empty', message: 'Không tìm thấy hồ sơ này trong CLB.' });
                    return;
                }
                setMembership(found);
                const assessmentPayload = await assessmentResponse.json().catch(() => ({}));
                setAssessments(assessmentPayload.assessments || []);
                setState({ kind: 'ready', message: '' });
            } catch (error) {
                if (error.name !== 'AbortError') setState({ kind: 'error', message: error.message || 'Không tải được hồ sơ.' });
            }
        }

        load();
        return () => controller.abort();
    }, [membershipId]);

    return (
        <div className="member-info-page">
            <header className="member-info-heading">
                <div>
                    <span>Hồ sơ athlete / membership</span>
                    <h1>Thông tin thành viên</h1>
                    <p>Dữ liệu công khai của membership trong CLB.</p>
                </div>
                <a className="ph-btn ph-btn--outline" href="/thanh-vien">← Về danh bạ</a>
            </header>

            {state.kind === 'ready'
                ? <MemberProfileView
                    athleteMembership={membership}
                    phrSnapshot={assessments[0] || null}
                    assessmentHistory={assessments}
                    showLinkCta={role === 'member'}
                />
                : <section className="ph-state" role={state.kind === 'ready' ? 'status' : 'alert'}>
                    <h2 className="ph-state__title">
                        {state.kind === 'loading' ? 'Đang tải hồ sơ' : state.kind === 'empty' ? 'Không tìm thấy hồ sơ' : 'Chưa mở được hồ sơ'}
                    </h2>
                    <p className="ph-state__text">{state.message}</p>
                </section>}
        </div>
    );
}
```

Route này nằm dưới `app/thanh-vien/` nên đã được `app/thanh-vien/layout.js` bọc `AppShell`,
không cần tự render shell.

Trang dùng lại class `.member-info-page` và `.member-info-heading` đã có sẵn trong
`app/thong-tin/page.css`. Vì CSS trong Next App Router là toàn cục khi import, cách sạch
là **chuyển hai nhóm class đó sang `MemberProfileView.css`** và để `app/thong-tin/page.css`
import chúng, thay vì nhân bản.

- [ ] **Step 4: `/thong-tin` dùng chung component**

Trong `app/thong-tin/page.js`, đổi import và chỗ render:

```js
import MemberProfileView from '@/components/pickhub/MemberProfileView';
```

```js
                    : <MemberProfileView
                        athleteMembership={membership}
                        phrSnapshot={assessments[0] || null}
                        assessmentHistory={assessments}
                        showLinkCta
                    />}
```

Trang `/thong-tin` chỉ dành cho vai trò thành viên (đã có guard sẵn ở đầu file) nên
`showLinkCta` luôn bật.

- [ ] **Step 5: Kiểm**

```bash
npm run dev
```

- `/thanh-vien` vai trò thành viên → bấm `Xem hồ sơ` → sang `/thanh-vien/<id>`, thấy CTA liên kết, nút bị vô hiệu.
- Breadcrumb ở top bar hiện `Hồ sơ vận động viên`, mục `Thành viên CLB` ở sidebar vẫn sáng.
- `/thanh-vien/999999` (id không có thật) → hiện "Không tìm thấy hồ sơ này trong CLB", không trắng trang.
- `/thong-tin` vẫn chạy như cũ.

- [ ] **Step 6: Chạy test phase 2**

Run: `node tests/pickhub-ui-phase2.test.js`
Expected: PASS.

> **Cảnh báo:** test này có assert `combinedUi` không được chứa `tạo tài khoản` (không
> phân biệt hoa thường), quét các file trong mảng `requiredFiles`. `MemberProfileView.js`
> **không** nằm trong mảng đó nên CTA không làm đỏ test. Nếu ai thêm file này vào
> `requiredFiles` thì phải nới assert đó — CTA là quyết định đã duyệt của sản phẩm.

- [ ] **Step 7: Commit**

```bash
git add components/pickhub/MemberProfileView.js components/pickhub/MemberProfileView.css app/thanh-vien app/thong-tin
git commit -m "feat(ho-so): MemberProfileView dung chung cho /thanh-vien/[id] va /thong-tin"
```

---

# PHASE E — BXH

---

### Task 19: Dựng lại dòng xếp hạng theo bản thiết kế

**Files:**
- Modify: `app/bxh/page.js`
- Modify: `app/bxh/page.css`

**Logic tính toán giữ nguyên tuyệt đối.** Chỉ đổi lớp trình bày.

- [ ] **Step 1: Đổi cấu trúc mỗi dòng**

Thay khối `<article className="ph-bxh-item">` hiện có bằng:

```js
                                            <article className="ph-bxh-item" key={row.key}>
                                                <div className="ph-bxh-item__left">
                                                    <span className="ph-bxh-item__av" aria-hidden="true">{initials(row.name)}</span>
                                                    <div className="ph-bxh-item__body">
                                                        <div className="ph-bxh-item__name">
                                                            <span className="nm">{row.name}</span>
                                                            {row.streak >= 2 && <span className="ph-bxh-tag ph-bxh-tag--brand">Chuỗi {row.streak}</span>}
                                                            {row.badges.map((badge) => <span className="ph-bxh-tag ph-bxh-tag--gold" key={badge.kind}>{badge.label}</span>)}
                                                        </div>
                                                        <p className="ph-bxh-item__sub">Lượt góp: <strong>{row.transactionCount}</strong></p>
                                                    </div>
                                                </div>
                                                <div className="ph-bxh-item__right">
                                                    <div>
                                                        <strong className="ph-bxh-item__amt">{amountText(row.amount)}</strong>
                                                        <div className="ph-bxh-bar ph-bxh-bar--fixed"><span style={{ width: `${width}%` }} /></div>
                                                    </div>
                                                    <span className="ph-bxh-item__no">#{row.rank}</span>
                                                </div>
                                            </article>
```

Biến `width` và `multiple` đang tính ở dòng trên vẫn giữ. Dòng `{multiple && ...}` đặt
lại vào trong `.ph-bxh-item__body`, sau `.ph-bxh-item__sub`.

- [ ] **Step 2: CSS**

Trong `app/bxh/page.css`, thay nhóm `.ph-bxh-item*` bằng:

```css
.ph-bxh-item { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 0; border-bottom: 1px solid var(--ph-line); }
.ph-bxh-item:last-child { border-bottom: 0; }
.ph-bxh-item__left { display: flex; align-items: center; gap: 13px; min-width: 0; }
.ph-bxh-item__av { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 40px; border-radius: var(--ph-radius-sm); background: var(--ph-lavender); color: var(--ph-indigo); font-size: 14px; font-weight: 800; }
.ph-bxh-item__body { min-width: 0; }
.ph-bxh-item__name { display: flex; align-items: center; gap: 7px; min-width: 0; }
.ph-bxh-item__name .nm { font-size: 13px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-bxh-item__sub { margin: 3px 0 0; font-size: 11px; font-weight: 600; color: var(--ph-muted); }
.ph-bxh-item__sub strong { color: var(--ph-ink-2); font-weight: 700; }
.ph-bxh-item__right { display: flex; align-items: center; gap: 16px; flex: 0 0 auto; }
.ph-bxh-item__amt { display: block; text-align: right; font-size: 14px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.ph-bxh-item__no { width: 26px; text-align: right; font-size: 12px; font-weight: 800; color: var(--ph-muted); font-variant-numeric: tabular-nums; }
.ph-bxh-bar { height: 6px; border-radius: 999px; background: var(--ph-tint-neutral); overflow: hidden; }
.ph-bxh-bar span { display: block; height: 100%; border-radius: 999px; background: var(--ph-indigo); }
.ph-bxh-bar--fixed { width: 128px; margin-top: 6px; }

.ph-bxh-tag { padding: 2px 6px; border-radius: 5px; font-size: 10px; font-weight: 700; white-space: nowrap; border: 1px solid transparent; }
.ph-bxh-tag--brand { background: var(--ph-tint-indigo); border-color: var(--ph-tint-indigo-line); color: var(--ph-indigo); }
.ph-bxh-tag--gold { background: var(--ph-tint-gold); border-color: var(--ph-tint-gold-line); color: var(--ph-tint-gold-text); }

@media (max-width: 520px) { .ph-bxh-bar--fixed { width: 84px; } }
```

**`width: 128px` cố định là điểm mấu chốt.** Bản cũ để bar kéo hết chiều rộng dòng
(~730px), tạo một sọc mảnh cắt ngang mỗi hàng — đó chính là lý do bản dựng đầu trông
tệ hơn bản thiết kế.

- [ ] **Step 3: Podium ba cột**

Thay `.ph-bxh-podium__grid` bằng:

```css
.ph-bxh-podium__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 640px) { .ph-bxh-podium__grid { grid-template-columns: 1fr; } }
```

Khoá cứng 3 cột. Dùng `auto-fit minmax(190px, 1fr)` thì tên dài như "ĐẶNG NGỌC DƯƠNG"
đẩy thẻ thứ ba xuống hàng riêng.

- [ ] **Step 4: Chạy test cấm hex**

Run: `npm run test:ph-ui`
Expected: PASS. Nếu đỏ, còn hex trong `app/bxh/page.css`.

- [ ] **Step 5: Kiểm mắt**

Mở `/bxh` ở 1280px và 1900px. Đối chiếu với mockup (màn `/bxh`):
bar ngắn nằm dưới số tiền, có dòng `Lượt góp`, số hạng ở mép phải, podium ba cột một hàng.

- [ ] **Step 6: Commit**

```bash
git add app/bxh
git commit -m "feat(bxh): dung lai dong xep hang theo ban thiet ke, bar co dinh 128px"
```

---

# PHASE F — Cấu hình CLB và backend QR

---

### Task 20: Migration cột `groups.fund_qr_url`

**Files:**
- Create: `database/migrations/044_group_fund_qr.sql`

- [ ] **Step 1: Xác nhận số thứ tự**

Run: `ls database/migrations/*.sql | tail -3`
Expected: cao nhất là `043_club_notifications_and_bxh_flag.sql`. Nếu đã có `044_`,
dùng số kế tiếp còn trống.

- [ ] **Step 2: Viết migration**

Tạo `database/migrations/044_group_fund_qr.sql`, theo đúng khuôn của
`011_group_branding.sql`:

```sql
-- PickHub: anh QR nhan quy cua CLB.
-- Additive, forward-only. Khong sua migration da apply.
--
-- QR chi la anh de thanh vien quet, khong co logic kem theo. Viec ghi nhan tien vao
-- van hoan toan do webhook SePay dam nhiem qua group_bank_accounts.account_number.

BEGIN;

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS fund_qr_url text;

COMMENT ON COLUMN public.groups.fund_qr_url IS
  'Anh QR nhan quy luu dang data-URL PNG (<=200KB). Chi hien thi cho phien CLB hop le, khong phoi bay qua /api/club/branding.';

COMMIT;
```

Dùng PNG chứ không WebP: QR nén mất dữ liệu bị rỗ cạnh, máy quét đọc lỗi.

- [ ] **Step 3: Apply lên Supabase**

Dùng Supabase MCP (`apply_migration`) với nội dung file trên. `CLAUDE.md` cho phép
apply trực tiếp lên database hiện hữu. Đây là thao tác **additive**, không mất dữ liệu.

- [ ] **Step 4: Kiểm cột đã có**

Chạy qua Supabase MCP (`execute_sql`):

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'fund_qr_url';
```

Expected: một dòng `fund_qr_url | text`

- [ ] **Step 5: Cập nhật sổ migration**

Run: `npm run migration:ledger`
Expected: chạy xong không lỗi

- [ ] **Step 6: Commit**

```bash
git add database/migrations/044_group_fund_qr.sql
git commit -m "feat(db): them cot groups.fund_qr_url cho anh QR nhan quy"
```

---

### Task 21: API đọc và ghi QR

**Files:**
- Modify: `app/api/club/settings/route.js`
- Create: `app/api/club/fund-qr/route.js`

- [ ] **Step 1: Cho `settings` nhận và trả `fundQrUrl`**

Trong `app/api/club/settings/route.js`:

1. Thêm `fund_qr_url` vào **cả hai** chuỗi `.select(...)` (dòng 33 và 105):

```js
        .select('id, code, name, description, logo_url, fund_qr_url, shame_badges_enabled, sepay_webhook_secret, access_version')
```

2. Trong `PATCH`, thêm xử lý ngay sau khối `logoUrl` đang có:

```js
    if (body?.fundQrUrl === null) {
        updates.fund_qr_url = null;
    } else if (typeof body?.fundQrUrl === 'string' && body.fundQrUrl) {
        if (!body.fundQrUrl.startsWith('data:image/')) {
            return NextResponse.json({ error: 'Ảnh QR không hợp lệ.' }, { status: 400 });
        }
        if (body.fundQrUrl.length > 280000) {
            return NextResponse.json({ error: 'Ảnh QR quá lớn, hãy chọn ảnh nhỏ hơn 200KB.' }, { status: 400 });
        }
        updates.fund_qr_url = body.fundQrUrl;
    }
```

Ngưỡng `280000` ký tự tương ứng ~200KB nhị phân sau khi mã hoá base64 (base64 phình ~4/3).

**Quan trọng:** `fund_qr_url` **không** được thêm vào `app/api/club/branding/route.js`.
Route đó tự khai là đường đọc công khai cho cả khách chưa đăng nhập.

- [ ] **Step 2: Tạo route đọc cho thành viên**

Tạo `app/api/club/fund-qr/route.js`:

```js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getValidatedGroupSessionFromCookies } from '@/lib/groupSession';

// QR nhan quy chi danh cho phien CLB hop le (thanh vien hoac admin).
// Khong dua vao /api/club/branding vi route do phuc vu ca khach chua dang nhap.
export async function GET() {
    const session = await getValidatedGroupSessionFromCookies();
    if (!session?.group_id) {
        return NextResponse.json({ error: 'Cần phiên CLB hợp lệ.' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
        .from('groups')
        .select('fund_qr_url')
        .eq('id', session.group_id)
        .single();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ fundQrUrl: data?.fund_qr_url || null });
}
```

- [ ] **Step 3: Kiểm quyền bằng tay**

```bash
npm run dev
```

- Ở tab ẩn danh (chưa đăng nhập): mở `http://localhost:3000/api/club/fund-qr`
  → Expected: `401` với `{"error":"Cần phiên CLB hợp lệ."}`
- Đăng nhập vai trò **thành viên** rồi mở lại → Expected: `200` với `{"fundQrUrl":null}`
- Mở `http://localhost:3000/api/club/branding` → Expected: JSON **không** chứa `fundQrUrl`

- [ ] **Step 4: Commit**

```bash
git add app/api/club/settings/route.js app/api/club/fund-qr/route.js
git commit -m "feat(api): ghi QR qua settings, doc QR qua route rieng can phien CLB"
```

---

### Task 22: Xoá endpoint tạo lại mã CLB

**Files:**
- Delete: `app/api/club/settings/regenerate-code/route.js`
- Modify: `app/admin/ClubSettings.js`

- [ ] **Step 1: Xoá endpoint**

```bash
git rm app/api/club/settings/regenerate-code/route.js
rmdir app/api/club/settings/regenerate-code 2>/dev/null || true
```

Phải xoá endpoint chứ không chỉ giấu nút — để lại thì vẫn `POST` trực tiếp được, và
hàm này nâng `access_version`, đăng xuất toàn bộ thành viên đang truy cập.

- [ ] **Step 2: Gỡ code gọi nó trong `ClubSettings.js`**

Xoá hàm `handleRegenerate` (khoảng dòng 80–95) và mọi nút gọi nó. Xoá luôn state
`regenerating` nếu có. Giữ nguyên state `qr` — đó là **QR tham gia CLB**, khác hoàn
toàn với `fundQrUrl` là **QR nhận quỹ**.

- [ ] **Step 3: Xác nhận không còn tham chiếu**

Run: `grep -rn "regenerate-code\|handleRegenerate" app components lib tests`
Expected: không có kết quả

- [ ] **Step 4: Chạy test**

Run: `node tests/club-space-roles.test.js && npm run test:admin-auth`
Expected: `club space role contract ok` và test admin-auth xanh

- [ ] **Step 5: Commit**

```bash
git add -A app/api/club/settings app/admin/ClubSettings.js
git commit -m "chore(admin): xoa endpoint tao lai ma CLB, ma CLB thanh co dinh"
```

---

### Task 23: Sub-menu neo cho trang cấu hình

**Files:**
- Create: `components/pickhub/ClubSettingsNav.js`
- Create: `components/pickhub/ClubSettingsNav.css`

- [ ] **Step 1: Viết component**

```js
'use client';

import { useEffect, useState } from 'react';
import './ClubSettingsNav.css';

const SECTIONS = [
    { id: 'set-brand', label: 'Nhận diện' },
    { id: 'set-code', label: 'Mã CLB' },
    { id: 'set-pw-admin', label: 'MK quản trị' },
    { id: 'set-pw-member', label: 'MK thành viên' },
    { id: 'set-qr', label: 'QR nhận quỹ' },
    { id: 'set-sepay', label: 'SePay' },
    { id: 'set-bank', label: 'Ngân hàng' },
];

// Vach doc nam duoi sub-menu dinh; muc nao co mep tren vuot qua vach thi dang xem.
const ACTIVE_LINE = 200;

export default function ClubSettingsNav() {
    const [activeId, setActiveId] = useState(SECTIONS[0].id);

    useEffect(() => {
        // KHONG dung IntersectionObserver: nhieu muc cung cat vung quan sat thi
        // entry ghi sau de entry truoc, gay to sang sai muc.
        function sync() {
            let current = SECTIONS[0].id;
            for (const section of SECTIONS) {
                const node = document.getElementById(section.id);
                if (node && node.getBoundingClientRect().top - ACTIVE_LINE <= 0) current = section.id;
            }
            setActiveId(current);
        }
        sync();
        window.addEventListener('scroll', sync, { passive: true });
        window.addEventListener('resize', sync);
        return () => {
            window.removeEventListener('scroll', sync);
            window.removeEventListener('resize', sync);
        };
    }, []);

    function goTo(event, id) {
        event.preventDefault();
        const node = document.getElementById(id);
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return (
        <nav className="set-nav" aria-label="Mục cấu hình">
            <span className="set-nav__lbl">Đi tới</span>
            {SECTIONS.map((section) => (
                <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={activeId === section.id ? 'is-active' : ''}
                    aria-current={activeId === section.id ? 'true' : undefined}
                    onClick={(event) => goTo(event, section.id)}
                >{section.label}</a>
            ))}
        </nav>
    );
}
```

- [ ] **Step 2: CSS**

Tạo `components/pickhub/ClubSettingsNav.css`:

```css
.set-nav { position: sticky; top: 0; z-index: 30; display: flex; gap: 8px; align-items: center; overflow-x: auto; padding: 12px 2px; margin-bottom: 18px; background: var(--ph-surface); border-bottom: 1px solid var(--ph-line); -webkit-overflow-scrolling: touch; }
.set-nav__lbl { flex: 0 0 auto; padding-right: 4px; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--ph-muted); }
.set-nav a { flex: 0 0 auto; display: flex; align-items: center; min-height: 44px; padding: 8px 14px; border: 1px solid var(--ph-line); border-radius: 999px; background: var(--ph-card); font-size: 12px; font-weight: 700; color: var(--ph-ink-2); text-decoration: none; white-space: nowrap; transition: background .15s, color .15s, border-color .15s; }
.set-nav a:hover { background: var(--ph-tint-neutral-strong); }
.set-nav a.is-active { background: var(--ph-indigo); border-color: var(--ph-indigo); color: var(--ph-card); }
.set-nav a:focus-visible { outline: 2px solid var(--ph-indigo); outline-offset: 2px; }

@media (min-width: 1120px) { .set-nav { top: 64px; } }

/* Dem cuoi trang: bat buoc, neu khong hai muc cuoi khong bao gio cuon len toi
   vach ACTIVE_LINE duoc va luon to sang sai. Dung chua bang dieu kien
   "cham day trang thi sang muc cuoi" - dieu kien do lam muc ap chot sang nham. */
.set-spacer { height: min(62vh, 540px); }
```

`top: 64px` từ 1120px vì `AppTopBar` cao 64px và dính ở `top: 0`.

- [ ] **Step 3: Commit**

```bash
git add components/pickhub/ClubSettingsNav.js components/pickhub/ClubSettingsNav.css
git commit -m "feat(admin): sub-menu neo cho trang cau hinh CLB"
```

---

### Task 24: Chia `ClubSettings` thành 7 mục

**Files:**
- Modify: `app/admin/ClubSettings.js`
- Modify: `app/admin/club-settings.css`

- [ ] **Step 1: Bọc mỗi mục bằng `<section className="set-group" id="...">`**

Sắp xếp lại JSX theo đúng thứ tự và `id` sau:

| Thứ tự | `id` | Nội dung chuyển từ đâu |
|---|---|---|
| 1 | `set-brand` | Tên CLB, mô tả, logo, huy hiệu BXH — form `handleSave` hiện có, **bỏ ô mật khẩu thành viên** |
| 2 | `set-code` | Mã CLB (chỉ đọc) + QR tham gia — khối `qr` hiện có |
| 3 | `set-pw-admin` | Form `handleChangePassword` hiện có |
| 4 | `set-pw-member` | **Mới** — xem Step 3 |
| 5 | `set-qr` | **Mới** — xem Step 4 |
| 6 | `set-sepay` | Khối `club-settings-sepay` hiện có, giữ nguyên |
| 7 | `set-bank` | Khối `club-settings-bank` hiện có, **bỏ ô tên ngân hàng** |

Render `<ClubSettingsNav />` ngay trước mục 1, và `<div className="set-spacer" aria-hidden="true" />`
sau mục 7.

- [ ] **Step 2: Mã CLB thành chỉ đọc**

Trong mục `set-code`, mã CLB render bằng:

```js
                <label className="ph-field">
                    <span className="ph-field__label">Mã CLB</span>
                    <input className="ph-field__control" value={group.code} readOnly tabIndex={-1} />
                </label>
                <p className="set-note">
                    🔒 Mã CLB là định danh cố định. Chỉ superadmin đổi trực tiếp trong Supabase.
                    Đổi mã sẽ nâng access_version và đăng xuất toàn bộ thành viên đang truy cập.
                </p>
```

- [ ] **Step 3: Mục mật khẩu thành viên riêng**

Bỏ ô `memberPassword` khỏi form `handleSave` (và bỏ `if (form.memberPassword) payload.memberPassword = ...`
trong `handleSave`), thay bằng form riêng:

```js
    const [memberPasswordForm, setMemberPasswordForm] = useState({ next: '', confirm: '' });
    const [changingMemberPassword, setChangingMemberPassword] = useState(false);

    async function handleChangeMemberPassword(event) {
        event.preventDefault();
        setError('');
        setNotice('');
        if (memberPasswordForm.next.length < 4) {
            setError('Mật khẩu thành viên cần ít nhất 4 ký tự.');
            return;
        }
        if (memberPasswordForm.next !== memberPasswordForm.confirm) {
            setError('Hai lần nhập mật khẩu thành viên không khớp.');
            return;
        }
        setChangingMemberPassword(true);
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberPassword: memberPasswordForm.next }),
        });
        const data = await res.json();
        setChangingMemberPassword(false);
        if (res.ok) {
            setMemberPasswordForm({ next: '', confirm: '' });
            setNotice('Đã đặt mật khẩu thành viên mới. Hãy gửi lại mã CLB và mật khẩu cho cả nhóm.');
        } else {
            setError(data.error || 'Không đặt được mật khẩu thành viên.');
        }
    }
```

Ô xác nhận là điểm chính của task này: trước đây mật khẩu thành viên chỉ là một ô lẻ
trong form chung, gõ nhầm là cả CLB mất quyền vào mà không ai biết.

- [ ] **Step 4: Mục QR nhận quỹ**

```js
    const [fundQrUrl, setFundQrUrl] = useState(null);

    function handlePickFundQr(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const MAX = 640;
                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                // PNG chu khong WebP: QR nen mat du lieu bi ro canh, may quet doc loi.
                const dataUrl = canvas.toDataURL('image/png');
                if (dataUrl.length > 280000) {
                    setError('Ảnh QR quá lớn, hãy chọn ảnh nhỏ hơn 200KB.');
                    return;
                }
                setError('');
                setFundQrUrl(dataUrl);
                setNotice('Đã chọn ảnh QR, bấm "Lưu QR" để áp dụng.');
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    async function handleSaveFundQr(nextValue) {
        setError('');
        setNotice('');
        const res = await fetch('/api/club/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fundQrUrl: nextValue }),
        });
        const data = await res.json();
        if (res.ok) {
            setGroup(data.group);
            setFundQrUrl(data.group.fund_qr_url || null);
            setNotice(nextValue ? 'Đã lưu ảnh QR nhận quỹ.' : 'Đã xoá ảnh QR nhận quỹ.');
        } else {
            setError(data.error || 'Không lưu được ảnh QR.');
        }
    }
```

Trong hàm nạp dữ liệu ban đầu, thêm `setFundQrUrl(data.group.fund_qr_url || null);`
cạnh dòng `setLogoUrl(...)` đang có.

JSX của mục:

```js
                <section className="set-group" id="set-qr">
                    <h3>QR nhận quỹ</h3>
                    <p>Ảnh QR chuyển khoản của CLB, hiển thị ở cột phải trang Tổng quan quỹ để thành viên quét.</p>
                    <div className="set-qr-row">
                        {fundQrUrl
                            ? <img className="set-qr-preview" src={fundQrUrl} alt="QR nhận quỹ CLB" />
                            : <span className="set-qr-empty">Chưa có ảnh QR</span>}
                        <div className="set-qr-side">
                            <label className="ph-field">
                                <span className="ph-field__label">Ảnh QR (PNG/JPG, tối đa 200KB)</span>
                                <input className="ph-field__control" type="file" accept="image/png,image/jpeg" onChange={handlePickFundQr} />
                            </label>
                            <div className="set-qr-actions">
                                <button type="button" className="ph-btn ph-btn--primary ph-btn--sm" onClick={() => handleSaveFundQr(fundQrUrl)} disabled={!fundQrUrl}>Lưu QR</button>
                                <button type="button" className="ph-btn ph-btn--danger ph-btn--sm" onClick={() => handleSaveFundQr(null)} disabled={!group.fund_qr_url}>Xoá QR</button>
                            </div>
                        </div>
                    </div>
                </section>
```

- [ ] **Step 5: Mục Ngân hàng bỏ ô tên ngân hàng**

Trong `club-settings-bank-form`, xoá `<input>` `bankForm.bankName` và bỏ `bankName`
khỏi body của `handleAddBank`. Cột `bank_name` trong bảng giữ nguyên (nullable), chỉ
bỏ khỏi giao diện.

Thêm cảnh báo ngay dưới tiêu đề mục:

```js
                    <p className="set-note set-note--warn">
                        ⚠ Đây không phải thông tin hiển thị. Webhook SePay tra đúng số tài khoản này
                        để biết tiền vào thuộc CLB nào — xoá hoặc nhập sai thì mọi giao dịch chuyển khoản
                        sẽ bị từ chối và quỹ ngừng cập nhật tự động.
                    </p>
```

- [ ] **Step 6: CSS các mục**

Thêm vào `app/admin/club-settings.css`:

```css
.set-group { padding: 20px; scroll-margin-top: 178px; background: var(--ph-card); border: 1px solid var(--ph-line); border-radius: var(--ph-radius-card); margin-bottom: 16px; }
.set-group h3 { margin: 0 0 4px; font-size: 15px; font-weight: 800; letter-spacing: -.02em; }
.set-group > p { margin: 0 0 14px; font-size: 12px; font-weight: 500; color: var(--ph-muted); }
.set-note { display: block; padding: 11px 13px; margin-top: 12px; border-radius: var(--ph-radius-xs); background: var(--ph-tint-neutral-strong); border: 1px solid var(--ph-line); font-size: 11px; font-weight: 600; color: var(--ph-muted); line-height: 1.6; }
.set-note--warn { background: var(--ph-tint-gold); border-color: var(--ph-tint-gold-line); color: var(--ph-tint-gold-text); }
.set-qr-row { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
.set-qr-preview { width: 168px; height: 168px; flex: 0 0 168px; object-fit: contain; padding: 11px; border-radius: var(--ph-radius-sm); background: var(--ph-card); border: 1px solid var(--ph-line); }
.set-qr-empty { display: grid; place-items: center; width: 168px; height: 168px; flex: 0 0 168px; border-radius: var(--ph-radius-sm); border: 2px dashed var(--ph-line); background: var(--ph-tint-neutral-strong); color: var(--ph-muted); font-size: 12px; font-weight: 700; text-align: center; padding: 12px; }
.set-qr-side { flex: 1; min-width: 210px; }
.set-qr-actions { display: flex; gap: 8px; margin-top: 12px; }
```

`scroll-margin-top: 178px` để tiêu đề không bị top bar (64px) và sub-menu (~68px) che.

- [ ] **Step 7: Kiểm sub-menu**

```bash
npm run dev
```

Mở `/admin` và bấm lần lượt cả 7 chip.
Expected: mỗi mục cuộn tới **cùng một vị trí** dưới sub-menu, và chip tương ứng sáng lên.
Đặc biệt kiểm **`SePay` và `Ngân hàng`** — hai mục cuối; nếu chúng sáng sai thì
`.set-spacer` chưa được render hoặc chiều cao chưa đủ.

Cuộn tay từ đầu xuống cuối, kiểm chip sáng đổi theo đúng mục đang xem.

- [ ] **Step 8: Kiểm mật khẩu**

- Đổi mật khẩu thành viên với hai ô **không khớp** → Expected: báo "Hai lần nhập mật khẩu thành viên không khớp.", **không** gọi API.
- Đổi với hai ô khớp, 4 ký tự → Expected: lưu thành công. Đăng xuất, đăng nhập lại bằng mật khẩu mới.
- Ô mật khẩu thành viên **không còn** trong form "Lưu thay đổi" của mục Nhận diện.

- [ ] **Step 9: Commit**

```bash
git add app/admin
git commit -m "feat(admin): chia cau hinh thanh 7 muc, tach mat khau thanh vien, them QR nhan quy"
```

---

### Task 25: Hiển thị QR ở cột phải `/quy`

**Files:**
- Modify: `app/quy/page.js`
- Modify: `app/quy/page.css`

- [ ] **Step 1: Nạp QR**

```js
    const [fundQrUrl, setFundQrUrl] = useState(null);
```

Trong `useEffect` nạp dữ liệu, sau khi biết `canViewClub`:

```js
                fetch('/api/club/fund-qr', { cache: 'no-store' })
                    .then((response) => (response.ok ? response.json() : null))
                    .then((data) => { if (active) setFundQrUrl(data?.fundQrUrl || null); })
                    .catch(() => {});
```

- [ ] **Step 2: Render trong cột phải**

Đặt cạnh khối sự kiện quỹ:

```js
                {fundQrUrl && (
                    <section className="fund-qr-card">
                        <span className="fund-qr-card__kicker">Chuyển khoản</span>
                        <h2>QR nhận quỹ CLB</h2>
                        <img src={fundQrUrl} alt="Mã QR chuyển khoản vào quỹ CLB" />
                        <p>Quét để chuyển khoản vào quỹ CLB. Hệ thống tự ghi nhận vào lịch sử giao dịch và BXH sau 1–3 phút.</p>
                    </section>
                )}
```

`{fundQrUrl && ...}` là bắt buộc — chưa upload thì **ẩn cả khối**, không hiện ô trống.

- [ ] **Step 3: CSS**

```css
.fund-qr-card { padding: 18px; text-align: center; background: var(--ph-card); border: 1px solid var(--ph-line); border-radius: var(--ph-radius-card); box-shadow: var(--ph-shadow-soft); }
.fund-qr-card__kicker { display: block; font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; color: var(--ph-muted); }
.fund-qr-card h2 { margin: 4px 0 0; font-size: 15px; font-weight: 800; letter-spacing: -.02em; }
.fund-qr-card img { display: block; width: 100%; max-width: 220px; height: auto; margin: 12px auto 0; padding: 11px; border-radius: var(--ph-radius-sm); background: var(--ph-card); border: 1px solid var(--ph-line); }
.fund-qr-card p { margin: 12px 0 0; font-size: 11px; font-weight: 600; color: var(--ph-muted); line-height: 1.6; }
```

- [ ] **Step 4: Kiểm đầu-cuối**

1. Vai trò admin: `/admin` → mục QR nhận quỹ → upload một ảnh QR → `Lưu QR`
2. Mở `/quy` → Expected: thấy đúng ảnh đó ở cột phải
3. Đăng xuất, đăng nhập vai trò **thành viên** → `/quy` → Expected: vẫn thấy ảnh QR
4. Quay lại admin, `/admin` → `Xoá QR` → mở `/quy` → Expected: **khối biến mất hẳn**, không có ô trống

- [ ] **Step 5: Commit**

```bash
git add app/quy
git commit -m "feat(quy): hien thi QR nhan quy o cot phai"
```

---

### Task 26: Chốt toàn bộ

**Files:** không sửa file nào, chỉ chạy và kiểm.

- [ ] **Step 1: Hồi quy đầy đủ**

Run: `npm run test:regression && node tests/club-space-navigation.test.js && node tests/club-space-roles.test.js`
Expected: tất cả xanh

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: thành công, không thêm cảnh báo mới so với `evidence/phase-4-final-build-2026-09-06.txt`

- [ ] **Step 3: Đối chiếu 9 tiêu chí hoàn thành của spec**

Mở spec mục 14 và tick từng dòng. Riêng ba dòng dễ bỏ sót:

- **Redirect một chặng:** mở DevTools tab Network, bật "Preserve log", vào lần lượt
  `/quy/members`, `/quy/bxh`, `/members`, `/admin?section=roster`, `/admin?section=fund`.
  Expected: mỗi đường **chỉ một** chặng chuyển hướng tới đích cuối.
- **Ba mốc responsive:** 1400px / 900px / 380px trên cả `/quy`, `/thanh-vien`, `/bxh`, `/admin`.
- **SePay vẫn chạy:** mở `/admin` mục Ngân hàng, xác nhận số tài khoản của CLB vẫn còn
  và vẫn thêm/xoá được. **Đây là điều kiện sống còn** — thiếu nó thì webhook không định
  tuyến được và quỹ ngừng cập nhật tự động.

- [ ] **Step 4: Ghi chứng cứ**

```bash
npm run test:regression > evidence/club-space-ci-2026-09-09.txt 2>&1
npm run build > evidence/club-space-build-2026-09-09.txt 2>&1
git add evidence/
git commit -m "chore(evidence): ket qua CI va build sau khi doi dieu huong khong gian CLB"
```

---

## Ghi chú cho người thực thi

**Thứ tự phase không đổi được.** Phase B dựa vào `getBreadcrumbLabel` của Phase A;
Phase C xoá `app/quy/admin` mà `tests/pickhub-ui-phase2.test.js` còn tham chiếu cho tới
Task 15; Phase F Task 25 cần route của Task 21.

**Ba lỗi đã gặp khi dựng mockup, đừng giẫm lại:**

1. Thiếu `margin: 0 auto` trên `.ph-shell__main` → nội dung dính trái trên màn rộng.
2. Dùng `<table>` cho danh sách giao dịch → cuộn ngang ở 1280px, che mất cột thao tác.
3. Dùng `IntersectionObserver` cho sub-menu neo, và thiếu `.set-spacer` → chip sáng sai mục.

**Điều tuyệt đối không được làm:** xoá ô số tài khoản ngân hàng. Nó là khoá định tuyến
của webhook SePay, không phải thông tin hiển thị.
