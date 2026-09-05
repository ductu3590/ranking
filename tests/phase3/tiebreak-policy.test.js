const assert = require('assert');
const { TIEBREAK_PRESETS, resolveTiebreak, rankStandings } = require('../../lib/tournament/rules/tiebreak');
const { computeStandings } = require('../../lib/tournament/engines/roundRobin');
assert.deepStrictEqual(TIEBREAK_PRESETS.phong_trao_mac_dinh.order, ['match_points', 'head_to_head', 'game_diff', 'point_diff', 'points_for', 'draw_lot']);
assert.deepStrictEqual(TIEBREAK_PRESETS.giao_huu_clb.order, ['match_points', 'point_diff', 'points_for', 'head_to_head', 'draw_lot']);
assert.deepStrictEqual(TIEBREAK_PRESETS.hieu_so_van_truoc.order, ['match_points', 'game_diff', 'head_to_head', 'point_diff', 'draw_lot']);
assert.deepStrictEqual(TIEBREAK_PRESETS.legacy_v2.order, ['match_points', 'diff', 'head_to_head', 'points_for', 'seed'], 'legacy_v2 không đổi');

const cyclicRows = [1, 2, 3].map((entrant_id) => ({ entrant_id, match_points: 2, game_diff: 0, point_diff: 0, points_for: 20, seed: entrant_id, group_label: 'A' }));
const cyclicMatches = [{ entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, status: 'done' }, { entrant_a_id: 2, entrant_b_id: 3, winner_entrant_id: 2, status: 'done' }, { entrant_a_id: 3, entrant_b_id: 1, winner_entrant_id: 3, status: 'done' }];
const cyclic = rankStandings(cyclicRows, cyclicMatches, { version: 'phong_trao_mac_dinh', scope: 'tied_group' }, 1);
assert.deepStrictEqual(cyclic.map((row) => row.rank), [1, 2, 3], 'vòng tròn vẫn có thứ hạng deterministic');
assert(cyclic.every((row) => row.explanation.some((item) => item.criterion === 'game_diff')), 'vòng tròn bỏ qua head_to_head và chuyển tiêu chí kế tiếp');
assert(cyclic.every((row) => row.explanation.find((item) => item.criterion === 'order').order.join(',') === 'match_points,head_to_head,game_diff,point_diff,points_for,draw_lot'), 'explanation phản ánh đúng config.order');
assert(cyclic.every((row) => row.explanation.some((item) => item.criterion === 'draw_lot')), 'hòa hoàn toàn dùng draw_lot làm tiêu chí cuối');

const splitRows = [
  { entrant_id: 1, match_points: 2, game_diff: 4, point_diff: 10, points_for: 30, seed: 1, group_label: 'A' },
  { entrant_id: 2, match_points: 2, game_diff: 1, point_diff: 5, points_for: 25, seed: 2, group_label: 'A' },
  { entrant_id: 3, match_points: 2, game_diff: 1, point_diff: 2, points_for: 22, seed: 3, group_label: 'A' },
];
const split = rankStandings(splitRows, [], { version: 'hieu_so_van_truoc', scope: 'all', order: ['match_points', 'game_diff', 'head_to_head', 'point_diff', 'draw_lot'] }, 1);
assert.deepStrictEqual(split.map((row) => row.entrant_id), [1, 2, 3], 'game_diff tách nhóm đúng');
assert(split[0].explanation.some((item) => item.criterion === 'game_diff' && item.decided === true), 'explanation ghi tiêu chí đã tách được');
assert(!split[0].explanation.some((item) => item.criterion === 'diff'), 'explanation không dùng danh sách legacy cứng');

