'use strict';
// Tầng luật thứ tư: VÒNG. Đè lên luật giai đoạn do resolveStageScoring trả về.
// Thuần, không I/O. Không sửa scoring.js — file này chỉ mở rộng.

const { resolveStageScoring, SCORING_PRESETS } = require('./scoring');

const BRACKET_LABELS = Object.freeze({ W: 'Nhánh thắng', L: 'Nhánh thua' });

// Nơi DUY NHẤT biết cách đặt tên vòng. Engine đổi shape thì chỉ sửa ở đây.
function roundKeyOf(match = {}) {
  const bracket = match.bracket ? String(match.bracket) : '';
  const round = Number(match.round);
  const roundPart = Number.isFinite(round) && round > 0 ? String(round) : '1';
  if (!bracket) return roundPart;
  if (bracket === 'GF') return 'GF';        // grand final chỉ có một, bỏ số vòng
  return `${bracket}:${roundPart}`;
}

function describeRound(stage = {}, roundKey, totalRounds) {
  const key = String(roundKey);
  if (key === 'GF') return 'Chung kết tổng';
  const bracketMatch = key.match(/^([WL]):(\d+)$/);
  if (bracketMatch) {
    return `${BRACKET_LABELS[bracketMatch[1]]} · vòng ${bracketMatch[2]}`;
  }

  const round = Number(key);
  if (stage.schedule_format !== 'knockout') return `Vòng ${round}`;

  const total = Number(totalRounds);
  if (!Number.isFinite(total) || total <= 0) return `Vòng ${round}`;
  const fromEnd = total - round;
  if (fromEnd === 0) return 'Chung kết';
  if (fromEnd === 1) return 'Bán kết';
  if (fromEnd === 2) return 'Tứ kết';
  return `Vòng ${round}`;
}

const OVERRIDABLE_FIELDS = Object.freeze(['best_of', 'points_to', 'win_by', 'cap', 'deciding_game']);

