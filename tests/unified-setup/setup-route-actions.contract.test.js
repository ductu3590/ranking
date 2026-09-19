'use strict';

// CONTRACT CONFORMANCE — POST /api/tournament-v2/setup new actions (08_FROZEN_CONTRACT.md
// section 3) and the tenant/guard invariants of section 8.
//
// EVIDENCE KIND: static source inspection of the route module. It proves the route contains
// the branches and the mapping table; it does NOT prove any HTTP status was ever returned.
// Real status codes require the live/browser harness.

const { readSource, createChecker, stripJsComments, exists } = require('./_harness');

const check = createChecker('setup route actions + error mapping', 'static');
const route = stripJsComments(readSource('app/api/tournament-v2/setup/route.js'));

// ---------- existing actions must survive ----------
for (const action of ['replace_roster', 'lock_roster', 'unlock_roster', 'configure_top_two_playoff']) {
    check.match(route, new RegExp(`['"]${action}['"]`), `existing action ${action} is preserved`);
}

// ---------- new actions ----------
check.match(route, /['"]replace_participants['"]/, 'action replace_participants exists');
check.match(route, /['"]repair_legacy_pairs['"]/, 'action repair_legacy_pairs exists');
check.match(route, /replace_division_participants_revisioned/, 'replace_participants maps to RPC replace_division_participants_revisioned');
check.match(route, /repair_legacy_division_pair_identity/, 'repair_legacy_pairs maps to RPC repair_legacy_division_pair_identity');
check.match(route, /p_participants/, 'participants payload is forwarded as p_participants');
check.match(route, /p_tournament_club_id/, 'tournament_club_id is forwarded as p_tournament_club_id');
check.match(route, /p_dry_run/, 'dry_run is forwarded as p_dry_run');

// ---------- dry_run defaults to true, server-side ----------
check.match(
    route,
    /dry_run[\s\S]{0,120}!==\s*false|dry_run[\s\S]{0,120}\?\?\s*true|Boolean\([^)]*dry_run[^)]*\)\s*!==\s*false/,
    'dry_run defaults to TRUE on the server (an omitted dry_run must never apply)',
);

// ---------- confirm_apply guard ----------
check.match(route, /confirm_apply/, 'the confirm_apply guard exists');
check.match(route, /REPAIR_CONFIRMATION_REQUIRED/, 'missing confirm_apply produces code REPAIR_CONFIRMATION_REQUIRED');
check.match(
    route,
    /REPAIR_CONFIRMATION_REQUIRED[\s\S]{0,200}status:\s*400|status:\s*400[\s\S]{0,200}REPAIR_CONFIRMATION_REQUIRED/,
    'REPAIR_CONFIRMATION_REQUIRED is returned as HTTP 400',
);

// ---------- error -> HTTP mapping table ----------
const conflictCodes = [
    'SETUP_REVISION_CONFLICT', 'ROSTER_LOCKED', 'IDEMPOTENCY_KEY_REUSED',
    'ROSTER_MEMBER_IN_ACTIVE_PAIR', 'REPAIR_BLOCKED_FIXTURES_EXIST', 'REPAIR_BLOCKED_ATHLETE_REUSE',
];
for (const code of conflictCodes) {
    check.match(route, new RegExp(code), `error code ${code} is recognised by the route`);
}
check.match(route, /'40001'|"40001"/, 'pg 40001 maps to 409');
check.match(route, /REPAIR_ENTRY_MEMBER_COUNT_INVALID/, 'REPAIR_ENTRY_MEMBER_COUNT_INVALID is recognised (400)');
check.match(route, /'22023'|"22023"/, 'pg 22023 maps to 400');
check.match(route, /P0002/, 'pg P0002 is recognised');
check.match(route, /DIVISION_NOT_FOUND/, 'P0002 surfaces as code DIVISION_NOT_FOUND (404)');
check.match(route, /'23503'|"23503"/, 'pg 23503 is recognised');
check.match(route, /SETUP_SCOPE_MISMATCH/, '23503 surfaces as code SETUP_SCOPE_MISMATCH (409)');

// ---------- payload validation ----------
check.match(route, /SETUP_PAYLOAD_INVALID/, 'invalid payloads return SETUP_PAYLOAD_INVALID (400)');
check.match(route, /expected_setup_revision|expectedSetupRevision/, 'expected_setup_revision is required on every mutation');
check.match(route, /idempotency_key|idempotencyKey/, 'idempotency_key is required on every mutation');
check.match(route, /128/, 'the participants array is bounded at 128 items (contract section 2)');
check.match(route, /client_ref/, 'each participant carries a client_ref');
check.match(
    route,
    /(new\s+Set\([\s\S]{0,200}client_ref[\s\S]{0,200}\)[\s\S]{0,120}(size|length))|duplicate|DUPLICATE/i,
    'duplicate client_ref values in one payload are rejected (contract section 2: client_ref distinct)',
);

// ---------- tenant + auth invariants ----------
check.match(route, /requireValidatedGroupAdmin/, 'every setup request goes through requireValidatedGroupAdmin');
check.match(route, /p_group_id:\s*Number\(groupId\)/, 'group_id passed to every RPC comes from the validated session');
check.noMatch(route, /body\?\.\s*group_id|body\.group_id|groupId\s*=\s*body/, 'group_id is never read from the request body');
check.noMatch(route, /group_session/, 'the route never echoes the session cookie');

// ---------- helper modules named by the frozen contract (section 7) ----------
for (const file of ['lib/tournament/setupParticipants.js', 'lib/tournament/legacyPairRepair.js']) {
    check.ok(exists(file), `${file} exists (frozen contract section 7, API worker deliverable)`, `${file} is missing`);
}

check.done();
