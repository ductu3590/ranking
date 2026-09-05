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

const lotA = rankStandings(cyclicRows, cyclicMatches, { version: 'draw_lot', scope: 'all', order: ['match_points', 'draw_lot'] }, 99);
const lotB = rankStandings(cyclicRows, cyclicMatches, { version: 'draw_lot', scope: 'all', order: ['match_points', 'draw_lot'] }, 99);
assert.deepStrictEqual(lotA, lotB, 'draw_lot deterministic theo seed');
assert.strictEqual(resolveTiebreak({}, {}, {}).version, 'legacy_v2', 'default tiebreak legacy_v2');
console.log('phase3 tiebreak policy ok');
