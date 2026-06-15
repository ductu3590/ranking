const { resolveMatch } = require('../../lib/tournament/match/mlp');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const match = { entrant_a_id: 1, entrant_b_id: 2 };
const cfg = { subMatches: ['womens', 'mens', 'mixed1', 'mixed2'], dreambreaker: true };
let r = resolveMatch(match, [
  { kind: 'womens', score_a: 21, score_b: 15 }, { kind: 'mens', score_a: 18, score_b: 21 },
  { kind: 'mixed1', score_a: 21, score_b: 19 }, { kind: 'mixed2', score_a: 21, score_b: 10 },
], cfg);
assert(r.complete && r.winner_entrant_id === 1, 'A thắng 3-1');
assert(r.games_a === 3 && r.games_b === 1, 'ván con 3-1');
let r2 = resolveMatch(match, [
  { kind: 'womens', score_a: 21, score_b: 15 }, { kind: 'mens', score_a: 15, score_b: 21 },
  { kind: 'mixed1', score_a: 21, score_b: 19 }, { kind: 'mixed2', score_a: 10, score_b: 21 },
], cfg);
assert(r2.complete === false && r2.winner_entrant_id === null, 'hòa 2-2 chờ dreambreaker');
let r3 = resolveMatch(match, [
  { kind: 'womens', score_a: 21, score_b: 15 }, { kind: 'mens', score_a: 15, score_b: 21 },
  { kind: 'mixed1', score_a: 21, score_b: 19 }, { kind: 'mixed2', score_a: 10, score_b: 21 },
  { kind: 'dreambreaker', score_a: 21, score_b: 18 },
], cfg);
assert(r3.complete && r3.winner_entrant_id === 1, 'dreambreaker A thắng');
console.log('match-mlp ok');
