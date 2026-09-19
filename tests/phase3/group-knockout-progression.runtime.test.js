'use strict';

const assert = require('node:assert/strict');
const { buildDrawSlots } = require('../../lib/tournament/draw');
const roundRobin = require('../../lib/tournament/engines/roundRobin');
const knockout = require('../../lib/tournament/engines/knockout');

const stage = { schedule_format: 'round_robin', config: { groupCount: 2 } };
const entries = Array.from({ length: 7 }, (_, index) => ({
  id: `pair-${index + 1}`,
  pair_id: `pair-${index + 1}`,
}));
const slots = buildDrawSlots(stage, entries, 20260918);
const assigned = slots.map((slot) => ({
  id: slot.entry_id,
  seed: slot.seed_in_stage,
  group_label: slot.group_label,
}));
const groupSizes = assigned.reduce((sizes, entry) => {
  sizes[entry.group_label] = (sizes[entry.group_label] || 0) + 1;
  return sizes;
}, {});

assert.deepEqual(groupSizes, { A: 4, B: 3 }, 'seven pairs are assigned to A=4 and B=3');
const groupMatches = roundRobin.generateSchedule(stage, assigned, 20260918);
assert.equal(groupMatches.length, 9, 'groups 4/3 produce 9 round-robin fixtures');

const standings = ['A', 'B'].flatMap((label) => assigned
  .filter((entry) => entry.group_label === label)
  .sort((a, b) => a.seed - b.seed)
  .map((entry, index) => ({ entrant_id: entry.id, group_label: label, rank: index + 1 })));
const playoff = knockout.generateTopTwoGroupPlayoff(standings);

assert.equal(playoff.qualifiers.A1, standings.find((row) => row.group_label === 'A' && row.rank === 1).entrant_id);
assert.equal(playoff.qualifiers.B2, standings.find((row) => row.group_label === 'B' && row.rank === 2).entrant_id);
assert.equal(playoff.qualifiers.B1, standings.find((row) => row.group_label === 'B' && row.rank === 1).entrant_id);
assert.equal(playoff.qualifiers.A2, standings.find((row) => row.group_label === 'A' && row.rank === 2).entrant_id);

const [sf1, sf2, final] = playoff.matches;
assert.equal(playoff.matches.length, 3, 'top-two playoff contains two semifinals and one final');
assert.deepEqual([sf1.match_key, sf1.entrant_a_id, sf1.entrant_b_id], ['SF1', playoff.qualifiers.A1, playoff.qualifiers.B2]);
assert.deepEqual([sf2.match_key, sf2.entrant_a_id, sf2.entrant_b_id], ['SF2', playoff.qualifiers.B1, playoff.qualifiers.A2]);
assert.deepEqual([final.match_key, final.entrant_a_source, final.entrant_b_source], [
  'F',
  { match_key: 'SF1', result: 'winner' },
  { match_key: 'SF2', result: 'winner' },
]);
assert.equal(groupMatches.length + playoff.matches.length, 12, 'group stage plus playoff contains 12 fixtures');

const bronzePlayoff = knockout.generateTopTwoGroupPlayoff(standings, { bronze: true });
assert.equal(bronzePlayoff.matches.length, 4, 'bronze plan contains two semifinals, final, and bronze match');
assert.equal(groupMatches.length + bronzePlayoff.matches.length, 13, 'group stage plus bronze playoff contains 13 fixtures');
assert.deepEqual(
  bronzePlayoff.transitions.filter((edge) => edge.target_match_key === 'BRONZE'),
  [
    { source_kind: 'match_outcome', source_match_key: 'SF1', source_outcome: 'loser', target_match_key: 'BRONZE', target_slot: 'a' },
    { source_kind: 'match_outcome', source_match_key: 'SF2', source_outcome: 'loser', target_match_key: 'BRONZE', target_slot: 'b' },
  ],
  'bronze receives both semifinal losers through explicit transitions',
);
assert.throws(() => knockout.topTwoGroupQualifiers([
  { entrant_id: 'a1', group_label: 'A', rank: 1 },
  { entrant_id: 'a2', group_label: 'A', rank: 2 },
  { entrant_id: 'b1', group_label: 'B', rank: 1 },
  { entrant_id: 'b1-again', group_label: 'B', rank: 1 },
  { entrant_id: 'b2', group_label: 'B', rank: 2 },
]), /DUPLICATE_GROUP_RANK/);

console.log('group knockout progression runtime ok');