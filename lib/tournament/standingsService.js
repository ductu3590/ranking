const { getScheduleEngine, getMatchEngine } = require('./engines');
const { buildResolvedMatches } = require('./results');

async function loadStageData(db, stage, groupId) {
  const stageId = stage.id;
  let entrants = [];
  const { data: stageEntrants, error: seErr } = await db
    .from('tournament_stage_entrants')
    .select('entrant_id, seed_in_stage, group_label')
    .eq('group_id', groupId)
    .eq('stage_id', stageId);
  if (seErr) return { error: { message: seErr.message, status: 500 } };

  if (stageEntrants && stageEntrants.length) {
    const { data: baseEntrants, error: beErr } = await db
      .from('tournament_entrants')
      .select('id, seed')
      .eq('group_id', groupId)
      .eq('tournament_id', stage.tournament_id);
    if (beErr) return { error: { message: beErr.message, status: 500 } };
    const seedById = {};
    for (const entrant of baseEntrants || []) seedById[entrant.id] = entrant.seed;
    entrants = stageEntrants.map((row) => ({
      id: row.entrant_id,
      seed: row.seed_in_stage != null ? row.seed_in_stage : seedById[row.entrant_id],
      group_label: row.group_label,
    }));
  } else {
    const { data: tournamentEntrants, error: teErr } = await db
      .from('tournament_entrants')
      .select('id, seed')
      .eq('group_id', groupId)
      .eq('tournament_id', stage.tournament_id);
    if (teErr) return { error: { message: teErr.message, status: 500 } };
    entrants = (tournamentEntrants || []).map((row) => ({ id: row.id, seed: row.seed }));
  }

  const { data: matches, error: mErr } = await db
    .from('tournament_matches')
    .select('*')
    .eq('group_id', groupId)
    .eq('stage_id', stageId);
  if (mErr) return { error: { message: mErr.message, status: 500 } };
  const matchList = matches || [];

  const gamesByMatchId = {};
  const matchIds = matchList.map((match) => match.id);
  if (matchIds.length) {
    const { data: games, error: gErr } = await db
      .from('tournament_games')
      .select('match_id, score_a, score_b, kind, game_no')
      .eq('group_id', groupId)
      .in('match_id', matchIds);
    if (gErr) return { error: { message: gErr.message, status: 500 } };
    for (const game of games || []) {
      if (!gamesByMatchId[game.match_id]) gamesByMatchId[game.match_id] = [];
      gamesByMatchId[game.match_id].push({
        score_a: game.score_a,
        score_b: game.score_b,
        kind: game.kind,
        game_no: game.game_no,
      });
    }
  }

  const matchEngine = getMatchEngine(stage.match_format);
  const resolved = buildResolvedMatches(matchList, gamesByMatchId, matchEngine, stage.config || {});
  return { entrants, resolved, matches: matchList };
}

async function computeStageStandings(db, stage, groupId) {
  const loaded = await loadStageData(db, stage, groupId);
  if (loaded.error) throw Object.assign(new Error(loaded.error.message), { status: loaded.error.status });
  const scheduleEngine = getScheduleEngine(stage.schedule_format);
  const standings = scheduleEngine.computeStandings(
    { schedule_format: stage.schedule_format, config: stage.config || {} },
    loaded.entrants,
    loaded.resolved,
  );
  return { schedule_format: stage.schedule_format, standings };
}

module.exports = { loadStageData, computeStageStandings };
