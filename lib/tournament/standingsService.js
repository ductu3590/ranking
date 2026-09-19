const { getScheduleEngine, getMatchEngine } = require('./engines');
const { buildResolvedMatches } = require('./results');
const { resolveMatchScoring } = require('./rules/roundScoring');
const { resolveTiebreak } = require('./rules/tiebreak');

async function loadStageData(db, stage, groupId, context = {}) {
  const stageId = stage.id;
  let entrants = [];
  let stageEntrantQuery = db.from('tournament_stage_entrants')
    .select('entry_id, entrant_id, seed_in_stage, group_label');
  if (groupId != null) stageEntrantQuery = stageEntrantQuery.eq('group_id', groupId);
  const { data: stageEntrants, error: seErr } = await stageEntrantQuery.eq('stage_id', stageId);
  if (seErr) return { error: { message: seErr.message, status: 500 } };

  if (stageEntrants && stageEntrants.length && stageEntrants.some((row) => row.entry_id != null)) {
    const entryIds = stageEntrants.map((row) => row.entry_id).filter(Boolean);
    const { data: baseEntries, error: beErr } = await db
      .from('tournament_entries')
      .select('id, seed')
      .eq('division_id', stage.division_id)
      .in('id', entryIds);
    if (beErr) return { error: { message: beErr.message, status: 500 } };
    const seedById = {};
    for (const entry of baseEntries || []) seedById[entry.id] = entry.seed;
    entrants = stageEntrants.map((row) => ({
      id: row.entry_id,
      seed: row.seed_in_stage != null ? row.seed_in_stage : seedById[row.entry_id],
      group_label: row.group_label,
    }));
  } else if (stage.division_id) {
    const { data: divisionEntries, error: beErr } = await db
      .from('tournament_entries')
      .select('id, seed')
      .eq('division_id', stage.division_id);
    if (beErr) return { error: { message: beErr.message, status: 500 } };
    entrants = (divisionEntries || []).map((row) => ({ id: row.id, seed: row.seed }));
  } else {
    let tournamentEntrantQuery = db.from('tournament_entrants').select('id, seed');
    if (groupId != null) tournamentEntrantQuery = tournamentEntrantQuery.eq('group_id', groupId);
    const { data: tournamentEntrants, error: teErr } = await tournamentEntrantQuery.eq('tournament_id', stage.tournament_id);
    if (teErr) return { error: { message: teErr.message, status: 500 } };
    entrants = (tournamentEntrants || []).map((row) => ({ id: row.id, seed: row.seed }));
  }

  let matchQuery = db.from('tournament_matches').select('*');
  if (groupId != null) matchQuery = matchQuery.eq('group_id', groupId);
  const { data: matches, error: mErr } = await matchQuery.eq('stage_id', stageId);
  if (mErr) return { error: { message: mErr.message, status: 500 } };
  const rawMatches = matches || [];
  let matchList = rawMatches;
  const entryIds = [...new Set(rawMatches.flatMap((match) => [match.entry_a_id, match.entry_b_id, match.winner_entry_id]).filter(Boolean))];
  if (entryIds.length) {
    const { data: matchEntries, error: matchEntriesErr } = await db
      .from('tournament_entries')
      .select('id')
      .eq('division_id', stage.division_id)
      .in('id', entryIds);
    if (matchEntriesErr) return { error: { message: matchEntriesErr.message, status: 500 } };
    const validEntryIds = new Set((matchEntries || []).map((entry) => entry.id));
    matchList = rawMatches.map((match) => ({
      ...match,
      entrant_a_id: validEntryIds.has(match.entry_a_id) ? match.entry_a_id : match.entrant_a_id,
      entrant_b_id: validEntryIds.has(match.entry_b_id) ? match.entry_b_id : match.entrant_b_id,
      winner_entrant_id: validEntryIds.has(match.winner_entry_id) ? match.winner_entry_id : match.winner_entrant_id,
      status: match.status === 'finalized' ? 'done' : match.status,
    }));
  }

  const gamesByMatchId = {};
  const matchIds = matchList.map((match) => match.id);
  if (matchIds.length) {
    let gameQuery = db.from('tournament_games').select('match_id, score_a, score_b, kind, game_no');
    if (groupId != null) gameQuery = gameQuery.eq('group_id', groupId);
    const { data: games, error: gErr } = await gameQuery.in('match_id', matchIds);
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
  // Mỗi trận resolve luật theo VÒNG của nó. Trước đây truyền stage.config gốc,
  // mà bestOf nằm ở config.scoring.engine.bestOf chứ không ở gốc, nên
  // match/simple.js rơi về mặc định 3 và giai đoạn BO1 không bao giờ có đội thắng.
  const tournament = context.tournament || {};
  const division = context.division || {};
  const configOf = (match) => {
    const resolvedScoring = resolveMatchScoring(tournament, division, stage, match);
    return {
      ...(stage.config || {}),
      ...resolvedScoring.engine,
      ...(resolvedScoring.round_source === 'stage' && !stage.config?.scoring && stage.config?.bestOf != null
        ? { bestOf: stage.config.bestOf }
        : {}),
    };
  };
  const resolved = buildResolvedMatches(matchList, gamesByMatchId, matchEngine, configOf);

  return { entrants, resolved, matches: matchList };
}

// Luật điểm được resolve theo 4 tầng (giải -> nội dung -> giai đoạn -> vòng).
// MỌI nơi nạp dữ liệu giai đoạn để tính kết quả đều phải truyền context này;
// thiếu nó thì resolveMatchScoring không thấy default_scoring.best_of và rơi về
// BO3, khiến trận BO1 bị coi là chưa xong (không có người thắng, không có
// group_label) và đường advance hỏng hoàn toàn.
async function loadScoringContext(db, stage, groupId) {
  const tourQuery = db.from('tournaments')
    .select('id, default_scoring, tiebreak_policy')
    .eq('id', stage.tournament_id);
  const divQuery = stage.division_id
    ? db.from('tournament_divisions')
      .select('id, scoring_override, tiebreak_override')
      .eq('id', stage.division_id)
    : null;

  const [tournamentResult, divisionResult] = await Promise.all([
    typeof tourQuery.maybeSingle === 'function'
      ? (groupId != null ? tourQuery.eq('group_id', groupId) : tourQuery).maybeSingle()
      : tourQuery.then((r) => ({ data: (r?.data || [])[0] || null, error: r?.error })),
    divQuery
      ? (typeof divQuery.maybeSingle === 'function'
          ? (groupId != null ? divQuery.eq('group_id', groupId) : divQuery).maybeSingle()
          : divQuery.then((r) => ({ data: (r?.data || [])[0] || null, error: r?.error })))
      : Promise.resolve({ data: null, error: null }),
  ]);
  const contextError = tournamentResult?.error || divisionResult?.error;
  if (contextError) {
    throw Object.assign(
      new Error(`Không thể đọc cấu hình tính điểm/tie-break: ${contextError.message}`),
      { status: 500, code: 'SCORING_CONTEXT_READ_FAILED', cause: contextError },
    );
  }
  return {
    tournament: tournamentResult?.data || {},
    division: divisionResult?.data || {},
  };
}

// Chính sách tie-break hiệu lực của MỘT giai đoạn, theo đúng thứ tự ưu tiên
// trong lib/tournament/rules/tiebreak.js (snapshot giai đoạn -> override nội
// dung -> chính sách giải -> legacy_v2).
//
// Engine chỉ nhìn `config.tiebreak`. Nơi duy nhất biết đủ ba tầng cấu hình là
// lớp này, nên nó phải gắn chính sách đã resolve vào config TRƯỚC khi gọi
// engine. Trước đây computeStageStandings truyền thẳng `stage.config`, nên
// tournament.tiebreak_policy và division.tiebreak_override không bao giờ tới
// được engine và BXH luôn tính theo legacy_v2.
function resolveStageTiebreak(stage, context = {}) {
  return resolveTiebreak(context.tournament || {}, context.division || {}, stage || {});
}

// Bản sao stage đã gắn chính sách hiệu lực. MỌI consumer tính BXH hoặc suất
// tiến cấp phải dùng bản sao này, để bảng xếp hạng, nhãn luật và qualifier luôn
// dùng CHUNG một chính sách.
function stageWithResolvedTiebreak(stage, context = {}) {
  const tiebreak = resolveStageTiebreak(stage, context);
  return {
    tiebreak,
    stage: { ...stage, config: { ...(stage.config || {}), tiebreak } },
  };
}

async function computeStageStandings(db, stage, groupId) {
  const context = await loadScoringContext(db, stage, groupId);
  const loaded = await loadStageData(db, stage, groupId, context);
  if (loaded.error) throw Object.assign(new Error(loaded.error.message), { status: loaded.error.status });
  const scheduleEngine = getScheduleEngine(stage.schedule_format);
  const { tiebreak, stage: effectiveStage } = stageWithResolvedTiebreak(stage, context);
  const standings = scheduleEngine.computeStandings(
    { schedule_format: stage.schedule_format, config: effectiveStage.config },
    loaded.entrants,
    loaded.resolved,
  );
  return { schedule_format: stage.schedule_format, standings, matches: loaded.matches, tiebreak };
}

module.exports = {
  loadStageData,
  loadScoringContext,
  resolveStageTiebreak,
  stageWithResolvedTiebreak,
  computeStageStandings,
};
