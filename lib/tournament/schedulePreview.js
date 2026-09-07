'use strict';

const { getScheduleEngine } = require('./engines');

function buildSchedulePreview({ competition = {}, entrantCount = 0, seed = 1 } = {}) {
  const format = competition.schedule_format === 'knockout' ? 'knockout' : 'round_robin';
  const groupCount = Math.max(1, Number(competition.group_count || 1));
  const n = Math.max(0, Number(entrantCount || 0));
  const entrants = Array.from({ length: n }, (_, i) => ({ id: i + 1, seed: i + 1 }));
  if (!entrants.length) return { format, groups: groupCount, matches: [] };
  const engine = getScheduleEngine(format);
  const stage = { schedule_format: format, config: { groupCount, shuffle: false } };
  let matches = [];
  try {
    matches = engine.generateSchedule(stage, entrants, Number(seed) || 1) || [];
  } catch (e) {
    matches = [];
  }
  return {
    format,
    groups: format === 'round_robin' ? groupCount : 1,
    double_elimination: !!competition.double_elimination,
    engine_pending: !!competition.engine_pending,
    matches: matches.map((m) => ({
      round: m.round, group_label: m.group_label || null, bracket_slot: m.bracket_slot || null,
      a: m.entrant_a_id, b: m.entrant_b_id,
    })),
  };
}

module.exports = { buildSchedulePreview };