function readRoundOverride(stage = {}, roundKey) {
  const table = (stage.config || {}).round_scoring;
  if (!table || typeof table !== 'object') return null;
  const raw = table[String(roundKey)];
  if (!raw || typeof raw !== 'object') return null;
  const picked = {};
  for (const field of OVERRIDABLE_FIELDS) {
    if (field in raw) picked[field] = raw[field];
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

function resolveRoundScoring(tournament, division, stage, roundKey) {
  const stageScoring = resolveStageScoring(tournament, division, stage);
  const override = readRoundOverride(stage, roundKey);
  if (!override) {
    return { ...stageScoring, round_key: String(roundKey), round_source: 'stage' };
  }
  const merged = { ...stageScoring, ...override };
  return {
    ...merged,
    round_key: String(roundKey),
    round_source: 'round',
    // engine.bestOf phải đi theo best_of sau merge, nếu không chỗ chốt trận
    // vẫn dùng số ván của giai đoạn.
    engine: {
      ...stageScoring.engine,
      bestOf: Number(merged.best_of),
    },
  };
}

function resolveMatchScoring(tournament, division, stage, match) {
  return resolveRoundScoring(tournament, division, stage, roundKeyOf(match));
}

const ALLOWED_BEST_OF = Object.freeze([1, 3, 5]);

function totalRoundsOf(matches, bracket) {
  let max = 0;
  for (const match of matches || []) {
    const b = match.bracket ? String(match.bracket) : '';
    if (bracket !== undefined && b !== bracket) continue;
    const round = Number(match.round) || 1;
    if (round > max) max = round;
  }
  return max;
}

// Một vòng khoá khi có ít nhất một trận đang đấu hoặc đã chốt.
// Trạng thái DB là pending | live | finalized (tournament_matches_status_phase3_ck).
function computeRoundLocks(stage, matches) {
  const table = {};
  for (const match of matches || []) {
    const key = roundKeyOf(match);
    if (!table[key]) {
      table[key] = { locked: false, reason: null, counts: { pending: 0, live: 0, finalized: 0, total: 0 } };
    }
    const entry = table[key];
    entry.counts.total += 1;
    if (match.status === 'live') entry.counts.live += 1;
    else if (match.status === 'finalized') entry.counts.finalized += 1;
    else entry.counts.pending += 1;
  }
  for (const key of Object.keys(table)) {
    const entry = table[key];
    if (entry.counts.live > 0) { entry.locked = true; entry.reason = 'ROUND_LIVE'; }
    else if (entry.counts.finalized > 0) { entry.locked = true; entry.reason = 'ROUND_FINALIZED'; }
  }
  return table;
}

function sanitizeRoundPatch(patch) {
  const clean = {};
  for (const field of OVERRIDABLE_FIELDS) {
    if (patch && field in patch) clean[field] = patch[field];
  }
  return clean;
}

function isPositiveInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function fail(code, message) {
  return { ok: false, code, message };
}

// inherited = luật của giai đoạn, dùng để kiểm cap so với points_to SAU merge.
function validateRoundScoringPatch(patch, stage = {}, inherited = {}) {
  if (patch == null) return { ok: true, code: null, message: null };
  if (typeof patch !== 'object') return fail('INVALID_ROUND_SCORING', 'Dữ liệu luật vòng không hợp lệ.');

  for (const forbidden of ['win_points', 'loss_points', 'draw_points']) {
    if (forbidden in patch) {
      return fail(
        'FORBIDDEN_ROUND_FIELD',
        'Không đổi được điểm xếp hạng theo từng vòng. Nếu vòng 1 thắng ăn 2 điểm mà vòng 3 thắng ăn 3 điểm thì bảng xếp hạng không còn so sánh được giữa các đội đã đá lệch số vòng.'
      );
    }
  }

  if ('best_of' in patch) {
    if (stage.match_format && stage.match_format !== 'simple') {
      return fail(
        'BEST_OF_NOT_ALLOWED_FOR_FORMAT',
        'Giai đoạn này là trận đội, số ván con của một trận là cố định — không đổi theo vòng được. Điểm tới, cách biệt và cap thì vẫn đổi được.'
      );
    }
    if (!ALLOWED_BEST_OF.includes(patch.best_of)) {
      return fail('INVALID_BEST_OF', 'Số ván chỉ nhận 1, 3 hoặc 5.');
    }
  }

  if ('points_to' in patch && !isPositiveInt(patch.points_to, 1, 99)) {
    return fail('INVALID_POINTS_TO', 'Điểm tới phải là số nguyên từ 1 đến 99.');
  }
  if ('win_by' in patch && !isPositiveInt(patch.win_by, 0, 5)) {
    return fail('INVALID_WIN_BY', 'Cách biệt phải là số nguyên từ 0 đến 5.');
  }

  if ('cap' in patch && patch.cap !== null) {
    const pointsTo = 'points_to' in patch ? patch.points_to : Number(inherited.points_to);
    if (!isPositiveInt(patch.cap, 1, 199) || patch.cap < pointsTo) {
      return fail('INVALID_CAP', `Cap phải là số nguyên và không nhỏ hơn điểm tới (${pointsTo}).`);
    }
  }

  if ('deciding_game' in patch && patch.deciding_game !== null) {
    const d = patch.deciding_game;
    if (typeof d !== 'object'
      || !isPositiveInt(d.points_to, 1, 99)
      || !isPositiveInt(d.win_by, 0, 5)
      || (d.cap != null && (!isPositiveInt(d.cap, 1, 199) || d.cap < d.points_to))) {
      return fail('INVALID_DECIDING_GAME', 'Ván quyết định phải có điểm tới, cách biệt và cap hợp lệ.');
    }
  }

  return { ok: true, code: null, message: null };
}

module.exports = {
  roundKeyOf,
  describeRound,
  resolveRoundScoring,
  resolveMatchScoring,
  totalRoundsOf,
  computeRoundLocks,
  sanitizeRoundPatch,
  validateRoundScoringPatch,
  ALLOWED_BEST_OF,
};

