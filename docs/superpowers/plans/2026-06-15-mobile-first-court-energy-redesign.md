# Mobile-First Court Energy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Court Energy mobile-first redesign across PickHub's UI without changing business logic, API behavior, state transitions, or data contracts.

**Architecture:** Centralize Court Energy tokens in `app/globals.css`, then progressively retheme existing CSS modules while preserving class names and React logic. Add a lightweight CSS contract test that checks the approved palette, mobile bottom-nav safe area, and key visual hooks so the redesign has regression coverage without requiring browser screenshots in CI.

**Tech Stack:** Next.js 14 App Router, React 18, JavaScript, plain CSS modules imported by route/component files, Node-based contract tests.

---

## File Structure

Modify:

- `app/globals.css`: Court Energy tokens, global body surface, shared compatibility variables, safe-area bottom spacing.
- `app/page.css`: group entry screen, create/join rows, modals.
- `components/HomeHeader.css`: sticky desktop/mobile shell header.
- `components/MobileBottomNav.css`: mobile-first floating bottom navigation.
- `components/UserStatusBadge.css`: role/session badge styling.
- `components/TournamentModuleNav.css`: tournament subnav treatment.
- `app/quy/page.css`: fund stats, event cards, transaction list, tabs, modal styles.
- `app/quy/members/members.css`: member list and admin controls.
- `app/admin/admin-center.css`: unified admin shell and section tabs.
- `app/admin/club-settings.css`: settings panels, QR/code, bank/SePay forms.
- `app/quy/admin/admin.css`: fund admin embedded surface.
- `app/giai-dau/dashboard.css`: tournament dashboard cards.
- `app/giai-dau/tournament.css`: tournament detail rules/schedule styling.
- `app/giai-dau/admin/admin-tournament.css`: tournament admin console/list/forms.
- `app/giai-dau/admin/pairings/admin-pairings.css`: pairings admin screen.
- `app/giai-dau/live/live.css`: live tournament screen and scoreboard states.
- `app/giai-dau/live/draggable-styles.css`: draggable live elements aligned with the new palette.
- `package.json`: add one CSS contract test script.

Create:

- `tests/court-energy-css.test.js`: Node contract test for approved palette and key CSS hooks.

Do not modify:

- `app/api/**`
- `lib/**`
- `database/**`
- React handler logic, fetch calls, routing logic, tournament assignment logic, auth/session logic, or parser code.

---

### Task 1: Add Court Energy CSS Contract Test

**Files:**

- Create: `tests/court-energy-css.test.js`
- Modify: `package.json`

- [ ] **Step 1: Create the failing CSS contract test**

Create `tests/court-energy-css.test.js`:

```js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const globalsCss = read('app/globals.css');
const bottomNavCss = read('components/MobileBottomNav.css');
const homeHeaderCss = read('components/HomeHeader.css');
const fundCss = read('app/quy/page.css');
const adminCss = read('app/admin/admin-center.css');
const tournamentDashboardCss = read('app/giai-dau/dashboard.css');
const liveCss = read('app/giai-dau/live/live.css');

const requiredTokens = [
    '--court-midnight: #071B18',
    '--court-green: #0D7565',
    '--pickle-lime: #CAFF28',
    '--live-cyan: #2CDCFF',
    '--rally-coral: #FF6B35',
    '--surface-court: #F4FBF6',
    '--surface-court-soft: #EEF7F3',
    '--text-primary: #071B18',
    '--text-secondary: #536A64',
];

for (const token of requiredTokens) {
    assert(globalsCss.includes(token), `globals.css should define ${token}`);
}

assert(
    globalsCss.includes('--gradient-court-hero') &&
    globalsCss.includes('--gradient-court-action') &&
    globalsCss.includes('--focus-ring'),
    'Global CSS should define shared Court Energy gradients and focus ring.'
);

assert(
    bottomNavCss.includes('position: fixed') &&
    bottomNavCss.includes('env(safe-area-inset-bottom)') &&
    bottomNavCss.includes('var(--court-midnight)') &&
    bottomNavCss.includes('var(--pickle-lime)'),
    'Mobile bottom nav should stay fixed, safe-area aware, and use active Court Energy styling.'
);

assert(
    homeHeaderCss.includes('var(--court-midnight)') &&
    homeHeaderCss.includes('var(--pickle-lime)'),
    'HomeHeader should use Court Energy brand colors.'
);

assert(
    fundCss.includes('var(--gradient-court-hero)') &&
    fundCss.includes('var(--rally-coral)') &&
    fundCss.includes('var(--pickle-lime)'),
    'Fund dashboard should use the Court Energy hero, warning, and action accents.'
);

assert(
    adminCss.includes('var(--surface-court)') &&
    adminCss.includes('var(--court-green)'),
    'Admin center should use the shared Court Energy surface and primary action colors.'
);

assert(
    tournamentDashboardCss.includes('var(--live-cyan)') &&
    tournamentDashboardCss.includes('var(--pickle-lime)'),
    'Tournament dashboard should expose sports-energy live and accent states.'
);

assert(
    liveCss.includes('var(--court-midnight)') &&
    liveCss.includes('var(--live-cyan)') &&
    liveCss.includes('var(--pickle-lime)'),
    'Live tournament CSS should use dark court, live cyan, and pickle lime states.'
);

console.log('Court Energy CSS contract ok');
```

