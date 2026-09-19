'use strict';

// RETRY-REPLAY TEST - the one contract sentence that is easy to break invisibly:
// 08_FROZEN_CONTRACT.md section 4: "Retry reuses the stored idempotency key for that
// checkpoint. A key is only rotated when the payload changes. An ambiguous network failure is
// retried with the same key, which replays rather than duplicates."
//
// Replay only works if BOTH the key and the expected_setup_revision that were sent on the
// first attempt are sent again. The server compares payload_fingerprint (which contains the
// revision) before it replays: a retry that carries a freshly read revision either rotates the
// key (bypassing the cache entirely) or reuses the key with a different fingerprint
// (IDEMPOTENCY_KEY_REUSED). Neither replays.
//
// EVIDENCE: runtime for lib/tournament/wizardDraft.js, static for the wizard call sites.

const { readSource, createChecker, stripJsComments, exists } = require('./_harness');

const check = createChecker('checkpoint retry replays instead of duplicating', 'runtime+static');

if (!exists('lib/tournament/wizardDraft.js')) {
    check.fail('lib/tournament/wizardDraft.js must exist', 'frozen contract section 7 assigns it to the UI worker');
    check.done();
    return;
}
const draftLib = require('../../lib/tournament/wizardDraft');
const wizard = stripJsComments(readSource('app/giai-dau/v2/TournamentWizard.js'));

// ---------- runtime: key stability ----------
const base = draftLib.createDraft
    ? draftLib.createDraft({ groupId: 1, clientDraftKey: 'draft-key-1', plan: ['participants'] })
    : null;
const draft = base || { client_draft_key: 'draft-key-1', keys: {}, plan: ['participants'], results: {} };
const payload = { division_id: 3, participants: [{ client_ref: 'a', display_name: 'A' }], expected_setup_revision: 5 };

const first = draftLib.checkpointIdempotency(draft, 'participants', payload);
const second = draftLib.checkpointIdempotency(first.draft, 'participants', payload);
check.ok(second.key === first.key && second.rotated === false, 'an identical retry reuses the stored idempotency key');

const changed = draftLib.checkpointIdempotency(first.draft, 'participants', { ...payload, participants: [{ client_ref: 'b', display_name: 'B' }] });
check.ok(changed.key !== first.key, 'a genuinely changed participant list rotates the key');

// ---------- the actual defect: only the revision moved ----------
const revisionOnly = draftLib.checkpointIdempotency(first.draft, 'participants', { ...payload, expected_setup_revision: 6 });
check.ok(
    revisionOnly.key === first.key,
    'a retry whose ONLY difference is a re-read expected_setup_revision must still replay under the original key',
    'the key rotated because expected_setup_revision is part of the fingerprint. After an ambiguous network failure the server has already applied the write and bumped the revision, so the retry sends a NEW key with a NEW revision and the replay cache is bypassed. Checkpoint 6 (pairs) then re-runs confirm_tournament_pairs_revisioned, which always INSERTs new pairs/entries; it is stopped only by the 059 ATHLETE_ALREADY_PAIRED_IN_DIVISION trigger -> HTTP 409. No records are duplicated, but the checkpoint can never complete: every further retry conflicts again, checkpoints 7 and 8 never run and the wizard is a permanent dead end (05 section B: "network timeout after server success"). Checkpoints 2/3/4 avoid this with an attemptCount > 1 lookup; checkpoint 6 has no such recovery.'
);

// ---------- static: the revision used on retry must be the captured one ----------
check.ok(
    /beginMutation\(/.test(wizard)
    && /readRevision: async \(\) =>/.test(wizard)
    && /pinnedRevision\(draft, name\)/.test(require('fs').readFileSync('lib/tournament/wizardRunner.js', 'utf8')),
    'a retried checkpoint reuses the revision captured on the first attempt instead of re-reading it just before every submit',
    'a retried checkpoint must reuse the pinned revision: beginMutation() only calls readRevision() when pinnedRevision() is null, so a retry never re-reads and never silently overwrites a concurrent editor',
);

check.done();
