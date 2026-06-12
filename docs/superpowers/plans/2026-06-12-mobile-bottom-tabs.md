# Mobile Bottom Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mobile hamburger/drawer navigation with fixed bottom tabs across Fund and Tournament pages while preserving desktop navigation.

**Architecture:** Add mobile-only bottom tab markup inside the existing header/navbar components so each app area owns its role-aware links. Use shared CSS patterns in the existing component styles and add global mobile bottom padding to prevent fixed tabs from covering page content.

**Tech Stack:** Next.js 14 App Router, React client components, plain CSS, Node-based source/CSS verification, `next build`.

---

## File Structure

- Modify `components/HomeHeader.js`: remove mobile hamburger state from the Fund header path and render a mobile-only bottom tab bar for `/quy`, `/quy/members`, `/giai-dau`, and optional `/quy/admin`.
- Modify `components/HomeHeader.css`: hide top navigation on mobile, add `.mobile-bottom-tabs` styles, and keep desktop behavior unchanged.
- Modify `components/TournamentNavBar.js`: keep desktop tournament navigation, remove mobile menu state/rendering, and render a mobile-only bottom tab bar using role-aware links.
- Modify `components/TournamentNavBar.css`: remove mobile dropdown behavior, add tournament-themed bottom tab styles, and keep desktop behavior unchanged.
- Modify `app/globals.css`: add mobile safe-area padding for fixed bottom tabs.
- Create `tests/mobile-bottom-tabs.test.js`: verify source/CSS expectations that protect the new mobile navigation contract.
- Modify `package.json`: add a `test:mobile-nav` script for the Node verification.

### Task 1: Add Failing Mobile Navigation Contract Test

**Files:**
- Create: `tests/mobile-bottom-tabs.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/mobile-bottom-tabs.test.js`:

```js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const homeHeaderJs = read('components/HomeHeader.js');
const homeHeaderCss = read('components/HomeHeader.css');
const tournamentNavJs = read('components/TournamentNavBar.js');
const tournamentNavCss = read('components/TournamentNavBar.css');
const globalsCss = read('app/globals.css');

assert(
  homeHeaderJs.includes('home-mobile-bottom-tabs'),
  'HomeHeader should render a Fund mobile bottom tab bar.'
);

assert(
  homeHeaderJs.includes('/quy/members') && homeHeaderJs.includes('/giai-dau') && homeHeaderJs.includes('/quy/admin'),
  'HomeHeader mobile tabs should include members, tournament, and admin links.'
);

assert(
  !homeHeaderJs.includes('useState') && !homeHeaderJs.includes('hamburger'),
  'HomeHeader should not keep mobile hamburger state or markup.'
);

assert(
  homeHeaderCss.includes('position: fixed') && homeHeaderCss.includes('bottom: 0') && homeHeaderCss.includes('home-mobile-bottom-tabs'),
  'HomeHeader CSS should fix the Fund mobile tabs to the bottom.'
);

assert(
  tournamentNavJs.includes('tournament-mobile-bottom-tabs'),
  'TournamentNavBar should render a Tournament mobile bottom tab bar.'
);

assert(
  tournamentNavJs.includes('/giai-dau/live') && tournamentNavJs.includes('/giai-dau/admin') && tournamentNavJs.includes('/giai-dau/captain'),
  'Tournament mobile tabs should include live plus role-specific admin/captain destinations.'
);

assert(
  !tournamentNavJs.includes('isMenuOpen') && !tournamentNavJs.includes('mobile-menu'),
  'TournamentNavBar should not keep mobile dropdown menu state or markup.'
);

assert(
  tournamentNavCss.includes('position: fixed') && tournamentNavCss.includes('bottom: 0') && tournamentNavCss.includes('tournament-mobile-bottom-tabs'),
  'TournamentNavBar CSS should fix the Tournament mobile tabs to the bottom.'
);

assert(
  globalsCss.includes('--mobile-bottom-nav-height') && globalsCss.includes('safe-area-inset-bottom'),
  'Global CSS should reserve mobile safe-area space for the fixed bottom nav.'
);

console.log('mobile bottom tabs contract ok');
```

Modify `package.json` scripts:

```json
"test:mobile-nav": "node tests/mobile-bottom-tabs.test.js"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:mobile-nav`

Expected: FAIL with `HomeHeader should render a Fund mobile bottom tab bar.`

### Task 2: Implement Fund Mobile Bottom Tabs

**Files:**
- Modify: `components/HomeHeader.js`
- Modify: `components/HomeHeader.css`

- [ ] **Step 1: Update HomeHeader markup**

Use `usePathname` only. Remove `useState`, `menuOpen`, `toggleMenu`, `closeMenu`, the hamburger button, and mobile drawer behavior. Add a `mobileTabs` array and render:

```jsx
const mobileTabs = [
  { href: '/quy', label: 'Quỹ', icon: '💰' },
  { href: '/quy/members', label: 'TV', icon: '👥' },
  { href: '/giai-dau', label: 'Giải', icon: '🏆' },
];

if (showAdmin) {
  mobileTabs.push({ href: '/quy/admin', label: 'Admin', icon: '⚙️' });
}
```

Render the tab bar after the header container:

```jsx
<nav className="home-mobile-bottom-tabs" aria-label="Điều hướng chính trên mobile">
  {mobileTabs.map((link) => (
    <a
      key={link.href}
      href={link.href}
      className={`mobile-tab-link ${pathname === link.href ? 'active' : ''}`}
    >
      <span className="mobile-tab-icon" aria-hidden="true">{link.icon}</span>
      <span className="mobile-tab-label">{link.label}</span>
    </a>
  ))}
</nav>
```

- [ ] **Step 2: Update HomeHeader CSS**