- [ ] **Step 2: Add a package script**

Modify the `scripts` object in `package.json` to include:

```json
"test:court-energy-css": "node tests/court-energy-css.test.js"
```

Keep all existing scripts unchanged.

- [ ] **Step 3: Run the new test to verify it fails before CSS work**

Run:

```bash
npm run test:court-energy-css
```

Expected: FAIL with the first missing token assertion, because `app/globals.css` has not yet defined the Court Energy variables.

- [ ] **Step 4: Commit the failing test**

Run:

```bash
git add package.json tests/court-energy-css.test.js
git commit -m "test(ui): add Court Energy CSS contract"
```

Expected: commit succeeds with only `package.json` and `tests/court-energy-css.test.js`.

---

### Task 2: Install Global Court Energy Tokens

**Files:**

- Modify: `app/globals.css`

- [ ] **Step 1: Replace the `:root` token block with Court Energy tokens**

In `app/globals.css`, replace the existing `:root` custom properties with:

```css
:root {
  --court-midnight: #071B18;
  --court-green: #0D7565;
  --court-green-strong: #064F45;
  --court-green-soft: #E6F8F0;
  --pickle-lime: #CAFF28;
  --pickle-lime-soft: #F1FFC6;
  --live-cyan: #2CDCFF;
  --live-cyan-soft: #E6FBFF;
  --rally-coral: #FF6B35;
  --rally-coral-soft: #FFF0EA;
  --surface-court: #F4FBF6;
  --surface-court-soft: #EEF7F3;
  --bg-primary: var(--surface-court);
  --bg-secondary: var(--surface-court-soft);
  --bg-card: #FFFFFF;
  --bg-card-hover: #F8FCF9;
  --border-color: #DBECE4;
  --border-strong: #BBD8CB;
  --text-primary: #071B18;
  --text-secondary: #536A64;
  --text-muted: #7A8D85;
  --primary: var(--court-green);
  --primary-hover: var(--court-green-strong);
  --primary-dim: rgba(13, 117, 101, 0.10);
  --primary-light: var(--court-green-soft);
  --success: #14A979;
  --success-dim: rgba(20, 169, 121, 0.12);
  --success-light: #E8F8F1;
  --danger: var(--rally-coral);
  --danger-dim: rgba(255, 107, 53, 0.12);
  --danger-light: var(--rally-coral-soft);
  --warning: #F5B700;
  --warning-dim: rgba(245, 183, 0, 0.14);
  --gradient-court-hero:
    radial-gradient(circle at 92% 8%, rgba(44, 220, 255, 0.36), transparent 25%),
    linear-gradient(135deg, #071B18 0%, #0D7565 58%, #14A979 100%);
  --gradient-court-action: linear-gradient(135deg, #CAFF28 0%, #9DF20B 100%);
  --gradient-court-green: linear-gradient(135deg, #0D7565 0%, #14A979 100%);
  --gradient-live: linear-gradient(135deg, #2CDCFF 0%, #14A979 100%);
  --gradient-danger: linear-gradient(135deg, #FF6B35 0%, #E64A2E 100%);
  --font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --mobile-bottom-nav-height: 78px;
  --border-radius-sm: 10px;
  --border-radius-md: 14px;
  --border-radius-lg: 18px;
  --border-radius-xl: 22px;
  --shadow-sm: 0 8px 24px rgba(7, 27, 24, 0.06);
  --shadow-md: 0 14px 36px rgba(7, 27, 24, 0.10);
  --shadow-lg: 0 24px 70px rgba(7, 27, 24, 0.18);
  --focus-ring: 0 0 0 3px rgba(202, 255, 40, 0.36);
  --dark: var(--court-midnight);
  --light: #FFFFFF;
  --secondary: var(--court-green);
  --accent: var(--pickle-lime);
  --gradient-primary: var(--gradient-court-green);
  --gradient-success: var(--gradient-court-green);
  --gradient-team-blue: linear-gradient(135deg, #0D7565 0%, #2CDCFF 100%);
  --gradient-team-red: linear-gradient(135deg, #FF6B35 0%, #E64A2E 100%);
  --gradient-badge: var(--gradient-court-action);
}
```

