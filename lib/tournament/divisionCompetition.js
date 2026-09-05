'use strict';

const { getScheduleEngine } = require('./engines');

const TOURNAMENT_STATUS_MAP = {
  draft: 'draft',
  active: 'registration_open',
  completed: 'completed',
};

const MATCH_STATUS_MAP = {
  pending: 'pending',
  live: 'live',
  done: 'finalized',
};

function mapLegacyTournamentStatus(status) {
  return TOURNAMENT_STATUS_MAP[status] || status;
}

function mapLegacyMatchStatus(status) {
  return MATCH_STATUS_MAP[status] || status;
}

function buildDivisionCompetition({ divisions = [], entries = [], completedMatches = [], seed = 1 } = {}) {
  const byDivision = {};
  for (const division of divisions) {
    const divisionId = String(division.id);
    const divisionEntries = entries.filter((entry) => String(entry.division_id) === divisionId);
    const stage = {
      id: `${divisionId}:stage:1`,
      division_id: division.id,
      stage_order: 1,
      name: division.name || `Division ${division.id}`,
      schedule_format: division.stageConfig?.schedule_format || 'round_robin',
      config: division.stageConfig || {},
    };
    const engine = getScheduleEngine(stage.schedule_format);
    const matches = engine.generateSchedule(stage, divisionEntries, seed + Number(division.id || 0));
    const resolvedMatches = completedMatches
      .filter((match) => String(match.division_id) === divisionId)
      .map((match) => ({ ...match, status: match.status || 'done' }));
    const standings = engine.computeStandings(stage, divisionEntries, resolvedMatches);
    byDivision[divisionId] = {
      division: { ...division },
      stages: [stage],
      matches: matches.map((match) => ({ ...match, division_id: division.id })),
      standings,
    };
  }
  return { byDivision };
}

module.exports = {
  mapLegacyTournamentStatus,
  mapLegacyMatchStatus,
  buildDivisionCompetition,
};
