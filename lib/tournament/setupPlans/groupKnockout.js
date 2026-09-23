'use strict';
// Vòng bảng → loại trực tiếp cho giải nội bộ đánh đôi (spec Lát A §2–§6).
// Nguồn cấu trúc DUY NHẤT của thể thức này ở luồng v3: preview và finalize cùng gọi.

const roundRobin = require('../engines/roundRobin');
const { dealtGroupSizes } = require('../playoffPlan');
const { groupKnockoutCombo } = require('../setupFormats');
const { rankAcrossGroups } = require('../crossGroupRanking');
const { planError, seededShuffle, GROUP_LABELS, STAGE_SCORING } = require('./common');

const RANK_WORD = { 1: 'Nhất', 2: 'Nhì', 3: 'Ba' };

const g = (groupLabel, rank) => ({ kind: 'group_rank', groupLabel, rank });
const pool = (rank, poolPosition) => ({ kind: 'group_rank_pool', rank, poolPosition });

// Vị trí tĩnh vòng loại đầu tiên (spec Lát A §5). Mỗi dòng: [matchKey, slot a, slot b].
const FIRST_ROUND = Object.freeze({
  '2x2': [['SF1', g('A', 1), g('B', 2)], ['SF2', g('B', 1), g('A', 2)]],
  '3x1': [['SF1', g('A', 1), pool(2, 1)], ['SF2', g('B', 1), g('C', 1)]],
  '4x1': [['SF1', g('A', 1), g('D', 1)], ['SF2', g('B', 1), g('C', 1)]],
  '3x2': [['QF1', g('A', 1), pool(3, 1)], ['QF2', g('C', 1), g('B', 2)], ['QF3', g('B', 1), pool(3, 2)], ['QF4', g('A', 2), g('C', 2)]],
  '4x2': [['QF1', g('A', 1), g('B', 2)], ['QF2', g('C', 1), g('D', 2)], ['QF3', g('B', 1), g('A', 2)], ['QF4', g('D', 1), g('C', 2)]],
});

const ROUND_LABEL = { QF: 'tứ kết', SF: 'bán kết' };

function sourceLabel(source, poolCount) {
  if (source.kind === 'group_rank') return `${RANK_WORD[source.rank] || `Hạng ${source.rank}`} ${source.groupLabel}`;
  if (source.kind === 'group_rank_pool') {
    const base = `${RANK_WORD[source.rank] || `Hạng ${source.rank}`} tốt nhất`;
    return poolCount > 1 ? `${base} #${source.poolPosition}` : base;
  }
  const [, stageKey, number] = String(source.matchKey).match(/^([A-Z]+)(\d+)$/) || [];
  const word = source.outcome === 'winner' ? 'Thắng' : 'Thua';
  return `${word} ${ROUND_LABEL[stageKey] || source.matchKey} ${number || ''}`.trim();
}

function comboKey(config) {
  const combo = groupKnockoutCombo(config);
  if (!combo) planError('FORMAT_CONFIG_INVALID', 'Tổ hợp số bảng / số cặp đi tiếp không hợp lệ');
  return { combo, key: `${combo.groupCount}x${combo.qualifiersPerGroup}` };
}

function buildGroups(pairIds, groupCount, seed) {
  const shuffled = seededShuffle(pairIds.map(String).sort(), `groups:${seed}`);
  const labels = GROUP_LABELS.slice(0, groupCount);
  const groups = labels.map((label) => ({ label, entryIds: [] }));
  shuffled.forEach((pairId, index) => groups[index % groupCount].entryIds.push(pairId));
  const expected = dealtGroupSizes(pairIds.length, groupCount);
  if (groups.some((group) => group.entryIds.length !== expected[group.label])) planError('GROUP_DEAL_MISMATCH', 'Chia bảng lệch kích thước dự kiến');
  return groups;
}

