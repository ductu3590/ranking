'use strict';

// Hồi quy (phát hiện khi chạy thật Lát B): tournaments.default_scoring mặc định là {} và
// resolveStageScoring coi {} là có giá trị → best_of 3. Stage v4 phải tự mang luật BO1.
const { assert, lib, read, suite } = require('../_harness');
const { buildSetupPlan } = lib('lib/tournament/setupPlans/index.js');
const { resolveMatchScoring } = lib('lib/tournament/rules/roundScoring.js');
const { STAGE_SCORING } = lib('lib/tournament/setupPlans/common.js');

const pairIds = (n) => Array.from({ length: n }, (_, i) => `pair_${String(i + 1).padStart(2, '0')}`);
const TOURNAMENT = { default_scoring: {} };

function bestOfByMatch(plan) {
  const stages = new Map(plan.stages.map((stage) => [stage.planKey, { schedule_format: stage.scheduleFormat, config: stage.config }]));
  return plan.matches.map((match) => ({
    key: match.matchKey,
    bestOf: resolveMatchScoring(TOURNAMENT, {}, stages.get(match.stagePlanKey), { round: match.round, match_key: match.matchKey }).best_of,
  }));
}

suite('stage v4 — luật điểm chốt theo plan, không phụ thuộc default_scoring rỗng', {
  'vòng tròn: mọi trận BO1'() {
    const plan = buildSetupPlan({ formatKey: 'round_robin', config: {}, pairIds: pairIds(5), seed: 's', divisionId: '9' });
    assert.ok(bestOfByMatch(plan).every((row) => row.bestOf === 1));
    assert.equal(plan.stages[0].config.scoring.best_of, 1);
  },

  'vòng bảng → loại trực tiếp: chỉ chung kết theo BO đã chọn, còn lại BO1'() {
    for (const finalBestOf of [1, 3, 5]) {
      const plan = buildSetupPlan({ formatKey: 'group_knockout', config: { groupCount: 2, qualifiersPerGroup: 2, finalBestOf, thirdPlaceEnabled: true }, pairIds: pairIds(8), seed: 's', divisionId: '9' });
      for (const row of bestOfByMatch(plan)) {
        assert.equal(row.bestOf, row.key === 'F' ? finalBestOf : 1, `${row.key} (chung kết BO${finalBestOf})`);
      }
      assert.ok(plan.matches.some((m) => m.matchKey === 'BRONZE'), 'có trận hạng ba (cùng vòng với chung kết)');
      assert.ok(plan.stages.every((stage) => stage.config.scoring?.best_of === 1), 'mọi stage có snapshot luật');
    }
  },

  'migration 105: backfill đúng preset của plan, chỉ thêm khóa, bỏ qua stage đã có trận chốt'() {
    const sql = read('database/migrations/105_backfill_v4_stage_scoring.sql');
    const body = sql.match(/jsonb_build_object\('scoring', jsonb_build_object\(([\s\S]*?)\)\)\r?\n/)[1];
    const pairs = [...body.matchAll(/'([a-z_]+)',\s*('([^']*)'|NULL|\d+)/g)].map((m) => [m[1], m[3] ?? (m[2] === 'NULL' ? null : Number(m[2]))]);
    assert.deepEqual(Object.fromEntries(pairs), { ...STAGE_SCORING });
    assert.ok(sql.includes("s.config->'scoring' IS NULL") && sql.includes("m.status = 'finalized'"));
    assert.equal(/\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(sql), false);
  },
});