- [ ] **Step 2: Update global body and shared shells**

Ensure `body`, `.app-background`, `.card-container`, and `.card-header` use Court Energy surfaces:

```css
body {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: var(--font-family);
  background: var(--surface-court);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-background {
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(202, 255, 40, 0.12), transparent 28rem),
    var(--surface-court);
  padding: 20px;
}

.card-container {
  max-width: 900px;
  margin: 0 auto;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.card-header {
  background: var(--gradient-court-hero);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  padding: 30px 20px;
  text-align: center;
}
```

- [ ] **Step 3: Run the CSS contract test**

Run:

```bash
npm run test:court-energy-css
```

Expected: still FAIL, because module CSS files have not yet been rethemed.

- [ ] **Step 4: Commit global tokens**

Run:

```bash
git add app/globals.css
git commit -m "style(ui): install Court Energy design tokens"
```

Expected: commit succeeds with `app/globals.css`.

---

### Task 3: Redesign App Shell, Header, Bottom Nav, And Status Badges

**Files:**

- Modify: `components/HomeHeader.css`
- Modify: `components/MobileBottomNav.css`
- Modify: `components/UserStatusBadge.css`
- Modify: `components/TournamentModuleNav.css`

- [ ] **Step 1: Update `HomeHeader.css` with Court Energy shell styling**

Replace old blue-focused values with token-based rules:

```css
.home-header {
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border-color);
    box-shadow: 0 8px 28px rgba(7, 27, 24, 0.08);
    padding: 12px 20px;
}

.header-logo a {
    text-decoration: none;
    color: var(--court-midnight);
    display: inline-flex;
    align-items: center;
    gap: 10px;
}

.header-logo-img {
    height: 36px;
    width: 36px;
    object-fit: contain;
    border-radius: 12px;
    background: var(--court-midnight);
    box-shadow: 0 8px 18px rgba(7, 27, 24, 0.14);
}

.header-logo h1 {
    font-size: 20px;
    font-weight: 900;
    margin: 0;
    white-space: nowrap;
    color: var(--court-midnight);
    background: none;
    -webkit-text-fill-color: currentColor;
}

.nav-link {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    padding: 0 14px;
    background: transparent;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 800;
    transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.2s;
    border: 1px solid transparent;
    white-space: nowrap;
}

.nav-link:hover {
    background: var(--surface-court-soft);
    color: var(--court-midnight);
    border-color: var(--border-color);
    transform: translateY(-1px);
}

.nav-link.active,
.nav-link.tournament-link {
    background: var(--court-midnight);
    color: var(--pickle-lime);
    border-color: rgba(202, 255, 40, 0.28);
}

.nav-link.admin-link {
    background: var(--surface-court-soft);
    color: var(--text-secondary);
    border-color: var(--border-color);
}
```

Retain the existing responsive blocks that hide `.header-nav` on mobile.

- [ ] **Step 2: Update `MobileBottomNav.css`**

Replace the mobile media-query block with a floating Court Energy nav:

```css
@media (max-width: 768px) {
    .mobile-bottom-nav {
        position: fixed;
        left: 10px;
        right: 10px;
        bottom: calc(8px + env(safe-area-inset-bottom));
        z-index: 1100;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        min-height: 62px;
        padding: 7px;
        border: 1px solid rgba(219, 236, 228, 0.92);
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 -12px 34px rgba(7, 27, 24, 0.14);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
    }

    .mobile-bottom-nav-link {
        min-width: 0;
        min-height: 48px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        border-radius: 17px;
        color: var(--text-muted);
        text-decoration: none;
        font-size: 11px;
        font-weight: 850;
        transition: background 0.18s, color 0.18s, transform 0.18s;
    }

    .mobile-bottom-nav-link.active {
        background: var(--court-midnight);
        color: var(--pickle-lime);
        box-shadow: inset 0 0 0 1px rgba(202, 255, 40, 0.18);
    }

    .mobile-bottom-nav-link:active {
        transform: scale(0.98);
    }

    .mobile-bottom-nav-icon {
        font-size: 18px;
        line-height: 1;
    }

    .mobile-bottom-nav-label {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}
```

