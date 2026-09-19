// Regression runtime: đường ADVANCE phải resolve luật điểm theo giải/nội dung.
//
// Lỗi: app/api/tournament-v2/advance/route.js gọi loadStageData(db, stage, groupId)
// KHÔNG kèm context {tournament, division}. resolveMatchScoring khi đó không thấy
// tournaments.default_scoring.best_of = 1 nên rơi về mặc định BO3. Một ván 11-5 bị
// coi là CHƯA hoàn tất -> winner_entrant_id = null -> roundRobin.computeStandings
// bỏ qua toàn bộ trận -> group_label null và rank xếp theo seed trên cả stage ->
// advance_division_group_rank_transitions từ chối với INVALID_GROUP_RANKINGS.
// Hệ quả: giải BO1 do wizard tạo KHÔNG BAO GIỜ seed được bán kết.
//
// Chạy trên hàm thật (loadStageData + loadScoringContext) với một db giả.

const assert = require('assert');
const { loadStageData, loadScoringContext } = require('../../lib/tournament/standingsService');
const roundRobin = require('../../lib/tournament/engines/roundRobin');

const STAGE = {
  id: 45, tournament_id: 52, division_id: 40,
  schedule_format: 'round_robin', match_format: 'simple',
  config: { groupCount: 2 },
};
const ENTRY_IDS = [56, 57, 58, 59, 60, 61, 62];
const STAGE_ENTRANTS = [
  { entry_id: 58, entrant_id: null, seed_in_stage: 1, group_label: 'A' },
  { entry_id: 62, entrant_id: null, seed_in_stage: 2, group_label: 'A' },
  { entry_id: 60, entrant_id: null, seed_in_stage: 3, group_label: 'A' },
  { entry_id: 57, entrant_id: null, seed_in_stage: 4, group_label: 'A' },
  { entry_id: 59, entrant_id: null, seed_in_stage: 1, group_label: 'B' },
  { entry_id: 61, entrant_id: null, seed_in_stage: 2, group_label: 'B' },
  { entry_id: 56, entrant_id: null, seed_in_stage: 3, group_label: 'B' },
];
// 9 trận, mỗi trận đúng MỘT ván 11-5 (BO1) và đã finalized.
const RAW = [
  [75, 'A', 60, 57], [77, 'A', 60, 62], [79, 'A', 60, 58],
  [76, 'A', 58, 62], [78, 'A', 57, 58], [80, 'A', 62, 57],
  [81, 'B', 59, 61], [82, 'B', 56, 61], [83, 'B', 56, 59],
].map(([id, g, a, b]) => ({
  id, group_id: 24, stage_id: 45, division_id: 40, group_label: g, round: 1,
  entry_a_id: a, entry_b_id: b, entrant_a_id: null, entrant_b_id: null,
  winner_entry_id: a, winner_entrant_id: null, status: 'finalized', version: 2,
}));

// db giả: chỉ đủ cho loadStageData + loadScoringContext.
function makeDb() {
  const build = (table) => {
    const state = { table, filters: {}, inList: null };
    const thenable = {
      select() { return thenable; },
      eq(col, val) { state.filters[col] = val; return thenable; },
      in(col, vals) { state.inList = { col, vals }; return thenable; },
      order() { return thenable; },
      maybeSingle() { return Promise.resolve({ data: rowsFor(state)[0] || null, error: null }); },
      single() { return Promise.resolve({ data: rowsFor(state)[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: rowsFor(state), error: null }).then(res, rej); },
    };
    return thenable;
  };
  const rowsFor = (s) => {
    if (s.table === 'tournament_stage_entrants') return STAGE_ENTRANTS;
    if (s.table === 'tournament_entries') return ENTRY_IDS.map((id) => ({ id, seed: id }));
    if (s.table === 'tournament_matches') return RAW;
    if (s.table === 'tournament_games') {
      return RAW.map((m) => ({ match_id: m.id, game_no: 1, kind: 'game', score_a: 11, score_b: 5, lineup: null }));
    }
    if (s.table === 'tournaments') return [{ id: 52, default_scoring: { best_of: 1 }, tiebreak_policy: {} }];
    if (s.table === 'tournament_divisions') return [{ id: 40, scoring_override: null, tiebreak_override: null }];
    if (s.table === 'tournament_round_rules') return [];
    return [];
  };
  return { from: (table) => build(table) };
}

let failed = 0;
const check = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); failed += 1; } };

(async () => {
  const db = makeDb();

  /* 1. KHÔNG có context (hành vi cũ của advance) — tái hiện lỗi. */
  {
    const loaded = await loadStageData(db, STAGE, 24);
    const withWinner = loaded.resolved.filter((m) => m.winner_entrant_id).length;
    // Đây chính là trạng thái hỏng; giữ lại để mô tả lỗi cho rõ.
    if (withWinner === 9) {
      console.log('  note: BO1 tu hoan tat ngay ca khi thieu context (mac dinh da doi)');
    }
  }

  /* 2. CÓ context (hành vi đúng) -> đủ 9 trận có winner, có group_label, rank theo bảng. */
  {
    const context = await loadScoringContext(db, STAGE, 24);
    check(context && context.tournament && context.tournament.default_scoring
      && Number(context.tournament.default_scoring.best_of) === 1,
      'loadScoringContext doc duoc default_scoring.best_of cua giai');

    const loaded = await loadStageData(db, STAGE, 24, context);
    const withWinner = loaded.resolved.filter((m) => m.winner_entrant_id).length;
    check(withWinner === 9, `co context thi ca 9 tran BO1 phai co nguoi thang (co ${withWinner})`);

    const standings = roundRobin.computeStandings(
      { schedule_format: 'round_robin', config: STAGE.config },
      loaded.entrants, loaded.resolved,
    );
    const labels = new Set(standings.map((r) => r.group_label));
    check(!labels.has(null) && labels.has('A') && labels.has('B'),
      'moi dong standings phai co group_label A/B (khong con null)');

    // Payload mà advance gui len RPC phai hop le: entry_id + group_label + rank.
    const ranked = standings.map(({ entrant_id, group_label, rank }) => ({ entry_id: entrant_id, group_label, rank }));
    const invalid = ranked.filter((r) => !/^\d+$/.test(String(r.entry_id))
      || r.group_label == null || !/^\d+$/.test(String(r.rank)));
    check(invalid.length === 0,
      `payload advance phai qua duoc kiem tra INVALID_GROUP_RANKINGS (${invalid.length} dong hong)`);

    // Hang 1 va 2 cua tung bang phai ton tai de seed SF.
    for (const label of ['A', 'B']) {
      const inGroup = standings.filter((r) => r.group_label === label).map((r) => r.rank).sort((a, b) => a - b);
      check(inGroup[0] === 1 && inGroup[1] === 2, `bang ${label} phai co hang 1 va hang 2 de seed ban ket`);
    }
  }

  if (failed) { console.error(`advance-scoring-context: ${failed} assertion(s) failed`); process.exit(1); }
  console.log('advance-scoring-context ok');
})().catch((e) => { console.error('FAIL (throw):', e.message); process.exit(1); });
