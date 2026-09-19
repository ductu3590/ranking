'use strict';

const { assert, expectModule } = require('./_harness');

const pairing = expectModule('lib/tournament/pairingDraft.js', 'createPairingDraft');
const initial = pairing({ memberIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'] });
const paired = pairing.pairMembers(initial, [['m1', 'm2'], ['m3', 'm4'], ['m5', 'm6']]);
const locked = pairing.setLocked(paired, 'pair-1', true);
const afterRemove = pairing.removeMember(locked, 'm3');

assert.deepEqual(pairing.getPair(afterRemove, 'pair-1'), pairing.getPair(locked, 'pair-1'), 'removing a middle member preserves a locked unrelated pair byte-for-byte');
assert.deepEqual(pairing.getPair(afterRemove, 'pair-3'), pairing.getPair(locked, 'pair-3'), 'removing a middle member preserves every unrelated pair');
assert.ok(pairing.getUnpairedMemberIds(afterRemove).includes('m4'), 'partner of removed member becomes explicitly unpaired');
assert.equal(pairing.getPairs(afterRemove).every((pair) => pair.memberIds.length === 2), true, 'removal never leaves a singleton pair');
const regenerated = pairing.regenerateUnlockedPairs(afterRemove);
assert.deepEqual(pairing.getPair(regenerated, 'pair-1'), pairing.getPair(locked, 'pair-1'), 'regenerate skips locked pairs');

const odd = pairing({ memberIds: ['m1', 'm2', 'm3'] });
assert.equal(pairing.canSaveDraft(odd), true, 'odd doubles roster can save draft');
assert.deepEqual(pairing.finalizeBlockers(odd), ['UNPAIRED_MEMBER'], 'odd doubles blocks finalize with stable code');
assert.equal(pairing.getPairs(odd).some((pair) => pair.memberIds.length !== 2), false, 'odd roster never produces a singleton pair');
assert.equal(pairing.getPairs(odd).some((pair) => pair.memberIds.includes('BYE')), false, 'BYE never substitutes a missing partner');

console.log('pairing acceptance: stable pairs and odd-roster contract ok');
