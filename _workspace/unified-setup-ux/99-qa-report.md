# R5 Verification Report

2026-09-21. **RELEASE BLOCKED; acceptance partial; do not proceed to 3.6.** No commits. Pre-existing R1-R5 changes retained. This report supersedes the contradictory Wave 4 status, not its historical artifacts.

## Requirements and parent verification

Authority: sections 7, 8 and 12 of `docs/superpowers/plans/2026-09-19-unified-internal-tournament-setup-parallel.md`. Required browser invariants and before/after evidence remain blocking if unverified. Repeated requests are observations, NOT a new release gate requiring a waiver.

Reviewed parent output: `C:\Users\ductu\AppData\Roaming\Code\copilot-terminal-output\copilot-terminal-output-0f9903da-60e5-4ce2-bcc6-02a43781515e.txt`.

| Command | Observed result |
|---|---|
| phase3 wizard and ui-unified-wizard contracts | PASS |
| v2 run-all | Static/runtime PASS; browser SKIP without env even though runner labels exit=0 as PASS |
| legacy run-all | NOT GREEN: browser PASS 0 / FAIL 0 / BLOCKED 13, child exit=2; other children pass |
| test:t-setup; test:regression | PASS; regression includes engine/API/UI/draw suites |
| build | PASS with hook/img warnings and dynamic-route diagnostics |
| diff-check | No whitespace errors; LF/CRLF warnings |

PowerShell semicolon-separated commands continued after the blocked suite; final exit 0 is not aggregate success. Legacy prerequisite messages are harness diagnostics, not independent proof that database RPCs are missing.

## Fresh scoped browser evidence

Started this checkout's production build at `http://127.0.0.1:3100`. Earlier provisioning attempts failed because port 3100 had no listener and unrelated port 3000 returned 404; starting the correct server resolved this. New groups **54/55** created through official group/login APIs with random secrets outside the repo. No writes to group 1/46, no triggers disabled, no operating data deleted.

`tests/unified-setup-v2/browser/r5-internal-doubles.browser.test.js`:

- Initial live PASS: desktop tournament 188 stages 275/276; mobile tournament 189 stages 277/278.
- After adding recorded artifacts/protected-group guard, live PASS: desktop **190**, stages **279/280**; mobile **191**, stages **281/282**.
- Desktop 1440x900 and mobile 390x844: 14 mapped members -> seven rendered pairs -> groups 4/3 -> preview 12 -> finalize and console navigation.
- Independent API assertions: two stages in same division; nine group matches; three knockout matches; 12 unique persisted IDs; keys F/SF1/SF2; null knockout entry/entrant IDs; locked group draw.
- Raw readback: `_workspace/unified-setup-ux/r5-evidence/2026-09-21T14-35-25-878Z/persisted-fixtures.json`; screenshots `desktop.png` and `mobile.png` in that directory.

Historical stage-only browser assertions did NOT prove 12 persisted matches. Preview text cannot substitute for persistence assertions. The new run independently supplies that proof; it does not retroactively strengthen old evidence.

The narrow harness does not assert preview/persisted identity equivalence, actual progression, bronze-on, no duplicate entities, not auto-LIVE, reload, idempotency, auth, or full accessibility. Mobile clicks alone do not establish no overflow/44px/focus/theme compliance.

`t3.2-edge-journeys.test.js` runtime/static PASS; with credentials it prints `INFO browser/live environment is provisioned; execute browser integration coverage separately.` That is NOT live edge execution. `t3.3-accessibility-responsive.test.js`: **14 PASS, 0 FAIL, static only**.

## Performance evidence

Inspected corrected `scripts/qa/perf-after-unified-setup.js`: request ownership fixed at request start, bounded body drain/quiet wait, failures and unknown bodies explicit, warm-up excluded, repeats counted within runs. `tests/unified-setup-v2/perf/recorder-statistics.test.js` PASS for ownership, draining, failures, timeout, quiet bound, per-run repeats, warmup exclusion and derivation.

Historical `perf-evidence/2026-09-21T09-23-41-770Z/perf-after.derived.json` is **derived, not remeasured**. Offline derivation cannot repair historical phase-attribution races or missing bodies; retained timings/mutation values are historical reports.

Corrected recorder-v2 artifact: `_workspace/unified-setup-ux/perf-evidence/2026-09-21T14-28-55-233Z/perf-after.json` and `perf-after.md`: five measured runs plus excluded warm-up, group 52, 14 members, 1440x900, production server, Chrome 153.0.8010.52, Windows/Node 25.3.0.

