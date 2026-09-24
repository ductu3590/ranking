'use strict';
// View model mục "Điều hành" (spec Epic 2, Lát E1 §4). Thuần, không I/O: route GET /operations tải dữ liệu
// rồi gọi buildOperationsBoard. Chỉ trả tên cặp đang hiển thị + id/version cần cho thao tác.

const { matchLabel, matchGroupKey, slotSourceLabel } = require('./matchLabels');
const { resolveMatchScoring } = require('./rules/roundScoring');
const { projectSchedule, averageMatchMinutes } = require('./courtBoard');
const { matchElapsed } = require('./matchLifecycle');

const RUNNING = new Set(['warmup', 'live', 'paused']);
const RECENT_LIMIT = 5;

function idKey(value) {
  return value === null || value === undefined ? '' : String(value);
}

function byOrder(stageOrder) {
  return (left, right) => (stageOrder.get(idKey(left.stage_id)) ?? 0) - (stageOrder.get(idKey(right.stage_id)) ?? 0)
    || (Number(left.round) || 0) - (Number(right.round) || 0)
    || (Number(left.match_order) || 0) - (Number(right.match_order) || 0)
    || (Number(left.id) || 0) - (Number(right.id) || 0);
}

// Điểm cặp thắng đứng trước ("X thắng 15–14, 11–15, 15–13") — đọc theo A–B khi B thắng thành ngược nghĩa.
function scoreText(games, winnerSide = 'a') {
  return (games || [])
    .filter((game) => game.kind !== 'dreambreaker')
    .sort((left, right) => (Number(left.game_no) || 0) - (Number(right.game_no) || 0))
    .map((game) => {
      const a = Number(game.score_a) || 0;
      const b = Number(game.score_b) || 0;
      return winnerSide === 'b' ? `${b}–${a}` : `${a}–${b}`;
    })
    .join(', ');
}

function stageKey(stage) {
  return `${idKey(stage.division_id)}`;
}

// Việc cần làm tiếp của cả giải khi mọi trận của một chặng đã chốt (D35, nghiệm thu Epic 2):
//   advance  — chặng có chặng sau (vòng bảng → loại trực tiếp): chốt BXH, điền cặp đi tiếp.
//   finish   — chặng cuối vừa xong: chốt chặng + chuyển giải sang "Đã kết thúc".
//   complete — mọi chặng đã chốt nhưng giải chưa "Đã kết thúc" (giải cũ trước E1.1).
// Cùng điều kiện với nút ở "Sơ đồ & xếp hạng" (StandingsTab) để hai lối vào không lệch nhau.
function stageActionOf(tournament, stages, matchesByStage) {
  if (!stages.length || ['completed', 'archived', 'draft'].includes(tournament.status)) return null;
  const ordered = [...stages].sort((left, right) => (Number(left.stage_order) || 0) - (Number(right.stage_order) || 0));
  for (const stage of ordered) {
    if (stage.status === 'completed') continue;
    const list = matchesByStage.get(idKey(stage.id)) || [];
    if (!list.length || list.some((match) => match.status !== 'finalized')) continue;
    const next = ordered.find((other) => other.id !== stage.id && stageKey(other) === stageKey(stage)
      && Number(other.stage_order) > Number(stage.stage_order));
    const format = stage.schedule_format;
    const v4 = String(stage.config?.setupPlanVersion) === '4';
    const base = { stageId: stage.id, stageName: stage.name || 'Giai đoạn', tournamentStatus: tournament.status || null };
    if (next) {
      if (format !== 'round_robin') continue;
      return { kind: 'advance', ...base, nextStageId: next.id, nextStageName: next.name || 'vòng sau' };
    }
    if (format === 'round_robin' || ((format === 'knockout' || format === 'double_elim') && v4)) {
      return { kind: 'finish', ...base, format };
    }
  }
  if (ordered.every((stage) => stage.status === 'completed') && tournament.status !== 'completed') {
    const last = ordered[ordered.length - 1];
    return { kind: 'complete', stageId: last.id, stageName: last.name || 'Giai đoạn', tournamentStatus: tournament.status || null, format: last.schedule_format };
  }
  return null;
}

