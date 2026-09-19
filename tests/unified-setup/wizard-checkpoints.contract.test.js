'use strict';

// CONTRACT CONFORMANCE — the wizard persistence state machine (08_FROZEN_CONTRACT.md
// section 4): eight named checkpoints, in order, in a durable draft, with no swallowed
// failure, idempotent retry, 409 rehydration and no roster lock during creation.
//
// EVIDENCE KIND: static source inspection of the wizard + its draft helper. It proves the
// checkpoints are coded in order; it does NOT prove a reload really resumes. Resume proof is
// browser evidence (wizard-journey.browser.test.js, currently BLOCKED).

const { readSource, createChecker, stripJsComments, exists } = require('./_harness');

const check = createChecker('wizard 8 checkpoints state machine', 'static');
const wizard = stripJsComments(readSource('app/giai-dau/v2/TournamentWizard.js'));
const draftExists = exists('lib/tournament/wizardDraft.js');
const draft = draftExists ? stripJsComments(readSource('lib/tournament/wizardDraft.js')) : '';
const surface = `${wizard}\n${draft}`;

// ---------- 1. the eight checkpoint names exist, and appear in contract order ----------
const CHECKPOINTS = ['tournament', 'host_club', 'division', 'group_stage', 'participants', 'pairs', 'playoff_stage', 'playoff_plan'];
// A checkpoint may be written either as a string literal or through a shared constant
// (CHECKPOINT.HOST_CLUB); both are accepted - what must hold is the NAME and the ORDER.
// Built with string concatenation on purpose: inside a template literal a backslash-b
// is a BACKSPACE character, not a word boundary, and the pattern silently never matches.
const token = (name) => new RegExp("['\"]" + name + "['\"]|CHECKPOINT[.]" + name.toUpperCase() + "([^A-Z_]|$)");
for (const name of CHECKPOINTS.slice(1)) {
    check.match(surface, token(name), `checkpoint "${name}" is a named, storable checkpoint`);
}
check.ordered(
    wizard,
    CHECKPOINTS.slice(1).map(token),
    'the checkpoints run in the frozen order: host_club -> division -> group_stage -> participants -> pairs -> playoff_stage -> playoff_plan',
);

// ---------- 2. each checkpoint calls the contracted endpoint ----------
const CALLS = [
    [/createTournament\s*\(/, 'checkpoint 1 calls createTournament'],
    [/inviteTournamentClub\s*\(/, 'checkpoint 2 calls inviteTournamentClub'],
    [/saveDivision\s*\(/, 'checkpoint 3 calls saveDivision'],
    [/saveStage\s*\(/, 'checkpoints 4 and 7 call saveStage'],
    [/replaceDivisionParticipants\s*\(/, 'checkpoint 5 calls replaceDivisionParticipants'],
    [/previewDivisionPairing\s*\(/, 'checkpoint 6 previews the pairing'],
    [/confirmDivisionPairing\s*\(/, 'checkpoint 6 confirms the pairing'],
    [/configureTopTwoPlayoff\s*\(/, 'checkpoint 8 calls configureTopTwoPlayoff'],
    [/getDivisionSetup\s*\(/, 'a verification read confirms readiness before success'],
];
for (const [regex, message] of CALLS) check.match(wizard, regex, message);

// ---------- 3. stage shapes ----------
check.match(wizard, /round_robin/, 'checkpoint 4 creates a round_robin group stage');
check.match(wizard, /knockout/, 'checkpoint 7 creates a knockout playoff stage');
check.match(wizard, /groupCount/, 'the group stage carries config.groupCount');
check.match(wizard, /bronze/i, 'checkpoint 8 passes the bronze option through');

// ---------- 4. stored ids survive a reload ----------
check.ok(draftExists, 'lib/tournament/wizardDraft.js exists (durable draft helper)', 'missing: nothing persists the checkpoint ids, so a reload restarts and duplicates');
check.match(surface, /pickhub:wizard-draft:v1:/, 'the draft key is pickhub:wizard-draft:v1:<groupId>');
for (const id of ['tournament_id', 'tournament_club_id', 'division_id', 'group_stage_id', 'playoff_stage_id', 'setup_revision']) {
    check.match(surface, new RegExp(id), `the draft records ${id}`);
}

// ---------- 5. retry / idempotency / 409 ----------
check.match(surface, /idempotency_key|idempotencyKey/, 'each checkpoint sends an idempotency key');
check.match(surface, /409/, 'HTTP 409 is handled explicitly');
// The 409 branch may inline the reload or delegate to a conflict handler; either is fine
// as long as a 409 really leads to a getDivisionSetup rehydration.
const conflictHandler = /(async\s+)?function\s+(\w*[Cc]onflict\w*)\s*\([\s\S]{0,1200}?getDivisionSetup/.exec(wizard);
check.ok(
    /409[\s\S]{0,800}getDivisionSetup/.test(wizard) || Boolean(conflictHandler),
    'a 409 rehydrates through getDivisionSetup before anything else (contract section 4)',
    'no getDivisionSetup reload is reachable from the 409 branch',
);
if (conflictHandler) {
    const handlerName = conflictHandler[2];
    // The checkpoint loop now lives in lib/tournament/wizardRunner.js (shared with the
    // integration test), so the 409 branch spans two files. Assert the guarantee on
    // both sides rather than by textual proximity inside one file:
    //   wizard  -> passes the conflict handler in as onConflict
    //   runner  -> only invokes onConflict when the error really is a 409
    const runnerSrc = require('fs').readFileSync('lib/tournament/wizardRunner.js', 'utf8');
    check.match(wizard, new RegExp('onConflict:[^]{0,120}' + handlerName + '[(]'),
        'the wizard wires ' + handlerName + '() in as the runner conflict handler');
    check.match(runnerSrc, /if \(isConflictError\(error\)\) \{/,
        'the runner branches on a real conflict before calling onConflict');
    check.match(runnerSrc, /Number\(error && error\.status\) === 409/,
        'isConflictError is defined as HTTP 409');
    check.match(runnerSrc, /if \(onConflict\) await onConflict\(/,
        'the runner awaits the conflict handler (rehydrate) before returning');
    check.ok(!/onConflict[^]{0,200}runCheckpointSequence/.test(runnerSrc),
        'the runner never auto-retries after a conflict',
        'the runner re-enters the sequence from the conflict branch');
}

// ---------- 6. no swallowed failure in the persistence path ----------
check.noMatch(wizard, /catch\s*\(\s*_[A-Za-z0-9_]*\s*\)/, 'no discarded-error catch remains in the wizard');
check.noMatch(wizard, /catch\s*(\([^)]*\))?\s*\{\s*\}/, 'no empty catch block remains in the wizard');

// ---------- 7. ordering rules ----------
check.noMatch(
    wizard,
    /lockDivisionRoster\s*\(/,
    'tournament creation never locks the roster (checkpoint 8 requires roster_lock_status = open; locking is a later, separate action)',
);
check.ok(
    /scope\s*===\s*['"]internal['"]/.test(wizard) && /unit\s*===\s*['"]doi['"]/.test(wizard),
    'checkpoints 5-8 are gated on scope === "internal" && unit === "doi"',
    'the internal-doubles gate for checkpoints 5-8 is missing, so singles/team/friendly flows could be pushed down the identity path',
);

check.done();
