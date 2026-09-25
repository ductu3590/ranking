'use strict';
// Nhãn trận tiếng Việt dùng chung cho bàn điều hành, danh sách trận, sơ đồ và trang công khai
// (spec Epic 2, Lát E1 §3). Thuần, chạy cả client. Nhãn suy từ match_key (quy ước ổn định của các
// builder setupPlans/*), không suy từ cột round và không bao giờ trả "Trận #id" hay "Đội A/Đội B".

const { parseDoubleElimKey, annotateDoubleElim, doubleElimRoundLabel } = require('./doubleElimKeys');

const GROUP_KEY_RE = /^GROUP-([^-]+)-(\d+)$/;
const KO_ROUND_KEY_RE = /^R(\d+)-(\d+)$/;
const KO_NAMED_KEY_RE = /^(QF|SF)(\d+)$/;
const RANK_WORDS = Object.freeze({ 1: 'Nhất', 2: 'Nhì', 3: 'Ba' });

function keyOf(match) {
  return String((match && (match.match_key ?? match.matchKey)) || '');
}

function numberOr(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fallbackTitle(match) {
  const round = numberOr(match.round, null);
  const order = numberOr(match.match_order ?? match.matchOrder, null);
  const orderPart = order === null ? '' : ` · trận ${order + 1}`;
  if (round === null) return order === null ? 'Trận chưa xếp lượt' : `Trận ${order + 1}`;
  return `Lượt ${round}${orderPart}`;
}

function distinctGroupLabels(stageMatches) {
  const labels = new Set();
  for (const item of stageMatches || []) {
    const parsed = GROUP_KEY_RE.exec(keyOf(item));
    const label = parsed ? parsed[1] : (item.group_label ?? item.groupLabel ?? null);
    if (parsed && label) labels.add(String(label));
  }
  return labels;
}

function finalRound(stageMatches) {
  const final = (stageMatches || []).find((item) => keyOf(item) === 'F');
  return final ? numberOr(final.round, null) : null;
}

function koRoundTitle(round, stageMatches) {
  const lastRound = finalRound(stageMatches);
  if (lastRound === null || !(round < lastRound)) return `Vòng ${round}`;
  const fromEnd = lastRound - round;
  if (fromEnd === 1) return 'Bán kết';
  if (fromEnd === 2) return 'Tứ kết';
  return `Vòng 1/${2 ** fromEnd}`;
}

function doubleElimInfo(match, stageMatches) {
  const pool = (stageMatches || []).filter((item) => parseDoubleElimKey(keyOf(item)));
  const withSelf = pool.some((item) => item === match || (item.id != null && item.id === match.id)) ? pool : pool.concat([match]);
  const annotated = annotateDoubleElim(withSelf);
  const self = annotated.find((item) => item.match === match || (match.id != null && item.match.id === match.id));
  if (!self || !self.bracket) return null;
  const sameRound = annotated
    .filter((item) => item.bracket === self.bracket && item.bracketRound === self.bracketRound)
    .sort((left, right) => numberOr(left.slot, 0) - numberOr(right.slot, 0));
  const ordinal = sameRound.findIndex((item) => item === self) + 1;
  return {
    bracket: self.bracket,
    bracketRound: self.bracketRound,
    groupTitle: doubleElimRoundLabel(self.bracket, self.bracketRound, self.lastRound),
    ordinal,
    count: sameRound.length,
  };
}

// → { title, short, code }. `short` là tên nhóm (không kèm "· trận n"); `code` là match_key (hiện phụ).
function matchLabel({ match, stageMatches = [] } = {}) {
  if (!match) return { title: 'Trận chưa xác định', short: 'Trận chưa xác định', code: '' };
  const key = keyOf(match);
  const code = key;

  const group = GROUP_KEY_RE.exec(key);
  if (group) {
    const round = numberOr(match.round, null);
    const roundPart = round === null ? '' : `Lượt ${round}`;
    if (distinctGroupLabels(stageMatches.length ? stageMatches : [match]).size >= 2) {
      const title = [`Bảng ${group[1]}`, roundPart].filter(Boolean).join(' · ');
      return { title, short: title, code };
    }
    const title = roundPart || fallbackTitle(match);
    return { title, short: title, code };
  }

  if (key === 'F') return { title: 'Chung kết', short: 'Chung kết', code };
  if (key === 'BRONZE') return { title: 'Tranh hạng ba', short: 'Tranh hạng ba', code };
  if (key === 'GF') return { title: 'Chung kết tổng', short: 'Chung kết tổng', code };

  const named = KO_NAMED_KEY_RE.exec(key);
  if (named) {
    const short = named[1] === 'QF' ? 'Tứ kết' : 'Bán kết';
    return { title: `${short} ${Number(named[2])}`, short, code };
  }

  const koRound = KO_ROUND_KEY_RE.exec(key);
  if (koRound) {
    const short = koRoundTitle(Number(koRound[1]), stageMatches);
    return { title: `${short} · trận ${Number(koRound[2])}`, short, code };
  }

  if (parseDoubleElimKey(key)) {
    const info = doubleElimInfo(match, stageMatches);
    if (info) {
      const title = info.count > 1 ? `${info.groupTitle} · trận ${info.ordinal}` : info.groupTitle;
      return { title, short: info.groupTitle, code };
    }
  }

  const title = fallbackTitle(match);
  return { title, short: title, code };
}

// Khóa nhóm hiển thị, theo match_key (không theo chuỗi title): Tranh hạng ba không bao giờ chung nhóm Chung kết.
function matchGroupKey(match, stageMatches = []) {
  const key = keyOf(match);
  const round = numberOr(match && match.round, 0);
  if (key === 'BRONZE') return { key: 'third_place', title: 'Tranh hạng ba', order: round + 0.6 };
  if (key === 'F') return { key: 'final', title: 'Chung kết', order: round + 0.9 };
  if (key === 'GF') return { key: 'grand_final', title: 'Chung kết tổng', order: round + 0.9 };
  const named = KO_NAMED_KEY_RE.exec(key);
  if (named) return { key: `ko:${named[1]}`, title: named[1] === 'QF' ? 'Tứ kết' : 'Bán kết', order: round };
  const koRound = KO_ROUND_KEY_RE.exec(key);
  if (koRound) return { key: `ko:R${koRound[1]}`, title: koRoundTitle(Number(koRound[1]), stageMatches), order: round };
  if (parseDoubleElimKey(key)) {
    const info = doubleElimInfo(match, stageMatches);
    if (info) return { key: `${info.bracket}:${info.bracketRound}`, title: info.groupTitle, order: round };
  }
  return { key: `round:${round}`, title: round ? `Lượt ${round}` : 'Chưa xếp lượt', order: round };
}

// Nhãn ô chờ theo nguồn tiến cấp (bảng tournament_stage_transitions).
function slotSourceLabel(edge, titleByMatchId = {}) {
  if (!edge) return 'Chờ xác định';
  const kind = edge.source_kind ?? edge.sourceKind;
  if (kind === 'match_outcome') {
    const sourceId = edge.source_match_id ?? edge.sourceMatchId;
    const title = titleByMatchId[String(sourceId)] || 'trận trước';
    const outcome = edge.source_outcome ?? edge.sourceOutcome;
    return `${outcome === 'loser' ? 'Thua' : 'Thắng'} ${title}`;
  }
  if (kind === 'group_rank') {
    const rank = numberOr(edge.source_rank ?? edge.sourceRank, null);
    const label = edge.source_group_label ?? edge.sourceGroupLabel ?? '?';
    const word = RANK_WORDS[rank];
    return word ? `${word} bảng ${label}` : `Hạng ${rank ?? '?'} bảng ${label}`;
  }
  if (kind === 'group_rank_pool') {
    const rank = numberOr(edge.source_rank ?? edge.sourceRank, null);
    const position = numberOr(edge.source_pool_position ?? edge.sourcePoolPosition, null);
    return `Suất bù hạng ${rank ?? '?'} · thứ ${position ?? '?'}`;
  }
  return 'Chờ xác định';
}

module.exports = { matchLabel, matchGroupKey, slotSourceLabel };
