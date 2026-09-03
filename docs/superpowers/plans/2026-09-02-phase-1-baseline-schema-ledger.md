# Phase 1 Baseline and Schema Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Start Phase 1 with a green deterministic regression baseline and a reproducible inventory of every local migration before schema hardening begins.

**Architecture:** Keep navigation-role behavior in a pure CommonJS helper that Node tests can execute, while the client component gets the role from the signed-session API. Add a pure migration-ledger module plus a thin CLI; database SQL creates the protected ledger and exposes read-only preflight queries for manual execution on staging/production.

**Tech Stack:** Next.js 14.1 App Router, JavaScript, Node built-ins, PostgreSQL/Supabase SQL.

**Spec:** `docs/pickhub-core/01-phase-foundation-hardening.md`

## Global Constraints

- JavaScript only; do not add TypeScript or a test framework.
- Browser code never queries Supabase for auth or CRUD.
- The server-signed `group_session` cookie remains the Phase 1 identity source.
- Historical migrations are immutable; duplicate sequence numbers are reported, not renamed.
- Production migrations remain manual and must not drop existing club, tournament, or fund data.
- No new npm dependency is required for this plan.

---

### Task 1: Record Phase 1 Start

**Files:**
- Create: `tests/phase1/progress.test.js`
- Modify: `docs/pickhub-core/PROGRESS.md`
- Modify: `docs/pickhub-core/progress.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: the progress schema in `docs/pickhub-core/progress.json`.
- Produces: `active_phase = 1` and Phase 1 status `in_progress` in both ledgers.

- [x] **Step 1: Write the failing progress consistency test**

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const progress = require(path.join(root, 'docs/pickhub-core/progress.json'));
const human = fs.readFileSync(path.join(root, 'docs/pickhub-core/PROGRESS.md'), 'utf8');
const phase = progress.phases.find((item) => item.id === 1);

assert.strictEqual(progress.active_phase, 1);
assert.strictEqual(phase.status, 'in_progress');
assert.strictEqual(phase.branch, 'codex/phase-1-foundation-hardening');
assert.match(human, /Phase 1 — Ổn định nền tảng \| `in_progress` \| `codex\/phase-1-foundation-hardening`/);
console.log('phase 1 progress contract ok');
```

- [x] **Step 2: Run the test and confirm RED**

Run: `node tests/phase1/progress.test.js`

Expected: FAIL because `active_phase` is `null` and Phase 1 is `not_started`.

- [x] **Step 3: Update both ledgers and register the phase test**

Set `active_phase` to `1`, Phase 1 to `in_progress`, and show the required branch in `PROGRESS.md`. Add `"test:phase1": "node tests/phase1/progress.test.js"` to `package.json`.

- [x] **Step 4: Run the phase test and confirm GREEN**

Run: `npm run test:phase1`

Expected: `phase 1 progress contract ok`.

- [x] **Step 5: Commit**

```bash
git add docs/pickhub-core/PROGRESS.md docs/pickhub-core/progress.json package.json tests/phase1/progress.test.js docs/superpowers/plans/2026-09-02-phase-1-baseline-schema-ledger.md
git commit -m "chore: start phase 1 foundation hardening"
```

### Task 2: Restore Session-Derived Navigation Role

**Files:**
- Create: `tests/phase1/navigation-role.test.js`
- Modify: `lib/globalNavigation.js`
- Modify: `components/MobileBottomNav.js`
- Modify: `tests/multitenant-phase6.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `GET /api/groups/session` returning `{ session: { role } }`.
- Produces: `getGlobalNavLinksForRole(role)` and a bottom nav that hides `/admin` until the signed session says the actor is an admin.

- [x] **Step 1: Write failing behavior and boundary tests**

```js
const assert = require('assert');
const { GLOBAL_NAV_LINKS, getGlobalNavLinksForRole } = require('../../lib/globalNavigation');

assert.deepStrictEqual(
    getGlobalNavLinksForRole('member').map((link) => link.href),
    ['/quy', '/quy/members', '/quy/bxh', '/giai-dau']
);
assert.deepStrictEqual(getGlobalNavLinksForRole('admin'), GLOBAL_NAV_LINKS);
assert.deepStrictEqual(getGlobalNavLinksForRole('unexpected'), getGlobalNavLinksForRole('member'));
console.log('phase 1 navigation role behavior ok');
```

Update the Phase 6 boundary assertion so it requires `MobileBottomNav.js` to call `/api/groups/session`, and rejects both `supabase.auth` and `getCurrentGroupClient` as role sources.

- [x] **Step 2: Run tests and confirm RED**

Run: `node tests/phase1/navigation-role.test.js` and `npm run test:phase6`.

Expected: the helper is missing and the component does not call the session API.

- [x] **Step 3: Implement the pure role filter and session fetch**

```js
function getGlobalNavLinksForRole(role) {
    if (role === 'admin') return GLOBAL_NAV_LINKS;
    return GLOBAL_NAV_LINKS.filter((link) => link.href !== '/admin');
}
```

In `MobileBottomNav`, initialize role to `member`, fetch `/api/groups/session` with `cache: 'no-store'`, accept only `admin` or `member`, ignore late results after unmount, and render `getGlobalNavLinksForRole(role)`.

- [x] **Step 4: Run focused and regression tests**

Run: `node tests/phase1/navigation-role.test.js`, `npm run test:phase6`, `npm run test:mobile-nav`, and `npm run test:leaderboard`.

Expected: all commands exit 0.

- [x] **Step 5: Commit**

```bash
git add lib/globalNavigation.js components/MobileBottomNav.js tests/phase1/navigation-role.test.js tests/multitenant-phase6.test.js package.json
git commit -m "fix: derive mobile navigation role from signed session"
```

### Task 3: Establish One Deterministic CI Command

**Files:**
- Modify: `tests/court-energy-css.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing named test scripts.
- Produces: `npm run test:regression` and `npm run test:ci`.