Add desktop-hidden bottom tabs and mobile styling:

```css
.home-mobile-bottom-tabs {
    display: none;
}

@media (max-width: 768px) {
    .header-nav {
        display: none;
    }

    .hamburger {
        display: none;
    }

    .home-mobile-bottom-tabs {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1100;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
        min-height: var(--mobile-bottom-nav-height, 72px);
        padding: 7px 8px calc(8px + env(safe-area-inset-bottom));
        background: rgba(255, 255, 255, 0.96);
        border-top: 1px solid #E2E8F0;
        box-shadow: 0 -10px 24px rgba(15, 23, 42, 0.1);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
    }

    .mobile-tab-link {
        min-width: 0;
        min-height: 52px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        border-radius: 8px;
        color: #64748B;
        text-decoration: none;
        font-size: 11px;
        font-weight: 700;
    }

    .mobile-tab-link.active {
        background: #EFF6FF;
        color: #2563EB;
    }

    .mobile-tab-icon {
        font-size: 18px;
        line-height: 1;
    }

    .mobile-tab-label {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}
```

- [ ] **Step 3: Run contract test**

Run: `npm run test:mobile-nav`

Expected: Still FAIL on TournamentNavBar until Task 3.

### Task 3: Implement Tournament Mobile Bottom Tabs

**Files:**
- Modify: `components/TournamentNavBar.js`
- Modify: `components/TournamentNavBar.css`

- [ ] **Step 1: Update TournamentNavBar markup**

Remove `isMenuOpen`, the mobile menu toggle, and the conditional `.mobile-menu`. Add `getMobileNavLinks()`:

```js
function getMobileNavLinks() {
  const links = [
    { href: '/quy', label: 'Home', icon: '🏠', roles: ['admin', 'captain', 'member', 'guest'] },
    { href: '/giai-dau', label: 'Điều lệ', icon: '📜', roles: ['admin', 'captain', 'member', 'guest'] },
    { href: '/giai-dau/live', label: 'Live', icon: '🔴', roles: ['admin', 'captain', 'member', 'guest'] },
    { href: '/giai-dau/admin', label: 'Admin', icon: '⚙️', roles: ['admin'] },
    { href: '/giai-dau/captain', label: 'Captain', icon: '👤', roles: ['guest'] },
  ];

  return links.filter((link) => link.roles.includes(userRole)).slice(0, 4);
}
```

Render:

```jsx
<nav className="tournament-mobile-bottom-tabs" aria-label="Điều hướng giải đấu trên mobile">
  {getMobileNavLinks().map((link) => (
    <a key={link.href} href={link.href} className="tournament-mobile-tab-link">
      <span className="tournament-mobile-tab-icon" aria-hidden="true">{link.icon}</span>
      <span className="tournament-mobile-tab-label">{link.label}</span>
    </a>
  ))}
</nav>
```

Use `usePathname` and add `active` class when `pathname === link.href`.

- [ ] **Step 2: Update TournamentNavBar CSS**

Add desktop-hidden bottom tabs and mobile styling:

```css
.tournament-mobile-bottom-tabs {
    display: none;
}

@media (max-width: 768px) {
    .mobile-menu-toggle,
    .mobile-menu {
        display: none;
    }

    .tournament-mobile-bottom-tabs {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1100;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
        min-height: var(--mobile-bottom-nav-height, 72px);
        padding: 7px 8px calc(8px + env(safe-area-inset-bottom));
        background: rgba(15, 23, 42, 0.97);
        border-top: 1px solid rgba(139, 92, 246, 0.35);
        box-shadow: 0 -12px 26px rgba(0, 0, 0, 0.25);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
    }

    .tournament-mobile-tab-link {
        min-width: 0;
        min-height: 52px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.72);
        text-decoration: none;
        font-size: 11px;
        font-weight: 700;
    }

    .tournament-mobile-tab-link.active {
        background: rgba(139, 92, 246, 0.22);
        color: #ffffff;
    }

    .tournament-mobile-tab-icon {
        font-size: 18px;
        line-height: 1;
    }

    .tournament-mobile-tab-label {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}
```

- [ ] **Step 3: Run contract test**

Run: `npm run test:mobile-nav`

Expected: PASS with `mobile bottom tabs contract ok`.

### Task 4: Add Global Mobile Bottom Padding

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add safe-area spacing**

Add:

```css
:root {
    --mobile-bottom-nav-height: 72px;
}

@media (max-width: 768px) {
    body {
        padding-bottom: calc(var(--mobile-bottom-nav-height) + env(safe-area-inset-bottom));
    }
}
```

- [ ] **Step 2: Run contract test**

Run: `npm run test:mobile-nav`

Expected: PASS.

### Task 5: Build Verification

**Files:**
- No code changes unless verification exposes an issue.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: PASS or existing project lint prompt/config issue documented.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Inspect git diff**

Run: `git diff -- components/HomeHeader.js components/HomeHeader.css components/TournamentNavBar.js components/TournamentNavBar.css app/globals.css package.json tests/mobile-bottom-tabs.test.js`

Expected: Diff contains only mobile bottom tab implementation and test/script changes.

### Task 6: Manual Mobile Check

**Files:**
- No code changes unless visual check exposes an issue.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

Expected: Local Next.js server starts and prints a localhost URL.

- [ ] **Step 2: Check mobile viewport**

Open the app at the dev server URL and inspect:

- `/quy`
- `/quy/members`
- `/giai-dau`
- `/giai-dau/live`

Expected:

- Bottom tabs show on mobile.
- Hamburger/drawer menu does not show on mobile.
- Desktop navigation still shows on wider viewport.
- Page content is not hidden behind the bottom tab bar.

