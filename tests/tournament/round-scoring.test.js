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

console.log('round-scoring ok');
