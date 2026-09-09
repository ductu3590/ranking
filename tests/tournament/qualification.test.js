const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const Q = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'qualification'));

const rows = [
  { entrant_id: 1, points: 8, rank: 1 },
  { entrant_id: 2, points: 6, rank: 2 },
  { entrant_id: 3, points: 4, rank: 3 },
  { entrant_id: 4, points: 2, rank: 4 },
];
const done = Q.qualificationOutlook(rows, { 1: 0, 2: 0, 3: 0, 4: 0 }, { slots: 2, winPoints: 2, groupLabel: 'A' });
assert(done[1].label === 'Nhất bảng A' && done[2].label === 'Nhì bảng A', 'hết trận, top 2 chắc suất');
assert(done[3].label === 'Đã loại' && done[3].status === 'eliminated', 'hết trận, ngoài suất bị loại');
const mid = Q.qualificationOutlook(rows, { 1: 0, 2: 1, 3: 2, 4: 2 }, { slots: 2, winPoints: 2, groupLabel: 'A' });
assert(mid[1].status === 'qualified', 'dẫn đầu chắc suất toán học');
assert(mid[2].status === 'provisional' && /Tạm/.test(mid[2].label), 'trong suất còn trận là tạm');
assert(mid[3].status === 'contending' && mid[3].label === 'Tranh vé vớt', 'ngoài suất còn cơ hội');
const out = Q.qualificationOutlook(rows, { 1: 0, 2: 0, 3: 1, 4: 1 }, { slots: 2, winPoints: 2, groupLabel: 'A' });
assert(out[4].status === 'eliminated', 'không thể vào suất bị loại');
assert(Object.keys(Q.qualificationOutlook([], {}, { slots: 2, winPoints: 2 })).length === 0, 'bảng rỗng không văng lỗi');

const koMatches = [
  { round: 2, status: 'finalized', entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1 },
  { round: 1, status: 'finalized', entrant_a_id: 1, entrant_b_id: 3, winner_entrant_id: 1 },
  { round: 1, status: 'finalized', entrant_a_id: 2, entrant_b_id: 4, winner_entrant_id: 2 },
];
const koFinal = Q.finalStandingsFrom({ schedule_format: 'knockout' }, [], koMatches);
assert(koFinal[0].rank === 1 && koFinal[0].entry_id === 1 && koFinal[0].label === 'Vô địch', 'vô địch');
assert(koFinal[1].rank === 2 && koFinal[1].entry_id === 2 && koFinal[1].label === 'Á quân', 'á quân');
const rrFinal = Q.finalStandingsFrom({ schedule_format: 'round_robin' }, rows, []);
assert(rrFinal[0].entry_id === 1 && rrFinal[0].label === 'Vô địch', 'vòng tròn lấy BXH');
assert(rrFinal[2].label === 'Hạng ba' && rrFinal[3].label === 'Hạng 4', 'nhãn hạng đúng');
console.log('qualification ok');
