'use strict';
// Epic 1 — Lát D1 §4/§9: cấu trúc loại kép cho 4–32 cặp (bye, thu gọn nhánh thua, chống gặp lại).

const { assert, suite, lib } = require('../_harness');
const { dePlan, pairIdsOf } = require('./_de');

const { buildSetupPlan } = lib('lib/tournament/setupPlans');
const { nextPowerOfTwo } = lib('lib/tournament/seeding');

const KEY_RE = /^(W\d+-\d+|WF|L\d+-\d+|LF|GF)$/;
const RANGE = Array.from({ length: 29 }, (_, i) => i + 4); // 4..32

const bracketOf = (key) => (key === 'GF' ? 'GF' : key[0]);

function checkStructure(plan, n) {
  const byKey = new Map(plan.matches.map((m) => [m.matchKey, m]));
  const B = nextPowerOfTwo(n);
  assert.equal(plan.matches.length, 2 * n - 2, `n=${n}: 2n−2 trận`);
  assert.equal(plan.counts.total, 2 * n - 2);
  assert.equal(plan.matches.filter((m) => m.bracket === 'W').length, n - 1, `n=${n}: nhánh thắng n−1`);
  assert.equal(plan.matches.filter((m) => m.bracket === 'L').length, n - 2, `n=${n}: nhánh thua n−2`);
  assert.equal(plan.matches.filter((m) => m.bracket === 'GF').length, 1);
  assert.equal(byKey.size, plan.matches.length, 'matchKey duy nhất');
  for (const key of ['WF', 'LF', 'GF']) assert.ok(byKey.has(key), `n=${n}: có ${key}`);
  for (const m of plan.matches) {
    assert.ok(KEY_RE.test(m.matchKey), `khóa lạ ${m.matchKey}`);
    assert.equal(bracketOf(m.matchKey), m.bracket);
    assert.equal(m.stageKind, 'knockout');
  }
  assert.deepEqual(plan.matches.map((m) => m.order), plan.matches.map((_, i) => i + 1), 'order liền 1..2n−2');

  // Mỗi ô: hoặc có cặp, hoặc đúng một tuyến → không trận một bên.
  for (const m of plan.matches) {
    for (const [side, field] of [['a', 'entryAId'], ['b', 'entryBId']]) {
      const edges = plan.progressions.filter((p) => p.targetMatchKey === m.matchKey && p.targetSlot === side);
      assert.equal((m[field] ? 1 : 0) + edges.length, 1, `n=${n} ${m.matchKey}.${side}: đúng một nguồn`);
    }
  }
  // Cặp: mỗi cặp đúng một lần, chỉ ở nhánh thắng; bye vào thẳng W vòng 2.
  const placed = plan.matches.flatMap((m) => [m.entryAId, m.entryBId].filter(Boolean).map((id) => ({ id, m })));
  assert.equal(placed.length, n);
  assert.equal(new Set(placed.map((x) => x.id)).size, n);
  assert.ok(placed.every((x) => x.m.bracket === 'W'), 'cặp chỉ xuất hiện ở nhánh thắng');
  assert.equal(plan.byeEntryIds.length, B - n, `n=${n}: bye = B − n`);
  for (const id of plan.byeEntryIds) {
    const home = placed.find((x) => x.id === id).m;
    assert.ok(home.matchKey === 'WF' || /^W2-/.test(home.matchKey), `bye ${id} phải vào W vòng 2 (${home.matchKey})`);
  }
  assert.deepEqual(plan.warnings, B > n ? ['DOUBLE_ELIM_BYE'] : []);

  // Tuyến.
  for (const edge of plan.progressions) {
    const src = byKey.get(edge.source.matchKey);
    const dst = byKey.get(edge.targetMatchKey);
    assert.ok(src && dst, 'tuyến trỏ trận có thật');
    assert.equal(edge.source.kind, 'match_outcome');
    assert.ok(src.round < dst.round, `${src.matchKey}@${src.round} → ${dst.matchKey}@${dst.round}: phải tới lượt sau`);
    if (edge.source.outcome === 'loser') {
      assert.equal(src.bracket, 'W', 'cạnh thua chỉ từ nhánh thắng');
      assert.equal(dst.bracket, 'L', 'cạnh thua chỉ vào nhánh thua');
    } else if (src.matchKey === 'WF' || src.matchKey === 'LF') {
      assert.equal(dst.matchKey, 'GF');
    } else {
      assert.equal(dst.bracket, src.bracket, `${src.matchKey} thắng phải ở lại nhánh`);
    }
  }
  for (const m of plan.matches) {
    const out = (outcome) => plan.progressions.filter((p) => p.source.matchKey === m.matchKey && p.source.outcome === outcome).length;
    assert.equal(out('winner'), m.matchKey === 'GF' ? 0 : 1, `${m.matchKey}: cạnh thắng đi ra`);
    assert.equal(out('loser'), m.bracket === 'W' ? 1 : 0, `${m.matchKey}: cạnh thua đi ra`);
  }
  const gfIn = plan.progressions.filter((p) => p.targetMatchKey === 'GF');
  assert.deepEqual(gfIn.map((p) => `${p.source.matchKey}:${p.source.outcome}->${p.targetSlot}`).sort(), ['LF:winner->b', 'WF:winner->a']);
}