function groupMatches(groups) {
  const matches = [];
  for (const group of groups) {
    const fixtures = roundRobin.generateSchedule(
      { schedule_format: 'round_robin', config: { groupCount: 1, shuffle: false } },
      group.entryIds.map((id) => ({ id })),
      1,
    );
    fixtures.forEach((fixture, index) => {
      matches.push({
        matchKey: `GROUP-${group.label}-${index + 1}`,
        stagePlanKey: 'group-stage',
        stageKind: 'group',
        groupLabel: group.label,
        round: fixture.round,
        entryAId: String(fixture.entrant_a_id),
        entryBId: String(fixture.entrant_b_id),
      });
    });
  }
  // Thứ tự toàn cục: theo lượt, rồi xen kẽ các bảng (để xếp sân không dồn một bảng).
  const labelIndex = new Map(groups.map((group, index) => [group.label, index]));
  matches.sort((a, b) => (a.round - b.round) || (labelIndex.get(a.groupLabel) - labelIndex.get(b.groupLabel)) || a.matchKey.localeCompare(b.matchKey, 'en', { numeric: true }));
  return matches.map((match, index) => ({ ...match, order: index + 1 }));
}

function knockoutMatches(key, combo, thirdPlaceEnabled, startOrder) {
  const matches = [];
  const progressions = [];
  const poolCount = combo.pool;
  const push = (matchKey, round, bracketSlot, sources) => {
    matches.push({
      matchKey, stagePlanKey: 'knockout-stage', stageKind: 'knockout', round, bracketSlot,
      slotA: { kind: 'progression', label: sourceLabel(sources[0], poolCount) },
      slotB: { kind: 'progression', label: sourceLabel(sources[1], poolCount) },
    });
    sources.forEach((source, index) => progressions.push({
      sourceStagePlanKey: source.kind === 'match_outcome' ? 'knockout-stage' : 'group-stage',
      targetMatchKey: matchKey,
      targetSlot: index === 0 ? 'a' : 'b',
      source,
    }));
  };
  const first = FIRST_ROUND[key];
  first.forEach(([matchKey, a, b], index) => push(matchKey, 1, index, [a, b]));
  const win = (matchKey) => ({ kind: 'match_outcome', matchKey, outcome: 'winner' });
  const lose = (matchKey) => ({ kind: 'match_outcome', matchKey, outcome: 'loser' });
  let finalRound = 2;
  if (combo.target === 8) {
    push('SF1', 2, 0, [win('QF1'), win('QF2')]);
    push('SF2', 2, 1, [win('QF3'), win('QF4')]);
    finalRound = 3;
  }
  if (thirdPlaceEnabled) push('BRONZE', finalRound, 1, [lose('SF1'), lose('SF2')]);
  push('F', finalRound, 0, [win('SF1'), win('SF2')]);
  return {
    matches: matches.map((match, index) => ({ ...match, order: startOrder + index + 1 })),
    progressions,
  };
}

function buildGroupKnockoutPlan({ config = {}, pairIds = [], seed, divisionId }) {
  if (!seed) planError('DRAW_SEED_REQUIRED', 'Chưa bốc thăm');
  const { combo, key } = comboKey(config);
  const ids = pairIds.map(String);
  if (new Set(ids).size !== ids.length) planError('DUPLICATE_ENTRY_ID', 'Một cặp xuất hiện hai lần');
  if (ids.length < combo.minPairs) planError('PAIR_COUNT_BELOW_MINIMUM', 'Không đủ số cặp cho tổ hợp này', { min: combo.minPairs, count: ids.length });

  const groups = buildGroups(ids, combo.groupCount, seed);
  const tooSmall = groups.find((group) => group.entryIds.length < combo.qualifiersPerGroup + 1);
  if (tooSmall) planError('PAIR_COUNT_BELOW_MINIMUM', 'Bảng quá ít cặp', { min: combo.minPairs, count: ids.length });

  const thirdPlaceEnabled = config.thirdPlaceEnabled === true;
  const finalBestOf = [1, 3, 5].includes(Number(config.finalBestOf)) ? Number(config.finalBestOf) : 1;
  const group = groupMatches(groups);
  const knockout = knockoutMatches(key, combo, thirdPlaceEnabled, group.length);
  const sizes = groups.map((item) => item.entryIds.length);

  return {
    planVersion: 4,
    formatKey: 'group_knockout',
    divisionId: divisionId ? String(divisionId) : null,
    seed: String(seed),
    layout: key,
    stages: [
      {
        planKey: 'group-stage', name: 'Vòng bảng', scheduleFormat: 'round_robin', order: 1,
        config: { groupCount: combo.groupCount, advancePerGroup: combo.qualifiersPerGroup, poolCount: combo.pool, qualifiersTarget: combo.target, setupPlanVersion: 4, scoring: { ...STAGE_SCORING } },
      },
      {
        planKey: 'knockout-stage', name: 'Vòng loại trực tiếp', scheduleFormat: 'knockout', order: 2,
        config: {
          thirdPlaceEnabled,
          setupPlanVersion: 4,
          scoring: { ...STAGE_SCORING },
          ...(finalBestOf > 1 ? { match_scoring: { F: { best_of: finalBestOf } } } : {}),
        },
      },
    ],
    groups,
    matches: [...group, ...knockout.matches],
    progressions: knockout.progressions,
    counts: { groupMatches: group.length, knockoutMatches: knockout.matches.length, total: group.length + knockout.matches.length },
    finalBestOf,
    warnings: new Set(sizes).size > 1 ? ['GROUP_SIZE_IMBALANCE'] : [],
  };
}

