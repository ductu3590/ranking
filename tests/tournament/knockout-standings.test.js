const { computeStandings, advance } = require('../../lib/tournament/engines/knockout');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const entrants = [1, 2, 3, 4].map((id) => ({ id, name: 'E' + id, seed: id }));
const matches = [
  { round: 1, slot: 0, parent_slot: 2, entrant_a_id: 1, entrant_b_id: 4, winner_entrant_id: 1, status: 'done' },
  { round: 1, slot: 1, parent_slot: 2, entrant_a_id: 3, entrant_b_id: 2, winner_entrant_id: 2, status: 'done' },
  { round: 2, slot: 2, parent_slot: null, entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, status: 'done' },
];
const st = computeStandings({ config: {} }, entrants, matches);
assert(st[0].entrant_id === 1 && st[0].rank === 1, 'vô địch E1');
assert(st[1].entrant_id === 2 && st[1].rank === 2, 'á quân E2');
assert(st.find((r) => r.entrant_id === 3).rank === 3 && st.find((r) => r.entrant_id === 4).rank === 3, 'thua vòng 1 = hạng 3');
const champ = advance({ config: {} }, st);
assert(champ.length === 1 && champ[0].entrant_id === 1, 'advance trả nhà vô địch');
console.log('knockout-standings ok');
