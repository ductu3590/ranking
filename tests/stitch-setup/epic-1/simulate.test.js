'use strict';
// Epic 1 — Lát D1 §9: chơi hết giải bằng định tuyến kiểu RPC 068, kiểm luật "thua hai trận mới bị
// loại", số trận thực đá và BXH chung cuộc (D22) cho mọi n = 4..32.

const { assert, suite, lib } = require('../_harness');
const { dePlan, simulate, randomPicker } = require('./_de');

const engine = lib('lib/tournament/engines/doubleElim.js');

function losses(played) {
  const count = new Map();
  for (const m of played) {
    const loser = m.winner_entrant_id === m.entrant_a_id ? m.entrant_b_id : m.entrant_a_id;
    count.set(loser, (count.get(loser) || 0) + 1);
  }
  return count;
}

function expectedPlacements(plan) {
  // Hạng 1, 2 rồi mỗi vòng nhánh thua (từ cuối về đầu) một dải đồng hạng dài bằng số trận vòng đó.
  const perRound = new Map();
  for (const m of plan.matches.filter((x) => x.bracket === 'L')) perRound.set(m.bracketRound, (perRound.get(m.bracketRound) || 0) + 1);
  const bands = [[1, 1], [2, 2]];
  let next = 3;
  for (const round of [...perRound.keys()].sort((a, b) => b - a)) {
    bands.push([next, next + perRound.get(round) - 1]);
    next += perRound.get(round);
  }
  return bands;
}

suite('Epic 1 D1 — chơi hết giải', {
  'n = 4..32 × 3 seed: đủ 2n−2 trận, mỗi cặp bị loại sau đúng 2 trận thua, BXH phủ 1..n'() {
    for (let n = 4; n <= 32; n += 1) {
      for (const seed of [1, 2, 3]) {
        const plan = dePlan(n, { seed: `sim-${seed}` });
        const played = simulate(plan, randomPicker(n * 100 + seed));
        assert.equal(played.length, 2 * n - 2, `n=${n}`);
        const gf = played.find((m) => m.match_key === 'GF');
        const champion = gf.winner_entrant_id;
        const lost = losses(played);
        const ids = plan.groups[0].entryIds;
        for (const id of ids) {
          const count = lost.get(id) || 0;
          if (id === champion) assert.ok(count <= 1, `n=${n}: vô địch thua ${count} trận`);
          else if (id === (gf.winner_entrant_id === gf.entrant_a_id ? gf.entrant_b_id : gf.entrant_a_id)) assert.ok(count === 1 || count === 2, `n=${n}: á quân thua ${count}`);
          else assert.equal(count, 2, `n=${n}: ${id} bị loại sau ${count} trận thua`);
        }

        const rows = engine.computeStandings({ config: {} }, ids.map((id, i) => ({ id, seed: i + 1 })), played);
        assert.equal(rows.length, n);
        assert.ok(rows.every((row) => row.rank != null), 'hết giải: ai cũng có hạng');
        assert.equal(rows[0].entrant_id, champion);
        assert.equal(rows[0].label, 'Vô địch');
        assert.equal(rows[1].label, 'Á quân');
        const bands = expectedPlacements(plan);
        const got = [...new Set(rows.map((row) => `${row.rank}-${row.placement_end}`))];
        assert.deepEqual(got, bands.map(([s, e]) => `${s}-${e}`), `n=${n}: dải hạng`);
        for (const [start, end] of bands) {
          assert.equal(rows.filter((row) => row.rank === start).length, end - start + 1, `n=${n}: hạng ${start}–${end} đủ số cặp`);
        }
        assert.equal(rows[2].label, 'Hạng 3');
        assert.equal(rows[3].label, 'Hạng 4');
      }
    }
  },

  'cặp từ nhánh thua thắng GF → vẫn là vô địch (không đá lại, D14)'() {
    const plan = dePlan(8);
    const played = simulate(plan, (match, a, b) => (match.matchKey === 'GF' ? b : a));
    const gf = played.find((m) => m.match_key === 'GF');
    const rows = engine.computeStandings({ config: {} }, plan.groups[0].entryIds.map((id) => ({ id })), played);
    assert.equal(rows[0].entrant_id, gf.entrant_b_id);
    assert.equal(played.length, 14, 'không phát sinh trận GF2');
  },
});
