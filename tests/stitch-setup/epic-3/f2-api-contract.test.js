'use strict';
// Epic 3 F2 — hợp đồng API + migration 111 (spec lat-f2 §5, §6, §7.2, §9; bổ sung D49, D50).
// Migration 111 so với bản trước (108 — bản mới nhất có finalize_internal_setup_v4): chỉ khác đúng các điểm của
// FRIENDLY_FINALIZE_SQL_CONTRACT (friendlySetup.js). Route: finalize/preview dựng plan từ cặp hiệu lực, không nhận hạn
// mức từ body; BXH CLB; khối friendly công khai theo allowlist; D50 private → unlisted.

const fs = require('node:fs');
const path = require('node:path');
const { assert, read, exists, lib, suite, ROOT } = require('../_harness');

const norm = (sql) => sql.replace(/\r\n?/g, '\n');
const M111 = 'database/migrations/111_finalize_v4_friendly.sql';
const m108 = norm(read('database/migrations/108_finalize_v4_double_elim.sql'));
const m111 = exists(M111) ? norm(read(M111)) : '';
const { FRIENDLY_FINALIZE_SQL_CONTRACT: C } = lib('lib/tournament/friendlySetup.js');

const FN = 'CREATE OR REPLACE FUNCTION public.finalize_internal_setup_v4(';
// Thân hàm + REVOKE/GRANT/COMMENT (tới COMMIT cuối file).
const fnBody = (sql) => sql.slice(sql.indexOf(FN), sql.lastIndexOf('COMMIT;'));
const withoutComments = (sql) => sql.replace(/--[^\n]*/g, '');
// Các đoạn đánh dấu friendly (cả dòng).
function friendlyBlocks(sql) {
  const out = [];
  const re = /^[^\n]*-- friendly:begin[^\n]*\n[\s\S]*?^[^\n]*-- friendly:end[^\n]*\n/gm;
  let match;
  while ((match = re.exec(sql))) out.push(match[0]);
  return out;
}
// Đảo 111 về 108: bỏ khối friendly + dòng khai báo mới, đảo danh sách organizerMode và v_pairs.
function backTo108(sql) {
  let text = fnBody(sql);
  for (const block of friendlyBlocks(text)) text = text.replace(block, '');
  text = text.split('\n').filter((line) => !line.includes(C.markers.decl)).join('\n');
  text = text.replace("NOT IN ('internal', 'friendly')", "<> 'internal'");
  text = text.replace(/\bv_pairs\b/g, "v_draft->'pairs'");
  return text;
}
const collapse = (sql) => sql.replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim();

const route = (file) => (exists(file) ? read(file) : '');
const finalize = route('app/api/tournament-v2/setup/finalize/route.js');
const preview = route('app/api/tournament-v2/preview-schedule/route.js');
const setup = route('app/api/tournament-v2/setup/route.js');
const standings = route('app/api/tournament-v2/friendly/standings/route.js');
const publicRoute = route('app/api/tournament-v2/public/route.js');
const tournaments = route('app/api/tournament-v2/tournaments/route.js');
const client = route('lib/tournamentV2Client.js');
const code = (source) => source.replace(/^\s*\/\/.*$/gm, '');