function buildOperationsBoard(input = {}, { now = Date.now() } = {}) {
  const tournament = input.tournament || {};
  const stages = input.stages || [];
  const matches = input.matches || [];
  const courts = [...(input.courts || [])].sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'vi', { numeric: true }));
  const assignments = input.assignments || [];
  const transitions = input.transitions || [];
  const gamesByMatchId = input.gamesByMatchId || {};
  const settings = { matchMinutes: 22, warmupMinutes: 4, ...(input.settings || {}) };

  const divisionById = new Map((input.divisions || []).map((division) => [idKey(division.id), division]));
  const stageById = new Map(stages.map((stage) => [idKey(stage.id), stage]));
  const stageOrder = new Map(stages.map((stage, index) => [idKey(stage.id), Number(stage.stage_order ?? index)]));
  const entryName = new Map((input.entries || []).map((entry) => [idKey(entry.id), entry.name || entry.name_snapshot || 'Cặp chưa đặt tên']));
  const courtById = new Map(courts.map((court) => [idKey(court.id), court]));
  const assignmentByMatch = new Map(assignments.map((assignment) => [idKey(assignment.match_id), assignment]));
  const matchesByStage = new Map();
  for (const match of matches) {
    const key = idKey(match.stage_id);
    if (!matchesByStage.has(key)) matchesByStage.set(key, []);
    matchesByStage.get(key).push(match);
  }

  const titleById = {};
  const groupById = {};
  for (const match of matches) {
    const stageMatches = matchesByStage.get(idKey(match.stage_id)) || [];
    titleById[idKey(match.id)] = matchLabel({ match, stageMatches });
    groupById[idKey(match.id)] = matchGroupKey(match, stageMatches);
  }
  const plainTitles = Object.fromEntries(Object.entries(titleById).map(([id, label]) => [id, label.title]));

  const incoming = new Map();
  const winnerTarget = new Map();
  for (const edge of transitions) {
    if (edge.target_match_id != null) incoming.set(`${idKey(edge.target_match_id)}:${edge.target_slot}`, edge);
    if (edge.source_kind === 'match_outcome' && edge.source_outcome === 'winner' && edge.source_match_id != null) {
      winnerTarget.set(idKey(edge.source_match_id), idKey(edge.target_match_id));
    }
  }

  const running = matches.filter((match) => RUNNING.has(match.status));
  const busyEntries = new Map();
  for (const match of running) {
    const courtLabel = courtLabelOf(match);
    for (const entryId of [match.entry_a_id, match.entry_b_id]) {
      if (entryId != null) busyEntries.set(idKey(entryId), courtLabel);
    }
  }

  function courtLabelOf(match) {
    const assignment = assignmentByMatch.get(idKey(match.id));
    const court = assignment && assignment.court_id != null ? courtById.get(idKey(assignment.court_id)) : null;
    return (court && court.label) || match.court || null;
  }

  function side(match, slot) {
    const entryId = slot === 'a' ? match.entry_a_id : match.entry_b_id;
    if (entryId != null) return { entryId, name: entryName.get(idKey(entryId)) || 'Cặp chưa đặt tên' };
    return { entryId: null, source: slotSourceLabel(incoming.get(`${idKey(match.id)}:${slot}`), plainTitles) };
  }

  function rule(match) {
    const stage = stageById.get(idKey(match.stage_id)) || {};
    const scoring = resolveMatchScoring(tournament, divisionById.get(idKey(stage.division_id)) || {}, stage, match);
    return { bestOf: Number(scoring.best_of), pointsTo: Number(scoring.points_to), winBy: Number(scoring.win_by), cap: scoring.cap == null ? null : Number(scoring.cap) };
  }

  function view(match) {
    const label = titleById[idKey(match.id)];
    const target = winnerTarget.get(idKey(match.id));
    return {
      id: match.id,
      version: match.version,
      status: match.status,
      stageId: match.stage_id,
      stageName: (stageById.get(idKey(match.stage_id)) || {}).name || null,
      title: label.title,
      code: label.code,
      rule: rule(match),
      a: side(match, 'a'),
      b: side(match, 'b'),
      court: courtLabelOf(match),
      winnerTo: target ? plainTitles[target] || null : null,
      resultType: match.result_type || 'simple',
      warmupStartedAt: match.warmup_started_at || null,
      startedAt: match.started_at || null,
      endedAt: match.ended_at || null,
    };
  }

  // Hàng chờ: trận chưa gọi, theo giai đoạn → lượt → thứ tự lịch.
  const pending = matches.filter((match) => match.status === 'pending').sort(byOrder(stageOrder));
  const runningByCourt = {};
  for (const match of running) {
    const assignment = assignmentByMatch.get(idKey(match.id));
    if (assignment && assignment.court_id != null) runningByCourt[assignment.court_id] = match;
  }
  const projection = projectSchedule({
    courts,
    runningByCourt,
    queue: pending.map((match) => {
      const assignment = assignmentByMatch.get(idKey(match.id));
      return { id: match.id, locked_start: assignment && assignment.locked ? assignment.scheduled_start : null };
    }),
    matchMinutes: settings.matchMinutes,
    now,
  });

  const queueItems = pending.map((match) => {
    const item = view(match);
    const busyCourt = [match.entry_a_id, match.entry_b_id].map((id) => busyEntries.get(idKey(id))).find((value) => value !== undefined);
    let readiness = 'ready';
    if (match.entry_a_id == null || match.entry_b_id == null) readiness = 'waiting';
    else if (busyCourt !== undefined) readiness = 'busy';
    const assignment = assignmentByMatch.get(idKey(match.id));
    return {
      ...item,
      readiness,
      busyCourt: readiness === 'busy' ? busyCourt || 'sân khác' : null,
      assignedCourtId: assignment && assignment.court_id != null ? assignment.court_id : null,
      projectedStart: projection.byMatchId[match.id] ? new Date(projection.byMatchId[match.id]).toISOString() : null,
      lockedStart: assignment && assignment.locked ? assignment.scheduled_start || null : null,
    };
  });

  const queueGroups = [];
  const groupIndex = new Map();
  for (const item of queueItems) {
    const source = matches.find((match) => match.id === item.id);
    const key = `${idKey(item.stageId)}:${Number(source.round) || 0}`;
    if (!groupIndex.has(key)) {
      groupIndex.set(key, queueGroups.length);
      queueGroups.push({ key, stageId: item.stageId, stageName: item.stageName, round: Number(source.round) || 0, titles: new Set(), matches: [] });
    }
    const group = queueGroups[groupIndex.get(key)];
    group.titles.add(groupById[idKey(item.id)].title);
    group.matches.push(item);
  }
  const queue = queueGroups.map(({ titles, ...group }) => ({
    ...group,
    label: titles.size === 1 ? [...titles][0] : `Lượt ${group.round}`,
  }));

  // Thẻ sân + gợi ý trận kế tiếp (không trùng giữa các sân; ưu tiên trận đã gán sẵn cho sân đó).
  const suggested = new Set();
  const courtCards = courts.map((court) => {
    const current = running.find((match) => {
      const assignment = assignmentByMatch.get(idKey(match.id));
      return assignment && idKey(assignment.court_id) === idKey(court.id);
    }) || null;
    let state = 'idle';
    if (current) state = current.status;
    else if (court.active === false) state = 'off';
    let suggestion = null;
    if (state === 'idle') {
      const ready = queueItems.filter((item) => item.readiness === 'ready' && !suggested.has(item.id));
      suggestion = ready.find((item) => idKey(item.assignedCourtId) === idKey(court.id))
        || ready.find((item) => item.assignedCourtId == null)
        || null;
      if (suggestion) suggested.add(suggestion.id);
    }
    const elapsed = current ? matchElapsed(current, now, { warmupMinutes: settings.warmupMinutes }) : null;
    return {
      id: court.id,
      label: court.label,
      active: court.active !== false,
      surface: court.surface || null,
      state,
      match: current ? view(current) : null,
      clock: elapsed
        ? (current.status === 'warmup'
          ? { kind: 'countdown', seconds: elapsed.countdownSeconds }
          : { kind: 'elapsed', seconds: elapsed.seconds })
        : null,
      suggestion,
    };
  });

  const recent = matches
    .filter((match) => match.status === 'finalized')
    .sort((left, right) => {
      const l = left.ended_at ? Date.parse(left.ended_at) : -Infinity;
      const r = right.ended_at ? Date.parse(right.ended_at) : -Infinity;
      return r - l || (Number(right.id) || 0) - (Number(left.id) || 0);
    })
    .slice(0, RECENT_LIMIT)
    .map((match) => {
      const winnerId = match.winner_entry_id ?? match.winner_entrant_id ?? null;
      const winnerSide = winnerId != null && idKey(winnerId) === idKey(match.entry_b_id) ? 'b' : 'a';
      const loserId = winnerSide === 'b' ? match.entry_a_id : match.entry_b_id;
      return {
        ...view(match),
        winnerEntryId: winnerId,
        winnerName: winnerId != null ? entryName.get(idKey(winnerId)) || null : null,
        loserName: loserId != null ? entryName.get(idKey(loserId)) || null : null,
        scoreText: scoreText(gamesByMatchId[idKey(match.id)] || gamesByMatchId[match.id], winnerSide),
      };
    });

  // Mục "Trận đấu" (spec E2 §1, Stitch OPS-04): mọi trận, nhóm theo giai đoạn → matchGroupKey (theo match_key:
  // Tranh hạng ba luôn là nhóm riêng). Tỉ số theo thứ tự A–B như hai cặp hiển thị trên dòng.
  const queueById = new Map(queueItems.map((item) => [idKey(item.id), item]));
  const scheduleGroups = [];
  const scheduleIndex = new Map();
  for (const match of [...matches].sort(byOrder(stageOrder))) {
    const stageMatches = matchesByStage.get(idKey(match.stage_id)) || [];
    const group = matchGroupKey(match, stageMatches);
    const key = `${idKey(match.stage_id)}:${group.key}`;
    if (!scheduleIndex.has(key)) {
      scheduleIndex.set(key, scheduleGroups.length);
      scheduleGroups.push({ key, stageId: match.stage_id, stageName: (stageById.get(idKey(match.stage_id)) || {}).name || null, title: group.title, order: group.order, matches: [] });
    }
    const games = (gamesByMatchId[idKey(match.id)] || gamesByMatchId[match.id] || [])
      .filter((game) => game.kind !== 'dreambreaker')
      .sort((left, right) => (Number(left.game_no) || 0) - (Number(right.game_no) || 0))
      .map((game) => ({ a: Number(game.score_a) || 0, b: Number(game.score_b) || 0 }));
    const winnerId = match.winner_entry_id ?? match.winner_entrant_id ?? null;
    const queued = queueById.get(idKey(match.id));
    scheduleGroups[scheduleIndex.get(key)].matches.push({
      ...view(match),
      games,
      winnerSide: winnerId == null ? null : idKey(winnerId) === idKey(match.entry_a_id) ? 'a' : idKey(winnerId) === idKey(match.entry_b_id) ? 'b' : null,
      readiness: queued ? queued.readiness : null,
      busyCourt: queued ? queued.busyCourt : null,
      projectedStart: queued ? queued.projectedStart : null,
      round: Number(match.round) || null,
      slot: match.bracket_slot == null ? null : Number(match.bracket_slot),
    });
  }
  const stageRank = (stageId) => stageOrder.get(idKey(stageId)) ?? 0;
  const schedule = scheduleGroups
    .sort((left, right) => stageRank(left.stageId) - stageRank(right.stageId) || left.order - right.order)
    .map(({ order, ...group }) => ({
      ...group,
      counts: {
        total: group.matches.length,
        finalized: group.matches.filter((item) => item.status === 'finalized').length,
        running: group.matches.filter((item) => RUNNING.has(item.status)).length,
      },
    }));

  return {
    progress: {
      total: matches.length,
      finalized: matches.filter((match) => match.status === 'finalized').length,
      finishAt: projection.finishAt ? new Date(projection.finishAt).toISOString() : null,
      averageMatchMinutes: averageMatchMinutes(matches),
      activeCourts: courts.filter((court) => court.active !== false).length,
      busyCourts: courtCards.filter((court) => court.match).length,
    },
    tournamentStatus: tournament.status || null,
    stageAction: stageActionOf(tournament, stages, matchesByStage),
    stages: [...stages]
      .sort((left, right) => (Number(left.stage_order) || 0) - (Number(right.stage_order) || 0))
      .map((stage) => ({ id: stage.id, name: stage.name || 'Giai đoạn', format: stage.schedule_format || null, status: stage.status || null })),
    settings: { matchMinutes: settings.matchMinutes, warmupMinutes: settings.warmupMinutes },
    courts: courtCards,
    queue,
    recent,
    schedule,
  };
}

module.exports = { buildOperationsBoard };
