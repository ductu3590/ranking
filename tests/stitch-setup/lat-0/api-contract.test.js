'use strict';

const { assert, read, suite } = require('../_harness');

const setup = read('app/api/tournament-v2/setup/route.js');
const server = read('lib/tournament/setupServer.js');
const preview = read('app/api/tournament-v2/preview-schedule/route.js');
const finalize = read('app/api/tournament-v2/setup/finalize/route.js');
const client = read('lib/tournamentV2Client.js');
const athletes = read('app/api/tournament-v2/athletes/route.js');
const m100 = read('database/migrations/100_harden_aggregate_draft_save.sql');
const m099 = read('database/migrations/099_restore_aggregate_draft_v1_definition.sql');

function saveBranch() {
  const start = setup.indexOf("if (action === 'save_aggregate')");
  return setup.slice(start, setup.indexOf("if (action === 'replace_roster')", start));
}

suite('api contract lát 0', {
  'save: chuẩn hóa v3 trước khi gọi RPC, gửi payload chứ không gửi draft thô'() {
    const branch = saveBranch();
    assert.ok(branch.includes('toSavePayload(draft'), 'dùng toSavePayload');
    assert.ok(branch.includes('p_draft: payload'), 'RPC nhận payload đã chuẩn hóa');
    assert.equal(branch.includes('p_draft: draft'), false);
  },

  'save: server tự tính progress và kẹp currentStep'() {
    const branch = saveBranch();
    assert.ok(branch.includes('computeCompletedThrough(payload, ctx)'));
    assert.ok(branch.includes('payload.progress = { completedThrough }'));
    assert.ok(branch.includes('allowedStep(payload.currentStep, completedThrough)'));
  },

  'save: định danh thành viên kiểm theo group trong session'() {
    assert.ok(server.includes("db.from('club_members').select('id, full_name, is_active').eq('group_id', Number(groupId))"));
    assert.ok(setup.includes('loadMemberContext(db, groupId'));
    assert.ok(setup.includes('requireValidatedGroupAdmin'));
  },

  'save: thể thức chưa bật bị từ chối khi lưu từ bước 3'() {
    assert.ok(saveBranch().includes("setupIssueError('FORMAT_NOT_AVAILABLE', 409)"));
  },

  'save: cho phép lần lưu đầu chưa có id (bootstrap theo client_draft_key)'() {
    assert.ok(setup.includes('hasTournamentId !== hasDivisionId'));
    assert.ok(client.includes('...(hasTarget ? { tournamentId'));
  },

  'save: trả draft v3 đã chuẩn hóa + readiness, kể cả khi replay'() {
    const branch = saveBranch();
    assert.ok(branch.includes('normalizeDraft(data?.draft || payload)'));
    assert.ok(branch.includes('readiness: computeSetupReadiness(savedDraft, ctx)'));
  },

  'GET: trả khối setup (draft v3 + progress + resumeStep + readiness)'() {
    assert.ok(setup.includes('const setup = await buildSetupView(db, groupId, division.setup_draft)'));
    assert.ok(/draft: \{ \.\.\.draft, progress: \{ completedThrough \}, currentStep: resumeStep \}/.test(server));
  },

  'preview và finalize chặn thể thức chưa bật trước khi tính/ghi'() {
    assert.ok(preview.includes("return fail('FORMAT_NOT_AVAILABLE', 409)"));
    assert.ok(preview.indexOf('FORMAT_NOT_AVAILABLE') < preview.indexOf('buildSetupPlan({'), 'kiểm tra trước khi dựng plan');
    assert.ok(finalize.includes("return fail('FORMAT_NOT_AVAILABLE', 409)"));
    assert.ok(finalize.indexOf('FORMAT_NOT_AVAILABLE') < finalize.indexOf("db.rpc("), 'kiểm tra trước RPC');
  },

  'roster trả biệt danh để tìm kiếm, không trả rating giả'() {
    assert.ok(athletes.includes("select('id, full_name, aliases, is_active')"));
    assert.ok(athletes.includes('aliases: Array.isArray(member.aliases)'));
  },

  'migration 100: replay không ghi đè, fingerprint phủ payload, chỉ service_role'() {
    const replay = m100.indexOf('IF v_replay THEN');
    const update = m100.indexOf('UPDATE public.tournament_divisions');
    assert.ok(m100.indexOf('v_replay := EXISTS') < m100.indexOf('save_unified_setup_aggregate_draft_v1('), 'xét replay trước khi gọi _v1');
    assert.ok(replay > 0 && replay < update, 'replay return trước UPDATE');
    assert.ok(m100.includes("'payloadHash', md5(p_draft::text)"));
    assert.ok(m100.includes('SECURITY DEFINER SET search_path = public'));
    assert.ok(m100.includes('REVOKE ALL ON FUNCTION') && m100.includes('TO service_role'));
    assert.ok(m100.includes("AND status = 'draft'"), 'metadata chỉ ghi khi giải còn nháp');
    assert.equal(/\b(DROP|TRUNCATE|DELETE)\b/i.test(m100), false);
  },

  'migration 099: chỉ CREATE OR REPLACE _v1, không phá dữ liệu'() {
    assert.ok(m099.includes('CREATE OR REPLACE FUNCTION public.save_unified_setup_aggregate_draft_v1('));
    assert.equal(/\b(DROP|TRUNCATE|DELETE FROM)\b/i.test(m099), false);
  },
});
