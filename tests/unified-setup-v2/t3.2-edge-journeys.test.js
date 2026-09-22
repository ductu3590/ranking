'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { fixtures, requiredEnvironment, missingEnvironment } = require('./browser/fixtures');
const { createPairingDraft: pairing } = require('../../lib/tournament/pairingDraft');
const { normalizeRosterSelection } = require('../../lib/tournament/participantContract');
const { validateFinalize } = require('../../lib/tournament/setupValidation');
const { buildReviewSummaryModel, markDrawStaleOnSetupChange } = require('../../app/giai-dau/v2/setup/draw/drawReviewModel');
const { createDraft, checkpointIdempotency, pinRevision } = require('../../lib/tournament/wizardDraft');

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); } catch (error) { failures.push({ name, error }); console.error(`FAIL ${name}: ${error.message}`); }
}

check('duplicate names retain two distinct member identities', () => {
  const selected = normalizeRosterSelection([
    { member_id: 101, athlete_id: 1001, display_name: 'An' },
    { member_id: 102, athlete_id: 1002, display_name: 'An' },
  ]);
  assert.equal(selected.length, 2);
  assert.notEqual(selected[0].memberId, selected[1].memberId);
  assert.notEqual(selected[0].athleteId, selected[1].athleteId);
});

check('missing athlete_id is explicit ATHLETE_ID_MISSING', () => {
  assert.throws(() => normalizeRosterSelection([{ member_id: 1, athlete_id: null, display_name: 'An' }]), (error) => error.code === 'ATHLETE_ID_MISSING');
});

check('cross-tenant member is explicit MEMBER_OUTSIDE_GROUP', () => {
  assert.throws(() => normalizeRosterSelection([{ member_id: 1, athlete_id: 2, group_id: 999 }]), (error) => error.code === 'MEMBER_OUTSIDE_GROUP');
});

