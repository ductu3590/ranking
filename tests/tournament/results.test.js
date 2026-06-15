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
console.log('results ok');