- [ ] **Step 3: Retheme `UserStatusBadge.css` and `TournamentModuleNav.css`**

Use the same tokens:

```css
background: var(--surface-court-soft);
border-color: var(--border-color);
color: var(--court-midnight);
box-shadow: var(--shadow-sm);
```

For active tournament subnav states use:

```css
background: var(--court-midnight);
color: var(--pickle-lime);
border-color: rgba(202, 255, 40, 0.28);
```

- [ ] **Step 4: Run shell/navigation tests**

Run:

```bash
npm run test:mobile-nav
npm run test:admin-center
npm run test:court-energy-css
```

Expected:

- `test:mobile-nav`: PASS.
- `test:admin-center`: PASS.
- `test:court-energy-css`: may still FAIL until fund/admin/tournament/live CSS tasks finish.

- [ ] **Step 5: Commit shell redesign**

Run:

```bash
git add components/HomeHeader.css components/MobileBottomNav.css components/UserStatusBadge.css components/TournamentModuleNav.css
git commit -m "style(ui): redesign app shell navigation"
```

---

### Task 4: Redesign Group Entry, Fund Dashboard, And Members

**Files:**

- Modify: `app/page.css`
- Modify: `app/quy/page.css`
- Modify: `app/quy/members/members.css`

- [ ] **Step 1: Retheme `app/page.css`**

Use `var(--gradient-court-hero)` for `.teamfund-appbar`, `var(--gradient-court-action)` for primary submit buttons, white cards with `var(--border-color)`, and `var(--rally-coral)` for errors. Ensure inputs remain `font-size: 16px`.

Required value replacements:

```css
.teamfund-home { background: var(--surface-court-soft); color: var(--text-primary); }
.teamfund-app { background: var(--surface-court); }
.teamfund-appbar { background: var(--gradient-court-hero); box-shadow: 0 16px 38px rgba(7, 27, 24, 0.22); }
.teamfund-submit { background: var(--gradient-court-action); color: var(--court-midnight); }
.teamfund-error { background: var(--rally-coral-soft); color: var(--rally-coral); }
```

- [ ] **Step 2: Retheme `app/quy/page.css`**

Apply Court Energy to:

- `.home-dark`
- `.home-main`
- `.stats-grid`
- `.stat-card`
- `.balance-card`
- `.tab-bar`
- `.tab-btn.active`
- `.admin-bar`
- `.btn-create`
- `.event-card`
- `.progress-bar-fill`
- `.filter-btn.active`
- `.tx-item.in`
- `.tx-item.out`
- `.btn-submit`

Required visual hooks:

```css
.balance-card {
    background: var(--gradient-court-hero);
    border-color: transparent;
    color: white;
}

.tab-btn.active,
.filter-btn.active {
    background: var(--court-midnight);
    color: var(--pickle-lime);
}

.btn-create,
.btn-submit {
    background: var(--gradient-court-action);
    color: var(--court-midnight);
}

.progress-bar-fill {
    background: linear-gradient(90deg, var(--court-green), var(--pickle-lime));
}

.tx-item.out {
    border-left-color: var(--rally-coral);
}
```

- [ ] **Step 3: Retheme `app/quy/members/members.css`**

Use the same card, button, input, and role/status tokens. Active or admin actions should use `var(--gradient-court-action)` or `var(--court-midnight)` with `var(--pickle-lime)` text.

- [ ] **Step 4: Run relevant tests**

Run:

```bash
npm run test:teamfund
npm run test:phase4
npm run test:court-energy-css
```

Expected:

- `test:teamfund`: PASS.
- `test:phase4`: PASS.
- `test:court-energy-css`: may still FAIL until tournament/live files finish.

- [ ] **Step 5: Commit fund/member redesign**

Run:

```bash
git add app/page.css app/quy/page.css app/quy/members/members.css
git commit -m "style(ui): energize fund and member screens"
```

