'use strict';
// Registry thể thức của luồng tạo giải nội bộ (ADR-005 D5).
// Nơi DUY NHẤT bật/tắt thể thức. UI, route save/preview/finalize đều hỏi ở đây;
// RPC finalize v4 giữ danh sách tương ứng phía SQL. Thuần, không I/O.

// Tổ hợp hợp lệ của vòng bảng → loại trực tiếp (spec Lát A §2).
// target = số cặp vào vòng loại; pool = số suất bù lấy từ hạng (qualifiersPerGroup + 1).
const GROUP_KNOCKOUT_COMBOS = Object.freeze({
  '2x2': { groupCount: 2, qualifiersPerGroup: 2, target: 4, pool: 0, minPairs: 6 },
  '3x1': { groupCount: 3, qualifiersPerGroup: 1, target: 4, pool: 1, minPairs: 6 },
  '4x1': { groupCount: 4, qualifiersPerGroup: 1, target: 4, pool: 0, minPairs: 8 },
  '3x2': { groupCount: 3, qualifiersPerGroup: 2, target: 8, pool: 2, minPairs: 9 },
  '4x2': { groupCount: 4, qualifiersPerGroup: 2, target: 8, pool: 0, minPairs: 12 },
});

function groupKnockoutCombo(config = {}) {
  const groupCount = Number(config.groupCount ?? 2);
  const qualifiersPerGroup = Number(config.qualifiersPerGroup ?? config.advancePerGroup ?? 2);
  return GROUP_KNOCKOUT_COMBOS[`${groupCount}x${qualifiersPerGroup}`] || null;
}

function issue(code, params) {
  return { code, step: 3, field: 'format', severity: 'blocker', ...(params ? { params } : {}) };
}

function validateFinalBestOf(config) {
  if (config.finalBestOf == null) return [];
  return [1, 3, 5].includes(Number(config.finalBestOf)) ? [] : [issue('FORMAT_CONFIG_INVALID', { field: 'finalBestOf' })];
}

const FORMATS = Object.freeze({
  group_knockout: {
    key: 'group_knockout',
    enabled: false,
    label: 'Vòng bảng → Loại trực tiếp',
    recommended: [6, 12],
    defaultConfig: { groupCount: 2, qualifiersPerGroup: 2, thirdPlaceEnabled: false, finalBestOf: 1 },
    minPairs(config) {
      const combo = groupKnockoutCombo(config);
      return combo ? combo.minPairs : GROUP_KNOCKOUT_COMBOS['2x2'].minPairs;
    },
    validateConfig(config = {}) {
      const issues = [];
      if (!groupKnockoutCombo(config)) issues.push(issue('FORMAT_CONFIG_INVALID', { field: 'groups' }));
      if (config.thirdPlaceEnabled != null && typeof config.thirdPlaceEnabled !== 'boolean') {
        issues.push(issue('FORMAT_CONFIG_INVALID', { field: 'thirdPlaceEnabled' }));
      }
      return issues.concat(validateFinalBestOf(config));
    },
  },
  round_robin: {
    key: 'round_robin',
    enabled: false,
    label: 'Vòng tròn tính điểm',
    recommended: [3, 6],
    defaultConfig: {},
    minPairs() { return 3; },
    validateConfig() { return []; },
  },
  knockout: {
    key: 'knockout',
    enabled: false,
    label: 'Loại trực tiếp',
    recommended: [8, 32],
    defaultConfig: { thirdPlaceEnabled: false, finalBestOf: 1 },
    minPairs() { return 4; },
    validateConfig(config = {}) {
      const issues = [];
      if (config.thirdPlaceEnabled != null && typeof config.thirdPlaceEnabled !== 'boolean') {
        issues.push(issue('FORMAT_CONFIG_INVALID', { field: 'thirdPlaceEnabled' }));
      }
      return issues.concat(validateFinalBestOf(config));
    },
  },
});

const FORMAT_ORDER = Object.freeze(['group_knockout', 'round_robin', 'knockout']);

function getFormat(key) {
  return Object.prototype.hasOwnProperty.call(FORMATS, key) ? FORMATS[key] : null;
}

function isFormatEnabled(key) {
  const format = getFormat(key);
  return Boolean(format && format.enabled);
}

function listFormats() {
  return FORMAT_ORDER.map((key) => FORMATS[key]);
}

module.exports = { FORMATS, FORMAT_ORDER, GROUP_KNOCKOUT_COMBOS, groupKnockoutCombo, getFormat, isFormatEnabled, listFormats };
