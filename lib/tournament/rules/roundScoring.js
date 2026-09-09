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

module.exports = { roundKeyOf, describeRound, resolveRoundScoring, resolveMatchScoring };
