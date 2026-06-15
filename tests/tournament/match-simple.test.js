const { resolveMatch } = require('../../lib/tournament/match/simple');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const match = { entrant_a_id: 10, entrant_b_id: 20 };
let r = resolveMatch(match, [
  { score_a: 11, score_b: 9 }, { score_a: 7, score_b: 11 }, { score_a: 11, score_b: 8 },
], { bestOf: 3 });
assert(r.complete === true, 'đủ ván -> complete');
assert(r.winner_entrant_id === 10, 'A thắng 2-1');
assert(r.games_a === 2 && r.games_b === 1, 'tỉ số ván 2-1');
assert(r.points_a === 29 && r.points_b === 28, 'tổng điểm');
let r2 = resolveMatch(match, [{ score_a: 11, score_b: 9 }], { bestOf: 3 });
assert(r2.complete === false && r2.winner_entrant_id === null, 'mới 1 ván chưa xong');
console.log('match-simple ok');