---

### Task 5: Redesign Admin Center, Settings, And Fund Admin

**Files:**

- Modify: `app/admin/admin-center.css`
- Modify: `app/admin/club-settings.css`
- Modify: `app/quy/admin/admin.css`

- [ ] **Step 1: Retheme `app/admin/admin-center.css`**

Use:

```css
.admin-center-shell { background: var(--surface-court); }
.admin-center-eyebrow { color: var(--court-green); }
.admin-center-heading h1 { color: var(--court-midnight); }
.admin-center-tabs button { background: var(--bg-card); border-color: var(--border-color); color: var(--text-secondary); border-radius: 999px; }
.admin-center-tabs button.active { border-color: var(--court-midnight); background: var(--court-midnight); color: var(--pickle-lime); }
```

- [ ] **Step 2: Retheme `app/admin/club-settings.css`**

Use Court Energy card/input/buttons:

```css
.club-settings-code,
.club-settings-bank,
.club-settings-sepay,
.club-settings-account {
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-lg);
    background: var(--bg-card);
    box-shadow: var(--shadow-sm);
}

.club-settings-save,
.club-settings-sepay-url button,
.club-settings-bank-form button {
    background: var(--gradient-court-action);
    color: var(--court-midnight);
}

.club-settings-msg.error,
.club-settings-logo-remove,
.bank-acc-del {
    background: var(--rally-coral-soft);
    color: var(--rally-coral);
}
```

Ensure all `input` and `textarea` rules keep `font-size: 16px`.

- [ ] **Step 3: Retheme `app/quy/admin/admin.css`**

Apply the same tokens to embedded admin panels, admin forms, transaction tools, and manual action buttons. Destructive buttons use Rally Coral, primary buttons use Pickle Lime action gradient.

- [ ] **Step 4: Run admin tests**

Run:

```bash
npm run test:admin-center
npm run test:admin-auth
npm run test:phase4
npm run test:court-energy-css
```

Expected:

- `test:admin-center`: PASS.
- `test:admin-auth`: PASS.
- `test:phase4`: PASS.
- `test:court-energy-css`: may still FAIL until tournament/live task finishes.

- [ ] **Step 5: Commit admin/settings redesign**

Run:

```bash
git add app/admin/admin-center.css app/admin/club-settings.css app/quy/admin/admin.css
git commit -m "style(ui): polish admin and settings screens"
```

---

### Task 6: Redesign Tournament Dashboard, Admin, Pairings, Detail, And Live Screens

**Files:**

- Modify: `app/giai-dau/dashboard.css`
- Modify: `app/giai-dau/tournament.css`
- Modify: `app/giai-dau/admin/admin-tournament.css`
- Modify: `app/giai-dau/admin/pairings/admin-pairings.css`
- Modify: `app/giai-dau/live/live.css`
- Modify: `app/giai-dau/live/draggable-styles.css`

- [ ] **Step 1: Retheme `app/giai-dau/dashboard.css`**

Required hooks:

```css
.tournament-dashboard { background: var(--surface-court); }
.dashboard-eyebrow { color: var(--court-green); }
.dashboard-action { background: var(--gradient-court-action); color: var(--court-midnight); border-radius: 999px; }
.tournament-dashboard-card { border-color: var(--border-color); border-radius: var(--border-radius-lg); box-shadow: var(--shadow-sm); }
.status-active { background: var(--live-cyan-soft); color: #007F99; }
.status-completed { background: var(--pickle-lime-soft); color: #275400; }
.card-meta strong { color: var(--court-green); }
```

Include both `var(--live-cyan)` and `var(--pickle-lime)` somewhere in the file so the contract test can verify tournament energy states.

- [ ] **Step 2: Retheme tournament detail and admin CSS**

For `app/giai-dau/tournament.css`, replace legacy heavy blue/orange gradients with:

```css
background: var(--gradient-court-hero);
color: white;
```

For `app/giai-dau/admin/admin-tournament.css` and `app/giai-dau/admin/pairings/admin-pairings.css`, use:

```css
background: var(--surface-court);
border-color: var(--border-color);
box-shadow: var(--shadow-sm);
```

Active console tabs:

```css
background: var(--court-midnight);
color: var(--pickle-lime);
```

Destructive or reset actions:

```css
background: var(--rally-coral-soft);
color: var(--rally-coral);
```

