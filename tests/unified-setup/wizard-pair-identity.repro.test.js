'use strict';

// REPRODUCTION TEST 1 — "wizard creates approved doubles entries with no stable pair identity".
//
// Ground truth being reproduced (08_FROZEN_CONTRACT.md section 1, live tournament 47):
// createGiai() persists tournament -> host club -> division -> stage and then only loops
// saveDivisionEntry() (legacy name-snapshot entries). It never creates tournament_athletes,
// never a tournament_division_roster_members row and never a tournament_pairs row, so every
// resulting doubles entry has pair_id IS NULL and every entry member has athlete_id IS NULL.
//
// EVIDENCE KIND: static source inspection only. Passing this file proves the persistence path
// *calls* the identity endpoints; it does NOT prove any row was written. Row-level proof needs
// the live/browser harness (wizard-journey.browser.test.js).

const { readSource, createChecker, stripJsComments } = require('./_harness');

const check = createChecker('wizard doubles pair identity (repro)', 'static');

let wizard;
try {
    wizard = readSource('app/giai-dau/v2/TournamentWizard.js');
} catch (error) {
    check.fail('app/giai-dau/v2/TournamentWizard.js must exist', error.message);
    check.done();
    return;
}
const code = stripJsComments(wizard);

const callsEntryWrite = /saveDivisionEntry\s*\(/.test(code);
const callsParticipants = /replaceDivisionParticipants\s*\(/.test(code) || /['"]replace_participants['"]/.test(code);
const callsPairConfirm = /confirmDivisionPairing\s*\(/.test(code) || /mode:\s*['"]confirm['"]/.test(code);
const callsPairPreview = /previewDivisionPairing\s*\(/.test(code);

// 1. The internal doubles branch must persist tournament-scoped identities.
check.ok(
    callsParticipants,
    'wizard persists participant identities (replaceDivisionParticipants / action replace_participants) so tournament_athletes + tournament_division_roster_members exist',
    'no call to replaceDivisionParticipants and no "replace_participants" action found in TournamentWizard.js',
);

// 2. ... and must give doubles entries a stable pair identity.
check.ok(
    callsPairConfirm,
    'wizard confirms pairs (confirmDivisionPairing / mode:"confirm") so approved doubles entries carry pair_id',
    'no pair-confirmation call found in TournamentWizard.js',
);
check.ok(
    callsPairPreview,
    'wizard previews pairing before confirming (checkpoint 6 = preview then confirm)',
    'no previewDivisionPairing call found in TournamentWizard.js',
);

// 3. The exact reproduced shape: entry writes with no identity writes at all.
check.ok(
    !(callsEntryWrite && !callsParticipants && !callsPairConfirm),
    'doubles persistence is NOT entry-only (the tournament-47 shape: saveDivisionEntry with zero athlete/roster/pair calls)',
    'TournamentWizard.js writes tournament_entries via saveDivisionEntry but performs no identity or pair write at all',
);

// 4. The doubles branch must be explicitly distinguished from singles/team,
//    because checkpoints 5-8 only run for scope internal + unit "doi".
check.match(code, /unit\s*===\s*['"]doi['"]/, 'wizard branches explicitly on unit === "doi" for the doubles identity path');
check.match(code, /scope\s*===\s*['"]internal['"]/, 'wizard branches explicitly on scope === "internal"');

// 5. Legacy journeys must keep working: singles/team/friendly still use the legacy entry writer.
check.ok(
    callsEntryWrite,
    'singles/team/community legacy path still calls saveDivisionEntry (invariant 8: legacy journeys keep working)',
    'saveDivisionEntry disappeared from TournamentWizard.js - singles/team creation would be broken',
);

check.done();
