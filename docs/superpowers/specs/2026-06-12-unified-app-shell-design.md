# Unified App Shell Design

## Goal

Make Fund and Tournament feel like one mobile-first app instead of two separate systems. Tournament remains a module inside PICKLEBALL 246 CLUB.

## Navigation Model

Use one global app shell for `/quy` and `/giai-dau`:

- Shared top header: `HomeHeader`
- Shared mobile bottom tabs: `Quỹ`, `Thành viên`, `Giải đấu`, `Admin`
- No `TournamentNavBar` on tournament pages

Tournament-specific destinations move into a module subnav inside the tournament area:

- Điều lệ: `/giai-dau`
- Live: `/giai-dau/live`
- Captain: `/giai-dau/captain`, visible for guests
- Admin: `/giai-dau/admin`, visible for admins

## Layout Responsibilities

- `app/quy/layout.js` renders `HomeHeader`, children, and `MobileBottomNav`.
- `app/giai-dau/layout.js` renders `HomeHeader`, a tournament subnav, children, and `MobileBottomNav`.
- Page files no longer render their own top-level app navigation.

## Visual Direction

Keep the tournament pages visually energetic, but remove the separate dark global navbar. The tournament subnav can use a compact module style under the shared header.

## Verification

Confirm:

- `/quy` and `/giai-dau` share the same top header and bottom tabs.
- Tournament pages do not import or render `TournamentNavBar`.
- Tournament subnav appears inside `/giai-dau` pages.
- Mobile bottom nav always has the same four global tabs.
