const { validateInterclubPool, aggregateClubStandings } = require('../../lib/tournament/interclub');
const assert = (condition, message) => { if (!condition) { console.error(`FAIL: ${message}`); process.exit(1); } };
const throwsCode = (fn, code) => { try { fn(); } catch (error) { return error.code === code; } return false; };

const pool = [{ id: 2, club_id: 20, seed: 2 }, { id: 1, club_id: 10, seed: 1 }];
assert(validateInterclubPool(pool)[0].id === 1, 'pool sort deterministic theo seed');
assert(throwsCode(() => validateInterclubPool([{ id: 1, club_id: 10 }, { id: 2, club_id: 10 }]), 'POOL_CLUB_DUPLICATE'), 'pool không trùng CLB');

const entries = [{ id: 1, club_id: 10 }, { id: 2, club_id: 20 }, { id: 3, club_id: 30 }];
const standings = aggregateClubStandings([
  { entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, points_a: 11, points_b: 7, status: 'done' },
  { entrant_a_id: 2, entrant_b_id: 3, winner_entrant_id: 2, points_a: 11, points_b: 9, status: 'done' },
  { entrant_a_id: 1, entrant_b_id: 3, winner_entrant_id: 3, points_a: 8, points_b: 11, status: 'done' },
], entries);
const club10 = standings.find((row) => row.club_id === 10);
assert(club10 && club10.won === 1, 'aggregate wins của CLB');
assert(club10.diff === 1, 'aggregate point differential');
assert(standings.every((row, index) => row.rank === index + 1), 'rank liên tục');
console.log('phase3 interclub competition ok');