const realRows = computeStandings({ config: { winPoints: 2, tiebreak: 'phong_trao_mac_dinh' } }, [{ id: 1, seed: 1 }, { id: 2, seed: 2 }], [
  { entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, points_a: 30, points_b: 10, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
]);
assert.deepStrictEqual(realRows.map((row) => row.entrant_id), [1, 2], 'computeStandings sinh dữ liệu thật và hiệu số cao xếp trên');
for (const criterion of ['wins', 'game_diff', 'point_diff', 'game_ratio', 'point_ratio', 'points_against']) {
  const rowsForCriterion = computeStandings({ config: { winPoints: 2 } }, [{ id: 1, seed: 1 }, { id: 2, seed: 2 }], [
    { entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, points_a: 30, points_b: 10, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
  ]);
  const ranked = rankStandings(rowsForCriterion.map((row) => ({ ...row, match_points: 0 })), [], { version: 'criterion_test', scope: 'all', order: [criterion, 'draw_lot'] }, 1);
  assert(ranked[0].explanation.some((item) => item.criterion === criterion && item.decided === true), `${criterion} thực sự được sử dụng để tách hạng`);
}

// A1: tỉ lệ ván và tỉ lệ điểm phải hữu hạn, nằm trong 0..1 và sống sót qua JSON.
const sweepRows = computeStandings({ config: { winPoints: 2 } }, [{ id: 1, seed: 1 }, { id: 2, seed: 2 }], [
  { entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, points_a: 22, points_b: 0, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
]);
const sweepWinner = sweepRows.find((row) => row.entrant_id === 1);
const sweepLoser = sweepRows.find((row) => row.entrant_id === 2);
assert(Number.isFinite(sweepWinner.game_ratio), 'game_ratio hữu hạn khi chưa thua ván nào');
assert(Number.isFinite(sweepWinner.point_ratio), 'point_ratio hữu hạn khi chưa thủng điểm nào');
assert(sweepWinner.game_ratio > 0 && sweepWinner.game_ratio <= 1, 'game_ratio nằm trong khoảng 0..1');
assert(sweepWinner.point_ratio > 0 && sweepWinner.point_ratio <= 1, 'point_ratio nằm trong khoảng 0..1');
assert.strictEqual(typeof JSON.parse(JSON.stringify(sweepWinner)).game_ratio, 'number', 'game_ratio không thành null khi trả JSON');
assert.strictEqual(typeof JSON.parse(JSON.stringify(sweepWinner)).point_ratio, 'number', 'point_ratio không thành null khi trả JSON');
assert(sweepWinner.game_ratio > sweepLoser.game_ratio, 'đội thắng vẫn có tỉ lệ ván cao hơn');
assert(sweepWinner.point_ratio > sweepLoser.point_ratio, 'đội thắng vẫn có tỉ lệ điểm cao hơn');

// A2: scope tied_group tính lại tiêu chí số trên các trận trong nội bộ nhóm hòa.
// 1, 2, 3 bằng điểm và thắng vòng tròn lẫn nhau; 4 thua cả ba.
// Hiệu số toàn bảng: 1 (+13) > 2 (+12) > 3 (0). Hiệu số bảng con: 1 (+10) > 3 (-1) > 2 (-9).
const miniEntrants = [1, 2, 3, 4].map((id) => ({ id, seed: id }));
const miniMatches = [
  { entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, points_a: 21, points_b: 10, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
  { entrant_a_id: 2, entrant_b_id: 3, winner_entrant_id: 2, points_a: 21, points_b: 19, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
  { entrant_a_id: 3, entrant_b_id: 1, winner_entrant_id: 3, points_a: 21, points_b: 20, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
  { entrant_a_id: 1, entrant_b_id: 4, winner_entrant_id: 1, points_a: 21, points_b: 18, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
  { entrant_a_id: 2, entrant_b_id: 4, winner_entrant_id: 2, points_a: 21, points_b: 0, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
  { entrant_a_id: 3, entrant_b_id: 4, winner_entrant_id: 3, points_a: 21, points_b: 20, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
];
const miniOrder = ['match_points', 'head_to_head', 'game_diff', 'point_diff', 'points_for', 'draw_lot'];
const miniRows = () => computeStandings({ config: { winPoints: 2 } }, miniEntrants, miniMatches);
const wholeTable = rankStandings(miniRows(), miniMatches, { version: 'phong_trao_mac_dinh', scope: 'all', order: miniOrder }, 1);
const tiedGroup = rankStandings(miniRows(), miniMatches, { version: 'phong_trao_mac_dinh', scope: 'tied_group', order: miniOrder }, 1);
assert.deepStrictEqual(wholeTable.map((row) => row.entrant_id), [1, 2, 3, 4], 'scope all xếp theo hiệu số toàn bảng');
assert.deepStrictEqual(tiedGroup.map((row) => row.entrant_id), [1, 3, 2, 4], 'scope tied_group xếp theo hiệu số trong nội bộ nhóm hòa');
assert(
  tiedGroup.find((row) => row.entrant_id === 3).explanation
    .some((item) => item.criterion === 'point_diff' && item.scope === 'tied_group'),
  'explanation ghi rõ tiêu chí được tính trong phạm vi nhóm hòa',
);
assert(
  !wholeTable.find((row) => row.entrant_id === 3).explanation
    .some((item) => item.scope === 'tied_group'),
  'scope all không đánh dấu nhóm hòa',
);

const lotA = rankStandings(cyclicRows, cyclicMatches, { version: 'draw_lot', scope: 'all', order: ['match_points', 'draw_lot'] }, 99);
const lotB = rankStandings(cyclicRows, cyclicMatches, { version: 'draw_lot', scope: 'all', order: ['match_points', 'draw_lot'] }, 99);
assert.deepStrictEqual(lotA, lotB, 'draw_lot deterministic theo seed');
assert.strictEqual(resolveTiebreak({}, {}, {}).version, 'legacy_v2', 'default tiebreak legacy_v2');
console.log('phase3 tiebreak policy ok');
