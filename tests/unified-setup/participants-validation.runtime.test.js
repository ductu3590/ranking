'use strict';

// RUNTIME TEST - node actually executes the API worker's payload helpers.
// This is the only file in tests/unified-setup that produces runtime (not static) evidence
// without a server: lib/tournament/setupParticipants.js and lib/tournament/legacyPairRepair.js
// are pure CommonJS with no database dependency.
//
// It covers the invariants that are easiest to break silently (08_FROZEN_CONTRACT section 8):
//   7. never deduplicate on display name alone; never treat a NULL global athlete_id as an
//      invalid guest; never manufacture a club/global identity
//   5. duplicate-safety tokens are mandatory and distinct
//   and section 3: dry_run defaults to true, apply needs confirm_apply.
//
// A missing helper is a FAIL, not a skip. Note what this does NOT prove: the RPCs themselves
// are never executed here, so nothing below is evidence about the database.

const assert = require('node:assert/strict');
const { createChecker, exists } = require('./_harness');

const check = createChecker('participants + repair helpers', 'runtime');

if (!exists('lib/tournament/setupParticipants.js') || !exists('lib/tournament/legacyPairRepair.js')) {
    check.fail(
        'lib/tournament/setupParticipants.js and lib/tournament/legacyPairRepair.js must exist',
        'frozen contract section 7 assigns both files to the API worker; without them there is nothing to execute',
    );
    check.done();
    return;
}

const participants = require('../../lib/tournament/setupParticipants');
const repair = require('../../lib/tournament/legacyPairRepair');

function throws(fn) {
    try {
        fn();
        return { threw: false };
    } catch (error) {
        return { threw: true, error };
    }
}

const person = (ref, name, extra) => ({ client_ref: ref, display_name: name, athlete_id: null, source: 'guest', phr_rating: null, ...(extra || {}) });

// ---------- identity is never merged by display name ----------
const sameName = participants.normalizeParticipants([person('draft-1', 'Nguyen Van A'), person('draft-2', 'Nguyen Van A')]);
check.ok(sameName.length === 2, 'two draft rows with the SAME display name stay two distinct identities (invariant 7)');
check.ok(sameName[0].client_ref !== sameName[1].client_ref, 'they are distinguished by client_ref, not by name');

// ---------- a NULL global athlete_id is a valid guest, not an error ----------
const guest = participants.normalizeParticipant(person('draft-3', 'Khach moi'));
check.ok(guest.athlete_id === null && guest.source === 'guest', 'a guest with athlete_id null is accepted and stays tournament-local');

// ---------- a club member may not be manufactured, and a guest may not carry a global id ----------
check.ok(throws(() => participants.normalizeParticipant({ client_ref: 'x', display_name: 'A', source: 'club_member', athlete_id: null })).threw,
    'source club_member without athlete_id is rejected (no manufactured club identity)');
check.ok(throws(() => participants.normalizeParticipant({ client_ref: 'x', display_name: 'A', source: 'guest', athlete_id: 5 })).threw,
    'source guest carrying a global athlete_id is rejected');

// ---------- duplicate safety ----------
check.ok(throws(() => participants.normalizeParticipants([person('dup', 'A'), person('dup', 'B')])).threw,
    'a duplicate client_ref inside one payload is rejected');
check.ok(throws(() => participants.normalizeParticipants([
    { client_ref: 'a', display_name: 'A', source: 'club_member', athlete_id: 9 },
    { client_ref: 'b', display_name: 'B', source: 'club_member', athlete_id: 9 },
])).threw, 'the same global athlete cannot appear twice in one division payload (silent identity merge)');
check.ok(throws(() => participants.normalizeParticipant({ client_ref: '   ', display_name: 'A' })).threw, 'a blank client_ref is rejected');
// ---------- bounds ----------
const bulk = (count) => Array.from({ length: count }, (_, index) => person(`draft-${index}`, `VDV ${index}`));
check.ok(throws(() => participants.normalizeParticipants([])).threw, 'an empty participants array is rejected');
check.ok(throws(() => participants.normalizeParticipants(bulk(129))).threw, '129 participants are rejected (max 128)');
check.ok(participants.normalizeParticipants(bulk(128)).length === 128, 'exactly 128 participants are accepted');

// ---------- no mass assignment into the identity row ----------
check.ok(throws(() => participants.normalizeParticipant({ ...person('draft-9', 'A'), id: 1 })).threw,
    'an unexpected field (mass assignment) is rejected instead of being forwarded to the RPC');

// ---------- the RPC argument shape ----------
const args = participants.buildReplaceParticipantsArgs({
    groupId: 1, tournamentId: 2, divisionId: 3, tournamentClubId: 4,
    participants: [person('draft-a', 'A')], expectedSetupRevision: 5, idempotencyKey: 'k',
});
assert.deepEqual(Object.keys(args).sort(), [
    'p_division_id', 'p_expected_setup_revision', 'p_group_id', 'p_idempotency_key',
    'p_participants', 'p_tournament_club_id', 'p_tournament_id',
].sort());
check.ok(args.p_group_id === 1 && args.p_expected_setup_revision === 5, 'the RPC arguments are numeric and named exactly as the frozen signature');

// ---------- repair: dry run is the default, apply needs an explicit confirmation ----------
check.ok(repair.resolveRepairMode({}).dryRun === true, 'an omitted dry_run defaults to TRUE (never an accidental apply)');
check.ok(repair.resolveRepairMode({ dry_run: true }).dryRun === true, 'dry_run true is honoured');
const noConfirm = throws(() => repair.resolveRepairMode({ dry_run: false }));
check.ok(noConfirm.threw && noConfirm.error.code === 'REPAIR_CONFIRMATION_REQUIRED', 'dry_run:false without confirm_apply raises REPAIR_CONFIRMATION_REQUIRED');
check.ok(repair.resolveRepairMode({ dry_run: false, confirm_apply: true }).dryRun === false, 'dry_run:false + confirm_apply:true applies');
check.ok(throws(() => repair.resolveRepairMode({ dry_run: 'false' })).threw,
    'a string "false" is rejected rather than coerced into an apply');
check.ok(throws(() => repair.resolveRepairMode({ dry_run: 0, confirm_apply: true })).threw,
    'a falsy non-boolean dry_run is rejected rather than treated as apply');

// ---------- repair: identity is keyed on the entry member id ----------
check.ok(repair.legacyClientRef(26) === 'legacy:entry_member:26', 'the legacy client_ref is derived from tournament_entry_members.id');
check.ok(throws(() => repair.legacyClientRef('Nguyen Van A')).threw, 'a display name can never be used as the identity key');

// ---------- repair: an apply report without real counts is refused ----------
check.ok(throws(() => repair.normalizeRepairReport({ dry_run: false, entries: [], planned: {}, applied: {} })).threw,
    'an apply report with no setup_revision is refused instead of being reported as success');
const dryReport = repair.normalizeRepairReport({
    dry_run: true,
    entries: [{ entry_id: 26, planned: 'create_pair', members: [] }],
    planned: { athletes: 16, roster: 16, pairs: 8, pair_members: 16, entries_updated: 8 },
});
check.ok(dryReport.planned.entries_updated === 8 && dryReport.dry_run === true, 'a dry-run report keeps its planned counts intact');
check.ok(throws(() => repair.normalizeRepairReport({ dry_run: true, entries: [{ entry_id: 1, planned: 'invented' }], planned: {} })).threw,
    'an unknown "planned" value is refused (only create_pair / already_paired)');

check.done();
