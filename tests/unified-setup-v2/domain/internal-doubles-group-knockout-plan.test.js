'use strict';

const assert = require('node:assert/strict');
const { buildInternalDoublesGroupKnockoutPlan } = require('../../../lib/tournament/internalDoublesGroupKnockoutPlan');

const input = {
  tournamentId: 'tournament-real',
  divisionId: 'division-real',
  seed: 'stable-draw-2026',
  entries: Array.from({ length: 7 }, (_, index) => ({ id: `entry-${index + 1}` })),
};
const plan = buildInternalDoublesGroupKnockoutPlan(input);
const reordered = buildInternalDoublesGroupKnockoutPlan({ ...input, entries: input.entries.slice().reverse() });

assert.equal(plan.stages.length, 2);
assert.ok(plan.stages.every((stage) => stage.planKey && !Object.hasOwn(stage, 'id')), 'stages use local plan keys, never pretend to be persisted');
assert.deepEqual(plan.groupSizes, [4, 3]);
assert.equal(plan.matches.filter((match) => match.stageKind === 'group').length, 9);
assert.equal(plan.matches.length, 12);
assert.ok(plan.matches.filter((match) => match.stageKind === 'group').every((match) => input.entries.some((entry) => entry.id === match.entryAId) && input.entries.some((entry) => entry.id === match.entryBId)), 'group fixtures use only supplied entry IDs');
assert.ok(plan.matches.filter((match) => match.stageKind === 'knockout').every((match) => match.slotA.kind === 'progression' && match.slotB.kind === 'progression'));
assert.ok(plan.progressions.every((item) => item.sourceStagePlanKey === 'group-stage' && item.targetStagePlanKey === 'knockout-stage' && item.sourceKind === 'standing'));
const knockoutMatches = Object.fromEntries(plan.matches.filter((match) => match.stageKind === 'knockout').map((match) => [match.matchKey, match]));
assert.deepEqual(
  [knockoutMatches['semi-1'].slotA, knockoutMatches['semi-1'].slotB, knockoutMatches['semi-2'].slotA, knockoutMatches['semi-2'].slotB].map((slot) => slot.targetSlot),
  ['semi-1-a', 'semi-1-b', 'semi-2-a', 'semi-2-b'],
  'each group qualifier slot explicitly maps to its progression target slot',
);
assert.deepEqual(
  [knockoutMatches.final.slotA, knockoutMatches.final.slotB].map((slot) => [slot.sourceMatchKey, slot.outcome]),
  [['semi-1', 'winner'], ['semi-2', 'winner']],
  'final slots explicitly reference each semifinal winner',
);
assert.equal(plan.fingerprint, reordered.fingerprint, 'canonical output ignores caller entry ordering');
const thirdPlacePlan = buildInternalDoublesGroupKnockoutPlan({ ...input, thirdPlaceEnabled: true });
assert.equal(thirdPlacePlan.matches.length, 13);
const bronzeMatch = thirdPlacePlan.matches.find((match) => match.matchKey === 'third-place');
assert.deepEqual(
  [bronzeMatch.slotA, bronzeMatch.slotB].map((slot) => [slot.sourceMatchKey, slot.outcome]),
  [['semi-1', 'loser'], ['semi-2', 'loser']],
  'bronze slots explicitly reference each semifinal loser',
);
assert.ok(
  thirdPlacePlan.matches.filter((match) => match.stageKind === 'knockout').flatMap((match) => [match.slotA, match.slotB]).every((slot) => !Object.hasOwn(slot, 'id')),
  'progression slot DTOs never fabricate persisted IDs',
);
assert.throws(() => buildInternalDoublesGroupKnockoutPlan({ ...input, entries: [input.entries[0], input.entries[0], ...input.entries.slice(2)] }), (error) => error.code === 'DUPLICATE_ENTRY_ID');
assert.throws(() => buildInternalDoublesGroupKnockoutPlan({ ...input, groupCount: 3 }), (error) => error.code === 'UNSUPPORTED_GROUP_COUNT');
assert.throws(() => buildInternalDoublesGroupKnockoutPlan({ ...input, qualifiersPerGroup: 1 }), (error) => error.code === 'UNSUPPORTED_QUALIFIERS_PER_GROUP');

console.log('internal doubles group-knockout canonical preview: runtime contract ok');