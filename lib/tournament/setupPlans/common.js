'use strict';
// Tiện ích dùng chung của setupPlans (spec Lát A §4). Thuần, deterministic.
const { SCORING_PRESETS } = require('../rules/scoring');

function planError(code, message, params) {
  const error = new Error(message || code);
  error.code = code;
  if (params) error.params = params;
  throw error;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// PRNG theo seed chuỗi (FNV-1a → mulberry32). Cùng seed → cùng dãy ở mọi môi trường.
function seededRandom(seed) {
  let state = 2166136261;
  for (const character of String(seed)) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seed) {
  const random = seededRandom(seed);
  const out = items.slice();
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

const GROUP_LABELS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

// Chữ ký đầu vào của plan: đổi cặp/thể thức/cấu hình → khác chữ ký → draw hết hạn.
// Chuỗi thuần (không băm) để client tính được mà không cần crypto.
function planInputSignature({ formatKey, config, pairIds }) {
  return stableStringify({ formatKey, config: config || {}, pairIds: (pairIds || []).map(String).sort() });
}

// Luật điểm chốt vào MỌI stage v4 lúc finalize (ADR-005 D8: mọi trận BO1, chỉ chung kết chọn BO
// qua match_scoring.F). Bắt buộc ghi snapshot: tournaments.default_scoring mặc định là {} —
// resolveStageScoring coi {} là có giá trị và rơi về best_of 3. Snapshot cũng là tín hiệu
// "đã bốc thăm, khóa luật" mà màn luật và RPC walkover (096) đang đọc.
const STAGE_SCORING = Object.freeze({ ...SCORING_PRESETS.phong_trao_11 });

module.exports = { planError, stableStringify, seededRandom, seededShuffle, GROUP_LABELS, planInputSignature, STAGE_SCORING };
