'use strict';
// Điểm vào DUY NHẤT sinh cấu trúc giải cho luồng tạo giải v3 (spec README "Một nguồn cấu trúc").
// Preview và finalize cùng gọi buildSetupPlan; finalize tính lại trên server rồi so fingerprint.
// Dùng node:crypto → chỉ chạy phía server.

const crypto = require('node:crypto');
const { planError, stableStringify, planInputSignature } = require('./common');
const { buildGroupKnockoutPlan } = require('./groupKnockout');

const BUILDERS = Object.freeze({
  group_knockout: buildGroupKnockoutPlan,
});

function buildSetupPlan({ formatKey, config = {}, pairIds = [], seed, divisionId }) {
  const builder = BUILDERS[formatKey];
  if (!builder) planError('FORMAT_NOT_AVAILABLE', 'Thể thức này sắp có');
  const plan = builder({ config, pairIds, seed, divisionId });
  const withSignature = { ...plan, inputSignature: planInputSignature({ formatKey, config, pairIds }) };
  const fingerprint = crypto.createHash('sha256').update(stableStringify(withSignature)).digest('hex');
  return { ...withSignature, fingerprint };
}

module.exports = { buildSetupPlan, BUILDERS };
