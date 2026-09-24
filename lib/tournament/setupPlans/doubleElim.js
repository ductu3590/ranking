'use strict';
// Loại kép (double elimination) cho giải nội bộ đánh đôi (spec Epic 1, Lát D1 §4).
// Thua hai trận mới bị loại: nhánh thắng (W), nhánh thua (L), chung kết tổng (GF), không đá lại
// GF (ADR-007 D14). 4–32 cặp, có bye (D15).
//
// Engine engines/doubleElim.js sinh khung đủ cho nhánh B = lũy thừa 2, nhưng không biết bye ở nhánh
// thua: trận L có nguồn là trận W vòng 1 không tồn tại vẫn được sinh, thành trận một bên. Builder
// chuẩn hóa khung engine theo bốn bước, thuần và deterministic:
//   1. nguồn từng ô (quy ước a/b), 2. đảo thứ tự khi thả xuống nhánh thua (D23),
//   3. thu gọn trận L thiếu nguồn do bye, 4. khóa / lượt / thứ tự / tên (D21).

const doubleElimEngine = require('../engines/doubleElim');
const { nextPowerOfTwo } = require('../seeding');
const { getFormat } = require('../setupFormats');
const { planError, seededShuffle, STAGE_SCORING } = require('./common');

const STAGE_KEY = 'double-elim';
const BRACKET_RANK = Object.freeze({ W: 0, L: 1, GF: 2 });

// Ô đích của người thua W(r, q) trong vòng nhận có M trận (spec §4.2). Tìm bằng vét cạn trên
// B = 8/16/32: người thua nhánh thắng không thể gặp ngay cặp mình vừa loại ở vòng trước (trừ LF).
function dropTarget(q, M) {
  if (M === 8) return 7 - q;
  if (M === 2 || M === 4) return q ^ 1;
  return q;
}

// Bước 1–2: đọc khung engine thành danh sách trận với nguồn từng ô.
// Nguồn: { entryId } | { from: slot, outcome } | null (rỗng — trận W vòng 1 không tồn tại do bye).
function readEngineShape(engineMatches, B) {
  const K = Math.log2(B);
  const nodes = engineMatches.map((match) => ({
    slot: match.slot,
    bracket: match.bracket,
    engineRound: match.round,
    bracketSlot: match.bracket_slot,
    a: match.entrant_a_id ? { entryId: String(match.entrant_a_id) } : null,
    b: match.entrant_b_id ? { entryId: String(match.entrant_b_id) } : null,
  }));
  const bySlot = new Map(nodes.map((node) => [node.slot, node]));
  const w = (round, index) => engineMatches.find((m) => m.bracket === 'W' && m.round === round && m.bracket_slot === index) || null;
  const lRounds = [...new Set(engineMatches.filter((m) => m.bracket === 'L').map((m) => m.round))].sort((x, y) => x - y);
  const lRound = (round) => engineMatches.filter((m) => m.bracket === 'L' && m.round === round).sort((x, y) => x.bracket_slot - y.bracket_slot);
  const src = (match, outcome) => (match ? { from: match.slot, outcome } : null);

  // Nhánh thắng: ô chẵn của vòng trước vào a, ô lẻ vào b (đúng cách engine ghép cặp).
  for (const match of engineMatches.filter((m) => m.bracket === 'W' && m.round >= 2)) {
    const node = bySlot.get(match.slot);
    if (!node.a) node.a = src(w(match.round - 1, 2 * match.bracket_slot), 'winner');
    if (!node.b) node.b = src(w(match.round - 1, 2 * match.bracket_slot + 1), 'winner');
  }

  // Nhánh thua theo đúng trình tự vòng engine: ghép (vòng 1) → [nhận, gộp]* → nhận cuối (LF).
  if (K >= 2) {
    lRound(lRounds[0]).forEach((match, j) => {
      const node = bySlot.get(match.slot);
      node.a = src(w(1, 2 * j), 'loser');
      node.b = src(w(1, 2 * j + 1), 'loser');
    });
    let index = 1;
    let previous = lRound(lRounds[0]);
    for (let r = 2; r <= K; r += 1) {
      const receive = lRound(lRounds[index]);
      index += 1;
      const M = receive.length;
      receive.forEach((match, t) => {
        bySlot.get(match.slot).a = src(previous[t], 'winner');
      });
      for (let q = 0; q < M; q += 1) bySlot.get(receive[dropTarget(q, M)].slot).b = src(w(r, q), 'loser');
      previous = receive;
      if (r < K) {
        const merge = lRound(lRounds[index]);
        index += 1;
        merge.forEach((match, j) => {
          const node = bySlot.get(match.slot);
          node.a = src(previous[2 * j], 'winner');
          node.b = src(previous[2 * j + 1], 'winner');
        });
        previous = merge;
      }
    }
  }

  const wFinal = w(K, 0);
  const lFinal = K >= 2 ? lRound(lRounds[lRounds.length - 1])[0] : null;
  const gf = nodes.find((node) => node.bracket === 'GF');
  gf.a = src(wFinal, 'winner');
  gf.b = src(lFinal, 'winner');
  return { nodes, K };
}