- [x] **Step 1: Reproduce the stale CSS failure**

Run: `npm run test:court-energy-css`.

Expected: ENOENT for deleted legacy files `app/giai-dau/dashboard.css` and `app/giai-dau/live/live.css`.

- [x] **Step 2: Remove only obsolete legacy assertions**

Delete reads and assertions for the two files removed by tournament v2 clean-slate commit `b5a009a`; retain all current global, header, navigation, fund, and admin Court Energy assertions.

- [x] **Step 3: Add aggregate scripts**

Add `test:regression` to run Phase 1, teamfund, phases 2–6, navigation, leaderboard, debug guard, admin auth, Court Energy, and tournament tests. Add `test:ci` to run `test:regression` followed by `next build`. Keep the live Supabase isolation test separate as `test:isolation`.

- [x] **Step 4: Run the aggregate test command**

Run: `npm run test:regression`.

Expected: all deterministic suites exit 0.

- [x] **Step 5: Commit**

```bash
git add tests/court-energy-css.test.js package.json
git commit -m "test: establish phase 1 regression baseline"
```

### Task 4: Build a Reproducible Migration Ledger

**Files:**
- Create: `lib/migrationLedger.js`
- Create: `scripts/migration-ledger.js`
- Create: `tests/phase1/migration-ledger.test.js`
- Create: `database/migrations/017_phase1_migration_ledger.sql`
- Modify: `package.json`

**Interfaces:**
- Consumes: a directory of files named `NNN_description.sql`.
- Produces: `buildMigrationLedger(directory) -> { migrations, duplicateVersions }`, `renderLedgerSql(migrations) -> string`, and CLI modes `--format json|sql --output <path>`.

- [x] **Step 1: Write the failing ledger test**

Use a temporary directory containing `001_first.sql`, `002_second.sql`, and `002_duplicate.sql`. Assert normalized LF hashing, lexicographic order, the literal SHA-256 `b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd` for `SELECT 1;\n`, duplicate version reporting for `002`, SQL literal escaping, immutable `ON CONFLICT DO NOTHING` behavior, and non-migration file exclusion.

- [x] **Step 2: Run the test and confirm RED**

Run: `node tests/phase1/migration-ledger.test.js`.

Expected: FAIL because `lib/migrationLedger.js` does not exist.

- [x] **Step 3: Implement the pure ledger module**

Use only `fs`, `path`, and `crypto`. Normalize CRLF to LF and guarantee one trailing newline before hashing. Key rows by immutable filename; report duplicate numeric versions without renaming historical files.

- [x] **Step 4: Implement the CLI and protected ledger table**

The CLI parses `--directory`, `--format`, and optional `--output`, then writes JSON or SQL. Migration 017 creates `pickhub_schema_migrations(filename text primary key, version integer, checksum text, applied_at timestamptz, applied_by text)` with a 64-hex checksum constraint, enables RLS, and grants no anon/authenticated policy.

- [x] **Step 5: Run focused tests and generate the local ledger**

Run: `npm run migration:ledger -- --format json --output docs/pickhub-core/evidence/phase-1-local-migration-ledger.json`.

Expected: JSON lists every migration and reports the two historical `011_*` files under duplicate version `11`.

- [x] **Step 6: Commit**

```bash
git add lib/migrationLedger.js scripts/migration-ledger.js tests/phase1/migration-ledger.test.js database/migrations/017_phase1_migration_ledger.sql docs/pickhub-core/evidence/phase-1-local-migration-ledger.json package.json
git commit -m "feat: add reproducible migration ledger"
```

### Task 5: Add Production Schema Preflight

**Files:**
- Create: `database/audits/phase-1-schema-preflight.sql`
- Create: `database/audits/README.md`

**Interfaces:**
- Consumes: PostgreSQL catalogs plus PickHub public-schema tables.
- Produces: read-only result sets for migration ledger, table classification, missing/null tenant IDs, duplicate member names, orphan foreign keys, constraints, indexes, and RLS policies.

- [x] **Step 1: Write the read-only audit SQL**

Every statement must be `SELECT` or `WITH ... SELECT`. Use `to_regclass`/catalog queries so missing legacy tables are reported instead of crashing. Include explicit checks for `club_members`, `ranking_snapshots`, tournament v2 tables, `fund_events`, `quy_pickleball`, and the migration ledger.

- [x] **Step 2: Document the run contract**

Document: run against staging first, save unedited results in the Phase 1 evidence directory, never run migration 017 until its checksum SQL has been reviewed, and do not claim schema inventory complete until production output is attached.

- [x] **Step 3: Verify the artifact is read-only**

Run a repository search that rejects `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, `CREATE`, `TRUNCATE`, `GRANT`, and `REVOKE` outside SQL comments in the audit file; inspect every reported statement manually.

- [x] **Step 4: Run the full local gate**

Run: `npm run test:ci`.

Expected: tests and production build exit 0; warnings are recorded for the dependency-baseline follow-up plan.

- [x] **Step 5: Commit**

```bash
git add database/audits/phase-1-schema-preflight.sql database/audits/README.md
git commit -m "chore: add phase 1 schema preflight"
```