// Từ trận L đích, những trận L có thể "chảy" tới nó qua cạnh thắng (kể cả chính nó).
function lineageOf(plan, key, side) {
  const found = new Set();
  const walk = (targetKey, targetSide) => {
    for (const edge of plan.progressions) {
      if (edge.targetMatchKey !== targetKey || (targetSide && edge.targetSlot !== targetSide)) continue;
      const src = edge.source.matchKey;
      if (edge.source.outcome === 'loser') { found.add(`drop:${src}`); continue; }
      if (src.startsWith('L')) walk(src, null);
    }
  };
  walk(key, side);
  return found;
}

suite('Epic 1 D1 — plan loại kép', {
  'n = 4..32: cấu trúc, bye, tuyến, không trận một bên'() {
    for (const n of RANGE) checkStructure(dePlan(n), n);
  },

  'nhiều seed: cấu trúc vẫn đúng (vị trí bye đổi theo bốc thăm)'() {
    for (const n of [5, 6, 7, 11, 13, 19, 27]) for (const seed of ['a', 'b', 'c']) checkStructure(dePlan(n, { seed }), n);
  },

  'số trận bị thu gọn = số bye; bảng ca nghiệm thu README'() {
    const expect = { 4: [0, 6], 5: [3, 8], 6: [2, 10], 7: [1, 12], 8: [0, 14], 12: [4, 22], 16: [0, 30], 17: [15, 32], 32: [0, 62] };
    for (const [n, [byes, total]] of Object.entries(expect)) {
      const plan = dePlan(Number(n));
      assert.equal(plan.byeEntryIds.length, byes, `n=${n}`);
      assert.equal(plan.counts.total, total, `n=${n}`);
      assert.equal((nextPowerOfTwo(Number(n)) - 2) - plan.counts.losers, byes, `n=${n}: L bị bỏ = bye`);
    }
  },

  'ca 14 VĐV (7 cặp): W 6 · L 5 · GF 1 = 12 trận, 1 bye'() {
    const plan = dePlan(7);
    assert.deepEqual([plan.counts.winners, plan.counts.losers, plan.counts.grandFinal, plan.counts.total], [6, 5, 1, 12]);
    assert.equal(plan.byeEntryIds.length, 1);
  },

  'chống gặp lại (D23): người thua W vòng r ≥ 2 không gặp ngay cặp mình vừa loại, trừ LF'() {
    for (const n of [8, 16, 32, 12, 24]) {
      const plan = dePlan(n);
      const byKey = new Map(plan.matches.map((m) => [m.matchKey, m]));
      for (const drop of plan.progressions.filter((p) => p.source.outcome === 'loser')) {
        const wMatch = byKey.get(drop.source.matchKey);
        if (/^W1-/.test(wMatch.matchKey)) continue;
        if (drop.targetMatchKey === 'LF') continue;
        // Trận W nguồn của wMatch (vòng trước): người thua của chúng là cặp bị người thua wMatch loại.
        const children = plan.progressions.filter((p) => p.targetMatchKey === wMatch.matchKey && p.source.outcome === 'winner').map((p) => p.source.matchKey);
        const otherSide = drop.targetSlot === 'a' ? 'b' : 'a';
        const lineage = lineageOf(plan, drop.targetMatchKey, otherSide);
        for (const child of children) {
          assert.equal(lineage.has(`drop:${child}`), false, `n=${n}: thua ${wMatch.matchKey} → ${drop.targetMatchKey} có thể gặp lại cặp thua ${child}`);
        }
      }
    }
  },

  'deterministic theo seed; khác seed → khác vị trí'() {
    assert.equal(dePlan(11).fingerprint, dePlan(11).fingerprint);
    assert.notEqual(dePlan(11, { seed: 'x' }).fingerprint, dePlan(11, { seed: 'y' }).fingerprint);
  },

  'stage + BO: double_elim, không reset, match_scoring chỉ GF (D14)'() {
    const bo1 = dePlan(8);
    assert.equal(bo1.stages.length, 1);
    assert.equal(bo1.stages[0].scheduleFormat, 'double_elim');
    assert.equal(bo1.stages[0].config.grandFinalReset, false);
    assert.equal(bo1.stages[0].config.setupPlanVersion, 4);
    assert.equal(bo1.stages[0].config.scoring.best_of, 1);
    assert.equal(bo1.stages[0].config.match_scoring, undefined);
    const bo3 = dePlan(8, { finalBestOf: 3 });
    assert.deepEqual(bo3.stages[0].config.match_scoring, { GF: { best_of: 3 } });
    assert.equal(bo3.finalBestOf, 3);
    assert.deepEqual(bo3.groups, [{ label: null, stagePlanKey: 'double-elim', entryIds: bo3.groups[0].entryIds }]);
    assert.equal(bo3.groups[0].entryIds.length, 8);
  },

  'tên (D21): roundLabel, title, nhãn ô chờ'() {
    const plan = dePlan(8);
    const byKey = new Map(plan.matches.map((m) => [m.matchKey, m]));
    assert.equal(byKey.get('WF').roundLabel, 'Chung kết nhánh thắng');
    assert.equal(byKey.get('WF').title, 'Chung kết nhánh thắng');
    assert.equal(byKey.get('W2-1').roundLabel, 'Bán kết nhánh thắng');
    assert.equal(byKey.get('W1-1').roundLabel, 'Nhánh thắng · Vòng 1');
    assert.equal(byKey.get('L1-1').roundLabel, 'Nhánh thua · Vòng 1');
    assert.equal(byKey.get('LF').roundLabel, 'Chung kết nhánh thua');
    assert.equal(byKey.get('GF').title, 'Chung kết tổng');
    assert.match(byKey.get('W1-1').title, /^Trận \d+$/);
    assert.deepEqual(byKey.get('GF').slotA, { kind: 'progression', label: 'Thắng chung kết nhánh thắng' });
    assert.deepEqual(byKey.get('GF').slotB, { kind: 'progression', label: 'Thắng chung kết nhánh thua' });
    assert.equal(byKey.get('LF').slotB.label, 'Thua chung kết nhánh thắng');
    assert.match(byKey.get('L1-1').slotA.label, /^Thua trận \d+$/);
  },

  'n = 5: mất trọn vòng L1 engine, nhánh thua đánh số lại từ 1'() {
    const plan = dePlan(5);
    const rounds = [...new Set(plan.matches.filter((m) => m.bracket === 'L').map((m) => m.bracketRound))].sort();
    assert.deepEqual(rounds, rounds.map((_, i) => i + 1), 'vòng nhánh thua liền nhau');
    assert.equal(plan.losersRounds, rounds.length);
  },

  'từ chối: < 4 cặp, > 32 cặp, cặp trùng, chưa bốc thăm'() {
    const build = (ids, seed = 's') => () => buildSetupPlan({ formatKey: 'double_elimination', config: {}, pairIds: ids, seed });
    assert.throws(build(pairIdsOf(3)), (e) => e.code === 'PAIR_COUNT_BELOW_MINIMUM');
    assert.throws(build(pairIdsOf(33)), (e) => e.code === 'PAIR_COUNT_ABOVE_MAXIMUM');
    assert.throws(build(['a', 'b', 'c', 'a']), (e) => e.code === 'DUPLICATE_ENTRY_ID');
    assert.throws(build(pairIdsOf(4), null), (e) => e.code === 'DRAW_SEED_REQUIRED');
  },
});
