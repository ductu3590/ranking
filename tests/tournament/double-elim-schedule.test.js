const { generateSchedule } = require('../../lib/tournament/engines/doubleElim');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

function meaningful(matches) {
  // trận có nghĩa = có ít nhất 1 entrant hoặc là W/L bracket (GF reset placeholder rỗng thì loại)
  return matches.filter((m) => !(m.bracket === 'GF' && m.entrant_a_id == null && m.entrant_b_id == null && m.parent_slot == null && m._reset));
}

// N = 4 (lũy thừa 2)
const e4 = [1, 2, 3, 4].map((id) => ({ id, name: 'E' + id, seed: id }));
const m4 = generateSchedule({ config: {} }, e4, 1);
const W4 = m4.filter((m) => m.bracket === 'W');
const L4 = m4.filter((m) => m.bracket === 'L');
const GF4 = m4.filter((m) => m.bracket === 'GF');
assert(W4.length === 3, `N=4 winners = N-1 = 3, got ${W4.length}`);
assert(L4.length === 2, `N=4 losers = N-2 = 2, got ${L4.length}`);
assert(GF4.length >= 1, `N=4 có grand final, got ${GF4.length}`);
// reset bật mặc định -> 2 slot GF
assert(GF4.length === 2, `N=4 reset bật -> 2 slot GF, got ${GF4.length}`);
const meaningful4 = W4.length + L4.length + 1; // 1 GF quyết định
assert(meaningful4 === 6, `N=4 trận nghĩa = 2N-2 = 6, got ${meaningful4}`);

// mọi slot là duy nhất
const slots4 = m4.map((m) => m.slot);
assert(new Set(slots4).size === slots4.length, 'slot duy nhất');

// parent_slot (winner) và loser_to_slot trỏ tới slot tồn tại
const slotSet = new Set(slots4);
for (const m of m4) {
  if (m.parent_slot != null) assert(slotSet.has(m.parent_slot), `parent_slot ${m.parent_slot} tồn tại`);
  if (m.loser_to_slot != null) assert(slotSet.has(m.loser_to_slot), `loser_to_slot ${m.loser_to_slot} tồn tại`);
}
// trận nhánh W không phải trận cuối cùng của W phải có loser_to_slot (kẻ thua xuống L)
const wNonFinal = W4.filter((m) => m.parent_slot != null); // còn trận W kế tiếp -> chưa phải W-final
assert(wNonFinal.every((m) => m.loser_to_slot != null), 'trận W không-chung-kết có loser_to_slot');

// N = 8
const e8 = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, name: 'E' + id, seed: id }));
const m8 = generateSchedule({ config: {} }, e8, 1);
const W8 = m8.filter((m) => m.bracket === 'W');
const L8 = m8.filter((m) => m.bracket === 'L');
const GF8 = m8.filter((m) => m.bracket === 'GF');
assert(W8.length === 7, `N=8 winners = 7, got ${W8.length}`);
assert(L8.length === 6, `N=8 losers = 6, got ${L8.length}`);
const meaningful8 = W8.length + L8.length + 1;
assert(meaningful8 === 14, `N=8 trận nghĩa = 2N-2 = 14, got ${meaningful8}`);
assert(GF8.length === 2, 'N=8 reset bật -> 2 slot GF');

// vòng 1 nhánh W: seed 1 gặp seed 8
const w8r1 = W8.filter((m) => m.round === 1);
assert(w8r1.length === 4, 'N=8 vòng 1 nhánh W có 4 trận');
const top8 = w8r1.find((m) => m.entrant_a_id === 1 || m.entrant_b_id === 1);
assert([top8.entrant_a_id, top8.entrant_b_id].includes(8), 'seed1 vs seed8 ở vòng 1 W');

// non-power-of-2: N=6 -> không sinh trận entrant null ở vòng 1 nhánh W
const e6 = [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: 'E' + id, seed: id }));
const m6 = generateSchedule({ config: {} }, e6, 1);
const w6r1 = m6.filter((m) => m.bracket === 'W' && m.round === 1);
assert(w6r1.every((m) => m.entrant_a_id && m.entrant_b_id), 'N=6 vòng 1 W không có bye rỗng');

// grand final reset TẮT -> chỉ 1 slot GF
const m4noReset = generateSchedule({ config: { grandFinalReset: false } }, e4, 1);
assert(m4noReset.filter((m) => m.bracket === 'GF').length === 1, 'reset tắt -> 1 slot GF');

// group_label null, order tăng dần duy nhất
assert(m4.every((m) => m.group_label === null), 'group_label null');
const orders = m4.map((m) => m.order);
assert(new Set(orders).size === orders.length, 'order duy nhất');

console.log('double-elim-schedule ok');
