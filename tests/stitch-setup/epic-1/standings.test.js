'use strict';
// Epic 1 — Lát D1 §7: BXH loại kép (D22), khi giải đang chạy và khi đã xong; finalStandingsFrom;
// nhánh cũ của engine (không match_key) giữ nguyên.

const { assert, suite, lib } = require('../_harness');
const { dePlan, simulate } = require('./_de');

const engine = lib('lib/tournament/engines/doubleElim.js');
const { finalStandingsFrom } = lib('lib/tournament/qualification.js');
const { parseDoubleElimKey, annotateDoubleElim } = lib('lib/tournament/doubleElimKeys.js');

const entrantsOf = (plan) => plan.groups[0].entryIds.map((id, i) => ({ id, seed: i + 1 }));

suite('Epic 1 D1 — xếp hạng loại kép', {
  '8 cặp hết giải: Vô địch, Á quân, Hạng 3, Hạng 4, Hạng 5–6, Hạng 7–8'() {
    const plan = dePlan(8);
    const played = simulate(plan, (m, a) => a);
    const rows = engine.computeStandings({}, entrantsOf(plan), played);
    assert.deepEqual(rows.map((r) => r.label), ['Vô địch', 'Á quân', 'Hạng 3', 'Hạng 4', 'Hạng 5–6', 'Hạng 5–6', 'Hạng 7–8', 'Hạng 7–8']);
    const lf = played.find((m) => m.match_key === 'LF');
    assert.equal(rows[2].entrant_id, lf.winner_entrant_id === lf.entrant_a_id ? lf.entrant_b_id : lf.entrant_a_id, 'hạng 3 = thua LF');
  },

  '12 cặp: dải 9–12 cho vòng nhánh thua đầu (4 trận)'() {
    const plan = dePlan(12);
    const rows = engine.computeStandings({}, entrantsOf(plan), simulate(plan, (m, a) => a));
    const labels = rows.map((r) => r.label);
    assert.deepEqual([...new Set(labels)], ['Vô địch', 'Á quân', 'Hạng 3', 'Hạng 4', 'Hạng 5–6', 'Hạng 7–8', 'Hạng 9–12']);
  },

  'đang thi đấu: cặp chưa bị loại → Đang thi đấu, hạng đã loại không đổi về sau'() {
    const plan = dePlan(8);
    const all = simulate(plan, (m, a) => a);
    const half = all.slice(0, 7).concat(all.slice(7).map((m) => ({ ...m, status: 'pending', winner_entrant_id: null })));
    const mid = engine.computeStandings({}, entrantsOf(plan), half);
    const end = engine.computeStandings({}, entrantsOf(plan), all);
    const alive = mid.filter((r) => r.rank == null);
    assert.ok(alive.length > 0 && alive.every((r) => r.label === 'Đang thi đấu'));
    assert.ok(mid.findIndex((r) => r.rank != null) > mid.findIndex((r) => r.rank == null), 'cặp đang thi đấu đứng trên cặp đã bị loại');
    for (const row of mid.filter((r) => r.rank != null)) {
      const later = end.find((r) => r.entrant_id === row.entrant_id);
      assert.deepEqual([later.rank, later.label], [row.rank, row.label], 'hạng của cặp đã bị loại không đổi');
    }
  },

  'finalStandingsFrom: rỗng khi GF chưa xong; đủ n dòng khi xong'() {
    const plan = dePlan(6);
    const played = simulate(plan, (m, a) => a);
    const rows = engine.computeStandings({}, entrantsOf(plan), played);
    const stage = { schedule_format: 'double_elim' };
    assert.deepEqual(finalStandingsFrom(stage, rows, played.map((m) => (m.match_key === 'GF' ? { ...m, status: 'pending', winner_entrant_id: null } : m))), []);
    const final = finalStandingsFrom(stage, rows, played);
    assert.equal(final.length, 6);
    assert.deepEqual(final.slice(0, 3).map((r) => r.label), ['Vô địch', 'Á quân', 'Hạng 3']);
    assert.equal(final[0].entry_id, played.find((m) => m.match_key === 'GF').winner_entrant_id);
  },

  'advance(): trả vô địch'() {
    const plan = dePlan(4);
    const played = simulate(plan, (m, a) => a);
    const rows = engine.computeStandings({}, entrantsOf(plan), played);
    assert.deepEqual(engine.advance({}, rows), [{ entrant_id: played.find((m) => m.match_key === 'GF').winner_entrant_id, seed_in_stage: 1 }]);
  },

  'bộ đọc khóa'() {
    assert.deepEqual(parseDoubleElimKey('W1-3'), { bracket: 'W', final: false, round: 1, slot: 3 });
    assert.deepEqual(parseDoubleElimKey('LF'), { bracket: 'L', final: true, round: null, slot: null });
    assert.deepEqual(parseDoubleElimKey('GF'), { bracket: 'GF', final: true, round: null, slot: null });
    assert.equal(parseDoubleElimKey('F'), null);
    assert.equal(parseDoubleElimKey('SF1'), null);
    const annotated = annotateDoubleElim([{ match_key: 'W1-1' }, { match_key: 'WF' }, { match_key: 'L1-1' }, { match_key: 'LF' }, { match_key: 'GF' }]);
    assert.deepEqual(annotated.map((x) => `${x.bracket}${x.bracketRound}`), ['W1', 'W2', 'L1', 'L2', 'GF1']);
  },

  'nhánh cũ (không match_key) giữ hành vi engine'() {
    const matches = engine.generateSchedule({ config: {} }, [1, 2, 3, 4].map((id) => ({ id, seed: id })));
    const rows = engine.computeStandings({}, [1, 2, 3, 4].map((id) => ({ id, seed: id })), matches);
    assert.ok(rows.every((row) => row.label === undefined), 'nhánh cũ không gắn nhãn');
  },
});
