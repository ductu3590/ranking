'use strict';

const assert = require('node:assert/strict');
const { fixtures } = require('./browser/fixtures');
const { buildStagePlan } = require('../../lib/tournament/stagePlan');

function progressionSlot(match, side) {
  return side === 'a' ? match.slotA : match.slotB;
}

for (const thirdPlaceEnabled of [false, true]) {
  const fixture = fixtures.fourteen;
  const pairs = Array.from({ length: fixture.expectedPairs }, (_, index) => ({
    pairId: `t3.1-pair-${index + 1}`,
    memberIds: fixture.athletes.slice(index * 2, index * 2 + 2).map((athlete) => athlete.memberId),
    athleteIds: fixture.athletes.slice(index * 2, index * 2 + 2).map((athlete) => athlete.athleteId),
    locked: true,
  }));
  const plan = buildStagePlan({
    tournamentId: 't3.1-tournament',
    divisionId: 't3.1-division',
    formatKey: 'group_knockout',
    groupCount: 2,
    pairs,
    thirdPlaceEnabled,
  });

  assert.equal(fixture.athletes.length, 14, 'fixture contains exactly 14 athletes');
  assert.equal(pairs.length, 7, '14 athletes form seven pairs');
  assert.equal(plan.stages.length, 2, 'group_knockout creates exactly two stages');
  assert.equal(plan.stages[0].division_id, 't3.1-division', 'group stage belongs to requested division');
  assert.equal(plan.stages[1].division_id, 't3.1-division', 'knockout stage belongs to requested division');
  assert.notEqual(plan.stages[0].id, plan.stages[1].id, 'group and knockout stages have distinct identities');
  assert.deepEqual(plan.groupSizes, [4, 3], 'seven pairs distribute into groups of four and three');
  assert.equal(plan.matches.filter((match) => match.stageKind === 'group').length, 9, 'groups generate six plus three matches');
  assert.equal(plan.matches.length, thirdPlaceEnabled ? 13 : 12, 'total match count follows third-place option');

  const playoffMatches = plan.matches.filter((match) => match.stageKind === 'knockout');
  assert.ok(playoffMatches.every((match) => [match.slotA, match.slotB].every((slot) => slot && slot.kind === 'progression')), 'knockout uses only pending progression slots, never fake entrants');
  assert.ok(playoffMatches.every((match) => [match.slotA, match.slotB].every((slot) => !Object.hasOwn(slot, 'entrantId') && !Object.hasOwn(slot, 'athleteId'))), 'knockout placeholders contain no entrant or athlete identity');

  const transitions = new Map(plan.progressions.map((transition) => [`${transition.sourceGroupLabel}${transition.sourceRank}`, transition]));
  assert.deepEqual(
    [...transitions.entries()].map(([source, transition]) => [source, transition.targetSlot]).sort(),
    [['A1', 'semi-1-a'], ['A2', 'semi-2-b'], ['B1', 'semi-2-a'], ['B2', 'semi-1-b']],
    'progression graph creates cross-group semifinals A1-B2 and B1-A2',
  );
  for (const transition of plan.progressions) {
    assert.equal(transition.sourceStageId, plan.stages[0].id, 'transition references the persisted group stage identity');
    assert.equal(transition.targetStageId, plan.stages[1].id, 'transition references the persisted knockout stage identity');
    assert.equal(transition.targetDivisionId, 't3.1-division', 'transition remains in the requested division');
  }

  const semi1 = playoffMatches.find((match) => match.matchKey === 'semi-1');
  const semi2 = playoffMatches.find((match) => match.matchKey === 'semi-2');
  assert.deepEqual([progressionSlot(semi1, 'a').label, progressionSlot(semi1, 'b').label], ['Nhất A', 'Nhì B'], 'semifinal 1 is Nhất A - Nhì B');
  assert.deepEqual([progressionSlot(semi2, 'a').label, progressionSlot(semi2, 'b').label], ['Nhất B', 'Nhì A'], 'semifinal 2 is Nhất B - Nhì A');
}

console.log('PASS T3.1: 14-athlete group-knockout happy path');
