'use strict';

const { assert, read, lib, suite } = require('../_harness');

const preview = read('app/api/tournament-v2/preview-schedule/route.js');
const finalize = read('app/api/tournament-v2/setup/finalize/route.js');
const advance = read('app/api/tournament-v2/advance/route.js');
const m101 = read('database/migrations/101_stage_transition_pool_source.sql');
const m102 = read('database/migrations/102_finalize_internal_setup_v4.sql');
const m103 = read('database/migrations/103_advance_group_rank_transitions_v2.sql');
const { FORMATS } = lib('lib/tournament/setupFormats.js');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../_harness');
// Migration MỚI NHẤT định nghĩa finalize_internal_setup_v4 là bản đang chạy.
const latestFinalize = read('database/migrations/' + fs.readdirSync(path.join(ROOT, 'database/migrations')).filter((name) => /^\d+_.*\.sql$/.test(name)).sort()
  .filter((name) => read('database/migrations/' + name).includes('CREATE OR REPLACE FUNCTION public.finalize_internal_setup_v4')).pop());

const noDestructive = (sql) => !/\b(DROP\s+(TABLE|FUNCTION|COLUMN|INDEX)|TRUNCATE|DELETE\s+FROM)\b/i.test(sql);

suite('lát A — hợp đồng API & migration', {
  'preview/finalize: bắt admin đã xác thực, scope group từ session (chuyển từ finalize-contract, ADR-006)'() {
    for (const source of [preview, finalize]) {
      assert.ok(source.includes('requireValidatedGroupAdmin'));
      assert.ok(source.includes(".eq('group_id', Number(admin.groupId))"));
      assert.ok(source.includes('p_group_id: Number(admin.groupId)'));
      assert.equal(source.includes('tournament_draw_slots'), false);
    }
  },

  'preview: server sinh seed khi bốc, dùng lại seed khi cập nhật, lưu qua RPC có CAS'() {
    assert.ok(preview.includes("action === 'draw' ? randomUUID() : draft.draw.seed"));
    assert.ok(preview.includes("db.rpc('save_unified_setup_aggregate_draft'"));
    assert.ok(preview.includes('p_expected_setup_revision: expectedRevision'));
    assert.ok(preview.includes("return fail('SETUP_REVISION_CONFLICT', 409)"));
    assert.ok(preview.includes('firstBlocker(draft, ctx, 3)'), 'không bốc khi bước 1–3 chưa hợp lệ');
    assert.equal(/draftFingerprint|reserveMemberIds|selectedMemberIds/.test(preview), false, 'bỏ shape cũ');
  },

  'finalize: tính lại plan trên server, so fingerprint TRƯỚC khi gọi RPC v4'() {
    const recompute = finalize.indexOf('buildSetupPlan({');
    const compare = finalize.indexOf('plan.fingerprint !== draft.draw.previewFingerprint');
    const rpc = finalize.indexOf("db.rpc('finalize_internal_setup_v4'");
    assert.ok(recompute > 0 && compare > recompute && rpc > compare);
    assert.ok(finalize.includes('firstBlocker(draft, ctx, 4)'));
    assert.equal(/body\?\.plan|body\.plan/.test(finalize), false, 'không nhận plan từ client');
    assert.ok(finalize.includes('redirect: `/dieu-hanh-giai/${tournamentId}?step=schedule`'));
    const code = finalize.replace(/^\s*\/\/.*$/gm, '');
    assert.equal(/LIVE|setLive/.test(code), false, 'không tự chuyển LIVE');
  },

  'advance: stage v4 đi RPC v2 với phân công tính ở server; stage cũ giữ v1'() {
    assert.ok(advance.includes("String(stage.config?.setupPlanVersion) === '4'"));
    assert.ok(advance.includes('resolveGroupKnockoutAdvance({'));
    assert.ok(advance.includes("db.rpc('advance_division_group_rank_transitions_v2'"));
    assert.ok(advance.includes("db.rpc('advance_division_group_rank_transitions',"), 'nhánh v1 còn nguyên');
    assert.ok(advance.indexOf("=== '4'") < advance.indexOf("db.rpc('advance_division_group_rank_transitions',"));
  },

  'migration 101: additive, CHECK mới NOT VALID rồi VALIDATE, không xóa dữ liệu'() {
    assert.ok(m101.includes('ADD COLUMN IF NOT EXISTS source_pool_position integer'));
    assert.ok(m101.includes("'group_rank_pool'"));
    assert.ok(/NOT VALID[\s\S]*VALIDATE CONSTRAINT tournament_stage_transitions_check/.test(m101));
    assert.ok(m101.trim().startsWith('--') && m101.includes('BEGIN;') && m101.includes('COMMIT;'), 'một transaction');
    assert.ok(noDestructive(m101));
  },

  'migration 102: security definer, chỉ service_role, danh sách thể thức khớp registry'() {
    assert.ok(m102.includes('SECURITY DEFINER SET search_path = public'));
    assert.ok(m102.includes('REVOKE ALL ON FUNCTION public.finalize_internal_setup_v4') && m102.includes('TO service_role'));
    const allowed = (latestFinalize.match(/c_allowed_formats constant text\[\] := ARRAY\[([^\]]*)\]/) || [])[1];
    const sqlFormats = [...String(allowed).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const enabled = Object.values(FORMATS).filter((format) => format.enabled).map((format) => format.key).sort();
    assert.deepEqual(sqlFormats, enabled, 'RPC và registry mở cùng thể thức');
    assert.ok(noDestructive(m102));
  },

  'migration 102: kiểm plan khớp bản nháp, khách là VĐV riêng, idempotent, chặn cấu trúc có sẵn'() {
    for (const code of ['DRAW_FINGERPRINT_MISMATCH', 'PAIRING_INVALID', 'FINALIZE_PLAN_INVALID', 'FINALIZE_STRUCTURE_ALREADY_EXISTS', 'IDEMPOTENCY_KEY_REUSED', 'SETUP_REVISION_CONFLICT', 'MEMBER_NOT_ACTIVE_IN_GROUP', 'ATHLETE_IDENTITY_MISSING']) {
      assert.ok(m102.includes(`'${code}'`), code);
    }
    assert.ok(m102.includes("NULL, v_name, 'guest', v_client_ref"), 'khách: athlete_id NULL, source guest, client_ref');
    assert.ok(m102.includes('ON CONFLICT (group_id, tournament_id, client_ref) WHERE client_ref IS NOT NULL'));
    assert.ok(m102.includes("btrim(v_guest->>'displayName')"), 'tên khách lấy từ bản nháp, không từ p_plan');
    assert.equal(/'LIVE'|status = 'live'/i.test(m102), false, 'không tự chuyển LIVE');
  },

  'migration 103: phủ đúng mọi transition bảng, giữ bảo vệ của v1'() {
    for (const guard of ['GROUP_RESULTS_CHANGED', 'STAGE_NOT_COMPLETE', 'GROUP_RANK_ENTRY_SCOPE_MISMATCH', 'GROUP_RANK_ENTRY_DUPLICATE', 'PLAYOFF_TARGET_CONFLICT', 'GROUP_ADVANCE_ASSIGNMENT_INVALID', 'IDEMPOTENCY_KEY_REUSED']) {
      assert.ok(m103.includes(`'${guard}'`), guard);
    }
    assert.ok(m103.includes("source_kind IN ('group_rank', 'group_rank_pool')"));
    assert.ok(m103.includes("COALESCE(s.config->>'setupPlanVersion', '') <> '4'"));
    assert.ok(m103.includes('TO service_role') && noDestructive(m103));
  },
});