| Flow | Requests/run | UI median / p95 ms | Mean known decoded bytes |
|---|---:|---:|---:|
| Open | 2 | 1300 / 1560 | 1062 |
| Save | 1 | 1161 / 1293 | 754 |
| Preview | 3 | 2740 / 3019 | 13804 |
| Finalize + console | 35 | 5589 / 5828 | 239894 |

Add selection 45/49ms median/p95; remove 419/421ms, ending at selection text render. **captureComplete=false**: byte totals contain known bodies only. Five roster requests across five runs, zero within-run repeats; courts/venues zero in captured phases. Finalize has within-run repeats for session, tournament, stages, assignments, divisions, setup, branding and notifications. Matching method/URL alone does not establish redundant work.

**Comparable before/after remains incomplete.** Legacy baseline finalizes singles versus current doubles, with different quiet delays/mutation boundaries and mixed Content-Length/decoded-body payload semantics. Current journey timing includes 650ms quiet waiting, excludes body drain, and is not API latency. No controlled speedup or complete comparable report claim is justified. Performance gate remains BLOCKED, not because repeated requests need a new waiver.

## Formal gates and exact pending work

| Gate/scenario | Current status and pending verification | Owner |
|---|---|---|
| 14 people / two stages / 12 fixtures | Narrow persisted-count proof PASS; verify preview match IDs, duplicate entities, not auto-LIVE, explicit progression references and actual cross-group advance | API + QA |
| Main T3.1 journey | PARTIAL: search/filter/unselect, draw swap, save/reload/resume, complete-results advance; bronze-on 13 fixtures | UI/API + QA |
| Stable/locked pairs and odd 15 | Runtime/static PASS; browser persistence and odd finalize denial unverified | UI + QA |
| Live edge boundaries | Two-admin 409/rehydration; checkpoint retry/idempotency; member 403; tenant isolation; empty/error/retry; duplicate-name/rename identity; missing-athlete/cross-tenant member; redirects | API/UI + QA |
| Result protection | Runtime/static PASS; persist results, attempt structural writes and verify scores/structure unchanged; incomplete advance live denial | API + QA |
| Accessibility/theme | Static PASS; mobile clicks PASS; measure overflow/44px, keyboard/focus, tablet rail, setup/console theme and loading/error/empty states | UI + QA |
| Legacy browser | Parent BLOCKED; historical obsolete-selector failure not repaired by narrow harness. Rehome scenarios without silently dropping them | QA + integrator |
| Before/after | BLOCKED comparable evidence; match format, fixture, environment, timing/byte semantics; account for unavailable bodies | Performance QA |
| DDL/advisors | Tree now contains 090-093. Historical advisor review for 090 is not sign-off for 091-093; verify live ledger/RPC grants/search_path and advisors | API/integrator |

## Retained fixtures and history

Groups **54/55 retained**, not cleaned. Group 54: 14 members, four finalized tournaments 188-191. Group 55 provisioned but tenant-isolation acceptance not executed. Secrets only in `%TEMP%/pickhub-r5-final.env`.

Existing cleanup refuses member/global-athlete links and unlocks divisions before deletion. No cleanup writes attempted; no bypass or trigger disabling. Pending reviewed cleanup scoped only to manifest groups 54/55 with global-identity/cross-tenant checks. Preserve group 1/46 and operating data.

Historical group-46 run PASS 0 / FAIL 12 / BLOCKED 1 stopped at obsolete selectors. Earlier notes claimed groups 48/49 cleaned; this pass did not reverify that operation or endorse trigger bypass. Keep both distinct from current evidence.

## Decision

Narrow bronze-off persisted-match evidence and report reconciliation completed. Overall acceptance remains **PARTIAL / RELEASE BLOCKED** by unverified formal browser requirements and non-comparable performance evidence. Only QA harness/docs/evidence changed in this pass, no production dev code.# Wave 4 QA Report - Unified Internal Tournament Setup

Date: 2026-09-21
Branch/HEAD: `feat/tournament-unified-setup-ux` / `4f9c2af`
Status: **RELEASE BLOCKED - do not proceed to 3.6.**

## Scope and environment

