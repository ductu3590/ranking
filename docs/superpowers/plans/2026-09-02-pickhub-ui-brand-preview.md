# PickHub Brand & UI Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reviewable PickHub brand system and static UI prototype for the member club dashboard, club leader dashboard, and public tournament page before committing to the production redesign.

**Architecture:** Keep the prototype isolated under `docs/pickhub-core/ui-preview/` so it cannot alter production routes or data contracts. Express the brand as CSS custom properties and reusable semantic components, then switch between representative user contexts with client-side state. Use the generated court artwork only as a preview asset; the production UI will later replace the static data with existing PickHub services.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, inline SVG mark, PNG preview asset, PowerShell/Playwright for visual verification.

**Spec:** `docs/pickhub-core/UI-BRAND-SYSTEM.md` and `docs/pickhub-core/UI-PREVIEW-SPEC.md`

## Global Constraints

- Preserve the club-first entry model and read-only club access code for members.
- Keep leader access as club code plus password; do not require athlete accounts in the prototype.
- Mobile-first for members and spectators; responsive desktop support for leaders; desktop-first tournament operations.
- Use a neutral, nationwide-ready brand with per-club and per-tournament theme overrides.
- Display the PHR label and score in member and public tournament views.
- Do not introduce payment, external notifications, or approval workflows.
- Prototype data must be clearly synthetic and must not call Supabase or production APIs.

---

### Task 1: Document the PickHub brand system

**Files:**
- Create: `docs/pickhub-core/UI-BRAND-SYSTEM.md`
- Modify: `docs/pickhub-core/UI-STRATEGY.md`

**Interfaces:**
- Produces the canonical color tokens, typography, spacing, radius, elevation, icon, logo, tone, accessibility and theming rules used by the prototype and future UI work.

- [ ] **Step 1: Write the brand and token specification**

Document PickHub's draft positioning, color roles, type scale, spacing, component states, theme hierarchy, public/privacy rules, and sample Vietnamese interface copy.

- [ ] **Step 2: Link the existing UI strategy to the brand system**

Add the brand document to the UI strategy's deliverables and explain that this preview is a review gate before production redesign.

- [ ] **Step 3: Verify the document has no unresolved placeholders**

Run: `rg -n "TBD|TODO|FIXME|PLACEHOLDER" docs/pickhub-core/UI-BRAND-SYSTEM.md docs/pickhub-core/UI-STRATEGY.md`

Expected: no matches.

### Task 2: Define the prototype information architecture

**Files:**
- Create: `docs/pickhub-core/UI-PREVIEW-SPEC.md`

**Interfaces:**
- Produces the screen inventory, user-context switcher behavior, synthetic data, responsive acceptance criteria and review questions for the prototype.

- [ ] **Step 1: Specify the three review surfaces**

Describe the member dashboard, leader dashboard and public tournament surface, including their primary actions, content hierarchy, and mobile/desktop differences.

- [ ] **Step 2: Specify the review interaction**

Define the context switcher, club theme preview, tournament theme preview, and no-network static behavior.

- [ ] **Step 3: Verify coverage**

Run: `rg -n "member|leader|public|mobile|desktop|PHR|quỹ|giải" docs/pickhub-core/UI-PREVIEW-SPEC.md`

Expected: every required surface and core product decision is represented.

### Task 3: Build the static UI preview

**Files:**
- Create: `docs/pickhub-core/ui-preview/index.html`
- Create: `docs/pickhub-core/ui-preview/styles.css`
- Create: `docs/pickhub-core/ui-preview/app.js`
- Create: `docs/pickhub-core/ui-preview/assets/pickhub-court-hero.png`

**Interfaces:**
- `index.html` provides semantic regions and data attributes for the preview.
- `styles.css` exposes the brand tokens and responsive layouts.
- `app.js` switches `member`, `leader`, and `public` views without a network call.

- [ ] **Step 1: Add the semantic shell and context switcher**

Create a single accessible page with a Skip link, header, view switcher, main content region and footer. Use inline SVG for the PickHub mark and labels in Vietnamese.

- [ ] **Step 2: Add the member dashboard**

Render the club selector, read-only access state, fund leaderboard, fund summary, active member count, PHR distribution, and in-app notices.

- [ ] **Step 3: Add the leader dashboard**

Render fund quick actions, member health, pending notices, and primary links for members and tournaments.

- [ ] **Step 4: Add the public tournament view**

Render the themed hero, event metadata, discipline tabs, current match, standings, schedule and a double-elimination bracket preview.

- [ ] **Step 5: Add responsive behavior and interaction states**

Implement mobile bottom navigation, focus-visible states, hover/pressed states, reduced-motion support, and compact desktop layouts.

- [ ] **Step 6: Verify static behavior**

Run: `node --check docs/pickhub-core/ui-preview/app.js`

Expected: exit code 0.

### Task 4: Render and inspect visual output

**Files:**
- Create: `output/playwright/pickhub-ui-preview-1440.png`
- Create: `output/playwright/pickhub-ui-preview-390.png`

**Interfaces:**
- Produces desktop and mobile screenshots for human review; no production code is changed.

- [ ] **Step 1: Serve the static preview**

Run: `python -m http.server 4173 --directory docs/pickhub-core/ui-preview`

Expected: a local HTTP server listening on port 4173.

- [ ] **Step 2: Capture desktop and mobile screenshots**

Use the Playwright CLI skill to open `http://127.0.0.1:4173/`, switch contexts, and capture screenshots at 1440px and 390px widths. If the cached CLI cannot launch, use the bundled Playwright runtime with the installed Chrome executable.

- [ ] **Step 3: Inspect screenshots and correct layout defects**

Check contrast, clipping, text wrapping, touch target size, bracket readability, and whether the brand remains legible over the hero asset.

- [ ] **Step 4: Re-run static verification**

Run: `node --check docs/pickhub-core/ui-preview/app.js; git diff --check`

Expected: both commands exit 0.

### Task 5: Record the review gate

**Files:**
- Modify: `docs/pickhub-core/PROGRESS.md`
- Modify: `docs/pickhub-core/progress.json`
- Create: `docs/pickhub-core/evidence/ui-preview-review.md`

**Interfaces:**
- Records the preview branch, screenshots, verification commands and explicit approval status; production redesign remains blocked until the user reviews it.

- [ ] **Step 1: Record preview status as awaiting review**

Write the exact branch name, asset paths, and verification evidence. Do not mark the UI phase complete.

- [ ] **Step 2: Run the final review checklist**

Verify that all three contexts render, all links are local, no production API is called, and all required decisions are reflected.

- [ ] **Step 3: Commit the isolated preview branch**

Run: `git add docs/pickhub-core docs/superpowers/plans/2026-09-02-pickhub-ui-brand-preview.md output/playwright; git commit -m "feat: add PickHub brand and UI preview"`

Expected: one commit on `codex/pickhub-ui-brand-preview`; merge is deferred until the user approves the visual direction.
