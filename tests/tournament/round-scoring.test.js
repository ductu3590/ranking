const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const R = require(path.join(__dirname, '..', '..', 'lib', 'tournament', 'rules', 'roundScoring'));

// --- roundKeyOf ---
assert(R.roundKeyOf({ round: 1 }) === '1', 'trận thường vòng 1');
assert(R.roundKeyOf({ round: 3 }) === '3', 'trận thường vòng 3');
assert(R.roundKeyOf({}) === '1', 'thiếu round thì coi là vòng 1');
assert(R.roundKeyOf({ round: null }) === '1', 'round null thì coi là vòng 1');
assert(R.roundKeyOf({ round: 3, bracket: null }) === '3', 'bracket null thì bỏ qua, dùng round');
assert(R.roundKeyOf({ round: 3, bracket: '' }) === '3', 'bracket rỗng thì bỏ qua');
assert(R.roundKeyOf({ round: 3, bracket: 'W' }) === 'W:3', 'nhánh thắng vòng 3');
assert(R.roundKeyOf({ round: 2, bracket: 'L' }) === 'L:2', 'nhánh thua vòng 2');
assert(R.roundKeyOf({ round: 9, bracket: 'GF' }) === 'GF', 'chung kết tổng bỏ số vòng');

// --- describeRound ---
const ko = { schedule_format: 'knockout' };
const rr = { schedule_format: 'round_robin' };
assert(R.describeRound(ko, '3', 3) === 'Chung kết', 'knockout vòng cuối');
assert(R.describeRound(ko, '2', 3) === 'Bán kết', 'knockout kế cuối');
assert(R.describeRound(ko, '1', 3) === 'Tứ kết', 'knockout kế kế cuối');
assert(R.describeRound(ko, '1', 5) === 'Vòng 1', 'knockout 5 vòng, vòng 1 là Vòng 1');
assert(R.describeRound(ko, '3', 5) === 'Tứ kết', 'knockout 5 vòng, vòng 3 là Tứ kết');
assert(R.describeRound(ko, '1', 1) === 'Chung kết', 'knockout đúng 1 vòng');
assert(R.describeRound(rr, '4', 5) === 'Vòng 4', 'round-robin luôn Vòng N');
assert(R.describeRound(ko, 'GF', 3) === 'Chung kết tổng', 'GF');
assert(R.describeRound(ko, 'W:3', 5) === 'Nhánh thắng · vòng 3', 'nhánh thắng');
assert(R.describeRound(ko, 'L:2', 5) === 'Nhánh thua · vòng 2', 'nhánh thua');

// --- resolveRoundScoring ---
const tournament = { default_scoring: { version: 'phong_trao_11', points_to: 11, win_by: 2, cap: 15, best_of: 1, win_points: 2, loss_points: 0 } };
const division = {};
const stageNoOverride = { schedule_format: 'knockout', match_format: 'simple', config: {} };

const base = R.resolveRoundScoring(tournament, division, stageNoOverride, '1');
assert(base.round_key === '1', 'trả round_key');
assert(base.round_source === 'stage', 'không override thì nguồn là stage');
assert(base.best_of === 1 && base.points_to === 11 && base.cap === 15, 'kế thừa nguyên luật giai đoạn');

const stageOverride = {
  schedule_format: 'knockout',
  match_format: 'simple',
  config: { round_scoring: { 3: { best_of: 3, points_to: 15, cap: 21 } } },
};
const r3 = R.resolveRoundScoring(tournament, division, stageOverride, '3');
assert(r3.round_source === 'round', 'có override thì nguồn là round');
assert(r3.best_of === 3, 'đè best_of');
assert(r3.points_to === 15 && r3.cap === 21, 'đè points_to và cap');
assert(r3.win_by === 2, 'trường không đè thì giữ của giai đoạn');
assert(r3.engine.bestOf === 3, 'engine.bestOf đồng bộ theo best_of sau merge');
assert(r3.win_points === 2, 'điểm xếp hạng luôn của giai đoạn');

const r1 = R.resolveRoundScoring(tournament, division, stageOverride, '1');
assert(r1.round_source === 'stage', 'vòng không có key thì kế thừa');
assert(r1.best_of === 1, 'vòng 1 vẫn BO1');

// resolveMatchScoring = resolveRoundScoring theo roundKeyOf
const m3 = R.resolveMatchScoring(tournament, division, stageOverride, { round: 3 });
assert(m3.best_of === 3 && m3.round_key === '3', 'resolveMatchScoring dùng roundKeyOf');
const mGf = R.resolveMatchScoring(tournament, division, stageOverride, { round: 9, bracket: 'GF' });
assert(mGf.round_key === 'GF', 'trận GF lấy key GF');

// snapshot luật giai đoạn KHÔNG bị ghi đè
assert(stageOverride.config.scoring === undefined, 'không ghi vào config.scoring');
assert(stageOverride.config.round_scoring['3'].best_of === 3, 'không làm hỏng override gốc');

