// tests/tournament/results.test.js
const { advanceWinner, buildResolvedMatches } = require('../../lib/tournament/results');
const simple = require('../../lib/tournament/match/simple');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
let a = advanceWinner({ winner_entrant_id: 5, parent_match_id: 102, bracket_slot: 0 });
assert(a && a.parent_match_id === 102 && a.field === 'entrant_a_id' && a.entrant_id === 5, 'bs chẵn -> entrant_a');
let b = advanceWinner({ winner_entrant_id: 6, parent_match_id: 102, bracket_slot: 1 });
assert(b.field === 'entrant_b_id', 'bs lẻ -> entrant_b');
assert(advanceWinner({ winner_entrant_id: null, parent_match_id: 102, bracket_slot: 0 }) === null, 'chưa có winner -> null');
assert(advanceWinner({ winner_entrant_id: 5, parent_match_id: null, bracket_slot: 0 }) === null, 'không parent -> null');
const matches = [
  { id: 1, entrant_a_id: 10, entrant_b_id: 20, status: 'done', group_label: 'A' },
  { id: 2, entrant_a_id: 10, entrant_b_id: 30, status: 'pending', group_label: 'A' },
];
const gamesByMatch = { 1: [{ score_a: 11, score_b: 9 }, { score_a: 11, score_b: 7 }], 2: [] };
const resolved = buildResolvedMatches(matches, gamesByMatch, simple, { bestOf: 3 });
const r1 = resolved.find((m) => m.id === 1);
assert(r1.winner_entrant_id === 10 && r1.points_a === 22 && r1.games_a === 2 && r1.status === 'done', 'gom resolved cho trận done');
const r2 = resolved.find((m) => m.id === 2);
assert(r2.status === 'pending' && r2.winner_entrant_id == null, 'trận chưa done giữ nguyên, không winner');
const path = require('path');

// buildResolvedMatches phải nhận config THEO TỪNG TRẬN, vì mỗi vòng có thể
// có số ván khác nhau.
const matchesMixed = [
  { id: 1, round: 1, status: 'finalized', entrant_a_id: 10, entrant_b_id: 20 },
  { id: 2, round: 3, status: 'finalized', entrant_a_id: 10, entrant_b_id: 30 },
];
const gamesMixed = {
  1: [{ score_a: 11, score_b: 9 }],                                    // BO1: 1 ván là xong
  2: [{ score_a: 11, score_b: 9 }, { score_a: 8, score_b: 11 }, { score_a: 11, score_b: 7 }], // BO3
};
const configOf = (m) => (m.round === 3 ? { bestOf: 3 } : { bestOf: 1 });

const out = buildResolvedMatches(matchesMixed, gamesMixed, simple, configOf);
assert(out[0].winner_entrant_id === 10, 'BO1: trận một ván phải có đội thắng');
assert(out[1].winner_entrant_id === 10, 'BO3: thắng 2/3 ván');

// status 'finalized' của DB phải được hiểu là đã xong, không chỉ 'done'.
const outFinalized = buildResolvedMatches(
  [{ id: 3, round: 1, status: 'finalized', entrant_a_id: 10, entrant_b_id: 20 }],
  { 3: [{ score_a: 11, score_b: 9 }] },
  simple,
  () => ({ bestOf: 1 }),
);
assert(outFinalized[0].winner_entrant_id === 10, "status 'finalized' được coi là đã xong");

// Vẫn nhận object config như cũ để không vỡ nơi gọi khác.
const outLegacy = buildResolvedMatches(
  [{ id: 4, round: 1, status: 'done', entrant_a_id: 10, entrant_b_id: 20 }],
  { 4: [{ score_a: 11, score_b: 9 }] },
  simple,
  { bestOf: 1 },
);
assert(outLegacy[0].winner_entrant_id === 10, 'vẫn nhận config dạng object');

console.log('results ok');

