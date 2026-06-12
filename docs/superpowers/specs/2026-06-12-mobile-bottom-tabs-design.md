# Mobile Bottom Tabs Design

## Goal

Most members use the app on phones, so mobile navigation should feel like a native mobile app. Replace mobile drawer/dropdown behavior with a fixed bottom tab bar across the whole app while keeping desktop navigation unchanged.

## Scope

Apply the mobile bottom tab pattern to all main areas:

- Fund area: `/quy`, `/quy/members`, `/quy/admin`
- Tournament area: `/giai-dau`, `/giai-dau/live`, `/giai-dau/admin`, `/giai-dau/captain`

Desktop and large tablet layouts keep the current top navigation.

## Mobile Navigation Model

At `max-width: 768px`, show a fixed bottom navigation bar. The bar stays visible while users scroll, with large touch targets and short labels.

Fund pages use these tabs:

- Quỹ: `/quy`
- Thành viên: `/quy/members`
- Giải đấu: `/giai-dau`
- Admin: `/quy/admin`, shown only when the existing header would show admin access

Tournament pages use these tabs:

- Home: `/quy`
- Điều lệ: `/giai-dau`
- Live: `/giai-dau/live`
- Admin: `/giai-dau/admin`, shown for admin users
- Captain: `/giai-dau/captain`, shown for guests where the current tournament nav exposes captain login

If role-based links create more than four visible tournament tabs, keep the primary four visible by favoring Home, Điều lệ, Live, and the role-specific action. This avoids cramped labels on small screens.

## Header Behavior

On mobile:

- Hide hamburger/drawer navigation.
- Keep the top header compact for brand and user status.
- Avoid long labels in the header. The bottom tabs carry navigation responsibility.

On desktop:

- Preserve the existing header and tournament navbar behavior.

## Layout Requirements

- Add bottom padding to mobile pages so the fixed tab bar does not cover content.
- Use stable tab dimensions so labels and icons do not shift while active states change.
- Active tab is detected from the current pathname.
- Touch targets should be at least 44px high.
- Keep styling consistent with each area: light theme for Fund, dark/tournament theme where appropriate.

## Components

Prefer a reusable bottom navigation component or shared CSS pattern rather than duplicating the full mobile bar in each page.

Likely implementation points:

- `components/HomeHeader.js`
- `components/HomeHeader.css`
- `components/TournamentNavBar.js`
- `components/TournamentNavBar.css`
- `app/globals.css` for shared mobile body/page padding if needed

## Verification

Check these flows on a phone-size viewport:

- `/quy`
- `/quy/members`
- `/giai-dau`
- `/giai-dau/live`
- Admin/captain pages when accessible

Confirm:

- Bottom tabs appear on mobile and not desktop.
- Top drawer/hamburger no longer appears on mobile.
- Active tab highlights correctly.
- Page content is not hidden behind the fixed bottom bar.
- Role-specific links still appear where expected.