// --- computeRoundLocks ---
const stageKo = { schedule_format: 'knockout', config: {} };
const locks = R.computeRoundLocks(stageKo, [
  { id: 1, round: 1, status: 'finalized' },
  { id: 2, round: 1, status: 'finalized' },
  { id: 3, round: 2, status: 'live' },
  { id: 4, round: 2, status: 'pending' },
  { id: 5, round: 3, status: 'pending' },
]);
assert(locks['1'].locked === true && locks['1'].reason === 'ROUND_FINALIZED', 'vòng đã xong -> khoá');
assert(locks['1'].counts.finalized === 2 && locks['1'].counts.total === 2, 'đếm đúng vòng 1');
assert(locks['2'].locked === true && locks['2'].reason === 'ROUND_LIVE', 'vòng có trận đang đấu -> khoá');
assert(locks['2'].counts.live === 1 && locks['2'].counts.pending === 1, 'đếm đúng vòng 2');
assert(locks['3'].locked === false && locks['3'].reason === null, 'vòng chưa đấu -> mở');
assert(R.computeRoundLocks(stageKo, []) && Object.keys(R.computeRoundLocks(stageKo, [])).length === 0, 'không trận thì không vòng nào');

// totalRounds dùng cho nhãn: lớn nhất trong CÙNG bracket
assert(R.totalRoundsOf([{ round: 1 }, { round: 2 }, { round: 3 }]) === 3, 'tổng số vòng');
assert(R.totalRoundsOf([{ round: 1, bracket: 'W' }, { round: 5, bracket: 'L' }], 'W') === 1, 'tổng vòng theo bracket W');

// --- validateRoundScoringPatch ---
const stageSimple = { match_format: 'simple' };
const stageMlp = { match_format: 'mlp' };
const inherited = { points_to: 11, win_by: 2, cap: 15, best_of: 1 };

assert(R.validateRoundScoringPatch({}, stageSimple, inherited).ok === true, 'patch rỗng hợp lệ (xoá override)');
assert(R.validateRoundScoringPatch(null, stageSimple, inherited).ok === true, 'null hợp lệ (xoá override)');
assert(R.validateRoundScoringPatch({ best_of: 3 }, stageSimple, inherited).ok === true, 'BO3 hợp lệ');
assert(R.validateRoundScoringPatch({ best_of: 5 }, stageSimple, inherited).ok === true, 'BO5 hợp lệ');
assert(R.validateRoundScoringPatch({ best_of: 2 }, stageSimple, inherited).code === 'INVALID_BEST_OF', 'BO2 bị chặn');
assert(R.validateRoundScoringPatch({ best_of: 4 }, stageSimple, inherited).code === 'INVALID_BEST_OF', 'BO4 bị chặn');
assert(R.validateRoundScoringPatch({ best_of: 7 }, stageSimple, inherited).code === 'INVALID_BEST_OF', 'BO7 ngoài 3 chip UI');
assert(R.validateRoundScoringPatch({ points_to: 0 }, stageSimple, inherited).code === 'INVALID_POINTS_TO', 'điểm tới 0 bị chặn');
assert(R.validateRoundScoringPatch({ points_to: 100 }, stageSimple, inherited).code === 'INVALID_POINTS_TO', 'điểm tới 100 bị chặn');
assert(R.validateRoundScoringPatch({ win_by: 6 }, stageSimple, inherited).code === 'INVALID_WIN_BY', 'cách biệt 6 bị chặn');
assert(R.validateRoundScoringPatch({ cap: 9 }, stageSimple, inherited).code === 'INVALID_CAP', 'cap nhỏ hơn điểm tới kế thừa bị chặn');
assert(R.validateRoundScoringPatch({ points_to: 15, cap: 21 }, stageSimple, inherited).ok === true, 'cap so với points_to SAU merge');
assert(R.validateRoundScoringPatch({ cap: null }, stageSimple, inherited).ok === true, 'cap null hợp lệ');
assert(R.validateRoundScoringPatch({ win_points: 3 }, stageSimple, inherited).code === 'FORBIDDEN_ROUND_FIELD', 'điểm xếp hạng bị cấm');
assert(/xếp hạng/.test(R.validateRoundScoringPatch({ win_points: 3 }, stageSimple, inherited).message), 'giải thích tiếng Việt vì sao cấm');
assert(R.validateRoundScoringPatch({ best_of: 3 }, stageMlp, inherited).code === 'BEST_OF_NOT_ALLOWED_FOR_FORMAT', 'mlp không đổi best_of theo vòng');
assert(R.validateRoundScoringPatch({ points_to: 21 }, stageMlp, inherited).ok === true, 'mlp vẫn đổi được points_to');
assert(R.validateRoundScoringPatch({ mau_lung_tung: 1 }, stageSimple, inherited).ok === true, 'trường lạ không báo lỗi');
assert(R.sanitizeRoundPatch({ best_of: 3, mau_lung_tung: 1 }).best_of === 3, 'sanitize giữ trường hợp lệ');
assert(!('mau_lung_tung' in R.sanitizeRoundPatch({ best_of: 3, mau_lung_tung: 1 })), 'sanitize bỏ trường lạ');

console.log('round-scoring ok');

