'use strict';

// REPRODUCTION TEST 4 — "a legacy repair that creates NEW entries beside the old ones is
// forbidden".
//
// The failure mode this guards against is the tempting shortcut: instead of giving the eight
// existing tournament_entries of division 35 a pair identity, a repair could simply run the
// normal pairing flow and INSERT seven brand-new pair-backed entries, leaving the original
// eight untouched next to them (15 entries, duplicated people, broken seeds) - or worse,
// delete the originals. 08_FROZEN_CONTRACT.md section 2 (075) and 05_ACCEPTANCE_AND_REPAIR.md
// section C both forbid this: "keep eight entry IDs ... Never reduce this tournament to seven
// pairs or delete/recreate it".
//
// If the migration file does not exist yet this test FAILS LOUDLY. It must never skip.
//
// EVIDENCE KIND: static SQL text inspection. It proves the shape of the proposed SQL only.
// Whether the deployed function behaves this way is live-DB evidence that QA cannot produce
// (QA has no database access); the lead applies and verifies 074/075.

const { readSource, createChecker, stripSqlComments, exists } = require('./_harness');

const check = createChecker('legacy pair repair SQL (075)', 'static');
const FILE = 'database/migrations/075_legacy_division_pair_repair.sql';

if (!exists(FILE)) {
    check.fail(
        `${FILE} is MISSING`,
        'The frozen contract (section 2) reserves migration 075 for repair_legacy_division_pair_identity, proposed by the API worker. Until the file exists the repair cannot be reviewed and tournament 47 cannot be repaired. This is a FAIL, not a skip.',
    );
    check.done();
    return;
}

const raw = readSource(FILE);
const sql = stripSqlComments(raw);

// --- 1. No new entries, ever ---
check.noMatch(sql, /insert\s+into\s+(public\.)?tournament_entries\b/i, 'repair never INSERTs into tournament_entries (existing entries are reused, not duplicated)');
check.noMatch(sql, /insert\s+into\s+(public\.)?tournament_entry_members\b/i, 'repair never INSERTs into tournament_entry_members (member snapshot rows are untouched)');
check.noMatch(sql, /delete\s+from\s+(public\.)?tournament_entr/i, 'repair never DELETEs entries or entry members');

// --- 2. No destructive DDL/DML. DROP FUNCTION of the function being (re)defined is the one
//        accepted form and is excluded before the check, everything else is forbidden. ---
const withoutFunctionDrops = sql.replace(/drop\s+function[^;]*;/gi, ' ');
check.noMatch(withoutFunctionDrops, /\bdrop\b/i, 'repair contains no DROP other than a DROP FUNCTION of the repair function itself');
check.noMatch(sql, /\btruncate\b/i, 'repair contains no TRUNCATE');
check.noMatch(sql, /\balter\s+table\s+[^;]*drop\s+column/i, 'repair drops no column');

// --- 3. The actual mechanism: UPDATE the existing entry's pair_id ---
check.match(sql, /update\s+(public\.)?tournament_entries\s+set[\s\S]{0,400}?pair_id/i, 'repair sets tournament_entries.pair_id on the EXISTING rows');
check.match(sql, /insert\s+into\s+(public\.)?tournament_pairs\b/i, 'repair creates the tournament_pairs row it links');
check.match(sql, /insert\s+into\s+(public\.)?tournament_pair_members\b/i, 'repair creates two tournament_pair_members per pair');
check.match(sql, /insert\s+into\s+(public\.)?tournament_athletes\b/i, 'repair creates the missing tournament_athletes identities');
check.match(sql, /insert\s+into\s+(public\.)?tournament_division_roster_members\b/i, 'repair adds the derived identities to the division roster');

// --- 4. Identity is derived per entry member id, never by display name ---
check.match(sql, /legacy:entry_member:/, "identity client_ref is derived from the entry member id ('legacy:entry_member:' || em.id)");
check.noMatch(sql, /insert\s+into\s+(public\.)?athletes\b/i, 'repair never fabricates a global athletes row');
check.noMatch(sql, /\bilike\b/i, 'repair does no fuzzy (ILIKE) name matching');
check.noMatch(sql, /lower\s*\(\s*[a-z_.]*display_name/i, 'repair does no case-folded display-name matching');
check.noMatch(sql, /group\s+by[^;]{0,120}display_name/i, 'repair never groups/deduplicates identities by display name');

// --- 5. Hard refusals must RAISE, not silently skip ---
for (const code of [
    'REPAIR_ENTRY_MEMBER_COUNT_INVALID',
    'REPAIR_BLOCKED_FIXTURES_EXIST',
    'REPAIR_BLOCKED_ATHLETE_REUSE',
    'SETUP_REVISION_CONFLICT',
    'ROSTER_LOCKED',
    'IDEMPOTENCY_KEY_REUSED',
]) {
    check.match(sql, new RegExp(code), `repair raises ${code}`);
}
check.match(sql, /raise\s+exception/i, 'repair uses RAISE EXCEPTION for its refusals');
check.match(sql, /tournament_matches/i, 'repair inspects tournament_matches before touching anything (REPAIR_BLOCKED_FIXTURES_EXIST)');
check.match(sql, /tournament_stage_transitions/i, 'repair inspects tournament_stage_transitions before touching anything');

// --- 6. Dry run writes nothing ---
check.match(sql, /p_dry_run/, 'repair takes p_dry_run');
check.match(sql, /if\s+p_dry_run[\s\S]{0,6000}?return/i, 'repair returns from the dry-run branch before any write');
for (const key of ['dry_run', 'planned', 'ambiguities', 'blockers', 'entries_updated']) {
    check.match(sql, new RegExp(`['"]${key}['"]`), `dry-run response exposes "${key}"`);
}

// --- 7. Scope, CAS, idempotency, grants ---
check.match(sql, /repair_legacy_division_pair_identity\s*\(/, 'function is named repair_legacy_division_pair_identity');
for (const param of ['p_group_id', 'p_tournament_id', 'p_division_id', 'p_expected_setup_revision', 'p_idempotency_key']) {
    check.match(sql, new RegExp(param), `signature includes ${param}`);
}
check.match(sql, /for\s+update/i, 'repair locks the division row FOR UPDATE');
check.match(sql, /tournament_setup_mutations/i, 'repair records/replays through tournament_setup_mutations');
check.match(sql, /revoke\s+all[\s\S]{0,200}public/i, 'grants are locked down (REVOKE ALL FROM PUBLIC)');
check.match(sql, /grant\s+execute[\s\S]{0,120}service_role/i, 'only service_role may EXECUTE');
check.match(sql, /security\s+definer/i, 'function is SECURITY DEFINER like 059-073');

check.done();
