'use strict';

const assert = require('node:assert/strict');
const { computeStandings } = require('../../lib/tournament/engines/roundRobin');

const entrants = [1, 2, 3, 4].map((id) => ({ id, seed: id }));
const matches = [
  { entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, games_a: 2, games_b: 0, points_a: 22, points_b: 12, status: 'done', group_label: 'A', result_type: 'simple' },
  // Pair 3 withdraws mid-round. 2-0 / 22-0 is the stored minimum BO score,
  // but none of that number is permitted to affect differentials.
  { entrant_a_id: 1, entrant_b_id: 3, winner_entrant_id: 1, games_a: 2, games_b: 0, points_a: 22, points_b: 0, status: 'done', group_label: 'A', result_type: 'walkover' },
  { entrant_a_id: 2, entrant_b_id: 4, winner_entrant_id: 2, games_a: 2, games_b: 1, points_a: 23, points_b: 21, status: 'done', group_label: 'A', result_type: 'simple' },
];

const rows = computeStandings({ config: { winPoints: 1, lossPoints: 0 } }, entrants, matches);
const byId = new Map(rows.map((row) => [row.entrant_id, row]));
assert.equal(byId.get(1).won, 2, 'winner receives the W.O. win');
assert.equal(byId.get(3).lost, 1, 'withdrawn pair receives the W.O. loss');
assert.equal(byId.get(1).match_points, 2, 'W.O. awards exactly one match point');
assert.deepEqual(
  { games_won: byId.get(1).games_won, games_lost: byId.get(1).games_lost, points_for: byId.get(1).points_for, points_against: byId.get(1).points_against },
  { games_won: 2, games_lost: 0, points_for: 22, points_against: 12 },
  'W.O. minimum score does not inflate the winner game/point differentials',
);
assert.deepEqual(
  { games_won: byId.get(3).games_won, games_lost: byId.get(3).games_lost, points_for: byId.get(3).points_for, points_against: byId.get(3).points_against },
  { games_won: 0, games_lost: 0, points_for: 0, points_against: 0 },
  'withdrawn pair has only W/L, no W.O. game or point totals',
);
assert.equal(byId.get(2).point_diff, -8, 'unrelated pair keeps only its two played-match differentials');
assert.equal(byId.get(4).point_diff, -2, 'opponent differential is not contaminated by another W.O.');

console.log('walkover standings contract ok');