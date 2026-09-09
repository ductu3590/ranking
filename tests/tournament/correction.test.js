const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const C = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'correction'));

const match = { id: 5, parent_match_id: 9, winner_entrant_id: 1, status: 'finalized' };

// Trận vòng sau chưa gọi -> cho sửa.
let impact = C.correctionImpact(match, { id: 9, status: 'pending' }, { winnerChanged: true });
assert(impact.blocked === false, 'trận sau pending thì cho sửa');
assert(impact.downstream.length === 1, 'liệt kê trận bị ảnh hưởng');

// Trận vòng sau đang chạy -> chặn. Có người trên sân đang đấu dưới danh nghĩa
// một suất mà ta sắp lấy đi.
for (const st of ['warmup', 'live', 'paused']) {
  impact = C.correctionImpact(match, { id: 9, status: st }, { winnerChanged: true });
  assert(impact.blocked === true, `trận sau ${st} thì chặn`);
  assert(impact.code === 'CORRECTION_BLOCKED_DOWNSTREAM', `mã lỗi cho ${st}`);
  assert(/đang/.test(impact.message), `thông báo nói rõ tình trạng cho ${st}`);
}

// Trận vòng sau đã chốt -> chặn, thông báo khác.
impact = C.correctionImpact(match, { id: 9, status: 'finalized' }, { winnerChanged: true });
assert(impact.blocked === true, 'trận sau finalized thì chặn');
assert(/huỷ chốt/.test(impact.message), 'nói rõ phải huỷ chốt trận sau trước');

// Không đổi đội thắng thì không đụng vòng sau.
impact = C.correctionImpact(match, { id: 9, status: 'finalized' }, { winnerChanged: false });
assert(impact.blocked === false, 'chỉ sửa tỉ số, không đổi đội thắng -> không chặn');
assert(impact.downstream.length === 0, 'không liệt kê trận sau');

// Trận không có vòng sau.
impact = C.correctionImpact({ ...match, parent_match_id: null }, null, { winnerChanged: true });
assert(impact.blocked === false, 'không có trận sau thì không chặn');
assert(impact.downstream.length === 0, 'không có trận sau thì danh sách rỗng');

// --- buildCorrectionRow ---
const row = C.buildCorrectionRow({
  groupId: 1, tournamentId: 2, divisionId: 3, matchId: 5,
  before: { games: [{ score_a: 11, score_b: 7 }] },
  after: { games: [{ score_a: 11, score_b: 9 }] },
  reason: 'Trọng tài ghi nhầm ván 1',
  actor: 'Tuấn',
});
assert(row.status === 'applied', 'ghi thẳng applied, không qua duyệt hai bước');
assert(row.requester === 'Tuấn' && row.approver === 'Tuấn', 'một BTC vừa đề nghị vừa duyệt');
assert(row.applied_at && row.approved_at, 'đóng dấu cả hai mốc');
assert(row.group_id === 1 && row.tournament_id === 2 && row.division_id === 3 && row.match_id === 5, 'map id đúng');
assert(row.before_payload.games.length === 1 && row.after_payload.games[0].score_b === 9, 'giữ nguyên before/after');

let threw = null;
try {
  C.buildCorrectionRow({ groupId: 1, tournamentId: 2, matchId: 5, before: {}, after: {}, reason: '  ', actor: 'a' });
} catch (e) { threw = e; }
assert(threw !== null && /lý do/.test(threw.message), 'thiếu lý do thì ném lỗi');

threw = null;
try {
  C.buildCorrectionRow({ groupId: 1, tournamentId: 2, matchId: 5, before: {}, after: {}, reason: 'x', actor: '' });
} catch (e) { threw = e; }
assert(threw !== null, 'thiếu actor thì ném lỗi');

console.log('correction ok');
