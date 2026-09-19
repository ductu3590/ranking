'use strict';

// REPRODUCTION TEST 3 — "the console can render an empty identity roster while approved
// entries exist".
//
// Ground truth (08_FROZEN_CONTRACT.md sections 1 and 5, live division 35): GET
// /api/tournament-v2/setup returns roster.athletes = [] and entries = 8 approved rows.
// DivisionSetupPanel only SELECTs pre-existing tournament_athletes, so it paints an empty
// checkbox list with no explanation and setup is unreachable; TournamentConsoleV2 then also
// renders the editable TeamsTab over the same division (two competing mutation sources), and
// the panel is only reachable when activeStage?.division_id exists - which is exactly the
// case that fails when the stage was never created.
//
// EVIDENCE KIND: static source inspection of the two render paths. It proves the component
// has an explicit branch for "identities missing while entries exist"; it does NOT prove what
// a browser paints. Browser proof is wizard-journey.browser.test.js (currently BLOCKED).

const { readSource, createChecker, stripJsComments } = require('./_harness');

const check = createChecker('console empty identity roster (repro)', 'static');

let panel;
let console_;
try {
    panel = stripJsComments(readSource('app/giai-dau/v2/console/tabs/DivisionSetupPanel.js'));
    console_ = stripJsComments(readSource('app/giai-dau/v2/console/TournamentConsoleV2.js'));
} catch (error) {
    check.fail('console setup files must exist', error.message);
    check.done();
    return;
}

// --- DivisionSetupPanel: the empty-identity state must be explained, not silently empty ---

check.match(
    panel,
    /setup\??\.?\s*\??\.entries|\bentries\b/,
    'DivisionSetupPanel reads setup.entries so it can tell "no participants yet" apart from "legacy entries exist without identities"',
);

check.match(
    panel,
    /athletes\.length\s*===\s*0|!\s*athletes\.length|athletes\.length\s*<\s*1|athletes\.length\s*\?/,
    'DivisionSetupPanel has an explicit branch for an EMPTY identity roster (roster.athletes === [])',
);

check.match(
    panel,
    /legacy|migration|chuy\u1ec3n \u0111\u1ed5i|c\u1ea7n c\u1eadp nh\u1eadt|repairLegacyDivisionPairs|repair_legacy_pairs/i,
    'DivisionSetupPanel surfaces a migration-required state when existing entries have no identity links (04_AGENT_TASKS, UI section)',
);

// The panel must never silently create a *new* pair set over legacy entries.
check.ok(
    !/confirmDivisionPairing/.test(panel) || /entries/.test(panel),
    'DivisionSetupPanel does not offer pair confirmation while it is blind to pre-existing legacy entries',
    'the panel confirms pairings but never inspects setup.entries, so it can create a second, parallel set of entries beside the legacy ones',
);

// The legacy-entry state must DISABLE pair confirmation, not merely warn about it: pressing
// "Chot ghep cap" while approved pair-less entries exist inserts a second, parallel set of
// entries next to them (confirm_tournament_pairs_revisioned always INSERTs and the server has
// no legacy-entry guard). Invariant 3 / 05 section C: an existing entry is preserved, never
// doubled.
const confirmButton = /disabled=\{[^}]*\}\s*onClick=\{confirmPairs\}|onClick=\{confirmPairs\}[\s\S]{0,200}?disabled=\{[^}]*\}/.exec(panel);
const confirmGuard = /disabled=\{([^}]*)\}[\s\S]{0,200}?onClick=\{confirmPairs\}/.exec(panel);
check.ok(
    Boolean(confirmButton),
    'the pair-confirmation control is still present and inspectable',
);
check.ok(
    confirmGuard && /needsMigration|legacyEntr|migration/i.test(confirmGuard[1]),
    'pair confirmation is DISABLED while legacy pair-less approved entries exist (a prose warning is not a guard)',
    confirmGuard ? `the confirm button is only guarded by: ${confirmGuard[1].trim()}` : 'could not locate the confirm button guard',
);

// --- TournamentConsoleV2: reachability and single mutation source (contract section 5) ---

check.match(
    console_,
    /divisions/,
    'TournamentConsoleV2 can select a division from the tournament (panel reachable before any stage exists), not only from activeStage.division_id',
);

// The athletes step runs from its own guard up to the next step guard; stopping at the
// first ": null}" would truncate the block and hide TeamsTab from this check.
const athletesStep = /step === 'athletes' \?([\s\S]*?)(?:step === '|<\/ConsoleShell>)/.exec(console_);
check.ok(Boolean(athletesStep), 'TournamentConsoleV2 still has an "athletes" console step to inspect');
if (athletesStep) {
    const block = athletesStep[1];
    check.ok(
        /(\?|&&|:)\s*<TeamsTab/.test(block)
            || /<TeamsTab[^>]*(readOnly|readonly|legacyOnly)/.test(block)
            || /<TeamsTab[^>]*isAdmin=\{[^}]*false/.test(block),
        'the editable TeamsTab is not rendered unconditionally beside DivisionSetupPanel (contract section 5: one mutation source per division)',
        'TeamsTab is rendered unconditionally in the athletes step, so a division-backed doubles division has two competing editable mutation sources',
    );
    check.ok(
        !/isAdmin && activeStage\?\.division_id \? <DivisionSetupPanel/.test(block),
        'DivisionSetupPanel is not gated solely on activeStage?.division_id (unreachable exactly when the stage failed to create)',
        'DivisionSetupPanel is still gated on activeStage?.division_id only',
    );
}

check.done();
