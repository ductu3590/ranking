// lib/tournament/engines/knockout.js
const { seedOrder, nextPowerOfTwo } = require('../seeding');

// Sinh bracket single-elimination. entrants có seed (nhỏ = mạnh).
// slot = chỉ số duy nhất trong stage; parent_slot = slot trận kế mà winner đi vào.
function generateSchedule(stage, entrants, seed = 1) {
  const sorted = entrants.slice().sort((a, b) => (a.seed || 0) - (b.seed || 0));
  const n = sorted.length;
  const B = nextPowerOfTwo(Math.max(2, n));
  const order = seedOrder(B);
  const positions = order.map((seedRank) => sorted[seedRank - 1] ? sorted[seedRank - 1].id : null);

  const rounds = Math.log2(B);
  const matches = [];
  let slot = 0;
  let orderCounter = 0;

  const r1Khe = [];
  for (let i = 0; i < B; i += 2) {
    const a = positions[i];
    const b = positions[i + 1];
    if (a && b) {
      const s = slot++;
      matches.push({
        round: 1, bracket_slot: i / 2, parent_slot: null, slot: s,
        group_label: null, entrant_a_id: a, entrant_b_id: b, order: orderCounter++,
      });
      r1Khe.push({ matchSlot: s, entrantId: null });
    } else {
      r1Khe.push({ matchSlot: null, entrantId: a || b });
    }
  }

  let prevKhe = r1Khe;
  for (let r = 2; r <= rounds; r++) {
    const curKhe = [];
    for (let i = 0; i < prevKhe.length; i += 2) {
      const left = prevKhe[i];
      const right = prevKhe[i + 1];
      const s = slot++;
      const entrant_a_id = left.entrantId || null;
      const entrant_b_id = right.entrantId || null;
      const match = {
        round: r, bracket_slot: i / 2, parent_slot: null, slot: s,
        group_label: null, entrant_a_id, entrant_b_id, order: orderCounter++,
      };
      matches.push(match);
      if (left.matchSlot != null) matches.find((m) => m.slot === left.matchSlot).parent_slot = s;
      if (right.matchSlot != null) matches.find((m) => m.slot === right.matchSlot).parent_slot = s;
      curKhe.push({ matchSlot: s, entrantId: null });
    }
    prevKhe = curKhe;
  }
  return matches;
}
module.exports = { generateSchedule };
