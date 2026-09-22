# Release Evidence - Unified Internal Tournament Setup

Updated 2026-09-21. **RELEASE BLOCKED; R5 acceptance partial. No commits.**

Detailed results, owners, limitations and exact pending work: `_workspace/unified-setup-ux/99-qa-report.md`. Formal plan sections 7/8/12 remain authoritative; repeated requests do not create an additional release gate.

## Current verified evidence

- Parent output reviewed: `C:\Users\ductu\AppData\Roaming\Code\copilot-terminal-output\copilot-terminal-output-0f9903da-60e5-4ce2-bcc6-02a43781515e.txt`. Contracts, v2 static/runtime, setup, regression and build pass. V2 browser entries SKIP without env. Legacy browser: **BLOCKED 13, child exit 2** despite final shell exit 0. Diff-check reports only LF/CRLF warnings.
- New scoped groups **54/55**; this checkout's production server at port 3100. Group 1/46 untouched, no disabled triggers, no operating data deletion.
- Updated narrow browser harness PASS **1440x900 and 390x844**: recorded tournaments **190/191**, stages **279/280** and **281/282**. API readback verifies nine group matches plus three knockout placeholders, 12 unique persisted IDs, same-division stages and locked draw. Seven rendered pairs from 14 identity-mapped members; no fake knockout entrants.
- Raw API readback/screenshots: `_workspace/unified-setup-ux/r5-evidence/2026-09-21T14-35-25-878Z/persisted-fixtures.json`, `desktop.png`, `mobile.png`. Initial run also passed tournaments 188/189. All four retained, not cleaned.
- Historical browser test asserted only two stages: it did NOT prove 12 persisted matches. The new API assertions close that narrow gap independently, not retroactively.
- Edge assertions pass at runtime/static level, not live browser level; accessibility **14 PASS / 0 FAIL is static**. Mobile clicks alone do not prove full responsive/theme compliance.

## Performance, with limits

Corrected recorder evidence: `_workspace/unified-setup-ux/perf-evidence/2026-09-21T14-28-55-233Z/perf-after.json` and `perf-after.md`, five runs plus excluded warm-up, group 52, production build, 1440x900.

| Flow | Requests/run | Median / p95 ms | Mean known decoded bytes |
|---|---:|---:|---:|
| Open | 2 | 1300 / 1560 | 1062 |
| Save | 1 | 1161 / 1293 | 754 |
| Preview | 3 | 2740 / 3019 | 13804 |
| Finalize + console | 35 | 5589 / 5828 | 239894 |

**captureComplete=false**; missing bodies are unknown, not zero. Times include 650ms quiet wait and exclude body drain, not API latency. Add/remove selection-render median/p95: 45/49ms and 419/421ms. Legacy singles/current doubles, differing settle boundaries and mixed byte encodings prevent a controlled comparison. **Comparable before/after remains incomplete and blocking.**

Historical `2026-09-21T09-23-41-770Z/perf-after.derived.json` is offline derivation, not a fresh measurement; phase races/missing bodies cannot be repaired offline. Corrected recorder/statistics tests PASS. Within-run repeated URLs are diagnostic observations, not automatically redundant and not a new release gate requiring a waiver.

## Exact remaining acceptance

Current-UI save/reload and preview-ID equivalence, no duplicate entities/not auto-LIVE, bronze-on 13 fixtures, actual cross-group advance, locked pairing/odd-15 browser persistence, live conflict/retry/idempotency/auth/tenant/result-lock edges, redirects, accessibility/theme measurements. Restore full required browser coverage without dropping obsolete-harness scenarios. Obtain equivalent-condition before/after measurements with honest missing-body accounting. Verify migrations 091-093 live ledger/RPC privileges/advisors; historical 090 findings are not fresh sign-off.

