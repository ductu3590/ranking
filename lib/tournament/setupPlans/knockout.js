'use strict';
// Loại trực tiếp cho giải nội bộ đánh đôi (spec Lát C). Một stage, thua một trận là bị loại.
//
// Bốc thăm: xáo pairId (đã sort) bằng PRNG chuỗi của setupPlans; thứ tự sau khi xáo là "hạt
// giống" đưa vào engine knockout (rating không tham gia). Engine đặt cặp được bye thẳng vào
// vòng 2, không tạo trận một bên; bye rơi vào các vị trí bốc đầu tiên (ADR-005 D12).
// Engine không sinh trận tranh hạng ba, nên adapter thêm BRONZE nhận hai cặp thua bán kết.

const knockoutEngine = require('../engines/knockout');
const { getFormat } = require('../setupFormats');
const { planError, seededShuffle, STAGE_SCORING } = require('./common');

const STAGE_KEY = 'knockout';

// Trận cuối F; hai trận trước SF1/SF2; bốn trận trước nữa QF1–QF4; sớm hơn R<vòng>-<ô+1>.
function matchKeyFor(round, bracketSlot, rounds) {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return 'F';
  if (fromEnd === 1) return `SF${bracketSlot + 1}`;
  if (fromEnd === 2) return `QF${bracketSlot + 1}`;
  return `R${round}-${bracketSlot + 1}`;
}

// Tên vòng hiển thị: Chung kết / Bán kết / Tứ kết / Vòng 1/8, 1/16...
function roundLabel(round, rounds) {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return 'Chung kết';
  if (fromEnd === 1) return 'Bán kết';
  if (fromEnd === 2) return 'Tứ kết';
  return `Vòng 1/${2 ** fromEnd}`;
}

// Tên trận hiển thị. matchKey giữ theo ô (spec), nhưng khi có bye thì ô trống làm số nhảy
// ("Tứ kết 2, 3"), nên tên đánh số liền trong vòng; vòng sớm dùng số trận toàn giải.
function matchTitles(ordered, rounds) {
  const titles = new Map();
  ordered.forEach((match, index) => {
    const fromEnd = rounds - match.round;
    if (fromEnd === 0) titles.set(match.key, 'Chung kết');
    else if (fromEnd <= 2) {
      const inRound = ordered.filter((other) => other.round === match.round);
      titles.set(match.key, `${roundLabel(match.round, rounds)} ${inRound.indexOf(match) + 1}`);
    } else titles.set(match.key, `Trận ${index + 1}`);
  });
  return titles;
}

