'use strict';
// Epic 1 — Lát D1 §6: migration 108 chỉ khác 107 ở các điểm đã nêu (roadmap §1.2: finalize v4 sửa
// tuần tự, có test khóa khác biệt).

const { assert, read, lib, suite, exists } = require('../_harness');

const norm = (sql) => sql.replace(/\r\n/g, '\n');
const m107 = norm(read('database/migrations/107_finalize_v4_knockout.sql'));
const m108 = norm(read('database/migrations/108_finalize_v4_double_elim.sql'));
const m099 = norm(read('database/migrations/099_restore_aggregate_draft_v1_definition.sql'));
const { FORMATS, FORMAT_ORDER } = lib('lib/tournament/setupFormats.js');

const FINALIZE = 'CREATE OR REPLACE FUNCTION public.finalize_internal_setup_v4(';
const SAVE_V1 = 'CREATE OR REPLACE FUNCTION public.save_unified_setup_aggregate_draft_v1(';
const body = (sql) => sql.slice(sql.indexOf(FINALIZE));
// Khối _v1: từ CREATE tới hết GRANT của nó.
const v1Block = (sql) => {
  const start = sql.indexOf(SAVE_V1);
  const grant = 'GRANT EXECUTE ON FUNCTION public.save_unified_setup_aggregate_draft_v1(bigint,bigint,bigint,text,jsonb,bigint,text) TO service_role;';
  return sql.slice(start, sql.indexOf(grant, start) + grant.length);
};
const deBranch = (sql) => sql.slice(sql.indexOf("    OR (p_plan->>'formatKey' = 'double_elimination' AND ("), sql.indexOf("    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'stages') s WHERE s->>'scheduleFormat'"));

suite('Epic 1 D1 — migration 108 (finalize v4 mở loại kép)', {
  'giữ signature/grants, không phá dữ liệu, registry khớp danh sách SQL'() {
    assert.ok(m108.includes(FINALIZE));
    assert.ok(m108.includes('GRANT EXECUTE ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) TO service_role'));
    assert.ok(m108.includes('REVOKE ALL ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) FROM PUBLIC, anon, authenticated'));
    assert.equal(/\b(DROP\s+(TABLE|FUNCTION|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(m108), false);
    const allowed = "ARRAY['group_knockout', 'round_robin', 'knockout', 'double_elimination']";
    assert.ok(m108.includes(allowed));
    assert.deepEqual(FORMAT_ORDER, ['group_knockout', 'round_robin', 'knockout', 'double_elimination'], 'registry = danh sách SQL');
    assert.ok(FORMATS.double_elimination);
  },

  'lưu nháp _v1: chép nguyên 099, chỉ thêm double_elimination vào danh sách formatKey'() {
    const block = v1Block(m108);
    assert.ok(block.length > 1000, 'có khối _v1');
    const back = block.replace(
      "OR v_format_key NOT IN ('round_robin', 'knockout', 'group_knockout', 'mlp', 'double_elimination')",
      "OR v_format_key NOT IN ('round_robin', 'knockout', 'group_knockout', 'mlp')",
    );
    assert.notEqual(back, block, 'dòng danh sách formatKey đã đổi');
    assert.equal(back, v1Block(m099));
    assert.ok(m108.indexOf(SAVE_V1) < m108.indexOf(FINALIZE));
  },

  'CHECK schedule_format: thay bằng CHECK rộng hơn thêm double_elim, trong cùng transaction'() {
    const pre = m108.slice(0, m108.indexOf(SAVE_V1));
    assert.ok(pre.includes('BEGIN;'));
    assert.ok(pre.includes('ALTER TABLE public.tournament_stages DROP CONSTRAINT IF EXISTS tournament_stages_schedule_format_check;'));
    assert.ok(pre.includes("CHECK (schedule_format = ANY (ARRAY['round_robin'::text, 'knockout'::text, 'double_elim'::text]))"));
    assert.ok(m108.trimEnd().endsWith('COMMIT;'));
  },

  '108 chỉ khác 107 ở: danh sách thể thức, danh sách scheduleFormat, nhánh bất biến loại kép'() {
    const back = body(m108)
      .replace("ARRAY['group_knockout', 'round_robin', 'knockout', 'double_elimination']", "ARRAY['group_knockout', 'round_robin', 'knockout']")
      .replace("s->>'scheduleFormat' NOT IN ('round_robin', 'knockout', 'double_elim')", "s->>'scheduleFormat' NOT IN ('round_robin', 'knockout')")
      .replace(deBranch(m108), '');
    assert.equal(back, body(m107));
  },

  'nhánh loại kép có đủ bất biến spec D1 §6'() {
    const branch = deBranch(m108);
    assert.ok(branch.includes("jsonb_array_length(p_plan->'stages') <> 1"));
    assert.ok(branch.includes("IS DISTINCT FROM 'double_elim'"));
    assert.ok(branch.includes("'grandFinalReset' IS DISTINCT FROM 'false'::jsonb"), 'không đá lại GF (D14)');
    assert.ok(branch.includes('<> 2 * v_pair_count - 2'), '2n − 2 trận');
    assert.ok(branch.includes("'^W([0-9]+-[0-9]+|F)$') <> v_pair_count - 1"), 'nhánh thắng n − 1');
    assert.ok(branch.includes("'^L([0-9]+-[0-9]+|F)$') <> v_pair_count - 2"), 'nhánh thua n − 2');
    assert.ok(branch.includes("IN ('WF', 'LF', 'GF')) <> 3"), 'đúng một WF/LF/GF');
    assert.ok(branch.includes("(VALUES ('a', 'entryAId'), ('b', 'entryBId')) side(slot, field)"), 'mỗi ô: cặp hoặc đúng một tuyến');
    assert.ok(branch.includes("m->>'matchKey' !~ '^W'"), 'cặp chỉ ở nhánh thắng');
    assert.ok(branch.includes("(src.m->>'round')::integer >= (dst.m->>'round')::integer"), 'tuyến chỉ tới lượt sau');
    assert.ok(branch.includes("NOT (src.m->>'matchKey' ~ '^W' AND dst.m->>'matchKey' ~ '^L')"), 'thua: W → L');
    assert.ok(branch.includes("IN ('WF', 'LF') AND dst.m->>'matchKey' <> 'GF'"), 'WF/LF thắng → GF');
    assert.ok(branch.includes("CASE WHEN m->>'matchKey' ~ '^W' THEN 1 ELSE 0 END"), 'W đúng một cạnh thua ra');
    assert.ok(branch.includes("WHERE pr->'source'->>'matchKey' = 'GF'"), 'GF không có cạnh ra');
  },

  'SQL kiểm thử tích hợp được sinh từ script và bọc ROLLBACK'() {
    assert.ok(exists('database/tests/epic_1_de_integration.sql'));
    const sql = norm(read('database/tests/epic_1_de_integration.sql'));
    assert.ok(sql.trimEnd().endsWith('ROLLBACK;'));
    assert.equal(/\bCOMMIT;/.test(sql), false);
    assert.ok(sql.includes("'D7.done.finalized'") && sql.includes("'D5.done.finalized'"));
  },
});
