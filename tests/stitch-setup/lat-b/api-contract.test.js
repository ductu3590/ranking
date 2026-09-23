'use strict';

const { assert, read, suite } = require('../_harness');

const m104 = read('database/migrations/104_finalize_v4_round_robin.sql');
const m102 = read('database/migrations/102_finalize_internal_setup_v4.sql').replace(/\r\n/g, '\n');
const advance = read('app/api/tournament-v2/advance/route.js');
const draw = read('app/giai-dau/v2/setup-v3/steps/StepDraw.js');
const format = read('app/giai-dau/v2/setup-v3/steps/StepFormatPairing.js');

suite('lát B — hợp đồng API, migration, UI', {
  'migration 104: mở round_robin, giữ signature/grants, không phá dữ liệu'() {
    assert.ok(m104.includes("ARRAY['group_knockout', 'round_robin']"));
    assert.ok(m104.includes('CREATE OR REPLACE FUNCTION public.finalize_internal_setup_v4('));
    assert.ok(m104.includes('GRANT EXECUTE ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) TO service_role'));
    assert.equal(/\b(DROP\s+(TABLE|FUNCTION|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(m104), false);
  },

  'migration 104: bất biến vòng tròn (1 stage, 0 tuyến, n(n-1)/2 trận, mỗi cặp n-1 trận, không gặp lại)'() {
    assert.ok(m104.includes("p_plan->>'formatKey' = 'round_robin' AND ("));
    assert.ok(m104.includes("jsonb_array_length(p_plan->'stages') <> 1"));
    assert.ok(m104.includes("jsonb_array_length(p_plan->'progressions') <> 0"));
    assert.ok(m104.includes('v_pair_count * (v_pair_count - 1) / 2'));
    assert.ok(m104.includes('<> v_pair_count - 1)'));
    assert.ok(m104.includes("count(DISTINCT LEAST(m->>'entryAId', m->>'entryBId')"));
    assert.ok(m104.includes("(p_plan->>'formatKey' = 'group_knockout' AND jsonb_array_length(p_plan->'stages') <> 2)"), 'vòng bảng vẫn 2 stage');
  },

  'migration 104 chỉ khác 102 ở danh sách thể thức và khối bất biến stage'() {
    const body = (sql) => sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
    const strip = (sql) => body(sql)
      .replace("ARRAY['group_knockout', 'round_robin']", "ARRAY['group_knockout']")
      .replace(/  IF \(p_plan->>'formatKey' = 'group_knockout'[\s\S]*?<> jsonb_array_length\(p_plan->'matches'\)\)\)\n/, "  IF jsonb_array_length(p_plan->'stages') <> 2\n");
    assert.equal(strip(m104.replace(/\r\n/g, '\n')), body(m102));
  },

  'advance: stage v4 không có tuyến đi tiếp thì đi nhánh chung (chặng cuối)'() {
    const branch = advance.slice(advance.indexOf("=== '4'"), advance.indexOf('// Unified group-to-playoff plans'));
    assert.ok(branch.includes('if ((edgeRows || []).length) {'));
    assert.ok(branch.indexOf('if ((edgeRows || []).length) {') < branch.indexOf("db.rpc('advance_division_group_rank_transitions_v2'"));
  },

  'UI: vòng tròn ẩn nhánh, gọi "Danh sách cặp", lịch theo lượt, ghi rõ BO1'() {
    assert.ok(draw.includes('if (!knockout.length) return null;'));
    assert.ok(draw.includes("single ? 'Danh sách cặp' : 'Chia bảng'"));
    assert.ok(draw.includes('`Lượt ${match.round}`'));
    assert.ok(format.includes("draft.format.formatKey === 'round_robin' ?"));
    assert.ok(format.includes('mỗi trận 1 ván (BO1)'));
  },
});
