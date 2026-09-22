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

const evenRegenerated = pairing.regenerateUnlockedPairs(pairing({ memberIds: ['m1', 'm2', 'm3', 'm4'] }));
assert.deepEqual(pairing.getUnpairedMemberIds(evenRegenerated), [], 'an even roster leaves no member unpaired after automatic pairing');
assert.equal(new Set(pairing.getPairs(evenRegenerated).flatMap((pair) => pair.memberIds)).size, 4, 'automatic pairing assigns each even-roster member exactly once');

const odd = pairing({ memberIds: ['m1', 'm2', 'm3'] });
const oddRegenerated = pairing.regenerateUnlockedPairs(odd);
assert.equal(pairing.canSaveDraft(odd), true, 'odd doubles roster can save draft');
assert.deepEqual(pairing.finalizeBlockers(odd), ['UNPAIRED_MEMBER'], 'odd doubles blocks finalize with stable code');
assert.equal(pairing.getPairs(odd).some((pair) => pair.memberIds.length !== 2), false, 'odd roster never produces a singleton pair');
assert.equal(pairing.getPairs(odd).some((pair) => pair.memberIds.includes('BYE')), false, 'BYE never substitutes a missing partner');
assert.deepEqual(pairing.getUnpairedMemberIds(oddRegenerated), ['m3'], 'automatic pairing leaves only the final odd-roster member unpaired');

assert.throws(() => pairing.pairMembers(initial, [['m1', 'm1']]), /PAIR_MEMBER_COUNT_INVALID/, 'a member cannot occupy both positions in one pair');
assert.throws(() => pairing.pairMembers(locked, [['m2', 'm1'], ['m3', 'm4'], ['m5', 'm6']]), /LOCKED_PAIR_MUTATION_FORBIDDEN/, 'manual pairing cannot mutate a locked pair');
assert.throws(() => pairing.swapPairMembers(locked, 'pair-1', 'm1', 'pair-2', 'm3'), /LOCKED_PAIR_MUTATION_FORBIDDEN/, 'swapping a locked pair is rejected by the domain');
assert.equal(typeof pairing.reserveMember, 'undefined', 'pairing domain no longer exposes a reserve path');
assert.deepEqual(pairing.oddChoices(oddRegenerated), ['add_member', 'switch_format'], 'odd roster keeps explicit add/switch remedies and never silently removes a participant');

console.log('pairing acceptance: stable pairs and odd-roster contract ok');