function outcomeLabel(source, titles) {
  const word = source.outcome === 'winner' ? 'Thắng' : 'Thua';
  const title = titles.get(source.matchKey);
  return `${word} ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

function buildKnockoutPlan({ config = {}, pairIds = [], seed, divisionId }) {
  if (!seed) planError('DRAW_SEED_REQUIRED', 'Chưa bốc thăm');
  const ids = pairIds.map(String);
  if (new Set(ids).size !== ids.length) planError('DUPLICATE_ENTRY_ID', 'Một cặp xuất hiện hai lần');
  const min = getFormat('knockout').minPairs();
  if (ids.length < min) planError('PAIR_COUNT_BELOW_MINIMUM', 'Không đủ số cặp cho loại trực tiếp', { min, count: ids.length });

  const thirdPlaceEnabled = config.thirdPlaceEnabled === true;
  const finalBestOf = [1, 3, 5].includes(Number(config.finalBestOf)) ? Number(config.finalBestOf) : 1;
  const order = seededShuffle(ids.sort(), `knockout:${seed}`);
  const engineMatches = knockoutEngine.generateSchedule(
    { schedule_format: 'knockout', config: {} },
    order.map((id, index) => ({ id, seed: index + 1 })),
  );
  const rounds = Math.max(...engineMatches.map((match) => match.round));
  const keyBySlot = new Map(engineMatches.map((match) => [match.slot, matchKeyFor(match.round, match.bracket_slot, rounds)]));

  // Thứ tự hiển thị/thi đấu: theo vòng, trong vòng theo ô; BRONZE trước F.
  const ordered = engineMatches.slice().sort((a, b) => (a.round - b.round) || (a.bracket_slot - b.bracket_slot));
  const titles = matchTitles(ordered.map((match) => ({ key: keyBySlot.get(match.slot), round: match.round })), rounds);

  // Cạnh đi tiếp: ô chẵn của vòng trước vào phía a, ô lẻ vào phía b (đúng cách engine ghép).
  const progressions = [];
  for (const match of engineMatches) {
    if (match.parent_slot == null) continue;
    progressions.push({
      sourceStagePlanKey: STAGE_KEY,
      targetMatchKey: keyBySlot.get(match.parent_slot),
      targetSlot: match.bracket_slot % 2 === 0 ? 'a' : 'b',
      source: { kind: 'match_outcome', matchKey: keyBySlot.get(match.slot), outcome: 'winner' },
    });
  }
  if (thirdPlaceEnabled) {
    progressions.push(
      { sourceStagePlanKey: STAGE_KEY, targetMatchKey: 'BRONZE', targetSlot: 'a', source: { kind: 'match_outcome', matchKey: 'SF1', outcome: 'loser' } },
      { sourceStagePlanKey: STAGE_KEY, targetMatchKey: 'BRONZE', targetSlot: 'b', source: { kind: 'match_outcome', matchKey: 'SF2', outcome: 'loser' } },
    );
  }
  const incoming = (matchKey, side) => progressions.find((edge) => edge.targetMatchKey === matchKey && edge.targetSlot === side);
  const slot = (matchKey, side, entryId) => (entryId
    ? { kind: 'entry', entryId: String(entryId) }
    : { kind: 'progression', label: outcomeLabel(incoming(matchKey, side).source, titles) });

  const matches = ordered.map((match) => {
    const matchKey = keyBySlot.get(match.slot);
    return {
      matchKey,
      title: titles.get(matchKey),
      roundLabel: roundLabel(match.round, rounds),
      stagePlanKey: STAGE_KEY,
      stageKind: 'knockout',
      round: match.round,
      bracketSlot: match.bracket_slot,
      entryAId: match.entrant_a_id ? String(match.entrant_a_id) : null,
      entryBId: match.entrant_b_id ? String(match.entrant_b_id) : null,
      slotA: slot(matchKey, 'a', match.entrant_a_id),
      slotB: slot(matchKey, 'b', match.entrant_b_id),
    };
  });
  if (thirdPlaceEnabled) {
    // Cùng vòng với chung kết, đá trước chung kết.
    const finalIndex = matches.findIndex((match) => match.matchKey === 'F');
    matches.splice(finalIndex, 0, {
      matchKey: 'BRONZE', title: 'Tranh hạng ba', roundLabel: 'Chung kết', stagePlanKey: STAGE_KEY, stageKind: 'knockout', round: rounds, bracketSlot: 1,
      entryAId: null, entryBId: null,
      slotA: { kind: 'progression', label: 'Thua bán kết 1' },
      slotB: { kind: 'progression', label: 'Thua bán kết 2' },
    });
  }

  const byeEntryIds = order.slice(0, (2 ** rounds) - ids.length);
  return {
    planVersion: 4,
    formatKey: 'knockout',
    divisionId: divisionId ? String(divisionId) : null,
    seed: String(seed),
    layout: `bracket-${2 ** rounds}`,
    stages: [{
      planKey: STAGE_KEY, name: 'Loại trực tiếp', scheduleFormat: 'knockout', order: 1,
      config: {
        thirdPlaceEnabled,
        setupPlanVersion: 4,
        scoring: { ...STAGE_SCORING },
        ...(finalBestOf > 1 ? { match_scoring: { F: { best_of: finalBestOf } } } : {}),
      },
    }],
    // Một "nhóm" không nhãn: thứ tự bốc thăm, RPC ghi thành stage entrants của stage knockout.
    groups: [{ label: null, stagePlanKey: STAGE_KEY, entryIds: order }],
    matches: matches.map((match, index) => ({ ...match, order: index + 1 })),
    progressions,
    byeEntryIds,
    counts: { groupMatches: 0, knockoutMatches: matches.length, total: matches.length },
    rounds,
    finalBestOf,
    warnings: byeEntryIds.length ? ['KNOCKOUT_BYE'] : [],
  };
}

module.exports = { buildKnockoutPlan, matchKeyFor, roundLabel };