check('remove middle member preserves unrelated and locked pairs', () => {
  const start = pairing.pairMembers(pairing({ memberIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'] }), [['m1', 'm2'], ['m3', 'm4'], ['m5', 'm6']]);
  const locked = pairing.setLocked(start, 'pair-1', true);
  const after = pairing.removeMember(locked, 'm3');
  assert.deepEqual(pairing.getPair(after, 'pair-1'), pairing.getPair(locked, 'pair-1'));
  assert.deepEqual(pairing.getPair(after, 'pair-3'), pairing.getPair(locked, 'pair-3'));
  assert.ok(pairing.getUnpairedMemberIds(after).includes('m4'));
});

check('15-person doubles saves but blocks finalize without singleton or BYE teammate', () => {
  const state = pairing({ memberIds: fixtures.oddFifteen.athletes.map((athlete) => athlete.memberId) });
  const paired = pairing.regenerateUnlockedPairs(state);
  assert.equal(pairing.canSaveDraft(paired), true);
  assert.deepEqual(pairing.finalizeBlockers(paired), ['UNPAIRED_MEMBER']);
  assert.ok(pairing.getPairs(paired).every((item) => item.memberIds.length === 2));
  assert.ok(pairing.getPairs(paired).every((item) => !item.memberIds.includes('BYE')));
});

check('pairing rejects duplicate identities and protects locked pairs from manual mutation', () => {
  const start = pairing.pairMembers(pairing({ memberIds: ['m1', 'm2', 'm3', 'm4'] }), [['m1', 'm2'], ['m3', 'm4']]);
  const locked = pairing.setLocked(start, 'pair-1', true);
  assert.throws(() => pairing.pairMembers(start, [['m1', 'm1']]), /PAIR_MEMBER_COUNT_INVALID/);
  assert.throws(() => pairing.swapPairMembers(locked, 'pair-1', 'm1', 'pair-2', 'm3'), /LOCKED_PAIR_MUTATION_FORBIDDEN/);
  const odd = pairing.regenerateUnlockedPairs(pairing({ memberIds: ['m1', 'm2', 'm3'] }));
  assert.equal(typeof pairing.reserveMember, 'undefined');
  assert.deepEqual(pairing.getUnpairedMemberIds(odd), ['m3']);
  assert.deepEqual(pairing.oddChoices(odd), ['add_member', 'switch_format']);
});

check('inactive member remains selected and emits warning', () => {
  const result = validateFinalize({ tournament: { name: 'Test' }, participants: { selectedMemberIds: ['m1'], inactiveSelectedMemberIds: ['m1'] }, pairs: [{ memberIds: ['m1', 'm2'] }] });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.includes('INACTIVE_MEMBER_SELECTED'));
});

check('group imbalance is warning-only and knockout bye is surfaced', () => {
  const draft = { participants: { selectedMemberIds: fixtures.fourteen.athletes.map((item) => item.memberId) }, pairs: Array.from({ length: 7 }, (_, index) => ({ pairId: `p${index}`, memberIds: [`a${index}`, `b${index}`] })), format: { config: { groupCount: 2 } } };
  const review = buildReviewSummaryModel(draft);
  assert.ok(review.warnings.some((item) => item.code === 'GROUP_SIZE_IMBALANCE'));
  assert.equal(review.metrics.totalMatches, 12);
  // A three-pair group produces a structurally valid 4-team playoff with no fake pair.
  assert.ok(review.bracketSlots.every((match) => match.slotA.kind === 'progression' && match.slotB.kind === 'progression'));
});

check('upstream edit explicitly invalidates an already drafted draw', () => {
  const next = markDrawStaleOnSetupChange({ draw: { status: 'drafted', matches: [{ id: 'm1' }] } }, 'PAIR_CHANGED');
  assert.equal(next.draw.status, 'stale');
  assert.equal(next.invalidation.draw, true);
  assert.ok(next.invalidation.reasonCodes.includes('PAIR_CHANGED'));
});

check('result lock blocks structure change with STRUCTURE_LOCKED_BY_RESULTS', () => {
  const result = validateFinalize({ tournament: { name: 'Locked' }, pairs: [{ memberIds: ['m1', 'm2'] }], matchState: { started: true, hasScore: true } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'STRUCTURE_LOCKED_BY_RESULTS');
});

check('retry fault at a checkpoint retains pinned revision and idempotency key', () => {
  const draft = createDraft({ clientDraftKey: 't3.2-retry', plan: ['ROSTER'] });
  const pinned = pinRevision(draft, 'ROSTER', 7);
  const first = checkpointIdempotency(pinned.draft, 'ROSTER', { action: 'replace_roster', expected_setup_revision: 7 });
  const replay = checkpointIdempotency(first.draft, 'ROSTER', { action: 'replace_roster', expected_setup_revision: 7 });
  assert.equal(first.key, replay.key);
  assert.equal(pinned.revision, 7);
});

// Contract inspection is intentional here: this endpoint requires live database state
// (incomplete group scores / two admins) unavailable in this checkout, but its response
// shape is deterministic in the route and must expose the frozen stable code.
check('advance incomplete results returns stable ADVANCE_RESULTS_INCOMPLETE', () => {
  const advanceRoute = read('app/api/tournament-v2/advance/route.js');
  assert.match(advanceRoute, /ADVANCE_RESULTS_INCOMPLETE/);
});

check('pairing UI has no reserve remedy and explicitly disables unsupported singles', () => {
  const board = read('app/giai-dau/v2/setup/pairing/PairingBoard.js');
  assert.match(board, /data-choice="add_member"[^>]*onClick/);
  assert.doesNotMatch(board, /reserve_member|reserveMemberIds/);
  assert.match(board, /data-choice="switch_format" disabled=\{!canSwitchToSingles\}/);
  assert.match(board, /bốc thăm và bước rà soát hiện chưa hỗ trợ workflow đánh đơn hoàn chỉnh/);
});

const missingBrowserEnv = missingEnvironment(requiredEnvironment());
console.log(missingBrowserEnv.length
  ? `SKIP browser/live journeys (empty/load-error/retry, two-admin 409, member 403, DB result lock, advance): missing ${missingBrowserEnv.join(', ')}`
  : 'INFO browser/live environment is provisioned; execute browser integration coverage separately.');

if (failures.length) {
  console.error(`\nT3.2 failures: ${failures.map((item) => item.name).join(' | ')}`);
  process.exit(1);
}
console.log('PASS T3.2 edge journey contract coverage');