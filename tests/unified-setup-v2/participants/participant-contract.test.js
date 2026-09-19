const assert = require('assert');
const {
  normalizeRosterSelection,
  validatePairDraft,
  applyPairDraft,
} = require('../../../lib/tournament/participantContract');

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error.code === code);
}

assert.deepStrictEqual(
  normalizeRosterSelection([
    { member_id: 2, athlete_id: 22, display_name: 'An' },
    { member_id: 3, athlete_id: 33, display_name: 'An' },
  ]),
  [
    { memberId: 2, athleteId: 22, displayNameSnapshot: 'An' },
    { memberId: 3, athleteId: 33, displayNameSnapshot: 'An' },
  ],
);
throwsCode(() => normalizeRosterSelection([{ member_id: 4, athlete_id: null, display_name: 'Binh' }]), 'ATHLETE_ID_MISSING');
throwsCode(() => normalizeRosterSelection([{ member_id: 4, athlete_id: 44, display_name: 'Binh', group_id: 99 }]), 'MEMBER_OUTSIDE_GROUP');
throwsCode(() => validatePairDraft([{ pairId: 'p1', memberIds: [1, 2] }, { pairId: 'p2', memberIds: [2, 3] }]), 'DUPLICATE_PAIR_MEMBER');

const original = [
  { pairId: 'stable-a', memberIds: [1, 2], athleteIds: [11, 22], nameSnapshot: 'A', locked: true },
  { pairId: 'stable-b', memberIds: [3, 4], athleteIds: [33, 44], nameSnapshot: 'B', locked: false },
];
const applied = applyPairDraft(original, original);
assert.deepStrictEqual(applied.pairs.map((pair) => pair.pairId), ['stable-a', 'stable-b']);
assert.deepStrictEqual(applied.unpairedMemberIds, []);
console.log('participant contract red/green test ok');
