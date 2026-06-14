# Unify Auth on Group Code + Password (Remove Supabase Auth & Captain)

Date: 2026-06-14
Status: Approved

## Problem

Saving a club logo appeared to "do nothing." Root cause is **not** the logo feature — it
is a divergence between two sources of "which club am I administering":

- **Server:** the signed `group_session` cookie drives every `/api/club/*` route, including
  the branding read and the settings PATCH that writes `logo_url`.
- **Client:** `localStorage['teamfund-current-group']` drives the `UserStatusBadge` and the
  client-side admin gate.

Two login paths set the cookie to **different** clubs:

- Code + password (`/api/groups/join`) → cookie scoped to the entered club. ✅
- Email + Supabase Auth (`/login` → `/api/groups/session/admin`) → always `groupIds[0]`,
  the first club, with **no way to choose**. ❌

Demonstrated: on `/admin` the header/settings showed "Pickleball 246 Club" (cookie) while the
badge showed "HANA" (localStorage). A logo saved while viewing "HANA" was written to
"Pickleball 246 Club" — so the viewed club looked unchanged. The DB confirmed both clubs held
the byte-identical logo (same md5), and `group_members` lists the user as owner of club 1 only.

## Goal

The app uses **one** identity mechanism: the `group_session` cookie minted from a club code +
password. All Supabase Auth login is removed. The tournament **captain** feature is removed;
admins arrange teams/pairings (already supported by `app/giai-dau/admin/*`).

## Design

### Part 1 — Consolidate admin login (fixes the logo bug)
- Delete `app/login/` (page + css) and `app/api/groups/session/admin/route.js`.
- `app/page.js`: remove `@/lib/supabaseClient` import and the `signInWithPassword` call in the
  create flow; remove the `adminEmail` field from `EMPTY_CREATE_FORM` and the create form.
- `app/api/groups/route.js`: remove `adminEmail` handling/validation, `auth.admin.createUser`,
  the rollback, and the `addGroupMember` call/import. Create the group with code + admin/member
  password hashes, then set the `group_session` cookie (as today).
- Result: only `create` and `join` mint identity, and they set cookie + localStorage from the
  same club — no divergence, logo writes land on the correct club.

### Part 2 — Remove the captain feature
- Delete `app/giai-dau/captain/`, `app/giai-dau/[id]/captain/`, and
  `app/api/tournament/captain/` (pairings + unlock).
- `app/giai-dau/live/page.js`: replace `supabase.auth.getUser()` role detection with
  `getCurrentGroupClient()` (admin from the group session); drop the captain role/UI/link;
  remove the `@/lib/supabaseClient` import.
- Remove captain links/styles (`.btn-captain`, "Admin/Captain Login" link).
- Keep the admin `toggle-pairings-lock` route and `admin/pairings` page (admin manages
  pairings); relabel UI text away from "Captain". Keep `tournament_teams.captain_name`
  (display-only string the admin sets).

### Part 3 — Cleanup & tests
- Remove dead `lib/membership.js` (no remaining importers after Part 1).
- Confirm no `supabase.auth` remains anywhere under `app/`; remove `lib/supabaseClient.js` only
  if it has no remaining importers, otherwise leave it. Keep `supabaseAdmin`/`supabaseServer`.
- Leave the database untouched (`group_members`, RLS) — no data/table drops.
- Update tests:
  - `tests/multitenant-phase2.test.js`: drop assertions for `auth.admin.createUser`,
    `adminEmail`, the admin-session route, and home-page `signInWithPassword`; assert the new
    code+password-only create flow instead.
  - `tests/tournament-dashboard.test.js` and `tests/teamfund-phase1.test.js`: drop assertions
    that captain pages/routes exist.
  - Add a guard test: no `supabase.auth` under `app/`, and the captain files are gone.

## Non-goals / Notes
- Existing Supabase captain accounts become orphaned (intended). Supabase Auth data is not
  touched.
- Part 1 alone resolves the reported logo bug; Parts 2–3 are the requested broader cleanup.
