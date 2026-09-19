'use strict';

const { buildDivisionStagePayloads } = require('./wizardModel');
function pairsForGroups(pairs, count) { const groups = Array.from({ length: count }, () => []); (pairs || []).forEach((p, i) => groups[i % count].push(p)); return groups; }
function roundRobinMatches(group, label) { const out = []; for (let i = 0; i < group.length; i += 1) for (let j = i + 1; j < group.length; j += 1) out.push({ stageKind: 'group', groupLabel: label, entryAId: group[i].pairId, entryBId: group[j].pairId }); return out; }
function buildStagePlan(input = {}) {
  const formatKey = input.formatKey || input.stagePlan;
  if (formatKey !== 'group_knockout') return { stages: buildDivisionStagePayloads({ tournament_id: input.tournamentId, division: { id: input.divisionId }, stage_plan: formatKey, config: input }) , progressions: [], matches: [], groupSizes: [] };
  const groups = pairsForGroups(input.pairs || [], Number(input.groupCount) || 2);
  const stages = buildDivisionStagePayloads({ tournament_id: input.tournamentId, division: { id: input.divisionId }, stage_plan: 'group_knockout', config: input });
  const progressions = [
    ['A', 1, 'semi-1-a'], ['B', 2, 'semi-1-b'], ['B', 1, 'semi-2-a'], ['A', 2, 'semi-2-b'],
  ].map(([sourceGroupLabel, sourceRank, targetSlot]) => ({ sourceStageId: stages[0].id || null, targetStageId: stages[1].id || null, sourceGroupLabel, sourceRank, targetSlot, targetDivisionId: input.divisionId }));
  const matches = groups.flatMap((group, i) => roundRobinMatches(group, String.fromCharCode(65 + i)));
  const slot = (sourceGroupLabel, sourceRank) => ({ kind: 'progression', sourceStageId: stages[0].id || null, sourceGroupLabel, sourceRank, label: `${sourceRank === 1 ? 'Nhất' : 'Nhì'} ${sourceGroupLabel}` });
  matches.push({ stageKind: 'knockout', slotA: slot('A', 1), slotB: slot('B', 2), matchKey: 'semi-1' }, { stageKind: 'knockout', slotA: slot('B', 1), slotB: slot('A', 2), matchKey: 'semi-2' }, { stageKind: 'knockout', slotA: { kind: 'progression', sourceStageId: stages[1].id || null, sourceRank: 1, label: 'Thắng bán kết 1' }, slotB: { kind: 'progression', sourceStageId: stages[1].id || null, sourceRank: 1, label: 'Thắng bán kết 2' }, matchKey: 'final' });
  if (input.thirdPlaceEnabled) matches.push({ stageKind: 'knockout', matchKey: 'third-place', slotA: { kind: 'progression', sourceStageId: stages[1].id || null, label: 'Thua bán kết 1' }, slotB: { kind: 'progression', sourceStageId: stages[1].id || null, label: 'Thua bán kết 2' } });
  return { stages: stages.map((stage, i) => ({ ...stage, id: stage.id || `stage-${i + 1}` })), progressions, matches, groupSizes: groups.map((g) => g.length), warnings: groups.length === 2 && groups[0].length !== groups[1].length ? ['GROUP_SIZE_IMBALANCE'] : [] };
}
module.exports = { buildStagePlan };