suite('f2 api contract — migration 111', {
  'số 111 duy nhất; 111 là migration mới nhất định nghĩa finalize_internal_setup_v4'() {
    assert.ok(m111, 'thiếu ' + M111);
    const names = fs.readdirSync(path.join(ROOT, 'database/migrations')).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
    assert.deepEqual(names.filter((name) => name.startsWith('111_')), ['111_finalize_v4_friendly.sql']);
    const latest = names.filter((name) => read('database/migrations/' + name).includes(FN)).pop();
    // Epic 4 C3: 114 (nhánh cộng đồng) dựng từ 111 và được khoá riêng bằng epic-4/c3-migration-lock.test.js (114 = 111 + các khối community).
    assert.ok(['111_finalize_v4_friendly.sql', '114_finalize_v4_community.sql'].includes(latest), latest);
  },

  'giữ chữ ký, SECURITY DEFINER + search_path, REVOKE/GRANT/COMMENT y hệt 108; một transaction'() {
    const signature = (sql) => sql.slice(sql.indexOf(FN), sql.indexOf('DECLARE', sql.indexOf(FN)));
    assert.equal(signature(m111), signature(m108));
    assert.ok(signature(m111).includes('LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$'));
    const grants = (sql) => sql.split('\n').filter((line) => /^(REVOKE|GRANT|COMMENT) .*finalize_internal_setup_v4/.test(line));
    assert.equal(grants(m111).length, 3);
    assert.deepEqual(grants(m111), grants(m108));
    assert.ok(m111.includes('REVOKE ALL ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) FROM PUBLIC, anon, authenticated;'));
    assert.ok(m111.includes('GRANT EXECUTE ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) TO service_role;'));
    assert.ok(/^BEGIN;$/m.test(m111) && m111.trimEnd().endsWith('COMMIT;'));
    assert.equal((m111.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 1, 'chỉ đụng một hàm');
  },

  'không DROP / TRUNCATE / DELETE FROM / ALTER; không đụng hàm khác'() {
    const sql = withoutComments(m111);
    assert.equal(/\b(DROP|TRUNCATE|ALTER)\b/i.test(sql), false);
    assert.equal(/\bDELETE\s+FROM\b/i.test(sql), false);
    assert.equal(/save_unified_setup_aggregate_draft_v1|tournament_stages_schedule_format_check/.test(sql), false);
  },

  '111 chỉ khác 108 ở các điểm của FRIENDLY_FINALIZE_SQL_CONTRACT (bỏ khối friendly, đảo v_pairs / organizerMode → bằng đúng 108)'() {
    assert.equal(C.differencesFrom108.length, 11);
    assert.equal(backTo108(m111), fnBody(m108));
    assert.equal(collapse(backTo108(m111)), collapse(fnBody(m108)));
  },

  'mọi khối friendly có cặp begin/end; khối kiểm nằm ngay trước khối kiểm cặp, khối ghi ngay sau vòng "Cặp → entry"'() {
    const body = fnBody(m111);
    const begins = (body.match(/-- friendly:begin/g) || []).length;
    assert.equal(begins, (body.match(/-- friendly:end/g) || []).length);
    assert.equal(begins, friendlyBlocks(body).length);
    assert.equal(friendlyBlocks(body).length, 4, 'kiểm, v_participant_count, ghi, result');
    const [check, count, write, result] = friendlyBlocks(body);
    assert.ok(body.indexOf(check) < body.indexOf('  -- Cặp: đúng tập cặp của bản nháp'));
    assert.ok(body.slice(body.indexOf(check) + check.length).startsWith('  -- Cặp: đúng tập cặp của bản nháp'));
    assert.ok(count.includes('v_participant_count := v_participant_count + 2 * jsonb_array_length(v_guest_pairs);'));
    assert.ok(body.indexOf(write) > body.indexOf('  -- Cặp → entry.') && body.indexOf(write) < body.indexOf('  -- Stage theo plan'));
    assert.ok(result.includes("jsonb_build_object('friendly_clubs', v_friendly_clubs)"));
    assert.ok(body.indexOf(result) < body.indexOf("VALUES (p_group_id, 'finalize_internal_setup_v4'"), 'trước khi lưu idempotency');
  },

  'nhánh nội bộ đi đường 108: v_pairs = cặp bản nháp, v_guest_pairs rỗng; mọi kiểm friendly nằm trong IF v_mode = friendly'() {
    const [check, , write, result] = friendlyBlocks(fnBody(m111));
    assert.ok(check.includes("v_pairs := v_draft->'pairs';\n  IF v_mode = 'friendly' THEN"));
    assert.ok(m111.includes("v_guest_pairs jsonb := '[]'::jsonb; -- friendly:decl"));
    for (const block of [write, result]) assert.ok(block.includes("IF v_mode = 'friendly' THEN"));
    assert.ok(check.trimEnd().endsWith('END IF;\n  -- friendly:end'));
    // Mệnh đề ref ∈ người tham gia bản nháp giữ trên cặp bản nháp (cặp khách đã kiểm trong khối friendly).
    assert.ok(m111.includes("OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_draft->'pairs') x, jsonb_array_elements_text(x->'participantRefs') r\n               WHERE NOT ("));
    // Ghi chủ nhà giữ nguyên: vòng Cặp → entry vẫn duyệt cặp bản nháp.
    assert.ok(m111.includes("  FOR v_pair IN SELECT value FROM jsonb_array_elements(v_draft->'pairs') LOOP"));
  },

  'hằng hợp đồng có mặt trong khối friendly (đường hạn mức, khóa cặp, regex, trạng thái, khoảng 1–31)'() {
    const [check, , write] = friendlyBlocks(fnBody(m111));
    assert.equal(C.planFriendlyPath, "p_plan->'friendly'->>'maxGuestClubs'");
    assert.ok(check.includes(`(${C.planFriendlyPath})::integer`));
    assert.ok(check.includes(C.pairKeySql));
    assert.ok(check.includes(`~ '${C.pairKeyPattern}'`), 'regex khóa khách y hệt friendlyClubs');
    assert.ok(check.includes(`!~ '${C.guestRefPattern}'`));
    assert.ok(check.includes(`NOT IN (${C.readyStatuses.map((s) => `'${s}'`).join(', ')})`));
    assert.deepEqual(C.maxGuestClubsRange, [1, 31]);
    assert.ok(check.includes(`v_max_guest < ${C.maxGuestClubsRange[0]} OR v_max_guest > ${C.maxGuestClubsRange[1]}`));
    assert.ok(check.includes("jsonb_array_length(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) > 0"), 'D49');
    assert.ok(check.includes("t.settings->>'organizer_mode' IS DISTINCT FROM 'friendly'"));
    assert.ok(check.includes("cm.group_id = (x->>'clubId')::bigint AND cm.is_active IS DISTINCT FROM false"), 'D17: thành viên theo CLB của dòng');
    assert.ok(check.includes("tc.roster_submitted->'memberIds'"));
    assert.ok(check.includes("v_pairs := v_draft->'pairs' || v_guest_pairs;"));
    assert.ok(write.includes('club_name_snapshot, source)') && write.includes("v_club.id, v_athlete_id, v_name, v_club.name, 'club_member'"));
    assert.ok(write.includes('VALUES (p_group_id, p_division_id, v_club.id, v_pair_id, v_name, \'approved\')'), 'entry mang tournament_club_id của dòng khách');
    assert.ok(write.includes('INSERT INTO public.tournament_division_roster_members'), 'VĐV khách vào roster trước khi vào cặp');
    assert.ok(write.indexOf('tournament_division_roster_members') < write.indexOf('tournament_pair_members'));
  },

  'mọi mã RAISE của hợp đồng có trong khối friendly; mã xung đột dùng PH409'() {
    const blocks = friendlyBlocks(fnBody(m111)).join('\n');
    const raised = [...blocks.matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g)].map((m) => m[1]);
    for (const c of C.raiseCodes) assert.ok(raised.includes(c), `thiếu RAISE ${c}`);
    for (const c of ['FRIENDLY_HOST_GUEST_NOT_ALLOWED', 'FRIENDLY_CLUB_NOT_READY', 'EXTERNAL_CLUB_NOT_SUPPORTED', 'FRIENDLY_CLUB_LIMIT_REACHED',
      'FRIENDLY_ROSTER_CHANGED', 'FRIENDLY_GUEST_NOT_ALLOWED', 'FRIENDLY_QUOTA_EXCEEDED', 'FRIENDLY_ATHLETE_DUPLICATE', 'FRIENDLY_CLUBS_TOO_FEW']) {
      assert.ok(new RegExp(`RAISE EXCEPTION '${c}' USING ERRCODE = 'PH409'`).test(blocks), `${c} phải PH409`);
    }
  },

  'khoá FOR UPDATE dòng CLB khách theo id, sau khoá division và tournament'() {
    const body = fnBody(m111);
    const lockClubs = body.indexOf('PERFORM 1 FROM public.tournament_clubs tc WHERE tc.tournament_id = p_tournament_id AND tc.group_id = p_group_id AND tc.club_id IS DISTINCT FROM p_group_id ORDER BY tc.id FOR UPDATE;');
    assert.ok(lockClubs > 0);
    assert.deepEqual(C.lockOrder, ['tournament_divisions', 'tournaments', 'tournament_clubs']);
    assert.ok(body.indexOf('SELECT * INTO d FROM public.tournament_divisions') < body.indexOf('SELECT * INTO t FROM public.tournaments'));
    assert.ok(body.indexOf('SELECT * INTO t FROM public.tournaments') < lockClubs);
    // Mọi truy vấn tournament_clubs trong khối kiểm scope theo giải + tenant chủ nhà, bỏ dòng chủ nhà.
    const [check] = friendlyBlocks(body);
    const scoped = (check.match(/FROM public\.tournament_clubs tc(?! WHERE tc\.id)/g) || []).length;
    const withScope = (check.match(/tc\.tournament_id = p_tournament_id AND tc\.group_id = p_group_id AND tc\.club_id IS DISTINCT FROM p_group_id/g) || []).length;
    assert.ok(withScope >= scoped - 1, `truy vấn tournament_clubs thiếu scope (${withScope}/${scoped})`);
  },
});

