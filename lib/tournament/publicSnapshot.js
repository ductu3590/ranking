const PUBLIC_TOURNAMENT_FIELDS = [
  'id', 'public_slug', 'name', 'description', 'event_date', 'status',
  'location', 'entrant_type', 'visibility',
];
const PUBLIC_STAGE_FIELDS = [
  'id', 'stage_order', 'name', 'schedule_format', 'match_format', 'status',
];
const PUBLIC_ENTRANT_FIELDS = ['id', 'name', 'seed', 'color'];
const PUBLIC_MATCH_FIELDS = [
  'id', 'stage_id', 'round', 'bracket_slot', 'group_label', 'court',
  'match_order', 'entrant_a_id', 'entrant_b_id', 'status',
  'winner_entrant_id', 'parent_match_id',
];
const PUBLIC_GAME_FIELDS = [
  'match_id', 'game_no', 'kind', 'score_a', 'score_b', 'winner_entrant_id',
];
const PUBLIC_STANDING_FIELDS = [
  'entrant_id', 'played', 'won', 'lost', 'games_won', 'games_lost',
  'points_for', 'points_against', 'diff', 'match_points', 'group_label',
  'seed', 'rank', 'exit_round',
];

function normalizePublicSlug(value) {
  const slug = String(value == null ? '' : value).trim().toLowerCase();
  return slug || null;
}

function projectPublicRecord(record, fields) {
  if (!record || typeof record !== 'object') return null;
  const projected = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field) && record[field] !== undefined) {
      projected[field] = record[field];
    }
  }
  return projected;
}

function projectList(records, fields) {
  return (Array.isArray(records) ? records : [])
    .map((record) => projectPublicRecord(record, fields));
}

function projectStandings(value) {
  if (!value || typeof value !== 'object') return value;
  return {
    schedule_format: value.schedule_format,
    standings: projectList(value.standings, PUBLIC_STANDING_FIELDS),
  };
}

function buildGamesByMatchId(games) {
  const grouped = {};
  for (const game of projectList(games, PUBLIC_GAME_FIELDS)) {
    const key = String(game.match_id);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(game);
  }
  return grouped;
}

function buildPublicSnapshot({
  tournament,
  stages,
  entrants,
  matches,
  games,
  standingsByStage,
}) {
  const standings = {};
  for (const [stageId, value] of Object.entries(standingsByStage || {})) {
    standings[String(stageId)] = projectStandings(value);
  }
  return {
    tournament: projectPublicRecord(tournament, PUBLIC_TOURNAMENT_FIELDS),
    stages: projectList(stages, PUBLIC_STAGE_FIELDS),
    entrants: projectList(entrants, PUBLIC_ENTRANT_FIELDS),
    matches: projectList(matches, PUBLIC_MATCH_FIELDS),
    gamesByMatchId: buildGamesByMatchId(games),
    standingsByStage: standings,
  };
}

module.exports = {
  PUBLIC_TOURNAMENT_FIELDS,
  PUBLIC_STAGE_FIELDS,
  PUBLIC_ENTRANT_FIELDS,
  PUBLIC_MATCH_FIELDS,
  PUBLIC_GAME_FIELDS,
  PUBLIC_STANDING_FIELDS,
  normalizePublicSlug,
  projectPublicRecord,
  buildPublicSnapshot,
};
