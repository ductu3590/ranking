'use strict';

const { assert, read, lib, suite } = require('../_harness');

const norm = (sql) => sql.replace(/\r\n/g, '\n');
const m104 = norm(read('database/migrations/104_finalize_v4_round_robin.sql'));
const m107 = norm(read('database/migrations/107_finalize_v4_knockout.sql'));
const { FORMATS } = lib('lib/tournament/setupFormats.js');

const body = (sql) => sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'));
const knockoutBranch = (sql) => sql.slice(sql.indexOf("    OR (p_plan->>'formatKey' = 'knockout' AND ("), sql.indexOf("    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'stages') s WHERE s->>'scheduleFormat'"));

suite('lát C — migration 107 (finalize v4 mở loại trực tiếp)', {
  'giữ signature/grants, không phá dữ liệu, registry khớp danh sách SQL'() {
    assert.ok(m107.includes('CREATE OR REPLACE FUNCTION public.finalize_internal_setup_v4('));
    assert.ok(m107.includes('GRANT EXECUTE ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) TO service_role'));
    assert.equal(/\b(DROP\s+(TABLE|FUNCTION|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(m107), false);
    assert.ok(m107.includes("ARRAY['group_knockout', 'round_robin', 'knockout']"));
    assert.equal(FORMATS.knockout.enabled, true);
  },

  '107 chỉ khác 104 ở: danh sách thể thức, nhánh bất biến knockout, kiểm trận knockout chỉ cho group_knockout, stage entrants theo stagePlanKey'() {
    const back = body(m107)
      .replace("ARRAY['group_knockout', 'round_robin', 'knockout']", "ARRAY['group_knockout', 'round_robin']")
      .replace(knockoutBranch(m107), '')
      .replace("WHERE p_plan->>'formatKey' = 'group_knockout' AND m->>'stageKind' = 'knockout'", "WHERE m->>'stageKind' = 'knockout'")
      .replace("(v_stage_ids->>COALESCE(v_group->>'stagePlanKey', 'group-stage'))::bigint", "(v_stage_ids->>'group-stage')::bigint")
      .replace('  -- Cặp vào bảng (vòng bảng/vòng tròn) hoặc thứ tự bốc thăm của nhánh (loại trực tiếp, không nhãn).\n', '  -- Cặp vào bảng.\n');
    assert.equal(back, body(m104));
  },

  'nhánh knockout có đủ bất biến spec §6'() {
    const branch = knockoutBranch(m107);
    assert.ok(branch.includes("jsonb_array_length(p_plan->'stages') <> 1"));
    assert.ok(branch.includes('<> v_pair_count - 1'), 'n − 1 trận (+1 hạng ba)');
    assert.ok(branch.includes("WHERE m->>'matchKey' = 'F') <> 1"), 'đúng một chung kết');
    assert.ok(branch.includes("(VALUES ('a', 'entryAId'), ('b', 'entryBId')) side(slot, field)"), 'mỗi ô: cặp hoặc đúng một tuyến');
    assert.ok(branch.includes("(src->>'round')::integer >= (dst->>'round')::integer"), 'tuyến chỉ đi tới vòng sau');
    assert.ok(branch.includes("pr->'source'->>'matchKey' NOT IN ('SF1', 'SF2')"), 'thua chỉ từ bán kết vào hạng ba');
    assert.ok(branch.includes("CASE WHEN m->>'matchKey' IN ('F', 'BRONZE') THEN 0 ELSE 1 END"), 'F/BRONZE không có cạnh ra');
    assert.ok(branch.includes("NOT (p_plan->'groups'->0->'entryIds' ? e.id)"), 'cặp trong trận phải là cặp của bản nháp');
  },

  'SQL kiểm thử tích hợp được sinh từ script và bọc ROLLBACK'() {
    const sql = norm(read('database/tests/stitch_lat_c_integration.sql'));
    assert.ok(sql.trimEnd().endsWith('ROLLBACK;'));
    assert.equal(/\bCOMMIT;/.test(sql), false);
    assert.ok(sql.includes("'K6.after.bronze_are_sf_losers'") && sql.includes("'K6.after.final_are_sf_winners'"));
  },
});
