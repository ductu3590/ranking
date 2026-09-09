const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const D = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'draw'));

const entrants = [
  { id: 1, name: 'A', seed: 1, club_id: 10 },
  { id: 2, name: 'B', seed: 2, club_id: 11 },
  { id: 3, name: 'C', seed: 3, club_id: 10 },
  { id: 4, name: 'D', seed: 4, club_id: 12 },
];

// --- buildDrawSlots: vòng tròn nhiều bảng ---
const rr = D.buildDrawSlots({ schedule_format: 'round_robin', config: { groups: 2 } }, entrants, 42);
assert(rr.length === 4, 'đủ 4 đội');
assert(new Set(rr.map((s) => s.entry_id)).size === 4, 'không đội nào lặp');
assert(new Set(rr.map((s) => s.group_label)).size === 2, 'chia đúng 2 bảng');
const perGroup = rr.reduce((acc, s) => { acc[s.group_label] = (acc[s.group_label] || 0) + 1; return acc; }, {});
assert(Object.values(perGroup).every((n) => n === 2), 'mỗi bảng 2 đội');

// Cùng seed thì bốc lại ra cùng kết quả — BTC bốc lại được và giải thích được.
const rrAgain = D.buildDrawSlots({ schedule_format: 'round_robin', config: { groups: 2 } }, entrants, 42);
assert(JSON.stringify(rr) === JSON.stringify(rrAgain), 'cùng seed cho cùng kết quả');
const rrOther = D.buildDrawSlots({ schedule_format: 'round_robin', config: { groups: 2 } }, entrants, 7);
assert(JSON.stringify(rr) !== JSON.stringify(rrOther), 'seed khác cho kết quả khác');

// --- buildDrawSlots: knockout ---
const ko = D.buildDrawSlots({ schedule_format: 'knockout', config: {} }, entrants, 1);
assert(ko.length === 4, 'knockout giữ đủ đội');
assert(ko.every((s) => s.group_label === null), 'knockout không có bảng');
assert(ko.every((s) => Number.isInteger(s.seed_in_stage)), 'knockout có vị trí nhánh');
assert(new Set(ko.map((s) => s.seed_in_stage)).size === 4, 'vị trí nhánh không trùng nhau');

// --- swapDrawSlots ---
const swapped = D.swapDrawSlots(rr, rr[0].entry_id, rr[3].entry_id);
assert(swapped.length === 4, 'đổi chỗ giữ nguyên số đội');
assert(new Set(swapped.map((s) => s.entry_id)).size === 4, 'đổi chỗ không tạo trùng');
const before = rr.find((s) => s.entry_id === rr[0].entry_id);
const after = swapped.find((s) => s.entry_id === rr[0].entry_id);
assert(before.group_label !== after.group_label || before.seed_in_stage !== after.seed_in_stage,
  'đội đầu thực sự đổi chỗ');
assert(rr[0].group_label === before.group_label, 'không sửa mảng gốc');
let threw = null;
try { D.swapDrawSlots(rr, 999, rr[1].entry_id); } catch (e) { threw = e; }
assert(threw !== null, 'đổi chỗ với đội không có trong bốc thăm thì ném lỗi');

// --- validateDraw: lỗi chặn ---
const dup = [{ entry_id: 1, group_label: 'A' }, { entry_id: 1, group_label: 'B' }];
assert(D.validateDraw(dup, entrants).code === 'DRAW_DUPLICATE_ENTRY', 'đội trùng bị chặn');
assert(D.validateDraw([{ entry_id: 1, group_label: 'A' }], entrants).code === 'DRAW_TOO_FEW_ENTRIES', 'một đội bị chặn');
assert(D.validateDraw(rr, entrants).ok === true, 'bốc thăm hợp lệ');

// --- validateDraw: cảnh báo KHÔNG chặn ---
const lop = [
  { entry_id: 1, group_label: 'A' }, { entry_id: 2, group_label: 'A' },
  { entry_id: 3, group_label: 'A' }, { entry_id: 4, group_label: 'B' },
];
const vLop = D.validateDraw(lop, entrants);
assert(vLop.ok === true, 'bảng lệch không chặn');
assert(vLop.warnings.some((w) => /lệch/.test(w.message)), 'có cảnh báo bảng lệch');
assert(vLop.warnings.every((w) => w.blocking === false), 'mọi cảnh báo đều không chặn');

const cungClb = [
  { entry_id: 1, group_label: 'A' }, { entry_id: 3, group_label: 'A' },
  { entry_id: 2, group_label: 'B' }, { entry_id: 4, group_label: 'B' },
];
const vClb = D.validateDraw(cungClb, entrants);
assert(vClb.ok === true, 'cùng CLB một bảng không chặn');
assert(vClb.warnings.some((w) => /CLB/.test(w.message)), 'có cảnh báo cùng CLB');

// Knockout không có bảng thì không được cảnh báo lệch bảng.
assert(D.validateDraw(ko, entrants).warnings.every((w) => w.code !== 'DRAW_UNEVEN_GROUPS'),
  'knockout không cảnh báo lệch bảng');

console.log('draw ok');
