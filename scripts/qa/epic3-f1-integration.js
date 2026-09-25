'use strict';
// Sinh SQL kiểm thử tích hợp Epic 3 F1 (MỘT transaction, ROLLBACK ở cuối). Nạp luôn thân migration 110 trong
// transaction nên kiểm được TRƯỚC khi apply thật (DDL của Postgres có transaction: ROLLBACK trả lại mọi thứ).
// Dữ liệu tạm tạo trong transaction: hai group khách tạm (mã zze3a-…/zze3b-…) + thành viên + hồ sơ thi đấu, các giải
// friendly/internal của group chủ nhà 59 (qua save_unified_setup_aggregate_draft_v1). Mọi kiểm tra sai → RAISE
// EXCEPTION 'IT_FAIL <ca>: …' (transaction hỏng, không gì được ghi). Không ghi dữ liệu thật.
//
// Dùng:
//   node scripts/qa/epic3-f1-integration.js            > database/tests/epic3_f1_integration.sql
//   node scripts/qa/epic3-f1-integration.js --applied  (110 đã apply: bỏ thân migration, dùng hàm đang chạy)
//   node scripts/qa/epic3-f1-integration.js --post-check   (câu kiểm sau ROLLBACK: 0 dòng tạm còn lại)
//   node scripts/qa/epic3-f1-integration.js --md5          (md5(prosrc) kỳ vọng của 4 hàm 110 + câu SQL so)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HOST_GROUP_ID = 59;
const REAL_GUEST_GROUP_ID = 19;
const FUNCTIONS = ['friendly_sync_notifications', 'friendly_invite_club', 'friendly_club_action', 'set_friendly_registration_window'];

const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/110_friendly_club_rosters.sql'), 'utf8')
  .replace(/\r\n?/g, '\n');

if (process.argv.includes('--md5')) {
  const lines = FUNCTIONS.map((name) => {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    const open = migration.indexOf('AS $$', start) + 'AS $$'.length;
    const close = migration.indexOf('$$;', open);
    return `${name}\t${crypto.createHash('md5').update(migration.slice(open, close), 'utf8').digest('hex')}`;
  });
  process.stdout.write(`${lines.join('\n')}\n-- So trên DB sau khi apply:\n`
    + `SELECT proname, md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN (${FUNCTIONS.map((n) => `'${n}'`).join(', ')}) ORDER BY proname;\n`);
  process.exit(0);
}

if (process.argv.includes('--post-check')) {
  process.stdout.write(`-- Chạy SAU file tích hợp (đã ROLLBACK): mọi cột phải = 0.
SELECT
  (SELECT count(*) FROM public.groups WHERE code LIKE 'zze3a-%' OR code LIKE 'zze3b-%' OR name LIKE 'ZZE3_ IT F1%') AS groups_tmp,
  (SELECT count(*) FROM public.club_members WHERE full_name LIKE 'ZZE3_ VĐV%') AS members_tmp,
  (SELECT count(*) FROM public.tournaments WHERE name LIKE 'ZZE3A IT F1%') AS tournaments_tmp,
  (SELECT count(*) FROM public.club_notifications WHERE payload->>'tournamentName' LIKE 'ZZE3A IT F1%') AS notifications_tmp,
  (SELECT count(*) FROM public.tournament_setup_mutations WHERE idempotency_key LIKE 'zze3a-it-f1-%') AS mutations_tmp;
`);
  process.exit(0);
}

const applied = process.argv.includes('--applied');
const body = applied
  ? '-- 110 đã apply: dùng hàm đang chạy.'
  : migration.slice(migration.indexOf('ALTER TABLE public.tournament_clubs'), migration.lastIndexOf('COMMIT;')).trim();

// Token thô cố định (định dạng base64url 43 ký tự như issueInviteToken) → chỉ băm đi vào RPC.
const TOKENS = {};
function token(name) {
  if (!TOKENS[name]) {
    const raw = `ZZE3Afriendly${name}`.padEnd(43, '_').slice(0, 43);
    TOKENS[name] = { raw, hash: crypto.createHash('sha256').update(raw, 'utf8').digest('hex') };
  }
  return TOKENS[name];
}
const hash = (name) => `'${token(name).hash}'`;

const lit = (value) => (value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);

