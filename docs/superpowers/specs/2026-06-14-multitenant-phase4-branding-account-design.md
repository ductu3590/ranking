# Multi-tenant Phase 4 — Club Branding + Admin Password (Design)

> Scope reset: the original Phase 4 (super-admin, audit log, club transfer/delete,
> branding, legal) was deferred. Super-admin + audit log wait until commercialization;
> transfer/delete + legal deferred. This phase completes two **per-club admin** gaps:
> **club branding** (logo + name on member pages) and **admin password self-service**.

## Goal

1. Each club shows its **own name + logo** on member-facing pages instead of the
   hard-coded "PICKLEBALL 246 CLUB".
2. A club admin can **change their own login password** from the settings screen.

## Decisions (locked)

- **Logo storage:** small **data-URL** in a new `groups.logo_url` text column. The
  browser compresses the chosen image to ≤256px before saving. No Supabase Storage
  bucket, no upload route — ships fast and reliably through the existing service-role
  settings PATCH.
- **Branding scope:** **name + logo only.** No color theming (the app hard-codes many
  greens; theming would sprawl). Display name reuses the existing `groups.name`.
- **Account self-service:** **password only.** No email change (no SMTP configured;
  email change would need the service-role admin API and risks lockout).

## Architecture

### Data — Migration 011
```sql
ALTER TABLE groups ADD COLUMN IF NOT EXISTS logo_url text;
```
Additive, nullable → **safe to apply to prod before the Vercel deploy** (no existing
code reads it; branding falls back to name when null).

### Read branding — `app/api/club/branding/route.js` (GET)
- Resolves the active group from `getEffectiveGroupContext()` (signed cookie, or the
  default group for anonymous visitors).
- Reads `id, name, logo_url` from `groups` via `supabaseAdmin` (service role; bypasses
  RLS so unauthenticated members can still get branding).
- Returns `{ name, logoUrl }`. **No admin guard** — it only exposes non-sensitive
  branding fields, which every member/visitor must be able to read.

### Write branding — extend `app/api/club/settings/route.js` PATCH
- Accept an optional `logoUrl` (data-URL string, or `null`/`''` to clear).
- Server-side size guard: reject if the data-URL length exceeds ~100 KB
  (`logoUrl.length > 100_000`) → 400 with a Vietnamese message.
- Still guarded by `requireGroupAdmin()`; scoped to `adminCheck.groupId`.

### Render branding — `components/HomeHeader.js`
- On mount, fetch `/api/club/branding`.
- Render `<img>` (when `logoUrl` present) + the club `name` (uppercased) in the logo
  slot, replacing the hard-coded title. Fallback to "Pickleball 246 Club" while loading
  or when no branding is set.
- This is the shared header for member and admin pages, so one change brands the whole
  app per active club.

### Upload UI — `app/admin/ClubSettings.js`
- A logo control: `<input type="file" accept="image/*">` → read file → draw to a
  `<canvas>` scaled so the longest edge ≤256px → `canvas.toDataURL('image/webp', 0.8)`
  (fallback `image/png`) → store in form state with a live preview and a "Xóa logo"
  button.
- The logo is saved with the existing **Lưu thay đổi** PATCH (adds `logoUrl` to the
  payload). No separate save button.

### Admin password — `app/admin/ClubSettings.js`
- A new **"Tài khoản đăng nhập"** section: `new password` + `confirm` fields →
  `supabase.auth.updateUser({ password })` directly from the client (the admin already
  holds a Supabase session in the browser from `/login`).
- Validation: ≥6 chars, both fields match. Success/Error notice inline. No server route.

## Testing — `tests/multitenant-phase4.test.js`
Static-source contract assertions, matching the Phase 2/3/5 style:
- Migration 011 contains `logo_url`.
- `app/api/club/branding/route.js`: `export async function GET`, uses
  `getEffectiveGroupContext` + `supabaseAdmin`, returns `logoUrl`.
- `app/api/club/settings/route.js` PATCH references `logoUrl`.
- `app/admin/ClubSettings.js`: has logo file input + canvas resize (`toDataURL`) and a
  password change via `supabase.auth.updateUser`.
- `components/HomeHeader.js`: fetches `/api/club/branding`.
Register `"test:phase4"` in `package.json`.

## Migration / deploy safety
- 011 only adds a nullable column → apply to prod anytime; no live-app breakage.
- Work commits directly to `main` (user preference); user deploys via Vercel.

## Out of scope (deferred, recorded)
- Brand color theming; per-club `<title>`/favicon; logo on join/hero pages.
- Admin email change; co-admin invites; club transfer/delete; super-admin; audit log;
  legal pages.
