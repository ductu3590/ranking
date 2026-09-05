const assert = require('assert');
const { computeStageStandings, loadStageData } = require('../../lib/tournament/standingsService');
const { scheduleToInsertRows } = require('../../lib/tournament/persistence');

function fakeDb(fixtures, calls = []) {
  return { calls, from(table) {
    const state = { table, filters: [] };
    const query = {
      select(fields) { state.select = fields; return query; },
      eq(field, value) { state.filters.push(['eq', field, value]); return query; },
      in(field, value) { state.filters.push(['in', field, value]); return query; },
      order() { return query; },
      then(resolve, reject) {
        calls.push(state);
        const rows = (fixtures[table] || []).filter((row) => state.filters.every(([op, field, value]) => op === 'eq' ? row[field] === value : value.includes(row[field])));
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
}

(async () => {
  const fixtures = {
    tournament_stage_entrants: [],
    tournament_entries: [
      { id: 1011, division_id: 101, seed: 1 }, { id: 1012, division_id: 101, seed: 2 },
      { id: 2021, division_id: 202, seed: 1 }, { id: 2022, division_id: 202, seed: 2 },
    ],
    tournament_matches: [
      { id: 11, group_id: 7, stage_id: 11, division_id: 101, entry_a_id: 1011, entry_b_id: 1012, winner_entry_id: 1011, status: 'finalized', group_label: 'A' },
      { id: 22, group_id: 7, stage_id: 22, division_id: 202, entry_a_id: 2021, entry_b_id: 2022, winner_entry_id: 2022, status: 'finalized', group_label: 'A' },
    ],
    tournament_games: [
      { group_id: 7, match_id: 11, score_a: 11, score_b: 9, kind: 'singles', game_no: 1 },
      { group_id: 7, match_id: 22, score_a: 9, score_b: 11, kind: 'singles', game_no: 1 },
    ],
    tournament_entrants: [{ id: 999, tournament_id: 1, group_id: 7, seed: 1 }],
  };
  const calls = [];
  const db = fakeDb(fixtures, calls);
  const stageA = { id: 11, tournament_id: 1, division_id: 101, schedule_format: 'round_robin', match_format: 'simple', config: { bestOf: 1 } };
  const stageB = { id: 22, tournament_id: 1, division_id: 202, schedule_format: 'round_robin', match_format: 'simple', config: { bestOf: 1 } };
  const [standingA, standingB] = await Promise.all([computeStageStandings(db, stageA, 7), computeStageStandings(db, stageB, 7)]);
  assert.deepStrictEqual(standingA.standings.map((row) => row.entrant_id).sort((a, b) => a - b), [1011, 1012]);
  assert.deepStrictEqual(standingB.standings.map((row) => row.entrant_id).sort((a, b) => a - b), [2021, 2022]);
  assert.strictEqual(standingA.standings.find((row) => row.entrant_id === 1011).won, 1, 'division A is independent');
  assert.strictEqual(standingB.standings.find((row) => row.entrant_id === 2022).won, 1, 'division B is independent');

  const matchA = (await loadStageData(db, stageA, 7)).matches[0];
  assert.strictEqual(matchA.entry_a_id, 1011, 'match uses entry_a_id');
  assert.strictEqual(matchA.entry_b_id, 1012, 'match uses entry_b_id');
  assert.strictEqual(matchA.winner_entry_id, 1011, 'match uses winner_entry_id');
  assert(calls.some((call) => call.table === 'tournament_entries' && call.filters.some(([op, field, value]) => op === 'eq' && field === 'division_id' && value === 101)), 'entries are filtered by division_id');
  assert(!calls.some((call) => call.table === 'tournament_entrants'), 'division path does not use legacy entrants');

  const legacyCalls = [];
  const legacyDb = fakeDb({ tournament_stage_entrants: [], tournament_entries: [], tournament_matches: [], tournament_games: [], tournament_entrants: [{ id: 77, tournament_id: 1, group_id: 7, seed: 1 }] }, legacyCalls);
  await computeStageStandings(legacyDb, { id: 33, tournament_id: 1, division_id: null, schedule_format: 'round_robin', match_format: 'simple', config: {} }, 7);
  assert(legacyCalls.some((call) => call.table === 'tournament_entrants'), 'legacy fallback only runs without division_id');

  const rows = scheduleToInsertRows([{ round: 1, bracket_slot: null, group_label: 'A', order: 0, entrant_a_id: 1011, entrant_b_id: 1012 }], { stageId: 11, groupId: 7, divisionId: 101, entryBased: true });
  assert.strictEqual(rows[0].entry_a_id, 1011);
  assert.strictEqual(rows[0].entry_b_id, 1012);
  assert(!('entrant_a_id' in rows[0]) && !('entrant_b_id' in rows[0]), 'entry schedule does not write legacy columns');
  console.log('Phase 3 Task 3 division-entry convergence integration contract: PASS');
})().catch((error) => { console.error(error); process.exit(1); });