function invite(group, tournament, club, quota, note, max, tokenName) {
  return `public.friendly_invite_club(${group}, ${tournament}, ${club}, ${quota == null ? 'NULL' : quota}, ${lit(note)}, ${max == null ? 'NULL' : max}, ${tokenName ? hash(tokenName) : "'abc'"})`;
}
// Luôn truyền version hiện tại của dòng (trừ ca xung đột).
function action(actor, side, club, name, payload = "'{}'::jsonb", version = null) {
  return `public.friendly_club_action(${actor}, '${side}', ${club}, '${name}', ${version || `(SELECT version FROM public.tournament_clubs WHERE id = ${club})`}, ${payload})`;
}
function expectError(key, call, code) {
  return `
  e := NULL;
  BEGIN
    PERFORM ${call};
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('${key}', e, '${code}');`;
}
const ok = (key, cond, detail = 'NULL') => `
  PERFORM pg_temp.it_ok('${key}', ${cond}, ${detail});`;

// Roster: arr = biến mảng bigint[] (ma/mb); pairs = [[i, j], …] chỉ số 1-based; unpaired = [i…];
// extraRefs: thêm ref thô vào cặp cuối (ca khách mời).
function roster(arr, pairs, unpaired = [], { pairPrefix = 'p', memberIds = null, rawPairs = null } = {}) {
  const ids = memberIds || [...new Set([...pairs.flat(), ...unpaired])];
  const memberList = ids.map((i) => `${arr}[${i}]::text`).join(', ');
  const pairList = rawPairs || pairs.map(([a, b], index) => `jsonb_build_object('pairId', '${pairPrefix}${index + 1}', 'participantRefs', jsonb_build_array('member:' || ${arr}[${a}], 'member:' || ${arr}[${b}]), 'locked', false)`);
  return `jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(${memberList}), 'pairs', jsonb_build_array(${pairList.join(', ')}), 'unpairedRefs', jsonb_build_array(${unpaired.map((i) => `'member:' || ${arr}[${i}]`).join(', ')})))`;
}
const notif = (group, kind, club) => `(SELECT n FROM public.club_notifications n WHERE n.group_id = ${group} AND n.kind = '${kind}' AND n.subject_type = 'tournament_club' AND n.subject_id = ${club})`;
const notifStatus = (group, kind, club) => `(SELECT n.status FROM public.club_notifications n WHERE n.group_id = ${group} AND n.kind = '${kind}' AND n.subject_type = 'tournament_club' AND n.subject_id = ${club})`;
const row = (club) => `(SELECT tc FROM public.tournament_clubs tc WHERE tc.id = ${club})`;

function saveDraft(label, name, mode) {
  return `
  r := public.save_unified_setup_aggregate_draft_v1(host, NULL, NULL, 'zze3a-it-f1-${label}-' || ga,
    jsonb_build_object('currentStep', 1, 'tournament', jsonb_build_object('name', ${lit(name)}, 'organizerMode', '${mode}')),
    1, 'zze3a-it-f1-save-${label}-' || ga);`;
}

