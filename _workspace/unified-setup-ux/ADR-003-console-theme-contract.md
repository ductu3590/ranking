# ADR-003: Console Shell Theme Contract Alignment (GAP-THEME)

**Status:** Accepted  
**Date:** 2026-09-20  
**Context:**  
`tests/tournament/ui-shell.contract.test.js` was a legacy contract that directly asserted dark-mode variables (`--ops-bg`, `--ops-indigo`) and a hardcoded literal `Montserrat` string in `app/giai-dau/v2/console/shell.css`.

In the unified setup plan (§1, GAP-THEME) and T2.D execution:

Asserting a raw literal `Montserrat` in `shell.css` was a single-file false negative; asserting `--ops-bg` and `--ops-indigo` directly contradicted GAP-THEME.

**Decision:**  
Update `tests/tournament/ui-shell.contract.test.js`:
1. Require shared font token usage: `var(--font-family)` or `var(--ph-font)`.
2. Invert the token check to assert no `--ops-` declarations remain, protecting GAP-THEME compliance.
3. Retain prohibitions against Outfit and obsolete court tokens, and retain accessibility assertions (`prefers-reduced-motion`).

This update aligns the regression suite with the explicit architecture decision in GAP-THEME and does not mask product bugs.

Update `tests/tournament/ui-draw-step.contract.test.js`:
1. Replace legacy `.ops-draw-slot` assertions with the rendered `.v2-console-draw-slot` selectors.
2. Preserve the visible selected-slot assertion through `.v2-console-draw-slot.is-picked`.

Fix the real stage picker regression:
1. The rendered `.v2-stage-picker` / `.v2-stage-seg` now has one CSS source in `console.css`.
2. The active state follows the rendered `aria-pressed='true'` attribute rather than an absent `.active` class.
3. Each `.v2-stage-seg` has `min-height: 44px` for the browser-harness touch-target contract.
4. The unused `.v2-console-stage-picker` block was removed from `shell.css`; browser journey selectors now use `.v2-console-*` and `.v2-stage-picker` classes actually rendered by the console.
