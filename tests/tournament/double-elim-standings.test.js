const { generateSchedule, computeStandings } = require('../../lib/tournament/engines/doubleElim');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const entrants = [1, 2, 3, 4].map((id) => ({ id, name: 'E' + id, seed: id }));
const matches = generateSchedule({ config: {} }, entrants, 1);
const bySlot = new Map(matches.map((m) => [m.slot, m]));
const seedOf = new Map(entrants.map((e) => [e.id, e.seed]));

function place(slot, entrantId) {
  if (slot == null || entrantId == null) return;
  const t = bySlot.get(slot);
  if (!t) return;
  if (t.entrant_a_id === entrantId || t.entrant_b_id === entrantId) return;
  if (t.entrant_a_id == null) t.entrant_a_id = entrantId;
  else if (t.entrant_b_id == null) t.entrant_b_id = entrantId;
}

// Mô phỏng: hạt nhỏ hơn (mạnh hơn) luôn thắng. Chạy tới điểm bất động.
let changed = true;
while (changed) {
  changed = false;
  for (const m of matches.slice().sort((a, b) => a.order - b.order)) {
    if (m.status === 'done') continue;
    if (m.entrant_a_id != null && m.entrant_b_id != null) {
      const sa = seedOf.get(m.entrant_a_id);
      const sb = seedOf.get(m.entrant_b_id);
      const winner = sa <= sb ? m.entrant_a_id : m.entrant_b_id;
      const loser = winner === m.entrant_a_id ? m.entrant_b_id : m.entrant_a_id;
      m.winner_entrant_id = winner;
      m.status = 'done';
      place(m.parent_slot, winner);
      place(m.loser_to_slot, loser);
      changed = true;
    }
  }
}

const rows = computeStandings({ config: {} }, entrants, matches);
assert(rows.length === 4, '4 hàng xếp hạng');
const rank1 = rows.filter((r) => r.rank === 1);
assert(rank1.length === 1, 'đúng 1 vô địch');
assert(rank1[0].entrant_id === 1, 'seed 1 vô địch');
const maxExit = Math.max(...rows.map((r) => r.exit_round));
assert(rank1[0].exit_round === maxExit, 'vô địch exit_round cao nhất');
const rank2 = rows.filter((r) => r.rank === 2);
assert(rank2.length === 1, 'đúng 1 á quân');
// rank tăng dần hợp lệ 1..4
const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
assert(ranks[0] === 1 && ranks[ranks.length - 1] <= 4, 'rank trong khoảng 1..4');
// mọi entrant có mặt
const ids = new Set(rows.map((r) => r.entrant_id));
assert([1, 2, 3, 4].every((id) => ids.has(id)), 'đủ 4 entrant');

console.log('double-elim-standings ok');