- [ ] **Step 3: Retheme live tournament CSS**

In `app/giai-dau/live/live.css`, use a darker sports surface:

```css
background:
    radial-gradient(circle at top right, rgba(44, 220, 255, 0.18), transparent 28rem),
    var(--court-midnight);
```

Use:

```css
color: var(--pickle-lime);
border-color: rgba(202, 255, 40, 0.24);
background: var(--live-cyan);
```

Apply those values to `.live`, `.score`, `.match-status`, `.score-value`, and comparable existing live-score selectors that already render realtime status or score values.

In `app/giai-dau/live/draggable-styles.css`, align drag handles/drop states with `var(--live-cyan)`, `var(--pickle-lime)`, and `var(--rally-coral)`.

- [ ] **Step 4: Run tournament tests**

Run:

```bash
npm run test:tournament-dashboard
npm run test:tournament-management-v2
npm run test:tournament-admin-redesign
npm run test:court-energy-css
```

Expected:

- `test:tournament-dashboard`: PASS.
- `test:tournament-management-v2`: PASS.
- `test:tournament-admin-redesign`: PASS.
- `test:court-energy-css`: PASS.

- [ ] **Step 5: Commit tournament redesign**

Run:

```bash
git add app/giai-dau/dashboard.css app/giai-dau/tournament.css app/giai-dau/admin/admin-tournament.css app/giai-dau/admin/pairings/admin-pairings.css app/giai-dau/live/live.css app/giai-dau/live/draggable-styles.css
git commit -m "style(ui): refresh tournament surfaces"
```

---

### Task 7: Final Verification In Build And Browser

**Files:**

- No source edits expected unless verification finds a visual bug.

- [ ] **Step 1: Run the full relevant contract suite**

Run:

```bash
npm run test:mobile-nav
npm run test:admin-center
npm run test:teamfund
npm run test:phase4
npm run test:tournament-dashboard
npm run test:tournament-management-v2
npm run test:tournament-admin-redesign
npm run test:court-energy-css
```

Expected: every command exits with status `0`.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: Next.js production build completes successfully. If environment variables required by Supabase are missing, record the exact build failure and continue to dev-server visual verification.

- [ ] **Step 3: Start the dev server**

Run:

```bash
npm run dev
```

Expected: local Next.js server starts and prints a localhost URL, usually `http://localhost:3000`.

- [ ] **Step 4: Verify browser views**

Use the in-app browser to check:

- `http://localhost:3000`
- `http://localhost:3000/quy`
- `http://localhost:3000/quy/members`
- `http://localhost:3000/admin`
- `http://localhost:3000/giai-dau`
- `http://localhost:3000/giai-dau/live`

At mobile width around `390x844`, verify:

- Bottom nav is visible, safe-area aware, and does not cover primary content.
- Header text and club branding do not overflow.
- Primary buttons fit their labels.
- Cards have stable dimensions and no overlapping text.
- Fund stat values truncate or wrap professionally.
- Admin tabs scroll horizontally when needed.
- Tournament cards keep admin icon actions tappable.
- Live screen has readable contrast.

At desktop width around `1280x720`, verify:

- Header remains sticky and compact.
- Dense admin/tournament screens remain operational rather than marketing-like.
- Cards do not become oversized.
- Page gutters are balanced.

- [ ] **Step 5: Fix any visual issues with scoped CSS-only edits**

If verification finds issues, modify only the relevant CSS file. Do not change API, state, fetch, route, or database logic.

- [ ] **Step 6: Re-run affected tests and commit final fixes**

Run the affected tests plus:

```bash
npm run test:court-energy-css
```

Commit:

```bash
git add app components tests package.json
git commit -m "style(ui): finalize Court Energy responsive polish"
```

Expected: commit includes only final CSS/test/package changes needed after verification.

---

## Self-Review Notes

- Spec coverage: The plan covers global tokens, home/group entry, header, bottom nav, fund dashboard, members, admin center, settings, tournament dashboard/detail/admin/pairings, live tournament, and verification.
- Scope safety: The plan explicitly avoids API routes, database files, Supabase helpers, parser code, auth/session logic, and React business behavior.
- Test strategy: The new CSS contract checks approved palette and key hooks. Existing contract tests protect route/nav/admin/tournament behavior while CSS is changed.
- Red-flag scan: The plan contains concrete file paths, commands, CSS hooks, test code, and expected results.
