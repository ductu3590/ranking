'use strict';

const crypto = require('node:crypto');
const { buildDivisionStagePayloads } = require('./wizardModel');

function planError(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireId(value, code) {
  if (value == null || String(value).trim() === '') planError(code, 'Mỗi entry phải có ID thực');
  return String(value);
}

function seededRandom(seed) {
  let state = 2166136261;
  for (const character of String(seed)) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function progressionSlot(sourceStagePlanKey, sourceGroupLabel, sourceRank, label, options = {}) {
  return {
    kind: 'progression',
    sourceStagePlanKey,
    sourceGroupLabel,
    sourceRank,
    label,
    ...options,
  };
}

function buildInternalDoublesGroupKnockoutPlan(input = {}) {
  const groupCount = input.groupCount == null ? 2 : Number(input.groupCount);
  const qualifiersPerGroup = input.qualifiersPerGroup == null
    ? (input.advancePerGroup == null ? 2 : Number(input.advancePerGroup))
    : Number(input.qualifiersPerGroup);
  if (groupCount !== 2) planError('UNSUPPORTED_GROUP_COUNT', 'INTERNAL DOUBLES group_knockout chỉ hỗ trợ 2 bảng');
  if (qualifiersPerGroup !== 2) planError('UNSUPPORTED_QUALIFIERS_PER_GROUP', 'INTERNAL DOUBLES group_knockout chỉ hỗ trợ 2 suất mỗi bảng');
  if (input.thirdPlaceEnabled != null && typeof input.thirdPlaceEnabled !== 'boolean') planError('THIRD_PLACE_INVALID', 'thirdPlaceEnabled phải là boolean');

  const divisionId = requireId(input.divisionId, 'DIVISION_ID_REQUIRED');
  const seed = requireId(input.seed, 'DRAW_SEED_REQUIRED');
  const entries = Array.isArray(input.entries) ? input.entries : planError('ENTRIES_REQUIRED', 'Danh sách entry là bắt buộc');
  if (entries.length < 4) planError('ENTRY_COUNT_TOO_SMALL', 'Cần ít nhất 4 entry để có hai bảng và playoff');

  const normalizedEntries = entries.map((entry) => {
    if (!entry || typeof entry !== 'object') planError('ENTRY_INVALID', 'Entry phải là object');
    const entryId = requireId(entry.entryId == null ? entry.id : entry.entryId, 'ENTRY_ID_REQUIRED');
    return { entryId };
  }).sort((left, right) => left.entryId.localeCompare(right.entryId));
  if (new Set(normalizedEntries.map((entry) => entry.entryId)).size !== normalizedEntries.length) {
    planError('DUPLICATE_ENTRY_ID', 'Một entry không thể xuất hiện nhiều lần trong draw');
  }

  const shuffled = normalizedEntries.slice();
  const random = seededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const groupASize = Math.ceil(shuffled.length / 2);
  const groups = [
    { label: 'A', entries: shuffled.slice(0, groupASize) },
    { label: 'B', entries: shuffled.slice(groupASize) },
  ];
  if (groups[1].entries.length < 2) planError('GROUP_SIZE_TOO_SMALL', 'Mỗi bảng phải có ít nhất 2 entry');

  // This is deliberately the sole format-to-stage converter used by this adapter.
  const stagePayloads = buildDivisionStagePayloads({
    tournament_id: input.tournamentId,
    division: { id: divisionId },
    stage_plan: 'group_knockout',
    config: { groupCount, advancePerGroup: qualifiersPerGroup },
  });
  const stages = stagePayloads.map((stage, index) => ({
    ...stage,
    planKey: index === 0 ? 'group-stage' : 'knockout-stage',
  }));
  const groupStagePlanKey = stages[0].planKey;
  const knockoutStagePlanKey = stages[1].planKey;

  const matches = [];
  for (const group of groups) {
    for (let left = 0; left < group.entries.length; left += 1) {
      for (let right = left + 1; right < group.entries.length; right += 1) {
        matches.push({
          stagePlanKey: groupStagePlanKey,
          stageKind: 'group',
          groupLabel: group.label,
          matchKey: `group-${group.label}-${left + 1}-${right + 1}`,
          entryAId: group.entries[left].entryId,
          entryBId: group.entries[right].entryId,
        });
      }
    }
  }

  const thirdPlaceEnabled = input.thirdPlaceEnabled === true;
  const progressions = [
    ['A', 1, 'semi-1-a'], ['B', 2, 'semi-1-b'], ['B', 1, 'semi-2-a'], ['A', 2, 'semi-2-b'],
  ].map(([sourceGroupLabel, sourceRank, targetSlot]) => ({
    sourceStagePlanKey: groupStagePlanKey,
    targetStagePlanKey: knockoutStagePlanKey,
    sourceKind: 'standing',
    sourceGroupLabel,
    sourceRank,
    targetSlot,
    outcome: 'qualifies',
    sourceEntryKind: 'entry',
    targetDivisionId: divisionId,
    thirdPlaceEnabled,
  }));
  matches.push(
    { stagePlanKey: knockoutStagePlanKey, stageKind: 'knockout', matchKey: 'semi-1', slotA: progressionSlot(groupStagePlanKey, 'A', 1, 'Nhất A', { targetSlot: 'semi-1-a' }), slotB: progressionSlot(groupStagePlanKey, 'B', 2, 'Nhì B', { targetSlot: 'semi-1-b' }) },
    { stagePlanKey: knockoutStagePlanKey, stageKind: 'knockout', matchKey: 'semi-2', slotA: progressionSlot(groupStagePlanKey, 'B', 1, 'Nhất B', { targetSlot: 'semi-2-a' }), slotB: progressionSlot(groupStagePlanKey, 'A', 2, 'Nhì A', { targetSlot: 'semi-2-b' }) },
    { stagePlanKey: knockoutStagePlanKey, stageKind: 'knockout', matchKey: 'final', slotA: progressionSlot(knockoutStagePlanKey, null, null, 'Thắng bán kết 1', { sourceMatchKey: 'semi-1', outcome: 'winner' }), slotB: progressionSlot(knockoutStagePlanKey, null, null, 'Thắng bán kết 2', { sourceMatchKey: 'semi-2', outcome: 'winner' }) },
  );
  if (thirdPlaceEnabled) matches.push({ stagePlanKey: knockoutStagePlanKey, stageKind: 'knockout', matchKey: 'third-place', slotA: progressionSlot(knockoutStagePlanKey, null, null, 'Thua bán kết 1', { sourceMatchKey: 'semi-1', outcome: 'loser' }), slotB: progressionSlot(knockoutStagePlanKey, null, null, 'Thua bán kết 2', { sourceMatchKey: 'semi-2', outcome: 'loser' }) });

  const result = {
    formatKey: 'group_knockout',
    entrantType: 'doubles',
    seed,
    stages,
    groups: groups.map((group) => ({ label: group.label, entryIds: group.entries.map((entry) => entry.entryId) })),
    groupSizes: groups.map((group) => group.entries.length),
    progressions,
    matches,
    warnings: groups[0].entries.length !== groups[1].entries.length ? ['GROUP_SIZE_IMBALANCE'] : [],
  };
  return { ...result, fingerprint: crypto.createHash('sha256').update(stableStringify(result)).digest('hex') };
}

module.exports = { buildInternalDoublesGroupKnockoutPlan, stableStringify };