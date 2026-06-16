# Mobile-First Court Energy Redesign

## Summary

Redesign the full PickHub web app interface with a mobile-first visual system named **Court Energy**. The redesign should make the app feel more energetic for a pickleball club while keeping it clean and reliable for fund management, admin work, settings, and tournament operations.

This branch is UI-focused. It must not change data fetching, API behavior, state transitions, tournament logic, payment logic, auth/session logic, or database code.

## Approved Direction

The user approved the energetic variant of the original Club OS direction.

The app should feel:

- Sporty and active, suitable for court-side use.
- Modern, polished, and mobile-first.
- Clear enough for finance/admin workflows.
- Consistent across fund, members, admin, settings, tournament dashboard, live tournament, and navigation surfaces.

## Brand Palette

Use the following palette as the app-wide brand foundation:

- Midnight Court: `#071B18`
- Court Green: `#0D7565`
- Pickle Lime: `#CAFF28`
- Live Cyan: `#2CDCFF`
- Rally Coral: `#FF6B35`
- Surface: `#F4FBF6`
- Surface Soft: `#EEF7F3`
- Card: `#FFFFFF`
- Border: `#DBECE4`
- Text Primary: `#071B18`
- Text Secondary: `#536A64`
- Text Muted: `#7A8D85`

Color usage:

- Midnight Court is for strong headers, active navigation states, and high-emphasis text.
- Court Green is the primary brand and action color.
- Pickle Lime is the sports-energy accent for primary CTAs, highlights, active state details, and key tournament/fund moments.
- Live Cyan is reserved for live states, realtime tournament surfaces, and secondary highlight states.
- Rally Coral is reserved for warning, destructive, urgent, or high-attention actions.
- White cards and soft green-tinted surfaces should carry dense admin and finance information so the interface remains readable.

## Typography And Layout

Keep the current font stack strategy, but tune the visual system around:

- Stronger headings with compact line height.
- No negative letter spacing.
- Mobile-first spacing with 12-16px page gutters.
- Desktop layouts that expand density rather than becoming marketing-style pages.
- Stable dimensions for bottom nav, icon buttons, stat cards, tabs, pills, and tournament cards.

Target shapes:

- Cards: 16-20px radius for app cards and panels.
- Buttons and inputs: 12-14px radius.
- Bottom nav: floating glass-like bar with a dark active tab and lime accent.
- Pills: fully rounded but used for status metadata, not as decorative filler.

## Scope

Primary CSS surfaces:

- `app/globals.css`
- `app/page.css`
- `components/HomeHeader.css`
- `components/MobileBottomNav.css`
- `components/UserStatusBadge.css`
- `app/quy/page.css`
- `app/quy/members/members.css`
- `app/admin/admin-center.css`
- `app/admin/club-settings.css`
- `app/quy/admin/admin.css`
- `app/giai-dau/dashboard.css`
- `app/giai-dau/tournament.css`
- `app/giai-dau/admin/admin-tournament.css`
- `app/giai-dau/admin/pairings/admin-pairings.css`
- `app/giai-dau/live/live.css`
- `app/giai-dau/live/draggable-styles.css`
- `components/TournamentModuleNav.css`

Markup may be adjusted only when necessary for visual structure, accessibility, or responsive layout. Any markup changes must preserve existing event handlers, fetch calls, state, data mapping, routes, and business behavior.

Out of scope:

- API routes.
- Supabase clients and server helpers.
- Tournament engine or assignment logic.
- Transaction parser.
- Database migrations.
- Authentication/session behavior.
- Data model changes.

## Screen-Level Design

### Home / Group Entry

The landing screen should feel like a compact mobile app entry point, not a marketing page. Use a strong Court Energy header, clear create/join actions, and polished modal/form states. Group cards should look tappable and confident.

### Header And Global Navigation

On desktop, keep the sticky header restrained and utility-focused. On mobile, hide the desktop nav and rely on the bottom nav. The brand/logo area should reflect the current club branding but inherit the Court Energy visual treatment.

### Mobile Bottom Navigation

The bottom nav is a primary mobile control:

- Fixed and safe-area aware.
- Floating or glass-like on mobile.
- Four stable tabs.
- Active tab uses Midnight Court background and Pickle Lime icon/text emphasis.
- Labels must not overflow on narrow phones.

### Fund Dashboard

The fund screen should prioritize quick scanning:

- Hero balance block with energetic gradient.
- Income/outcome stat cards with clear green/coral states.
- Events as progress cards.
- Transactions as readable mobile cards, not cramped tables.
- Filters and tabs as segmented controls.

### Members

Member views should use compact list cards with clear status and role affordances. Admin actions should remain discoverable without making each row visually noisy.

### Admin Center

Admin should feel like an operational console:

- Clean page heading.
- Segmented section tabs.
- White cards on soft surface.
- Forms with consistent focus rings and action buttons.
- No nested-card visual clutter.

### Settings

Settings must stay easy to complete on mobile:

- Form groups with clear vertical rhythm.
- QR/code card with strong code readability.
- Bank and SePay sections as operational panels.
- Destructive/reset actions use Rally Coral treatment.

### Tournament Dashboard And Detail

Tournament views should inherit the same system but allow more sports energy:

- Tournament cards with status pills.
- Live or active states can use Live Cyan and Pickle Lime accents.
- Admin icon actions remain compact and tappable.
- Detail sections should avoid old heavy gradients and inconsistent badge styles.

### Live Tournament

Live tournament surfaces may use more dark/court contrast, cyan live states, and lime scoring accents, while preserving readability and avoiding text overlap on mobile.

## Implementation Rules

- Prefer CSS variable tokens in `app/globals.css` and reuse them across module CSS files.
- Keep edits scoped to UI and CSS. Do not refactor business logic.
- Replace inconsistent legacy blues/greens/oranges with Court Energy tokens.
- Avoid one-note palettes by balancing green with lime, cyan, coral, white, and soft surfaces.
- Preserve existing class names where possible.
- Ensure mobile is the default design, with desktop enhancements in media queries.
- Avoid oversized hero or marketing-page composition inside app screens.
- Use stable sizing for controls so hover, active, loading, and dynamic text states do not shift layouts.
- Ensure forms use 16px input text on mobile to avoid iOS zoom behavior.

## Verification Plan

After implementation:

- Run the relevant existing tests for touched areas.
- Run `npm run build` if feasible.
- Start the Next.js dev server.
- Use the in-app browser to check mobile and desktop views for:
  - Home/group entry.
  - Fund dashboard.
  - Members.
  - Admin center/settings.
  - Tournament dashboard.
  - Live tournament where accessible.
- Check that text does not overflow buttons/cards on narrow mobile widths.
- Check that no interactive layout shifts occur from active/hover/loading states.

## Open Decisions

No open visual direction decisions remain. The user approved the Court Energy palette and direction on 2026-06-15.