suite('f2 api contract — routes', {
  'finalize: loadFriendlyContext + effectivePairs + entryClubs; p_plan qua finalizePlanPayload; không đọc hạn mức từ body'() {
    const src = code(finalize);
    assert.ok(src.includes('loadFriendlyContext(db, {'));
    assert.ok(src.includes('setupContext(db, admin.groupId, draft, { friendly })'));
    assert.ok(src.includes('firstBlocker(draft, ctx, 4)'));
    assert.ok(src.includes('effectivePairs(draft, friendly)'));
    assert.ok(src.includes('pairIds: pairs.map((pair) => pair.pairId)'));
    assert.ok(src.includes('...(friendly ? { entryClubs: entryClubs(pairs) } : {})'));
    assert.ok(src.includes('p_plan: finalizePlanPayload({ plan, pairs, friendly })'));
    assert.equal(/maxGuestClubs|body\??\.friendly|body\??\.plan/.test(src), false, 'hạn mức / plan không lấy từ body');
    assert.ok(src.indexOf('loadFriendlyContext(') < src.indexOf('buildSetupPlan({') && src.indexOf('buildSetupPlan({') < src.indexOf("db.rpc('finalize_internal_setup_v4'"));
    const { FRIENDLY_FINALIZE_SQL_CONTRACT } = lib('lib/tournament/friendlySetup.js');
    for (const c of FRIENDLY_FINALIZE_SQL_CONTRACT.raiseCodes) assert.ok(src.includes(`'${c}'`), `RPC_CODES thiếu ${c}`);
  },

  'finalize D50: chỉ giải friendly đang private → unlisted + public_slug (generateSlug dùng chung), lỗi chỉ log; trả publicUrl'() {
    const src = code(finalize);
        assert.ok(src.includes('publishFriendlyTournament(') || src.includes("visibility: 'unlisted'"));
    assert.ok(src.includes('publicUrl'));
    const d50 = code(read('lib/tournament/friendlyServer.js'));
    assert.ok(d50.includes("require('./publicSlug')") && d50.includes('generateSlug(row.name)'), 'slug dùng chung publicSlug');
    assert.ok(d50.includes("visibility: 'unlisted'") && d50.includes(".eq('visibility', 'private')"));
    assert.ok(src.indexOf("db.rpc('finalize_internal_setup_v4'") < src.indexOf('publishFriendlyTournament('));
    assert.ok(/if \(friendly\)[\s\S]{0,120}publishFriendlyTournament\(/.test(src), 'chỉ giải friendly');
  },

  'preview: cặp hiệu lực + entryClubs, bước 3 theo ctx.friendly'() {
    const src = code(preview);
    assert.ok(src.includes('loadFriendlyContext(db, {'));
    assert.ok(src.includes('setupContext(db, admin.groupId, draft, { friendly })'));
    assert.ok(src.includes('firstBlocker(draft, ctx, 3)'));
    assert.ok(src.includes('effectivePairs(draft, friendly)'));
    assert.ok(src.includes('...(friendly ? { entryClubs: entryClubs(pairs) } : {})'));
    assert.equal(/maxGuestClubs/.test(src), false);
  },

  'setup: ORGANIZER_MODE_LOCKED (409, trước RPC lưu); view có khối friendly; readiness theo ctx.friendly'() {
    const src = code(setup);
    assert.ok(src.includes("'ORGANIZER_MODE_LOCKED', 409"));
    assert.ok(src.indexOf('ORGANIZER_MODE_LOCKED') < src.indexOf("db.rpc('save_unified_setup_aggregate_draft'"));
    assert.ok(src.includes('friendlySetupView('));
    assert.ok(src.includes('loadFriendlyContext(db, {'));
  },

  'standings: chủ nhà qua requireTournamentAccess(read), CLB khách qua requireParticipantClubAccess; giải không friendly → 404'() {
    const src = code(standings);
    assert.ok(src.includes("requireTournamentAccess({ tournamentId: Number(tournamentId), need: 'read' })"));
    assert.ok(src.includes('requireParticipantClubAccess({ tournamentClubId'));
    assert.ok(src.includes("'FRIENDLY_MODE_REQUIRED'") && src.includes('404'));
    assert.ok(src.includes('loadFriendlyClubStandings(db,'));
    assert.equal(/supabase\.from|createClient/.test(src), false);
  },

  'public: khối friendly chỉ khi organizer_mode = friendly, qua allowlist publicFriendlyBlock'() {
    const src = code(publicRoute);
    assert.ok(src.includes('organizer_mode:settings->>organizer_mode'));
    assert.ok(src.includes("tournament.organizer_mode === 'friendly'"));
    assert.ok(src.includes('publicFriendlyBlock('));
  },

  'publicSlug: tournaments route dùng chung generateSlug; thuật toán giữ nguyên'() {
    assert.ok(exists('lib/tournament/publicSlug.js'));
    const { generateSlug, slugify } = lib('lib/tournament/publicSlug.js');
    assert.equal(slugify('Giải Đấu Giao Hữu 59 — CLB Test'), 'giai-dau-giao-huu-59-clb-test');
    assert.match(generateSlug('Giải Đấu'), /^giai-dau-[a-f0-9]{18}$/);
    assert.match(generateSlug(''), /^giai-[a-f0-9]{18}$/);
    assert.ok(tournaments.includes("import { generateSlug } from '@/lib/tournament/publicSlug';"));
    assert.equal(/function generateSlug|function slugify/.test(tournaments), false);
  },

  'client: getFriendlyStandings({ tournamentId | tournamentClubId }) no-store'() {
    assert.ok(client.includes('export function getFriendlyStandings('));
    assert.ok(client.includes("request('/friendly/standings'"));
  },
});

suite('f2 api contract — SQL tích hợp', {
  'sinh từ script, một transaction, nạp 111, kết thúc ROLLBACK, không COMMIT'() {
    const file = 'database/tests/epic3_f2_integration.sql';
    assert.ok(exists('scripts/qa/epic3-f2-integration.js'));
    assert.ok(exists(file));
    const sql = norm(read(file));
    assert.ok(sql.trimEnd().endsWith('ROLLBACK;'));
    assert.equal(/^\s*COMMIT;/m.test(sql), false);
    assert.ok(sql.includes(FN), 'nạp thân 111 trong transaction');
    for (const key of ['g1.finalize.match_count', 'g1.entries.club', 'd49.host_guest', 'limit.over', 'not_ready', 'roster_changed', 'd50.after', 'internal14.match_count', 'zz.ALL']) {
      assert.ok(sql.includes(`'${key}`), `thiếu ca ${key}`);
    }
  },
});
