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

module.exports = { roundKeyOf, describeRound };