- Wave 4 commands were run from this worktree with `PICKHUB_TASK_ID=T2.D`.
- Browser fixture was scoped to test `group_id=46`; credentials are redacted and not stored here.
- Local QA endpoint: `http://127.0.0.1:3100`; direct HTTP health check returned `200`.
- Browser: `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- This release contains DDL since the baseline: `database/migrations/090_unified_setup_friendly_invites.sql`.

## Required Section 8 commands - real output summary

| Command | Result | Real output / note |
|---|---|---|
| `node tests/phase3/wizard-redesign-contract.test.js` | PASS | `phase3 T0.2 red contract: four-step wizard acceptance checks` |
| `node tests/tournament/ui-unified-wizard.contract.test.js` | PASS | `ui T0.2 red contract: draft, preview, finalize boundary checks` |
| `node tests/unified-setup-v2/run-all.js` | PASS (static) | Domain/pairing/guard acceptance passed; T3.1/T3.2 passed; T3.3 static QA `13 PASS, 0 FAIL`. Its live browser subset is SKIP when run without fixture. |
| `node tests/unified-setup/run-all.js` | BLOCKED | Static/runtime subtests passed, but required `wizard-journey.browser.test.js` reported `PASS 0 / FAIL 0 / BLOCKED 13` without fixture, exit `1`. |
| `npm run test:t-setup` | PASS | Setup draw, atomic draw RPC/unlock, and concurrency/progression runtime tests passed. |
| `npm run test:t-engines` | PASS | All engine tests passed, including round-robin, knockout, bronze final, and mix integration. |
| `npm run test:t-api` | PASS | Persistence/results plus all tournament API contracts passed. |
| `npm run test:t-ui` | PASS | All tournament UI contracts passed. |
| `npm run test:t-draw` | PASS | Draw/qualification/correction/migration/API/UI draw tests passed. |
| `npm run test:regression` | PASS | All configured phase, account, tournament, and open-registration suites passed. |
| `npm run build` | PASS with existing warnings | Next.js compiled, lint/type checks, page generation, traces, and optimization completed. Existing hook-dependency and `img` warnings remain; dynamic route messages did not fail the build. |

## Browser journey - scoped fixture

The fixture was loaded from `%TEMP%\\pickhub-w4.env`; all required session/group variables were set and the local endpoint returned HTTP 200 before the rerun.

Command:

`node tests/unified-setup/wizard-journey.browser.test.js`

Actual result: **FAIL - `PASS 0 / FAIL 12 / BLOCKED 1`, exit 1.**

All 12 required scenarios stopped at the first form selection. The harness timed out after 30 seconds waiting for the `Cặp đôi` button (and the legacy-singles scenario waited for `Cá nhân`):

`locator.click: Timeout 30000ms exceeded; waiting for getByRole('button', { name: /Cặp đôi/ }).first()`

This blocks the happy path, bronze-on/off 12/13-match proof, reload/resume, tiebreak, correction/unseed, two-admin 409, member authorization, tenant isolation, responsive browser measurement, and legacy singles proof. The optional legacy repair dry-run is separately BLOCKED because `PICKHUB_QA_ALLOW_T47_DRYRUN=1` and `PICKHUB_QA_T47` were intentionally not set.

Artifacts created by the harness:

- `_workspace/claude-unified-setup-handoff/evidence/browser/run-summary-20260921023000.json`
- `_workspace/claude-unified-setup-handoff/evidence/browser/created-scope-20260921023000.json`
- `_workspace/claude-unified-setup-handoff/evidence/browser/FAIL-A-journey-bronze-off-20260921023000.png` (and the corresponding screenshots for each failed scenario)

Routing: browser harness selector/wizard entry mismatch. Investigate `tests/unified-setup/wizard-journey.browser.test.js:184-185` against the current UI rendered by the server on port 3100 before treating this as a product regression. The harness must be repaired or the UI must restore the contract, then all journeys must be rerun successfully.

## Performance comparison - T0.3 scenario

The exact T0.3 command was attempted after loading the same scoped fixture and setting Chrome:

`node scripts/qa/perf-baseline-unified-setup.js`

Actual result: **BLOCKED, exit 2**:

`TournamentSetupWorkspace đã được wire vào TournamentWizard.js - UI cũ không còn, mất điểm baseline`

The script is expressly a before-baseline script and refuses to measure once the four-step workspace is wired. No replacement after-measurement script exists in `scripts/qa/`; no latency, request count, payload, duplicate-load, or add/remove response values were fabricated.

| Metric | Before (T0.3, 2026-09-20) | After (Wave 4) | Status |
|---|---|---|---|
| Open draft | 5 requests; median 1634 ms; p95 1701 ms; 2506 B | Not measured | BLOCKED: legacy-only script |
| Save draft | BLOCKED (browserStorage-only legacy UI) | Not measured | BLOCKED: no four-step measurement |
| Preview schedule | 1 request; median 1099 ms; p95 1245 ms; 1027 B | Not measured | BLOCKED: legacy-only script |
| Finalize | 35 requests; median 17268 ms; p95 17394 ms; 1763820 B | Not measured | BLOCKED: legacy-only script |
| Roster/court duplicate loads | Roster 1 / courts 0 | Not measured | BLOCKED: no four-step measurement |
| Add/remove settled time | 595 ms / 586 ms | Not measured | BLOCKED: no four-step measurement |

This alone triggers the second Section 8 release gate: there is no required before/after performance report on the same conditions.

## Supabase advisors for DDL

Supabase advisors were queried for project `uhhlelemewilgsdijwja` after detecting migration 090.

| Type | Finding | Count | Severity |
|---|---|---:|---|
| Security | `rls_enabled_no_policy` | 52 | INFO |
| Security | `function_search_path_mutable` | 1 | WARN |
| Security | `anon_security_definer_function_executable` | 7 | WARN |
| Security | `authenticated_security_definer_function_executable` | 7 | WARN |
| Security | `auth_leaked_password_protection` | 1 | WARN |
| Performance | `unindexed_foreign_keys` | 116 | INFO |
| Performance | `auth_rls_initplan` | 7 | WARN |
| Performance | `unused_index` | 24 | INFO |

These are project-level findings. They were not remediated in this release-gate run. The WARN findings require owner triage before a security sign-off; advisor remediation URLs are in the Supabase output captured by this session.

## Section 8 release blockers

### First group

| Gate | Result |
|---|---|
| UX-01 / ATH-01..07 | Static/contracts green where covered; end-to-end browser proof FAILS at wizard entry. |
| Preview/finalize invariants | Static v2 suite PASS; browser proof FAILS. |
| Finalize idempotency/error handling | Static durable-checkpoint/edge contracts PASS; browser proof FAILS. |
| Main browser journey | **FAIL**. |

### Second group

| Gate | Result |
|---|---|
| 14 people -> 12 matches, two stages, progression | Static/domain T3.1 PASS; browser proof FAILS. |
| Add/remove does not break pairs | Static pairing T3.2 PASS; browser proof FAILS. |
| Result-bearing tournament blocks structure change | Static guard T3.2 PASS; browser proof FAILS. |
| Theme has no mixed light/dark path | Static T3.3 PASS; browser responsive/visual proof FAILS. |
| Before/after performance report | **BLOCKED**. |

## Section 12 checklist

| Checklist item | Status | Evidence |
|---|---|---|
| Sessions set task ID and read invariant skill | PASS for this Wave 4 run | `PICKHUB_TASK_ID=T2.D`; skill read before commands. |
| T0.1 locked contract | PASS | `_workspace/unified-setup-ux/00-contract.md`. |
| T0.2 red evidence, 14-person case | PASS | Required contract commands and T3.1 static test. |
| T0.3 quantitative/live baseline | PARTIAL | Before baseline exists; after measurement BLOCKED. |
| Wave 1 overlap resolved | PASS in current tracked worktree | `git status` only has pre-existing untracked harness artifacts and `skills-lock.json`. |
| Domain/API suites after Wave 1 | PASS | T3 v2, `test:t-engines`, `test:t-api`. |
| Wave 2 shared entry point rule | NOT RE-VERIFIED | Historical ownership claim not independently auditable from this run. |
| Duplicate console removed from primary path | NOT BROWSER-VERIFIED | Browser harness failed before entry. |
| T2.E interclub workspace + test | PASS static | Regression includes `interclub-ui.test.js`. |
| Browser happy path desktop and 390px | **FAIL** | 12 scenarios fail at unit selector. |
| Revision conflict/retry/idempotency | PASS static / FAIL browser | Durable/edge contracts PASS; browser scenario blocked by selector. |
| Preview/finalize identities and counts | PASS static / FAIL browser | T3.1 passes; browser happy path fails. |
| Two stages + progression / 12 matches | PASS static / FAIL browser | T3.1 passes; browser happy path fails. |
| Stable pairs / locked pair preservation | PASS static / FAIL browser | T3.2 passes; browser journey fails. |
| Odd roster finalize guard | PASS static / FAIL browser | T3.2 passes; browser journey fails. |
| Result lock | PASS static / FAIL browser | T3.2 passes; browser journey fails. |
| Theme / no `ops-*` conflict | PASS static / FAIL browser | T3.3 static passes; viewport journey fails. |
| Same-condition before/after performance | **BLOCKED** | No post-wire measurement harness. |
| Regression and production build | PASS | `npm run test:regression`, `npm run build`. |
| QA report and evidence | PASS (this report and evidence file) | Paths below. |

## Final decision

**Do not release and do not start 3.6.** The Section 8 browser-release gate is red and the required performance comparison is blocked. Fix the wizard journey entry selector/contract, add or adapt a four-step performance measurement that matches T0.3 conditions, rerun all required browser scenarios until green, then regenerate this report.