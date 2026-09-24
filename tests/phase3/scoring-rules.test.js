const assert = require('assert');
const { SCORING_PRESETS, resolveStageScoring, validateGameScore } = require('../../lib/tournament/rules/scoring');
const { computeStandings } = require('../../lib/tournament/engines/roundRobin');
assert(SCORING_PRESETS.legacy_v2 && SCORING_PRESETS.legacy_v2.version, 'legacy_v2 là preset có version');
for (const preset of ['phong_trao_11', 'phong_trao_15', 'ban_ket_chung_ket', 'mlp_4_van']) {
  assert(SCORING_PRESETS[preset], `${preset} phải tồn tại`);
  assert('deciding_game' in SCORING_PRESETS[preset] && 'draw_points' in SCORING_PRESETS[preset] && 'mlp' in SCORING_PRESETS[preset], `${preset} có đủ cấu trúc scoring`);
}
const resolved = resolveStageScoring({ default_scoring: { version: 'custom', points_to: 21 } }, { scoring_override: { version: 'division', points_to: 15 } }, { config: { scoring: { version: 'stage', points_to: 11 } } });
assert.strictEqual(resolved.version, 'stage', 'stage snapshot ưu tiên cao nhất');
assert.strictEqual(resolveStageScoring({}, {}, {}).version, 'legacy_v2', 'giải cũ dùng legacy_v2');
const legacyRows = computeStandings({ config: { tiebreak: 'legacy_v2' } }, [{ id: 1, seed: 1 }, { id: 2, seed: 2 }, { id: 3, seed: 3 }], [
  { entrant_a_id: 1, entrant_b_id: 2, winner_entrant_id: 1, points_a: 22, points_b: 18, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
  { entrant_a_id: 1, entrant_b_id: 3, winner_entrant_id: 1, points_a: 22, points_b: 15, games_a: 2, games_b: 0, status: 'done', group_label: 'A' },
  { entrant_a_id: 2, entrant_b_id: 3, winner_entrant_id: 2, points_a: 21, points_b: 19, games_a: 2, games_b: 1, status: 'done', group_label: 'A' },
]);
assert.deepStrictEqual(legacyRows.map((row) => row.entrant_id), [1, 2, 3], 'legacy_v2 giữ đúng thứ tự fixture hiện hành');
// D34 (nghiệm thu Epic 2): bên nhiều điểm hơn thắng; không kiểm mốc tới / cách / trần (ADR-006 mục Epic 2 E1.1).
assert(validateGameScore({ score_a: 11, score_b: 9 }, { points_to: 11, win_by: 1 }).ok, 'điểm hợp lệ');
assert(validateGameScore({ score_a: 11, score_b: 10 }, { points_to: 11, win_by: 2 }).ok, 'không còn chặn thắng cách 1');
assert(validateGameScore({ score_a: 17, score_b: 15 }, { points_to: 15, win_by: 2, cap: 15 }).ok, 'vượt 15 khi thắng cách 2 được lưu');
assert(validateGameScore({ score_a: 7, score_b: 21 }, { points_to: 11, win_by: 2, cap: 15 }).ok, 'không cố định 11/15/21');
assert.strictEqual(validateGameScore({ score_a: 12, score_b: 12 }, {}).code, 'INVALID_SCORE', 'hoà bị chặn');
assert.strictEqual(validateGameScore({ score_a: -1, score_b: 11 }, {}).code, 'INVALID_SCORE', 'điểm âm bị chặn');
assert.strictEqual(validateGameScore({ score_a: 11.5, score_b: 3 }, {}).code, 'INVALID_SCORE', 'điểm lẻ bị chặn');
console.log('phase3 scoring rules ok');
