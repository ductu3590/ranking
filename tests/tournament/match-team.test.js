const { resolveMatch } = require('../../lib/tournament/match/team');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const match = { entrant_a_id: 1, entrant_b_id: 2 };

// subGames=5, A thắng 3-2 -> A vô địch, complete
const cfg5 = { teamSize: 4, subGames: 5, dreambreaker: true };
let r = resolveMatch(match, [
  { kind: 'g1', score_a: 21, score_b: 15 },
  { kind: 'g2', score_a: 18, score_b: 21 },
  { kind: 'g3', score_a: 21, score_b: 19 },
  { kind: 'g4', score_a: 10, score_b: 21 },
  { kind: 'g5', score_a: 21, score_b: 17 },
], cfg5);
assert(r.complete && r.winner_entrant_id === 1, 'subGames=5 A thắng 3-2');
assert(r.games_a === 3 && r.games_b === 2, 'ván con 3-2');

// chưa đủ ván -> chưa complete
let r2 = resolveMatch(match, [
  { kind: 'g1', score_a: 21, score_b: 15 },
  { kind: 'g2', score_a: 18, score_b: 21 },
  { kind: 'g3', score_a: 21, score_b: 19 },
], cfg5);
assert(r2.complete === false && r2.winner_entrant_id === null, 'chưa đủ ván -> chưa chốt');

// subGames=4 hòa 2-2 -> chờ dreambreaker
const cfg4 = { teamSize: 4, subGames: 4, dreambreaker: true };
let r3 = resolveMatch(match, [
  { kind: 'g1', score_a: 21, score_b: 15 },
  { kind: 'g2', score_a: 15, score_b: 21 },
  { kind: 'g3', score_a: 21, score_b: 19 },
  { kind: 'g4', score_a: 10, score_b: 21 },
], cfg4);
assert(r3.complete === false && r3.winner_entrant_id === null, 'hòa 2-2 chờ dreambreaker');

// subGames=4 hòa 2-2 + dreambreaker -> theo dreambreaker
let r4 = resolveMatch(match, [
  { kind: 'g1', score_a: 21, score_b: 15 },
  { kind: 'g2', score_a: 15, score_b: 21 },
  { kind: 'g3', score_a: 21, score_b: 19 },
  { kind: 'g4', score_a: 10, score_b: 21 },
  { kind: 'dreambreaker', score_a: 21, score_b: 18 },
], cfg4);
assert(r4.complete && r4.winner_entrant_id === 1, 'dreambreaker A thắng');

// teamSize khác không ảnh hưởng kết quả (chỉ metadata); chơi đủ ván con mới chốt (không clinch sớm)
const cfg5big = { teamSize: 6, subGames: 5, dreambreaker: true };
let r5 = resolveMatch(match, [
  { kind: 'g1', score_a: 21, score_b: 15 },
  { kind: 'g2', score_a: 21, score_b: 18 },
  { kind: 'g3', score_a: 21, score_b: 19 },
  { kind: 'g4', score_a: 10, score_b: 21 },
  { kind: 'g5', score_a: 12, score_b: 21 },
], cfg5big);
assert(r5.complete && r5.winner_entrant_id === 1 && r5.games_a === 3, 'teamSize=6 A thắng 3-2 khi chơi đủ 5 ván');

// points_a/points_b cộng đúng tổng điểm
let r6 = resolveMatch(match, [
  { kind: 'g1', score_a: 21, score_b: 15 },
  { kind: 'g2', score_a: 10, score_b: 21 },
], { subGames: 2, dreambreaker: false });
assert(r6.points_a === 31 && r6.points_b === 36, 'tổng điểm cộng đúng');

console.log('match-team ok');