Groups **54/55 retained** pending reviewed scoped cleanup; existing cleanup refuses linked members/athletes and was not bypassed. Secrets only in `%TEMP%/pickhub-r5-final.env`. Preserve groups 1/46. Historical group-46 selector failures and earlier 48/49 cleanup claims are not new verification results.# Release Evidence - Unified Internal Tournament Setup

Date: 2026-09-21
Decision: **BLOCKED - not release-ready**

The detailed report is `_workspace/unified-setup-ux/99-qa-report.md`.

## Retained real evidence

- Required static/contract/release suites and `npm run build` were run. All passed except `node tests/unified-setup/run-all.js`, which returned exit 1 because its required browser harness was BLOCKED when no fixture was loaded.
- With the scoped fixture loaded (`group_id=46`), `node tests/unified-setup/wizard-journey.browser.test.js` returned exit 1: `PASS 0 / FAIL 12 / BLOCKED 1`.
- The local QA endpoint returned HTTP 200 and Chrome was available. Each required browser scenario timed out waiting for the wizard's `Cặp đôi` selection button. This is a real test/harness or UI contract mismatch, not an environment omission.
- Browser screenshots and JSON summary are under `_workspace/claude-unified-setup-handoff/evidence/browser/`, including `run-summary-20260921023000.json` and `FAIL-A-journey-bronze-off-20260921023000.png`.
- Exact T0.3 scenario was attempted via `node scripts/qa/perf-baseline-unified-setup.js`; it returned exit 2 because it deliberately refuses to run once `TournamentSetupWorkspace` replaces the legacy wizard. No after-performance values exist.
- The before baseline remains `_workspace/unified-setup-ux/T0.3-perf-baseline.md`; same-condition before/after performance gate is therefore BLOCKED.
- Supabase advisors were queried because migration `090_unified_setup_friendly_invites.sql` exists. Security WARN: mutable function search path (1), anon security-definer execution (7), authenticated security-definer execution (7), leaked-password protection (1). Performance WARN: auth RLS initplan (7). These project-level findings need triage.

## Release gate outcome

- Static/domain/API/UI/regression/build: green.
- Main browser journey: red.
- Browser 390px proof: red.
- Required performance before/after: blocked.

Release remains blocked until the browser journey and four-step performance measurement both run successfully and the full Section 8 command block is green end to end.

## R5 follow-up - 2026-09-21

- A fresh, isolated browser fixture verified the supported internal doubles group-knockout path at desktop `1440x900` and mobile `390x844`: 14 members, 7 pairs, 2 stages, and 12 fixtures.
- The journey exposed and fixed three real release-path defects: the setup lacked a tournament-name input, roster identity lookup queried a nonexistent `athletes.group_id`, and the mobile bottom navigation covered the fixed setup action bar.
- The fresh fixture groups `48` and `49` were cleaned after the run. Group `48` required a guarded, transaction-scoped manual cleanup because `club_members` uses a soft-delete trigger; no operating-club data was touched.
- Static checks after the fixes passed: `node tests/unified-setup-v2/run-all.js`, `npm run build`, and `git diff --check`.
- Added `scripts/qa/perf-after-unified-setup.js` and measured the four-step workspace with one warm-up plus five desktop runs at `1440x900`, using an isolated 14-member fixture. Artifact: `_workspace/unified-setup-ux/perf-evidence/2026-09-21T09-23-41-770Z/perf-after.md`.
- After measurement: open draft `1771ms` median / `1809ms` p95 (5 requests); explicit save `1310ms` / `1945ms` (1 request); preview `2779ms` / `3094ms` (3 requests); finalize `6979ms` / `7280ms` (52 requests). Add/remove roster selection settled at `46ms` / `408ms` medians. Courts/venues had zero requests.
- The before/after evidence is now complete, but it exposes actionable duplicate loads after finalization: the console repeats session, tournament, roster, branding, notification, stage, division, assignment, and setup requests. Release remains blocked pending triage or an explicit decision to accept these measured duplicates.