// --- Tiến cấp (chạy khi xong vòng bảng) -------------------------------------------
// edges: [{ id, kind, groupLabel, rank, poolPosition, targetMatchKey, targetSlot }]
// standings: [{ entrant_id, group_label, rank, played, won, points_for, points_against }]
// Trả [{ transitionId, entryId, swapped }]. Hoán đổi chỉ để tránh hai cặp cùng bảng gặp
// nhau ở trận đầu vòng loại (spec §5); thử đổi với suất bù khác trước, rồi mới tới suất
// trực tiếp cùng phía (slot) ở trận khác.
function resolveGroupKnockoutAdvance({ edges, standings, seed }) {
  const byGroupRank = new Map(standings.map((row) => [`${row.group_label}:${row.rank}`, row]));
  const poolRank = edges.find((edge) => edge.kind === 'group_rank_pool')?.rank;
  let pooled = [];
  if (poolRank) {
    const candidates = standings.filter((row) => Number(row.rank) === Number(poolRank))
      .map((row) => ({ ...row, entryId: row.entrant_id, groupLabel: row.group_label }));
    pooled = rankAcrossGroups(candidates, seed);
  }
  const assigned = edges.map((edge) => {
    const row = edge.kind === 'group_rank'
      ? byGroupRank.get(`${edge.groupLabel}:${edge.rank}`)
      : pooled[Number(edge.poolPosition) - 1];
    if (!row) planError('GROUP_RANKING_MISSING', 'Thiếu thứ hạng để tiến cấp', { edge: edge.id });
    return { edge, entryId: String(row.entrant_id), groupLabel: row.group_label, swapped: false };
  });

  const opponentOf = (item) => assigned.find((other) => other !== item && other.edge.targetMatchKey === item.edge.targetMatchKey);
  const conflict = (item) => opponentOf(item)?.groupLabel === item.groupLabel;
  for (const item of assigned.filter((entry) => entry.edge.kind === 'group_rank_pool')) {
    if (!conflict(item)) continue;
    const others = assigned.filter((other) => other !== item && other.edge.targetMatchKey !== item.edge.targetMatchKey);
    const ordered = [
      ...others.filter((other) => other.edge.kind === 'group_rank_pool'),
      ...others.filter((other) => other.edge.kind === 'group_rank' && other.edge.targetSlot === item.edge.targetSlot),
      ...others.filter((other) => other.edge.kind === 'group_rank' && other.edge.targetSlot !== item.edge.targetSlot),
    ];
    for (const other of ordered) {
      [item.entryId, other.entryId] = [other.entryId, item.entryId];
      [item.groupLabel, other.groupLabel] = [other.groupLabel, item.groupLabel];
      if (!conflict(item) && !conflict(other)) { item.swapped = other.swapped = true; break; }
      [item.entryId, other.entryId] = [other.entryId, item.entryId];
      [item.groupLabel, other.groupLabel] = [other.groupLabel, item.groupLabel];
    }
  }
  return assigned.map((item) => ({ transitionId: item.edge.id, entryId: item.entryId, swapped: item.swapped }));
}

module.exports = { buildGroupKnockoutPlan, resolveGroupKnockoutAdvance, FIRST_ROUND };
