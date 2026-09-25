'use strict';
// Điểm vào DUY NHẤT sinh cấu trúc giải cho luồng tạo giải v3 (spec README "Một nguồn cấu trúc").
// Preview và finalize cùng gọi buildSetupPlan; finalize tính lại trên server rồi so fingerprint.
// Dùng node:crypto → chỉ chạy phía server.

const crypto = require('node:crypto');
const { planError, stableStringify, planInputSignature } = require('./common');
const { buildGroupKnockoutPlan } = require('./groupKnockout');
const { buildRoundRobinPlan } = require('./roundRobin');
const { buildKnockoutPlan } = require('./knockout');
const { buildDoubleElimPlan } = require('./doubleElim');

const BUILDERS = Object.freeze({
  group_knockout: buildGroupKnockoutPlan,
  round_robin: buildRoundRobinPlan,
  knockout: buildKnockoutPlan,
  double_elimination: buildDoubleElimPlan,
});

// entryClubs (tùy chọn, chỉ giải giao hữu): { [pairId]: clubKey } → rải CLB (Epic 3 F2 §4). Vắng / một CLB → đúng
// đường cũ. Không vào planInputSignature: CLB suy ra được từ pairId (khóa khách mang tournamentClubId).
function buildSetupPlan({ formatKey, config = {}, pairIds = [], seed, divisionId, entryClubs }) {
  const builder = BUILDERS[formatKey];
  if (!builder) planError('FORMAT_NOT_AVAILABLE', 'Thể thức này sắp có');
  const plan = builder({ config, pairIds, seed, divisionId, ...(entryClubs ? { entryClubs } : {}) });
  const withSignature = { ...plan, inputSignature: planInputSignature({ formatKey, config, pairIds }) };
  const fingerprint = crypto.createHash('sha256').update(stableStringify(withSignature)).digest('hex');
  return { ...withSignature, fingerprint };
}

module.exports = { buildSetupPlan, BUILDERS };
