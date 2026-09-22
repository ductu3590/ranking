'use strict';

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeConfig(draft = {}) {
  const config = (draft.format && draft.format.config) || {};
  const pairCount = Array.isArray(draft.pairs) ? draft.pairs.length : 0;
  const groupCount = toNumber(config.groupCount || config.groups || config.group_count, 2);
  const suppliedSizes = Array.isArray(config.groupSizes) ? config.groupSizes.map((size) => toNumber(size, 0)) : [];
  const groupSizes = suppliedSizes.length
    ? suppliedSizes
    : Array.from({ length: groupCount }, (_, index) => Math.floor(pairCount / groupCount) + (index < pairCount % groupCount ? 1 : 0));

  return {
    groupCount,
    groupSizes,
    qualifiersPerGroup: toNumber(config.qualifiersPerGroup || config.advancersPerGroup, 2),
    bracketPairing: config.bracketPairing || 'cross_seed',
    thirdPlaceEnabled: Boolean(config.thirdPlaceEnabled),
    courtCount: toNumber(config.courtCount, 1),
    minutesPerMatch: toNumber(config.minutesPerMatch, 30),
  };
}

function groupLabel(index) {
  return String.fromCharCode(65 + index);
}

function countRoundRobinMatches(groupSizes) {
  return groupSizes.reduce((total, size) => total + (size * Math.max(0, size - 1)) / 2, 0);
}

function buildProgressionLines(config) {
  if (config.groupCount < 2 || config.qualifiersPerGroup < 2 || config.bracketPairing !== 'cross_seed') return [];
  return ['Nhất A – Nhì B', 'Nhất B – Nhì A'];
}

function buildWarnings(config) {
  const warnings = [];
  const uniqueSizes = new Set(config.groupSizes);
  if (uniqueSizes.size > 1) {
    warnings.push({
      code: 'GROUP_SIZE_IMBALANCE',
      message: `Bảng ${groupLabel(config.groupSizes.indexOf(Math.max(...config.groupSizes)))} ${Math.max(...config.groupSizes)} cặp đá nhiều trận hơn bảng ${groupLabel(config.groupSizes.indexOf(Math.min(...config.groupSizes)))} ${Math.min(...config.groupSizes)} cặp.`,
      severity: 'warning',
    });
  }
  return warnings;
}

function buildBlockers(draft = {}, config) {
  const blockers = [];
  const drawStatus = draft.draw && draft.draw.status;
  if (!Array.isArray(draft.pairs) || draft.pairs.length === 0) {
    blockers.push({ code: 'ROSTER_EMPTY', message: 'Chưa có cặp thi đấu để bốc thăm.', severity: 'blocker' });
  }
  if ((draft.unpairedMemberIds || []).length) {
    blockers.push({ code: 'UNPAIRED_MEMBER', message: 'Còn VĐV chưa ghép cặp.', severity: 'blocker' });
  }
  if (config.groupCount < 1 || config.qualifiersPerGroup < 1) {
    blockers.push({ code: 'DIVISION_CONFIG_INVALID', message: 'Cấu hình bảng hoặc suất đi tiếp chưa hợp lệ.', severity: 'blocker' });
  }
  if (drawStatus === 'stale') {
    blockers.push({ code: 'DRAW_STALE', message: 'Cấu hình hoặc cặp đã đổi, cần bốc lại trước khi chốt.', severity: 'blocker' });
  }
  return blockers;
}

function buildDrawPreviewModel(draft = {}) {
  const config = normalizeConfig(draft);
  const groupMatches = countRoundRobinMatches(config.groupSizes);
  const semifinalMatches = config.groupCount >= 2 && config.qualifiersPerGroup >= 2 ? 2 : 0;
  const finalMatches = semifinalMatches ? 1 : 0;
  const thirdPlaceMatches = config.thirdPlaceEnabled && semifinalMatches ? 1 : 0;
  const totalMatches = groupMatches + semifinalMatches + finalMatches + thirdPlaceMatches;
  const estimatedRounds = Math.ceil(totalMatches / Math.max(1, config.courtCount));

  return {
    config,
    groupSizes: config.groupSizes,
    progressionLines: buildProgressionLines(config),
    bracketSlots: buildProgressionLines(config).map((line, index) => ({
      matchKey: `semi-${index + 1}`,
      label: line,
      slotA: { kind: 'progression', label: line.split(' – ')[0] },
      slotB: { kind: 'progression', label: line.split(' – ')[1] },
    })),
    metrics: { groupMatches, semifinalMatches, finalMatches, thirdPlaceMatches, totalMatches },
    courtPlan: {
      courtCount: config.courtCount,
      minutesPerMatch: config.minutesPerMatch,
      estimatedRounds,
      estimatedMinutes: estimatedRounds * config.minutesPerMatch,
    },
    blockers: buildBlockers(draft, config),
    warnings: buildWarnings(config),
  };
}

function buildReviewSummaryModel(draft = {}) {
  const preview = buildDrawPreviewModel(draft);
  const lockedByResults = draft.matchState && (draft.matchState.started || draft.matchState.hasScore);
  const metadataBlockers = [];
  if (!String(draft?.tournament?.name || '').trim()) {
    metadataBlockers.push({ code: 'TOURNAMENT_NAME_REQUIRED', message: 'Hãy nhập tên giải trước khi chốt.', severity: 'blocker' });
  }
  if (!String(draft?.tournament?.eventDate || '').trim()) {
    metadataBlockers.push({ code: 'EVENT_DATE_REQUIRED', message: 'Hãy chọn ngày thi đấu trước khi chốt.', severity: 'blocker' });
  }
  const blockers = lockedByResults
    ? [{ code: 'STRUCTURE_LOCKED_BY_RESULTS', message: 'Giải đã có trận bắt đầu hoặc đã có tỉ số, không thể đổi cấu trúc qua setup.', severity: 'blocker' }, ...preview.blockers]
    : [...preview.blockers, ...metadataBlockers];

  return {
    ...preview,
    blockers,
    warnings: preview.warnings,
    finalizeDisabled: blockers.length > 0,
    finalizeDisabledCode: blockers[0] ? blockers[0].code : null,
    finalizeDisabledReason: blockers[0] ? blockers[0].message : '',
    destinationLabel: 'Lịch thi đấu',
    summaryText: `${(draft.participants && (draft.participants.memberIds || draft.participants.selectedMemberIds) || []).length || (draft.pairs || []).length * 2} VĐV · ${(draft.pairs || []).length} cặp · ${preview.groupSizes.map((size, index) => `Bảng ${groupLabel(index)} ${size} cặp`).join(' / ')} · vòng bảng ${preview.metrics.groupMatches} trận · bán kết ${preview.metrics.semifinalMatches} · chung kết ${preview.metrics.finalMatches} · tổng ${preview.metrics.totalMatches}`,
  };
}

function markDrawStaleOnSetupChange(draft = {}, reasonCode = 'SETUP_CHANGED') {
  return {
    ...draft,
    draw: { ...(draft.draw || {}), status: 'stale', staleReason: reasonCode, matches: undefined },
    invalidation: { ...(draft.invalidation || {}), draw: true, reasonCodes: [...((draft.invalidation && draft.invalidation.reasonCodes) || []), reasonCode] },
  };
}

module.exports = { buildDrawPreviewModel, buildReviewSummaryModel, markDrawStaleOnSetupChange };
