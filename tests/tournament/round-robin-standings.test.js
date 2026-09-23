const { computeStandings, advance } = require('../../lib/tournament/engines/roundRobin');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const entrants = [1, 2, 3].map((id) => ({ id, name: 'E' + id, seed: id }));
const matches = [
  { entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, points_a: 22, points_b: 18, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
  { entrant_a_id: 1, entrant_b_id: 3, winner_entrant_id: 1, points_a: 22, points_b: 15, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
  { entrant_a_id: 2, entrant_b_id: 3, winner_entrant_id: 2, points_a: 21, points_b: 19, games_a: 2, games_b: 1, status: 'done', group_label: 'A' },
];
const standings = computeStandings({ config: { winPoints: 2 } }, entrants, matches);
assert(standings[0].entrant_id === 1 && standings[0].rank === 1, 'E1 nhất');
assert(standings[1].entrant_id === 2 && standings[1].rank === 2, 'E2 nhì');
assert(standings[2].entrant_id === 3 && standings[2].rank === 3, 'E3 ba');
assert(standings[0].won === 2 && standings[0].match_points === 4, 'E1 thắng 2, 4 điểm');
const withWalkover = computeStandings({ config: { winPoints: 1, lossPoints: 0 } }, entrants, [
  { entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, points_a: 22, points_b: 10, games_a: 2, games_b: 0, status: 'done', group_label: 'A', result_type: 'simple' },
  { entrant_a_id: 1, entrant_b_id: 3, winner_entrant_id: 1, points_a: 99, points_b: 0, games_a: 3, games_b: 0, status: 'done', group_label: 'A', result_type: 'walkover' },
]);
const e1 = withWalkover.find((row) => row.entrant_id === 1); const e3 = withWalkover.find((row) => row.entrant_id === 3);
assert(e1.won === 2 && e3.lost === 1 && e1.match_points === 2, 'W.O. vẫn tính một thắng/một thua và 1 điểm trận');
assert(e1.games_won === 2 && e1.points_for === 22 && e3.games_lost === 0 && e3.points_against === 0, 'W.O. không cộng game_diff, point_diff hay points_scored');
const adv = advance({ config: { groupCount: 1, advancePerGroup: 2 } }, standings);
assert(adv.length === 2 && adv[0].entrant_id === 1 && adv[0].seed_in_stage === 1, 'đi tiếp 2 đội, seed đúng');
console.log('round-robin-standings ok');
