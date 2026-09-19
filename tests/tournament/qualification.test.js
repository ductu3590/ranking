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
const bronzeFinal = Q.finalStandingsFrom({ schedule_format: 'knockout' }, [], [
  { round: 2, match_key: 'BRONZE', status: 'finalized', entrant_a_id: 3, entrant_b_id: 4, winner_entrant_id: 3 },
  { round: 2, match_key: 'F', status: 'finalized', entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 2 },
]);
assert(bronzeFinal.map((row) => row.entry_id).join(',') === '2,1,3,4', 'BXH chung cuộc ưu tiên F thay vì thứ tự fixture');
assert(bronzeFinal.map((row) => row.rank).join(',') === '1,2,3,4', 'tranh hạng ba cho thứ hạng riêng');
const rrFinal = Q.finalStandingsFrom({ schedule_format: 'round_robin' }, rows, []);
assert(rrFinal[0].entry_id === 1 && rrFinal[0].label === 'Vô địch', 'vòng tròn lấy BXH');
assert(rrFinal[2].label === 'Hạng ba' && rrFinal[3].label === 'Hạng 4', 'nhãn hạng đúng');
// Hồi quy E1: standingsService đổi 'finalized' -> 'done' cho nhánh entry, nên nếu
// finalStandingsFrom chỉ nhận 'finalized' thì MỌI nội dung đôi có final_standings rỗng.
const doneMatches = [
  { round: 1, match_key: 'SF1', status: 'done', entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1 },
  { round: 1, match_key: 'SF2', status: 'done', entrant_a_id: 3, entrant_b_id: 4, winner_entrant_id: 3 },
  { round: 2, match_key: 'F', status: 'done', entrant_a_id: 1, entrant_b_id: 3, winner_entrant_id: 1 },
];
const doneFinal = Q.finalStandingsFrom({ schedule_format: 'knockout' }, [], doneMatches);
assert(doneFinal.length === 4, "trận status 'done' vẫn phải ra BXH chung cuộc");
assert(doneFinal[0].entry_id === 1 && doneFinal[0].label === 'Vô địch', "vô địch từ nhánh 'done'");
assert(doneFinal[1].entry_id === 3 && doneFinal[1].label === 'Á quân', "á quân từ nhánh 'done'");
assert(doneFinal.filter((row) => row.placement === 'joint_third').length === 2, "không có tranh hạng ba thì hai đồng hạng ba");

console.log('qualification ok');
