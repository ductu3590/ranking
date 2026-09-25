'use strict';
// Dựng dữ liệu dạng DB (stages, matches, transitions, entries) từ plan thật của setupPlans,
// để test nhãn trận và view model bàn điều hành trên đúng cấu trúc production sinh ra.

const { lib } = require('../_harness');

const { buildSetupPlan } = lib('lib/tournament/setupPlans');

const pairIds = (n) => Array.from({ length: n }, (_, i) => `pair_${String(i + 1).padStart(4, '0')}`);

function planFor(formatKey, n, config = {}) {
  return buildSetupPlan({ formatKey, config, pairIds: pairIds(n), seed: `seed-${formatKey}-${n}` });
}

function toDb(plan) {
  const stages = plan.stages.map((stage, index) => ({
    id: 100 + index,
    name: stage.name,
    division_id: 1,
    stage_order: stage.order,
    schedule_format: stage.scheduleFormat === 'double_elimination' ? 'double_elim' : stage.scheduleFormat,
    config: stage.config,
    planKey: stage.planKey,
  }));
  const stageId = new Map(stages.map((stage) => [stage.planKey, stage.id]));
  const entryId = new Map();
  const entries = [];
  const entryOf = (pairId) => {
    if (pairId == null) return null;
    if (!entryId.has(pairId)) {
      const id = 500 + entryId.size + 1;
      entryId.set(pairId, id);
      entries.push({ id, name: `Cặp ${entryId.size}` });
    }
    return entryId.get(pairId);
  };
  const ordered = plan.matches.slice().sort((a, b) => a.order - b.order);
  const matchId = new Map(ordered.map((match, index) => [match.matchKey, 1000 + index]));
  const matches = ordered.map((match) => ({
    id: matchId.get(match.matchKey),
    stage_id: stageId.get(match.stagePlanKey),
    division_id: 1,
    round: match.round,
    bracket_slot: match.bracketSlot ?? null,
    group_label: match.groupLabel ?? null,
    match_order: match.order,
    match_key: match.matchKey,
    status: 'pending',
    version: 1,
    court: null,
    entry_a_id: entryOf(match.entryAId),
    entry_b_id: entryOf(match.entryBId),
    winner_entry_id: null,
    result_type: 'simple',
    warmup_started_at: null,
    started_at: null,
    ended_at: null,
  }));
  const transitions = (plan.progressions || []).map((edge) => ({
    source_kind: edge.source.kind,
    source_match_id: edge.source.matchKey ? matchId.get(edge.source.matchKey) : null,
    source_outcome: edge.source.outcome || null,
    source_group_label: edge.source.groupLabel ?? null,
    source_rank: edge.source.rank ?? null,
    source_pool_position: edge.source.poolPosition ?? edge.source.position ?? null,
    target_match_id: matchId.get(edge.targetMatchKey),
    target_slot: edge.targetSlot,
  }));
  return { stages, matches, transitions, entries, byKey: (key) => matches.find((match) => match.match_key === key) };
}

module.exports = { planFor, toDb, pairIds };
