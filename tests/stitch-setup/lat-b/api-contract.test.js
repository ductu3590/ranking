'use strict';

const { assert, read, suite } = require('../_harness');

const m104 = read('database/migrations/104_finalize_v4_round_robin.sql');
const m102 = read('database/migrations/102_finalize_internal_setup_v4.sql').replace(/\r\n/g, '\n');
const advance = read('app/api/tournament-v2/advance/route.js');
const draw = read('app/giai-dau/v2/setup-v3/steps/StepDraw.js');
const format = read('app/giai-dau/v2/setup-v3/steps/StepFormatPairing.js');
const standingsRoute = read('app/api/tournament-v2/standings/route.js');
const standingsTab = read('app/giai-dau/v2/console/tabs/StandingsTab.js');
const standingsRender = read('app/giai-dau/v2/console/standingsRender.js');
const bracketTab = read('app/giai-dau/v2/console/tabs/BracketTab.js');
const m106 = read('database/migrations/106_fix_advance_division_entry_stage_ambiguity.sql');

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
    assert.ok(draw.includes("(plan.groups || []).length > 1 ? 'Trong mỗi bảng:' : 'Bảng xếp hạng:'"), 'tiêu chí không nói "mỗi bảng" khi chỉ có một bảng');
  },

  'standings: stage v4 lấy suất từ advancePerGroup; 0 suất thì không có outlook, bỏ cột'() {
    assert.ok(standingsRoute.includes("Number(stage.config?.advancePerGroup || 0)"));
    assert.ok(standingsRoute.includes('advance > 0 ? Object.entries('));
    assert.ok(standingsRoute.includes("label: 'Xét suất bù'"), 'vòng bảng có suất bù: hạng kế tiếp chưa bị loại');
    assert.ok(standingsRender.includes('showOutlook ? <th>Suất đi tiếp</th> : null'));
  },

  'console: chặng cuối là "Kết thúc giải", đã xong thì báo chung cuộc; không có nhánh thì ẩn sơ đồ'() {
    assert.ok(standingsTab.includes("'Kết thúc giải & chốt xếp hạng'"));
    assert.ok(standingsTab.includes('canAdvance && !(completed && isLastStage)'));
    assert.ok(bracketTab.includes("if (!(stages || []).some((s) => s.schedule_format === 'knockout')) return null;"));
  },

  'migration 106: biến lặp không trùng alias cột seeded(item); signature/grants giữ nguyên'() {
    const body = m106.slice(m106.indexOf('DECLARE'), m106.indexOf('$$;'));
    assert.equal(/^\s*item jsonb;/m.test(body), false, 'không còn biến item');
    assert.ok(body.includes('FOR v_item IN SELECT value FROM jsonb_array_elements(p_seeded) LOOP'));
    assert.ok(/GRANT EXECUTE ON FUNCTION public\.advance_division_entry_stage\(bigint, bigint, bigint, jsonb, text\)\s+TO service_role;/.test(m106));
    assert.ok(m106.includes("USING ERRCODE = 'PH409'"), 'giữ mã xung đột của 078');
    assert.equal(/\b(DROP|TRUNCATE|DELETE\s+FROM)\b/i.test(m106), false);
  },
});
