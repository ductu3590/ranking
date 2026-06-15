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

// Thứ hạng knockout: vô địch -> á quân -> theo vòng bị loại (muộn hơn = hạng cao hơn).
function computeStandings(stage, entrants, matches) {
  const maxRound = matches.reduce((mx, m) => Math.max(mx, m.round), 0);
  const eliminatedRound = new Map();
  let champion = null;
  for (const m of matches) {
    if (m.status !== 'done' || !m.winner_entrant_id) continue;
    const loser = m.winner_entrant_id === m.entrant_a_id ? m.entrant_b_id : m.entrant_a_id;
    if (loser) eliminatedRound.set(loser, m.round);
    if (m.round === maxRound) champion = m.winner_entrant_id;
  }
  const rows = entrants.map((e) => {
    let exitRound;
    if (e.id === champion) exitRound = maxRound + 1;
    else exitRound = eliminatedRound.has(e.id) ? eliminatedRound.get(e.id) : 0;
    return { entrant_id: e.id, exit_round: exitRound, seed: e.seed || 0, rank: 0 };
  });
  rows.sort((a, b) => (b.exit_round - a.exit_round) || (a.seed - b.seed));
  let rank = 1;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i].exit_round !== rows[i - 1].exit_round) rank = i + 1;
    rows[i].rank = rank;
  }
  return rows;
}
function advance(stage, standings) {
  const champ = standings.find((r) => r.rank === 1);
  return champ ? [{ entrant_id: champ.entrant_id, seed_in_stage: 1 }] : [];
}
module.exports = { generateSchedule, computeStandings, advance };
