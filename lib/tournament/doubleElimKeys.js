'use strict';
// Bộ đọc matchKey của loại kép (spec Epic 1, Lát D1 §4.4 / D2 §4). Thuần, chạy cả client.
// Khóa: W<vòng>-<ô>, WF, L<vòng>-<ô>, LF, GF. Console, trang công khai và xếp hạng đều suy nhánh
// từ khóa qua file này — không suy từ cột round (round là "lượt" thi đấu, không phải vòng nhánh).

const KEY_RE = /^(?:(W|L)(\d+)-(\d+)|(WF|LF|GF))$/;

function parseDoubleElimKey(matchKey) {
  const match = KEY_RE.exec(String(matchKey || ''));
  if (!match) return null;
  if (match[4]) {
    return { bracket: match[4] === 'GF' ? 'GF' : match[4][0], final: true, round: null, slot: null };
  }
  return { bracket: match[1], final: false, round: Number(match[2]), slot: Number(match[3]) };
}

function isDoubleElimKeySet(matches = []) {
  return matches.length > 0
    && matches.every((match) => parseDoubleElimKey(match.match_key ?? match.matchKey))
    && matches.some((match) => (match.match_key ?? match.matchKey) === 'GF');
}

// Gắn vòng hiển thị trong nhánh: WF/LF = vòng lớn nhất của nhánh + 1 (vòng cuối).
function annotateDoubleElim(matches = []) {
  const parsed = matches.map((match) => ({ match, key: parseDoubleElimKey(match.match_key ?? match.matchKey) }));
  const maxRound = (bracket) => parsed.reduce((max, item) => (item.key && item.key.bracket === bracket && !item.key.final ? Math.max(max, item.key.round) : max), 0);
  const last = { W: maxRound('W') + 1, L: maxRound('L') + 1, GF: 1 };
  return parsed.map(({ match, key }) => ({
    match,
    bracket: key ? key.bracket : null,
    bracketRound: key ? (key.final ? last[key.bracket] : key.round) : null,
    slot: key ? key.slot : null,
    lastRound: key ? last[key.bracket] : null,
  }));
}

function doubleElimRoundLabel(bracket, bracketRound, lastRound) {
  if (bracket === 'GF') return 'Chung kết tổng';
  if (bracket === 'W') {
    if (bracketRound === lastRound) return 'Chung kết nhánh thắng';
    if (bracketRound === lastRound - 1) return 'Bán kết nhánh thắng';
    return `Nhánh thắng · Vòng ${bracketRound}`;
  }
  if (bracketRound === lastRound) return 'Chung kết nhánh thua';
  return `Nhánh thua · Vòng ${bracketRound}`;
}

const BRACKET_TITLES = Object.freeze({ W: 'Nhánh thắng', L: 'Nhánh thua', GF: 'Chung kết tổng' });

module.exports = { parseDoubleElimKey, isDoubleElimKeySet, annotateDoubleElim, doubleElimRoundLabel, BRACKET_TITLES };
