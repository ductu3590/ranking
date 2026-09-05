const { TIEBREAK_PRESETS } = require('./rules/tiebreak');

const PUBLIC_TOURNAMENT_FIELDS = [
  'id', 'public_slug', 'name', 'description', 'event_date', 'status',
  'location', 'entrant_type', 'visibility',
];
const PUBLIC_STAGE_FIELDS = [
  'id', 'division_id', 'stage_order', 'name', 'schedule_format', 'match_format', 'status',
];
// Nội dung thi đấu công khai: chỉ tên và cấu hình thi đấu, không có eligibility
// hay ghi chú nội bộ của BTC.
const PUBLIC_DIVISION_FIELDS = [
  'id', 'name', 'entrant_type', 'play_type', 'scoring_scope',
  'competition_template', 'ruleset_version', 'competition_status',
];
// share_settings có thể chứa cấu hình nội bộ; chỉ những khóa dưới đây ra ngoài.
const PUBLIC_SHARE_FIELDS = ['poster_url', 'og_image_url', 'text_template_version'];
const PUBLIC_ENTRANT_FIELDS = ['id', 'division_id', 'name', 'seed', 'color'];
const PUBLIC_MATCH_FIELDS = [
  'id', 'division_id', 'stage_id', 'round', 'bracket_slot', 'group_label', 'court',
  'match_order', 'entrant_a_id', 'entrant_b_id', 'status',
  'winner_entrant_id', 'entry_a_id', 'entry_b_id', 'winner_entry_id', 'parent_match_id',
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

// BXH của một stage phải giải thích được thứ tự tie-break đang dùng (mục 16),
// nên chiếu ra thứ tự tiêu chí đã snapshot trong config — không chiếu cả config.
function projectStageTiebreak(stage) {
  const raw = stage && stage.config ? stage.config.tiebreak : null;
  if (!raw) return null;
  if (typeof raw === 'string') {
    const preset = TIEBREAK_PRESETS[raw];
    return preset ? { version: preset.version, order: preset.order.slice() } : { version: raw, order: [] };
  }
  if (typeof raw !== 'object') return null;
  const order = Array.isArray(raw.order) ? raw.order.map(String) : [];
  const version = raw.version ? String(raw.version) : null;
  const fallback = version && TIEBREAK_PRESETS[version] ? TIEBREAK_PRESETS[version].order.slice() : [];
  return { version, order: order.length ? order : fallback };
}

function projectStages(stages) {
  return (Array.isArray(stages) ? stages : []).map((stage) => {
    const projected = projectPublicRecord(stage, PUBLIC_STAGE_FIELDS);
    const tiebreak = projectStageTiebreak(stage);
    return tiebreak ? { ...projected, tiebreak } : projected;
  });
}

function projectShareSettings(tournament) {
  const settings = tournament && tournament.share_settings;
  if (!settings || typeof settings !== 'object') return {};
  return projectPublicRecord(settings, PUBLIC_SHARE_FIELDS) || {};
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
  divisions,
  stages,
  entrants,
  matches,
  games,
  standingsByStage,
}) {
  // PHR chỉ ra ngoài khi BTC bật công khai, và chỉ ở dạng tổng đã snapshot lúc
  // duyệt entry. Không bao giờ trả PHR hiện tại của từng VĐV.
  const publicPhr = tournament?.share_settings?.public_phr === true || tournament?.public_phr === true;
  const projectedEntrants = projectList(entrants, PUBLIC_ENTRANT_FIELDS).map((entry, index) => {
    const source = Array.isArray(entrants) ? entrants[index] : null;
    return publicPhr && source?.phr_total != null
      ? { ...entry, phr_total: Number(source.phr_total) }
      : entry;
  });
  const standings = {};
  for (const [stageId, value] of Object.entries(standingsByStage || {})) {
    standings[String(stageId)] = projectStandings(value);
  }
  return {
    tournament: projectPublicRecord(tournament, PUBLIC_TOURNAMENT_FIELDS),
    share: projectShareSettings(tournament),
    divisions: projectList(divisions, PUBLIC_DIVISION_FIELDS),
    stages: projectStages(stages),
    entrants: projectedEntrants,
    matches: projectList(matches, PUBLIC_MATCH_FIELDS),
    gamesByMatchId: buildGamesByMatchId(games),
    standingsByStage: standings,
  };
}

module.exports = {
  PUBLIC_TOURNAMENT_FIELDS,
  PUBLIC_DIVISION_FIELDS,
  PUBLIC_SHARE_FIELDS,
  PUBLIC_STAGE_FIELDS,
  PUBLIC_ENTRANT_FIELDS,
  PUBLIC_MATCH_FIELDS,
  PUBLIC_GAME_FIELDS,
  PUBLIC_STANDING_FIELDS,
  normalizePublicSlug,
  projectPublicRecord,
  buildPublicSnapshot,
};