// Bước 3: bỏ trận L thiếu nguồn; nguồn duy nhất nối thẳng vào ô mà người thắng trận bị bỏ lẽ ra
// đi tới; không còn nguồn nào thì ô đích thành rỗng (spec §4.3).
function collapseByes(nodes) {
  const removed = new Map(); // slot → nguồn thay thế (hoặc null)
  const resolve = (source) => (source && source.from != null && removed.has(source.from) && source.outcome === 'winner'
    ? removed.get(source.from)
    : source);
  const ordered = nodes.slice().sort((x, y) => (BRACKET_RANK[x.bracket] - BRACKET_RANK[y.bracket]) || (x.engineRound - y.engineRound) || (x.bracketSlot - y.bracketSlot));
  for (const node of ordered) {
    node.a = resolve(node.a);
    node.b = resolve(node.b);
    if (node.bracket !== 'L') continue;
    if (node.a && node.b) continue;
    removed.set(node.slot, node.a || node.b || null);
  }
  const kept = nodes.filter((node) => !removed.has(node.slot));
  for (const node of kept) {
    if (!node.a || !node.b) planError('DOUBLE_ELIM_STRUCTURE_INVALID', 'Không dựng được nhánh loại kép', { slot: node.slot });
  }
  return kept;
}

function buildDoubleElimPlan({ config = {}, pairIds = [], seed, divisionId }) {
  if (!seed) planError('DRAW_SEED_REQUIRED', 'Chưa bốc thăm');
  const ids = pairIds.map(String);
  if (new Set(ids).size !== ids.length) planError('DUPLICATE_ENTRY_ID', 'Một cặp xuất hiện hai lần');
  const format = getFormat('double_elimination');
  const min = format.minPairs();
  const max = format.maxPairs();
  if (ids.length < min) planError('PAIR_COUNT_BELOW_MINIMUM', 'Không đủ số cặp cho loại kép', { min, count: ids.length });
  if (ids.length > max) planError('PAIR_COUNT_ABOVE_MAXIMUM', 'Quá số cặp cho loại kép', { max, count: ids.length });

  const finalBestOf = [1, 3, 5].includes(Number(config.finalBestOf)) ? Number(config.finalBestOf) : 1;
  const order = seededShuffle(ids.sort(), `double_elimination:${seed}`);
  const B = nextPowerOfTwo(order.length);
  const engineMatches = doubleElimEngine.generateSchedule(
    { schedule_format: 'double_elim', config: { grandFinalReset: false } },
    order.map((id, index) => ({ id, seed: index + 1 })),
  );
  const { nodes, K } = readEngineShape(engineMatches, B);
  const kept = collapseByes(nodes);
  const bySlot = new Map(kept.map((node) => [node.slot, node]));

  // Vòng hiển thị trong nhánh: W giữ vòng engine; L đánh số lại, bỏ vòng bị thu gọn trọn.
  const lEngineRounds = [...new Set(kept.filter((node) => node.bracket === 'L').map((node) => node.engineRound))].sort((x, y) => x - y);
  const losersRounds = lEngineRounds.length;
  for (const node of kept) {
    node.bracketRound = node.bracket === 'L' ? lEngineRounds.indexOf(node.engineRound) + 1 : node.bracket === 'W' ? node.engineRound : 1;
  }
  const lFinalNode = kept.find((node) => node.bracket === 'L' && node.bracketRound === losersRounds) || null;
  for (const node of kept) {
    if (node.bracket === 'GF') node.key = 'GF';
    else if (node.bracket === 'W') node.key = node.bracketRound === K ? 'WF' : `W${node.bracketRound}-${node.bracketSlot + 1}`;
    else node.key = node === lFinalNode ? 'LF' : `L${node.bracketRound}-${node.bracketSlot + 1}`;
  }

  // Lượt: 1 + lượt lớn nhất của các trận nguồn (cặp có sẵn tính 0). Mọi tuyến đi tới lượt sau.
  const roundOf = new Map();
  const depth = (node) => {
    if (roundOf.has(node.slot)) return roundOf.get(node.slot);
    const sources = [node.a, node.b].filter((source) => source.from != null).map((source) => depth(bySlot.get(source.from)));
    const value = 1 + Math.max(0, ...sources);
    roundOf.set(node.slot, value);
    return value;
  };
  kept.forEach(depth);
  const ordered = kept.slice().sort((x, y) => (roundOf.get(x.slot) - roundOf.get(y.slot))
    || (BRACKET_RANK[x.bracket] - BRACKET_RANK[y.bracket]) || (x.bracketRound - y.bracketRound) || (x.bracketSlot - y.bracketSlot));
  const orderOf = new Map(ordered.map((node, index) => [node.slot, index + 1]));

  const roundLabel = (node) => {
    if (node.bracket === 'GF') return 'Chung kết tổng';
    if (node.bracket === 'W') {
      if (node.bracketRound === K) return 'Chung kết nhánh thắng';
      if (node.bracketRound === K - 1) return 'Bán kết nhánh thắng';
      return `Nhánh thắng · Vòng ${node.bracketRound}`;
    }
    return node.key === 'LF' ? 'Chung kết nhánh thua' : `Nhánh thua · Vòng ${node.bracketRound}`;
  };
  const NAMED = new Set(['WF', 'LF', 'GF']);
  const title = (node) => (NAMED.has(node.key) ? roundLabel(node) : `Trận ${orderOf.get(node.slot)}`);
  const sourceLabel = (source) => {
    const node = bySlot.get(source.from);
    const name = title(node);
    return `${source.outcome === 'winner' ? 'Thắng' : 'Thua'} ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  };
  const slot = (source) => (source.entryId
    ? { kind: 'entry', entryId: source.entryId }
    : { kind: 'progression', label: sourceLabel(source) });

  const matches = ordered.map((node) => ({
    matchKey: node.key,
    title: title(node),
    roundLabel: roundLabel(node),
    stagePlanKey: STAGE_KEY,
    stageKind: 'knockout',
    bracket: node.bracket,
    bracketRound: node.bracketRound,
    round: roundOf.get(node.slot),
    bracketSlot: node.bracketSlot,
    entryAId: node.a.entryId || null,
    entryBId: node.b.entryId || null,
    slotA: slot(node.a),
    slotB: slot(node.b),
    order: orderOf.get(node.slot),
  }));

  const progressions = [];
  for (const node of ordered) {
    for (const side of ['a', 'b']) {
      const source = node[side];
      if (source.from == null) continue;
      progressions.push({
        sourceStagePlanKey: STAGE_KEY,
        targetMatchKey: node.key,
        targetSlot: side,
        source: { kind: 'match_outcome', matchKey: bySlot.get(source.from).key, outcome: source.outcome },
      });
    }
  }

  const byeEntryIds = order.slice(0, B - order.length);
  const count = (bracket) => matches.filter((match) => match.bracket === bracket).length;
  return {
    planVersion: 4,
    formatKey: 'double_elimination',
    divisionId: divisionId ? String(divisionId) : null,
    seed: String(seed),
    layout: `double-elim-${B}`,
    stages: [{
      planKey: STAGE_KEY, name: 'Loại kép', scheduleFormat: 'double_elim', order: 1,
      config: {
        setupPlanVersion: 4,
        grandFinalReset: false,
        scoring: { ...STAGE_SCORING },
        ...(finalBestOf > 1 ? { match_scoring: { GF: { best_of: finalBestOf } } } : {}),
      },
    }],
    // Một "nhóm" không nhãn: thứ tự bốc thăm, RPC ghi thành stage entrants của stage loại kép.
    groups: [{ label: null, stagePlanKey: STAGE_KEY, entryIds: order }],
    matches,
    progressions,
    byeEntryIds,
    counts: {
      groupMatches: 0, knockoutMatches: matches.length, total: matches.length,
      winners: count('W'), losers: count('L'), grandFinal: count('GF'),
    },
    rounds: Math.max(...matches.map((match) => match.round)),
    winnersRounds: K,
    losersRounds,
    finalBestOf,
    warnings: byeEntryIds.length ? ['DOUBLE_ELIM_BYE'] : [],
  };
}

module.exports = { buildDoubleElimPlan, dropTarget };