const out = [];
out.push(`-- Kiểm thử tích hợp Epic 3 F1: migration 110 (nạp trong transaction) + mời / hạn mức / đăng ký cặp / cửa sổ /
-- thông báo / link. Sinh bởi scripts/qa/epic3-f1-integration.js${applied ? ' --applied' : ''}. MỘT transaction, ROLLBACK ở cuối.
-- Kỳ vọng: bảng it_result liệt kê mọi ca (k, v), dòng cuối 'zz.ALL' = 'ok'. Ca sai → lỗi 'IT_FAIL <ca>: …' và không có bảng.
-- Không kiểm được trong một transaction: hai lần mời song song (khoá tournaments FOR UPDATE) — kiểm bằng đọc mã
-- (tests/stitch-setup/epic-3/f1-api-contract.test.js).
BEGIN;
${body}

CREATE TEMP TABLE it_result(k text, v text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.it_ok(p_key text, p_cond boolean, p_detail text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_cond IS NOT TRUE THEN
    RAISE EXCEPTION 'IT_FAIL %: điều kiện sai (%)', p_key, COALESCE(p_detail, 'null');
  END IF;
  INSERT INTO it_result VALUES (p_key, COALESCE(p_detail, 'ok'));
END
$f$;
CREATE FUNCTION pg_temp.it_err(p_key text, p_err text, p_code text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_err IS DISTINCT FROM p_code THEN
    RAISE EXCEPTION 'IT_FAIL %: mong lỗi % nhưng được %', p_key, p_code, COALESCE(p_err, 'không lỗi');
  END IF;
  INSERT INTO it_result VALUES (p_key, p_err);
END
$f$;

DO $it$
DECLARE
  host bigint := ${HOST_GROUP_ID};
  ga bigint; gb bigint; mid bigint;
  ma bigint[] := ARRAY[]::bigint[];
  mb bigint[] := ARRAY[]::bigint[];
  r jsonb; x jsonb; e text; s text;
  t1 bigint; d1 bigint; t2 bigint; d2 bigint; t3 bigint; t4 bigint;
  ca bigint; cb bigint; ca2 bigint; cb2 bigint; c19 bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = host) THEN
    RAISE EXCEPTION 'IT_FAIL setup: không có group chủ nhà %', host;
  END IF;

  -- ===== Dữ liệu tạm (trong transaction) =====
  INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
  VALUES ('zze3a-' || substr(md5(random()::text), 1, 8), 'ZZE3A IT F1 khách A (rollback)', 'x', 'x') RETURNING id INTO ga;
  INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
  VALUES ('zze3b-' || substr(md5(random()::text), 1, 8), 'ZZE3B IT F1 khách B (rollback)', 'x', 'x') RETURNING id INTO gb;
  FOR i IN 1..6 LOOP
    INSERT INTO public.club_members(group_id, full_name, is_active) VALUES (ga, 'ZZE3A VĐV ' || i, true) RETURNING id INTO mid;
    INSERT INTO public.athletes(display_name, normalized_name, legacy_club_member_id) VALUES ('ZZE3A VĐV ' || i, 'zze3a vdv ' || i, mid)
    ON CONFLICT (legacy_club_member_id) DO NOTHING;
    ma := ma || mid;
  END LOOP;
  FOR i IN 1..9 LOOP
    INSERT INTO public.club_members(group_id, full_name, is_active) VALUES (gb, 'ZZE3B VĐV ' || i, true) RETURNING id INTO mid;
    INSERT INTO public.athletes(display_name, normalized_name, legacy_club_member_id) VALUES ('ZZE3B VĐV ' || i, 'zze3b vdv ' || i, mid)
    ON CONFLICT (legacy_club_member_id) DO NOTHING;
    mb := mb || mid;
  END LOOP;
  -- Thành viên B9 không có hồ sơ thi đấu (gỡ liên kết trong transaction).
  UPDATE public.athletes SET legacy_club_member_id = NULL WHERE legacy_club_member_id = mb[9];
${saveDraft('t1', 'ZZE3A IT F1 giao hữu 1', 'friendly')}
  t1 := (r->>'tournament_id')::bigint; d1 := (r->>'division_id')::bigint;
${saveDraft('t2', 'ZZE3A IT F1 giao hữu 2', 'friendly')}
  t2 := (r->>'tournament_id')::bigint; d2 := (r->>'division_id')::bigint;
${saveDraft('t3', 'ZZE3A IT F1 nội bộ', 'internal')}
  t3 := (r->>'tournament_id')::bigint;
${saveDraft('t4', 'ZZE3A IT F1 giao hữu CLB 19', 'friendly')}
  t4 := (r->>'tournament_id')::bigint;
  UPDATE public.tournaments SET event_date = '2026-10-12', settings = settings || '{"poster_url": "zze3a-poster"}'::jsonb WHERE id IN (t1, t2);
${ok('setup.friendly_mode', `(SELECT settings->>'organizer_mode' FROM public.tournaments WHERE id = t1) = 'friendly' AND (SELECT settings->>'organizer_mode' FROM public.tournaments WHERE id = t3) = 'internal'`)}
${ok('setup.division_open', `(SELECT roster_lock_status FROM public.tournament_divisions WHERE id = d1) = 'open'`)}

  -- ===== Giải 1, hạn mức mặc định 1 =====
  r := ${invite('host', 't1', 'ga', 3, 'Mời giao lưu', 1, 'A1')};
  ca := (r->>'id')::bigint;
${ok('invite.a', `r->>'invitation_status' = 'invited' AND (r->>'version')::int = 1 AND NOT (r ? 'invite_token_hash') AND (r->>'has_invite_link')::boolean AND (r->>'quota')::int = 3`, "r->>'invitation_status'")}
${ok('invite.hash_stored', `(SELECT tc.invite_token_hash = ${hash('A1')} AND tc.invite_token_issued_at IS NOT NULL FROM public.tournament_clubs tc WHERE tc.id = ca)`)}
${ok('notify.invite_open', `EXISTS (SELECT 1 FROM public.club_notifications n WHERE n.group_id = ga AND n.kind = 'tournament_invitation' AND n.subject_type = 'tournament_club' AND n.subject_id = ca AND n.status = 'open' AND n.payload->>'reason' = 'invited' AND n.payload->>'tournamentName' = 'ZZE3A IT F1 giao hữu 1' AND n.payload->>'hostClubName' = (SELECT name FROM public.groups WHERE id = host) AND n.payload->>'eventDate' = '2026-10-12' AND NOT (n.payload ? 'tournamentId') AND NOT (n.payload ? 'group_id'))`)}
${ok('notify.no_host_review_yet', `NOT EXISTS (SELECT 1 FROM public.club_notifications n WHERE n.group_id = host AND n.kind = 'tournament_roster_review' AND n.subject_id = ca)`)}
${expectError('limit.second_club', invite('host', 't1', 'gb', null, null, 1, 'B1'), 'FRIENDLY_CLUB_LIMIT_REACHED')}
${expectError('invite.already', invite('host', 't1', 'ga', null, null, 5, 'X1'), 'CLUB_ALREADY_INVITED')}
${expectError('invite.host', invite('host', 't1', 'host', null, null, 5, 'X2'), 'CLUB_IS_HOST')}
${expectError('invite.internal', invite('host', 't3', 'ga', null, null, 1, 'X3'), 'FRIENDLY_MODE_REQUIRED')}
${expectError('invite.max_null', invite('host', 't1', 'gb', null, null, null, 'X4'), 'SETUP_PAYLOAD_INVALID')}
${expectError('invite.max_zero', invite('host', 't1', 'gb', null, null, 0, 'X5'), 'SETUP_PAYLOAD_INVALID')}
${expectError('invite.max_over_core', invite('host', 't1', 'gb', null, null, 32, 'X6'), 'SETUP_PAYLOAD_INVALID')}
${expectError('invite.bad_hash', invite('host', 't1', 'gb', null, null, 1, null), 'SETUP_PAYLOAD_INVALID')}
${expectError('invite.quota_invalid', invite('host', 't1', 'gb', 33, null, 5, 'X7'), 'FRIENDLY_QUOTA_INVALID')}
${expectError('invite.club_missing', invite('host', 't1', '(SELECT max(id) + 100000 FROM public.groups)', null, null, 5, 'X8'), 'CLUB_NOT_FOUND')}
${expectError('invite.not_owner', invite('ga', 't1', 'gb', null, null, 5, 'X9'), 'TOURNAMENT_NOT_FOUND')}

  -- Sai phía / xung đột version
${expectError('side.wrong_guest', action('gb', 'guest', 'ca', 'accept'), 'FRIENDLY_CLUB_NOT_FOUND')}
${expectError('side.host_as_guest', action('host', 'guest', 'ca', 'accept'), 'FRIENDLY_CLUB_NOT_FOUND')}
${expectError('side.guest_as_host', action('ga', 'host', 'ca', 'remove'), 'FRIENDLY_CLUB_NOT_FOUND')}
${expectError('side.guest_approve', action('ga', 'guest', 'ca', 'approve'), 'FRIENDLY_TRANSITION_INVALID')}
${expectError('side.guest_rotate', action('ga', 'guest', 'ca', 'rotate_link'), 'FRIENDLY_TRANSITION_INVALID')}
${expectError('side.host_submit', action('host', 'host', 'ca', 'submit_roster'), 'FRIENDLY_TRANSITION_INVALID')}
${expectError('version.conflict', action('ga', 'guest', 'ca', 'accept', "'{}'::jsonb", '99'), 'FRIENDLY_CLUB_VERSION_CONFLICT')}
${ok('version.unchanged', `(SELECT tc.invitation_status = 'invited' AND tc.version = 1 FROM public.tournament_clubs tc WHERE tc.id = ca)`)}

  -- Suất được trả lại: A từ chối → mời B được (hạn mức 1)
  r := ${action('ga', 'guest', 'ca', 'decline')};
${ok('decline.a', `r->>'invitation_status' = 'declined' AND r->>'responded_at' IS NOT NULL`)}
${ok('notify.decline_resolved', `${notifStatus('ga', 'tournament_invitation', 'ca')} = 'resolved'`)}
  r := ${invite('host', 't1', 'gb', 2, null, 1, 'B1')};
  cb := (r->>'id')::bigint;
${ok('limit.slot_returned', `r->>'invitation_status' = 'invited'`)}
  r := ${action('host', 'host', 'cb', 'remove')};
${ok('remove.revokes_link', `r->>'invitation_status' = 'withdrawn' AND (r->>'has_invite_link')::boolean = false AND (SELECT tc.invite_token_hash IS NULL FROM public.tournament_clubs tc WHERE tc.id = cb)`)}
${ok('notify.remove_resolved', `${notifStatus('gb', 'tournament_invitation', 'cb')} = 'resolved'`)}
  r := ${invite('host', 't1', 'ga', 3, 'Mời lại', 1, 'A2')};
${ok('reinvite.a', `(r->>'id')::bigint = ca AND r->>'invitation_status' = 'invited' AND (r->>'version')::int = 3 AND r->>'responded_at' IS NULL AND (SELECT tc.invite_token_hash = ${hash('A2')} FROM public.tournament_clubs tc WHERE tc.id = ca)`, "r->>'version'")}
${ok('notify.reinvite_open', `${notifStatus('ga', 'tournament_invitation', 'ca')} = 'open'`)}

  -- Người dùng "Bỏ qua" thông báo rồi trạng thái rời → vẫn dismissed
  UPDATE public.club_notifications SET status = 'dismissed', resolved_at = now()
  WHERE group_id = ga AND kind = 'tournament_invitation' AND subject_type = 'tournament_club' AND subject_id = ca;
  r := ${action('ga', 'guest', 'ca', 'accept')};
${ok('accept.a', `r->>'invitation_status' = 'accepted'`)}
${ok('notify.dismissed_kept', `${notifStatus('ga', 'tournament_invitation', 'ca')} = 'dismissed'`)}

  -- Khách A: lưu 2 cặp → gửi
  r := ${action('ga', 'guest', 'ca', 'save_roster', roster('ma', [[1, 2], [3, 4]]))};
${ok('roster.saved', `r->>'invitation_status' = 'accepted' AND jsonb_array_length(r->'roster_draft'->'pairs') = 2 AND r->'roster_draft'->'unpairedRefs' = '[]'::jsonb`)}
  r := ${action('ga', 'guest', 'ca', 'submit_roster')};
${ok('roster.submitted', `r->>'invitation_status' = 'roster_submitted' AND (r->'roster_submitted'->>'pairCount')::int = 2 AND (SELECT count(*) FROM jsonb_object_keys(r->'roster_submitted'->'memberNames')) = 4 AND r->'roster_submitted'->'memberNames'->>(ma[1]::text) = 'ZZE3A VĐV 1' AND r->>'roster_submitted_at' IS NOT NULL`)}
${ok('notify.review_open', `EXISTS (SELECT 1 FROM public.club_notifications n WHERE n.group_id = host AND n.kind = 'tournament_roster_review' AND n.subject_id = ca AND n.status = 'open' AND n.payload->>'reason' = 'roster_submitted' AND n.payload->>'guestClubName' = 'ZZE3A IT F1 khách A (rollback)' AND (n.payload->>'pairCount')::int = 2 AND (n.payload->>'tournamentId')::bigint = t1 AND (n.payload->>'divisionId')::bigint = d1)`)}

  -- Yêu cầu sửa: bắt buộc lý do 2–300 ký tự
${expectError('review.note_missing', action('host', 'host', 'ca', 'request_changes'), 'FRIENDLY_NOTE_REQUIRED')}
${expectError('review.note_short', action('host', 'host', 'ca', 'request_changes', `'{"note": "  x  "}'::jsonb`), 'FRIENDLY_NOTE_REQUIRED')}
  r := ${action('host', 'host', 'ca', 'request_changes', `'{"note": "Cặp 2 cần đổi người"}'::jsonb`)};
${ok('review.changes_requested', `r->>'invitation_status' = 'changes_requested' AND r->>'review_note' = 'Cặp 2 cần đổi người' AND r->>'roster_approved_version' IS NULL`)}
${ok('notify.changes_reopen', `EXISTS (SELECT 1 FROM public.club_notifications n WHERE n.group_id = ga AND n.kind = 'tournament_invitation' AND n.subject_id = ca AND n.status = 'open' AND n.payload->>'reason' = 'changes_requested')`)}
${ok('notify.review_resolved_on_changes', `${notifStatus('host', 'tournament_roster_review', 'ca')} = 'resolved'`)}
  r := ${action('ga', 'guest', 'ca', 'save_roster', roster('ma', [[1, 3], [2, 4]]))};
  r := ${action('ga', 'guest', 'ca', 'submit_roster')};
${ok('resubmit.a', `r->>'invitation_status' = 'roster_submitted' AND r->>'review_note' IS NULL AND ${notifStatus('ga', 'tournament_invitation', 'ca')} = 'resolved' AND ${notifStatus('host', 'tournament_roster_review', 'ca')} = 'open'`)}
  r := ${action('host', 'host', 'ca', 'approve')};
${ok('approve.version', `r->>'invitation_status' = 'approved' AND (r->>'roster_approved_version')::bigint = (r->>'version')::bigint AND r->>'roster_reviewed_at' IS NOT NULL`, "r->>'roster_approved_version'")}
${ok('notify.approve_resolved', `${notifStatus('host', 'tournament_roster_review', 'ca')} = 'resolved'`)}

  -- Hạn mức cặp
${expectError('quota.below_roster', action('host', 'host', 'ca', 'set_quota', `'{"quota": 1}'::jsonb`), 'FRIENDLY_QUOTA_BELOW_ROSTER')}
${expectError('quota.invalid', action('host', 'host', 'ca', 'set_quota', `'{"quota": 40}'::jsonb`), 'FRIENDLY_QUOTA_INVALID')}
${expectError('quota.fraction', action('host', 'host', 'ca', 'set_quota', `'{"quota": 2.5}'::jsonb`), 'FRIENDLY_QUOTA_INVALID')}
${expectError('quota.missing', action('host', 'host', 'ca', 'set_quota'), 'FRIENDLY_QUOTA_INVALID')}
  r := ${action('host', 'host', 'ca', 'set_quota', `'{"quota": 2}'::jsonb`)};
${ok('quota.set', `(r->>'quota')::int = 2 AND r->>'invitation_status' = 'approved'`)}

  -- Link: đổi băm, unique, thu hồi khi rút
  r := ${action('host', 'host', 'ca', 'rotate_link', `jsonb_build_object('inviteTokenHash', ${hash('A3')})`)};
${ok('link.rotate', `r->>'invitation_status' = 'approved' AND (SELECT tc.invite_token_hash = ${hash('A3')} FROM public.tournament_clubs tc WHERE tc.id = ca)`)}
${expectError('link.rotate_bad_hash', action('host', 'host', 'ca', 'rotate_link', `'{"inviteTokenHash": "ZZ"}'::jsonb`), 'SETUP_PAYLOAD_INVALID')}
  e := NULL;
  BEGIN
    UPDATE public.tournament_clubs SET invite_token_hash = ${hash('A3')} WHERE id = cb;
  EXCEPTION WHEN unique_violation THEN e := 'UNIQUE_VIOLATION';
  END;
  PERFORM pg_temp.it_err('link.unique', e, 'UNIQUE_VIOLATION');
  r := ${action('host', 'host', 'ca', 'remove')};
${ok('remove.approved', `r->>'invitation_status' = 'withdrawn' AND r->>'roster_approved_version' IS NULL AND (SELECT tc.invite_token_hash IS NULL FROM public.tournament_clubs tc WHERE tc.id = ca)`)}
${expectError('remove.rotate_withdrawn', action('host', 'host', 'ca', 'rotate_link', `jsonb_build_object('inviteTokenHash', ${hash('A9')})`), 'FRIENDLY_TRANSITION_INVALID')}
  r := ${invite('host', 't1', 'ga', null, null, 1, 'A4')};
${ok('reinvite.keeps_draft', `r->>'invitation_status' = 'invited' AND jsonb_array_length(r->'roster_draft'->'pairs') = 2 AND r->'roster_submitted' = 'null'::jsonb AND r->>'review_note' IS NULL AND r->>'roster_approved_version' IS NULL AND r->>'quota' IS NULL`)}

  -- ===== Giải 2, hạn mức truyền vào 2 (ca core ≥ 3 CLB: chủ nhà + A + B) =====
  r := ${invite('host', 't2', 'ga', null, null, 2, 'A5')};
  ca2 := (r->>'id')::bigint;
  r := ${invite('host', 't2', 'gb', 3, null, 2, 'B2')};
  cb2 := (r->>'id')::bigint;
${ok('core3.two_guests', `(SELECT count(*) FROM public.tournament_clubs WHERE tournament_id = t2 AND invitation_status = 'invited') = 2`)}
${expectError('core3.limit_1_blocks_more', invite('host', 't2', `(SELECT id FROM public.groups WHERE id NOT IN (host, ga, gb) ORDER BY id LIMIT 1)`, null, null, 2, 'X10'), 'FRIENDLY_CLUB_LIMIT_REACHED')}
  r := ${action('gb', 'guest', 'cb2', 'accept')};
${ok('notify.accept_resolved', `${notifStatus('gb', 'tournament_invitation', 'cb2')} = 'resolved'`)}

  -- Roster sai của B
${expectError('roster.guest', action('gb', 'guest', 'cb2', 'save_roster', roster('mb', [], [], { memberIds: [1], rawPairs: ["jsonb_build_object('pairId', 'g1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'guest:g_zze3a_0001'))"] })), 'FRIENDLY_GUEST_NOT_ALLOWED')}
${expectError('roster.outside', action('gb', 'guest', 'cb2', 'save_roster', `jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text, ma[1]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'o1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || ma[1]))), 'unpairedRefs', '[]'::jsonb))`), 'FRIENDLY_MEMBER_OUTSIDE_CLUB')}
${expectError('roster.bad_pair_id', action('gb', 'guest', 'cb2', 'save_roster', roster('mb', [], [], { memberIds: [1, 2], rawPairs: ["jsonb_build_object('pairId', 'bad id!', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[2]))"] })), 'SETUP_PAYLOAD_INVALID')}
${expectError('roster.person_in_two_pairs', action('gb', 'guest', 'cb2', 'save_roster', roster('mb', [], [], { memberIds: [1, 2, 3], rawPairs: ["jsonb_build_object('pairId', 'd1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[2]))", "jsonb_build_object('pairId', 'd2', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[3]))"] })), 'SETUP_PAYLOAD_INVALID')}
${expectError('roster.unpaired_mismatch', action('gb', 'guest', 'cb2', 'save_roster', roster('mb', [[1, 2]], [], { memberIds: [1, 2, 3] })), 'SETUP_PAYLOAD_INVALID')}
${expectError('roster.not_object', action('gb', 'guest', 'cb2', 'save_roster', `'{"roster": []}'::jsonb`), 'SETUP_PAYLOAD_INVALID')}
  r := ${action('gb', 'guest', 'cb2', 'save_roster', roster('mb', [[1, 2], [3, 4], [5, 6], [7, 8]]))};
${ok('roster.save_over_quota', `jsonb_array_length(r->'roster_draft'->'pairs') = 4 AND r->>'invitation_status' = 'accepted'`)}
${expectError('roster.quota_exceeded', action('gb', 'guest', 'cb2', 'submit_roster'), 'FRIENDLY_QUOTA_EXCEEDED')}
  r := ${action('gb', 'guest', 'cb2', 'save_roster', roster('mb', [[1, 2], [3, 4], [5, 9]]))};
${expectError('roster.athlete_missing', action('gb', 'guest', 'cb2', 'submit_roster'), 'FRIENDLY_ATHLETE_ID_MISSING')}
  r := ${action('gb', 'guest', 'cb2', 'save_roster', roster('mb', [[1, 2]], [3]))};
${ok('roster.save_odd', `jsonb_array_length(r->'roster_draft'->'unpairedRefs') = 1`)}
${expectError('roster.unpaired', action('gb', 'guest', 'cb2', 'submit_roster'), 'FRIENDLY_ROSTER_UNPAIRED')}
  r := ${action('gb', 'guest', 'cb2', 'save_roster', `'{"roster": {"memberIds": [], "pairs": [], "unpairedRefs": []}}'::jsonb`)};
${expectError('roster.empty', action('gb', 'guest', 'cb2', 'submit_roster'), 'FRIENDLY_ROSTER_EMPTY')}
  r := ${action('gb', 'guest', 'cb2', 'save_roster', roster('mb', [[1, 2], [7, 8]]))};
  UPDATE public.club_members SET is_active = false WHERE id = mb[8];
${expectError('roster.inactive_member', action('gb', 'guest', 'cb2', 'submit_roster'), 'FRIENDLY_MEMBER_OUTSIDE_CLUB')}
  UPDATE public.club_members SET is_active = true WHERE id = mb[8];
  r := ${action('gb', 'guest', 'cb2', 'save_roster', roster('mb', [[1, 2], [3, 4]]))};

  -- Cửa sổ đăng ký
  x := public.set_friendly_registration_window(host, t2, NULL, true);
${ok('window.lock_value', `x->>'registrationLockedAt' IS NOT NULL AND x->'registrationDeadline' = 'null'::jsonb`)}
${expectError('window.locked', action('gb', 'guest', 'cb2', 'submit_roster'), 'FRIENDLY_REGISTRATION_CLOSED')}
${ok('window.settings_kept', `(SELECT settings->>'poster_url' = 'zze3a-poster' AND settings->>'organizer_mode' = 'friendly' AND settings->'friendly'->>'registrationLockedAt' IS NOT NULL FROM public.tournaments WHERE id = t2)`)}
  s := x->>'registrationLockedAt';
  x := public.set_friendly_registration_window(host, t2, NULL, true);
${ok('window.lock_keeps_time', `x->>'registrationLockedAt' = s`)}
  x := public.set_friendly_registration_window(host, t2, now() - interval '1 hour', false);
${ok('window.unlocked', `x->'registrationLockedAt' = 'null'::jsonb`)}
${expectError('window.deadline_passed', action('gb', 'guest', 'cb2', 'submit_roster'), 'FRIENDLY_REGISTRATION_CLOSED')}
  x := public.set_friendly_registration_window(host, t2, now(), false);
${expectError('window.deadline_exact', action('gb', 'guest', 'cb2', 'submit_roster'), 'FRIENDLY_REGISTRATION_CLOSED')}
  x := public.set_friendly_registration_window(host, t2, NULL, false);
  r := ${action('gb', 'guest', 'cb2', 'submit_roster')};
${ok('window.open_submit', `r->>'invitation_status' = 'roster_submitted'`)}
${expectError('window.internal', 'public.set_friendly_registration_window(host, t3, NULL, true)', 'FRIENDLY_MODE_REQUIRED')}
${expectError('window.not_owner', 'public.set_friendly_registration_window(ga, t2, NULL, true)', 'TOURNAMENT_NOT_FOUND')}
  x := public.set_friendly_registration_window(host, t2, NULL, true);
  r := ${action('host', 'host', 'cb2', 'approve')};
${ok('window.approve_while_locked', `r->>'invitation_status' = 'approved'`)}
${expectError('window.request_changes_locked', action('host', 'host', 'cb2', 'request_changes', `'{"note": "Sửa lại"}'::jsonb`), 'FRIENDLY_REGISTRATION_CLOSED')}
${expectError('window.guest_withdraw_locked', action('gb', 'guest', 'cb2', 'withdraw'), 'FRIENDLY_REGISTRATION_CLOSED')}

  -- Đã chốt (division locked): mọi hành động và mời → FRIENDLY_REGISTRATION_CLOSED
  UPDATE public.tournament_divisions SET roster_lock_status = 'locked' WHERE id = d2;
${expectError('finalized.action', action('host', 'host', 'cb2', 'remove'), 'FRIENDLY_REGISTRATION_CLOSED')}
${expectError('finalized.guest', action('ga', 'guest', 'ca2', 'accept'), 'FRIENDLY_REGISTRATION_CLOSED')}
${expectError('finalized.rotate', action('host', 'host', 'cb2', 'rotate_link', `jsonb_build_object('inviteTokenHash', ${hash('B9')})`), 'FRIENDLY_REGISTRATION_CLOSED')}
${expectError('finalized.invite', invite('host', 't2', 'ga', null, null, 5, 'X11'), 'FRIENDLY_REGISTRATION_CLOSED')}
${expectError('finalized.window', 'public.set_friendly_registration_window(host, t2, NULL, false)', 'FRIENDLY_REGISTRATION_CLOSED')}

  -- ===== CLB ${REAL_GUEST_GROUP_ID} thật (chỉ trong transaction) =====
  IF EXISTS (SELECT 1 FROM public.groups WHERE id = ${REAL_GUEST_GROUP_ID}) THEN
    r := ${invite('host', 't4', REAL_GUEST_GROUP_ID, null, null, 1, 'G19')};
    c19 := (r->>'id')::bigint;
    PERFORM pg_temp.it_ok('g19.invited', r->>'invitation_status' = 'invited' AND ${notifStatus(REAL_GUEST_GROUP_ID, 'tournament_invitation', 'c19')} = 'open', NULL);
  ELSE
    INSERT INTO it_result VALUES ('g19.invited', 'bỏ qua: không có group ${REAL_GUEST_GROUP_ID}');
  END IF;

  -- Không có token thô nào trong DB; mọi băm đúng định dạng
${ok('token.no_raw', `NOT EXISTS (SELECT 1 FROM public.tournament_clubs tc WHERE tc.tournament_id IN (t1, t2, t4) AND to_jsonb(tc)::text LIKE ANY (ARRAY[${Object.values(TOKENS).map((t) => `'%${t.raw}%'`).join(', ')}])) AND NOT EXISTS (SELECT 1 FROM public.club_notifications n WHERE n.subject_type = 'tournament_club' AND n.subject_id IN (SELECT id FROM public.tournament_clubs WHERE tournament_id IN (t1, t2, t4)) AND n.payload::text LIKE '%ZZE3Afriendly%')`)}
${ok('token.hash_shape', `NOT EXISTS (SELECT 1 FROM public.tournament_clubs tc WHERE tc.tournament_id IN (t1, t2, t4) AND tc.invite_token_hash IS NOT NULL AND tc.invite_token_hash !~ '^[a-f0-9]{64}$')`)}

  INSERT INTO it_result VALUES ('zz.ALL', 'ok');
END
$it$;
SELECT k, v FROM it_result ORDER BY k;
ROLLBACK;`);
process.stdout.write(out.join('\n') + '\n');
