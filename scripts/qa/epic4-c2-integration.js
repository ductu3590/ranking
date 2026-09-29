'use strict';
// Sinh SQL kiểm thử tích hợp Epic 4 C2 (MỘT transaction, ROLLBACK ở cuối). Nạp luôn thân migration 113 trong
// transaction nên kiểm được TRƯỚC khi apply thật. Dữ liệu tạm (giải cộng đồng + 2 nội dung + tài khoản VĐV + admin) tạo
// trong transaction rồi ROLLBACK — không ghi dữ liệu thật. Ca sai → RAISE EXCEPTION 'IT_FAIL <ca>: …'.
//
// Dùng:
//   node scripts/qa/epic4-c2-integration.js            > database/tests/epic4_c2_integration.sql
//   node scripts/qa/epic4-c2-integration.js --applied  (113 đã apply: bỏ thân migration, dùng hàm đang chạy)
//   node scripts/qa/epic4-c2-integration.js --md5      (md5(prosrc) kỳ vọng của các hàm 113 + câu SQL so)
//   node scripts/qa/epic4-c2-integration.js --post-check (câu kiểm sau ROLLBACK: 0 dòng tạm còn lại)
// Không kiểm được trong MỘT transaction: hai người cùng chiếm suất cuối song song. Bảo đảm nằm ở advisory lock theo
// division (community_lock_division) — kiểm bằng đọc mã trong c2-migration-static.test.js.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FUNCTIONS = [
  'community_lock_division', 'community_account_seat', 'community_active_registration', 'community_insert_registration',
  'community_cancel_pending_invites', 'community_merge_registrations', 'community_send_invite', 'community_join_pair',
  'community_register', 'community_player_action', 'community_join_by_link', 'community_invite_action', 'community_admin_action',
];
const SYSTEM_GROUP_ID = 8;

const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/113_community_registrations.sql'), 'utf8')
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
  (SELECT count(*) FROM public.tournaments WHERE name LIKE 'ZZE4C2 %') AS tournaments_tmp,
  (SELECT count(*) FROM public.player_accounts WHERE display_name LIKE 'ZZE4C2 %') AS accounts_tmp,
  (SELECT count(*) FROM public.platform_accounts WHERE login = 'zze4c2-admin') AS admins_tmp;
`);
  process.exit(0);
}

const body = process.argv.includes('--applied')
  ? ''
  : migration.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');

const tests = `
CREATE TEMP TABLE it_result (k text, v text);

CREATE FUNCTION pg_temp.it_ok(k text, cond boolean, detail text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'IT_FAIL %: %', k, COALESCE(detail, 'điều kiện sai'); END IF;
  INSERT INTO it_result VALUES (k, 'ok');
END
$f$;

-- Chạy một câu SQL, kỳ vọng lỗi có chứa 'want'. Mỗi lần chạy trong khối con → lỗi không làm hỏng transaction ngoài.
CREATE FUNCTION pg_temp.it_err(k text, stmt text, want text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE e text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  IF e IS NULL OR position(want IN e) = 0 THEN
    RAISE EXCEPTION 'IT_FAIL %: mong đợi lỗi chứa "%", nhận "%"', k, want, COALESCE(e, '(không lỗi)');
  END IF;
  INSERT INTO it_result VALUES (k, 'ok');
END
$f$;

CREATE FUNCTION pg_temp.it_json(stmt text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE j jsonb;
BEGIN
  EXECUTE stmt INTO j;
  RETURN j;
END
$f$;

DO $it$
DECLARE
  g bigint := ${SYSTEM_GROUP_ID};
  t bigint; dA bigint; dB bigint; adm bigint;
  a1 bigint; a2 bigint; a3 bigint; a4 bigint; a5 bigint; a6 bigint; a7 bigint; a8 bigint;
  j jsonb; r1 bigint; r3 bigint; r5 bigint; r8 bigint; r9 bigint; rid bigint; inv bigint;
  tok text := repeat('a', 64); tok2 text := repeat('b', 64);
  n integer;
BEGIN
  -- ===== dữ liệu tạm =====
  INSERT INTO public.tournaments (group_id, name, organizer_type, status, entrant_type, settings, visibility, public_slug)
  VALUES (g, 'ZZE4C2 giải', 'community', 'registration_open', 'pair', '{"open_registration": true, "organizer_mode": "community"}'::jsonb, 'unlisted', 'zze4c2-' || substr(md5(random()::text), 1, 8))
  RETURNING id INTO t;
  INSERT INTO public.tournament_divisions (group_id, tournament_id, name, entrant_type, play_type, registration_open, registration_capacity, gender_mode, entry_fee)
  VALUES (g, t, 'Đôi Nam Nữ', 'pair', 'doubles', true, 2, 'mixed', 150000) RETURNING id INTO dA;
  INSERT INTO public.tournament_divisions (group_id, tournament_id, name, entrant_type, play_type, registration_open, registration_capacity, gender_mode, entry_fee)
  VALUES (g, t, 'Đơn', 'individual', 'singles', true, NULL, 'any', 0) RETURNING id INTO dB;
  INSERT INTO public.platform_accounts (login, password_hash, role, status) VALUES ('zze4c2-admin', 'x', 'community_admin', 'active') RETURNING id INTO adm;
  INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender, self_declared_phr) VALUES ('0900000101', 'x', 'ZZE4C2 A1', 'male', 3.0) RETURNING id INTO a1;
  INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender, self_declared_phr) VALUES ('0900000102', 'x', 'ZZE4C2 A2', 'female', 3.0) RETURNING id INTO a2;
  INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender, self_declared_phr) VALUES ('0900000103', 'x', 'ZZE4C2 A3', 'male', 3.0) RETURNING id INTO a3;
  INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender, self_declared_phr) VALUES ('0900000104', 'x', 'ZZE4C2 A4', 'female', 3.0) RETURNING id INTO a4;
  INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender, self_declared_phr) VALUES ('0900000105', 'x', 'ZZE4C2 A5', 'male', 3.0) RETURNING id INTO a5;
  INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender, self_declared_phr) VALUES ('0900000106', 'x', 'ZZE4C2 A6', 'female', 3.0) RETURNING id INTO a6;
  INSERT INTO public.player_accounts (phone_norm, password_hash, display_name) VALUES ('0900000107', 'x', 'ZZE4C2 A7') RETURNING id INTO a7;
  INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender, self_declared_phr) VALUES ('0900000108', 'x', 'ZZE4C2 A8', 'male', 3.0) RETURNING id INTO a8;

  -- ===== đăng ký + lời mời theo SĐT =====
  j := pg_temp.it_json(format('SELECT public.community_register(%s, %s, %L)', dA, a1, '0900000102'));
  r1 := (j->>'registration_id')::bigint;
  PERFORM pg_temp.it_ok('reg.pair_awaiting', j->>'status' = 'awaiting_partner' AND (SELECT needs_partner AND origin = 'public_self' AND player_account_id = a1 FROM public.tournament_registrations WHERE id = r1), j::text);
  PERFORM pg_temp.it_ok('reg.seat1_from_profile', (SELECT full_name = 'ZZE4C2 A1' AND phone_norm = '0900000101' AND player_account_id = a1 FROM public.tournament_registration_members WHERE registration_id = r1 AND seat = 1), NULL);
  SELECT id INTO inv FROM public.tournament_pair_invites WHERE from_registration_id = r1 AND invited_player_account_id = a2 AND status = 'pending';
  PERFORM pg_temp.it_ok('invite.created_by_phone', inv IS NOT NULL, NULL);

  PERFORM pg_temp.it_err('reg.duplicate', format('SELECT public.community_register(%s, %s, NULL)', dA, a1), 'COMMUNITY_ALREADY_REGISTERED');
  PERFORM pg_temp.it_err('reg.gender_required', format('SELECT public.community_register(%s, %s, NULL)', dA, a7), 'COMMUNITY_GENDER_REQUIRED');
  PERFORM pg_temp.it_err('reg.invite_self', format('SELECT public.community_register(%s, %s, %L)', dA, a3, '0900000103'), 'COMMUNITY_INVITE_SELF');

  -- Số điện thoại chưa có tài khoản: không lỗi, không lời mời (phản hồi đồng nhất).
  j := pg_temp.it_json(format('SELECT public.community_register(%s, %s, %L)', dA, a3, '0999999999'));
  r3 := (j->>'registration_id')::bigint;
  SELECT count(*) INTO n FROM public.tournament_pair_invites WHERE from_registration_id = r3;
  PERFORM pg_temp.it_ok('invite.silent_unknown_phone', n = 0, format('n=%s', n));

  -- ===== nhận lời mời: người sai bị từ chối, người đúng ghép cặp nguyên tử =====
  PERFORM pg_temp.it_err('invite.wrong_account', format('SELECT public.community_invite_action(%s, %s, %L)', inv, a4, 'accept'), 'COMMUNITY_NOT_FOUND');
  j := pg_temp.it_json(format('SELECT public.community_invite_action(%s, %s, %L)', inv, a2, 'accept'));
  PERFORM pg_temp.it_ok('invite.accept_merges', j->>'status' = 'accepted' AND (j->>'registration_id')::bigint = r1
    AND (SELECT status = 'submitted' AND NOT needs_partner FROM public.tournament_registrations WHERE id = r1)
    AND (SELECT count(*) = 2 FROM public.tournament_registration_members WHERE registration_id = r1)
    AND (SELECT player_account_id = a2 FROM public.tournament_registration_members WHERE registration_id = r1 AND seat = 2)
    AND EXISTS (SELECT 1 FROM public.tournament_registrations WHERE merged_into = r1 AND status = 'merged'), j::text);
  PERFORM pg_temp.it_err('invite.reaccept', format('SELECT public.community_invite_action(%s, %s, %L)', inv, a2, 'accept'), 'COMMUNITY_INVALID_TRANSITION');
  PERFORM pg_temp.it_err('reg.partner_cannot_reregister', format('SELECT public.community_register(%s, %s, NULL)', dA, a2), 'COMMUNITY_ALREADY_REGISTERED');

  -- ===== link rủ =====
  PERFORM pg_temp.it_json(format('SELECT public.community_player_action(%s, %s, %L, %L::jsonb)', r3, a3, 'set_link',
    jsonb_build_object('token_hash', tok, 'expires_at', (now() + interval '7 days')::text)::text));
  PERFORM pg_temp.it_err('link.self_join', format('SELECT public.community_join_by_link(%L, %s)', tok, a3), 'COMMUNITY_INVITE_SELF');
  PERFORM pg_temp.it_err('link.bad_hash', format('SELECT public.community_join_by_link(%L, %s)', 'khong-hop-le', a4), 'COMMUNITY_LINK_INVALID');
  PERFORM pg_temp.it_err('link.unknown_hash', format('SELECT public.community_join_by_link(%L, %s)', tok2, a4), 'COMMUNITY_LINK_INVALID');
  j := pg_temp.it_json(format('SELECT public.community_join_by_link(%L, %s)', tok, a4));
  PERFORM pg_temp.it_ok('link.join_merges', (j->>'registration_id')::bigint = r3
    AND (SELECT status = 'submitted' AND partner_link_hash IS NULL FROM public.tournament_registrations WHERE id = r3)
    AND (SELECT player_account_id = a4 FROM public.tournament_registration_members WHERE registration_id = r3 AND seat = 2), j::text);
  PERFORM pg_temp.it_err('link.reuse', format('SELECT public.community_join_by_link(%L, %s)', tok, a6), 'COMMUNITY_LINK_INVALID');

  -- Link hết hạn.
  j := pg_temp.it_json(format('SELECT public.community_register(%s, %s, NULL)', dA, a5));
  r5 := (j->>'registration_id')::bigint;
  PERFORM pg_temp.it_json(format('SELECT public.community_player_action(%s, %s, %L, %L::jsonb)', r5, a5, 'set_link',
    jsonb_build_object('token_hash', tok2, 'expires_at', (now() - interval '1 minute')::text)::text));
  PERFORM pg_temp.it_err('link.expired', format('SELECT public.community_join_by_link(%L, %s)', tok2, a6), 'COMMUNITY_LINK_INVALID');

  -- ===== ghép Nam-Nữ =====
  j := pg_temp.it_json(format('SELECT public.community_register(%s, %s, NULL)', dA, a8));
  r8 := (j->>'registration_id')::bigint;
  PERFORM pg_temp.it_err('merge.mixed_gender', format('SELECT public.community_admin_action(%s, %s, %L, NULL, NULL, %s)', r5, adm, 'merge', r8), 'COMMUNITY_MIXED_GENDER_REQUIRED');
  j := pg_temp.it_json(format('SELECT public.community_register(%s, %s, NULL)', dA, a6));
  r9 := (j->>'registration_id')::bigint;
  j := pg_temp.it_json(format('SELECT public.community_admin_action(%s, %s, %L, NULL, NULL, %s)', r5, adm, 'merge', r9));
  PERFORM pg_temp.it_ok('merge.admin_ok', j->>'status' = 'submitted' AND (SELECT count(*) = 2 FROM public.tournament_registration_members WHERE registration_id = r5), j::text);

  -- ===== duyệt + hạn mức (capacity = 2) =====
  PERFORM pg_temp.it_err('admin.version_conflict', format('SELECT public.community_admin_action(%s, %s, %L, NULL, %s)', r1, adm, 'admit', 9999), 'COMMUNITY_CONFLICT');
  j := pg_temp.it_json(format('SELECT public.community_admin_action(%s, %s, %L)', r1, adm, 'admit'));
  PERFORM pg_temp.it_ok('admin.admit_1', j->>'status' = 'approved' AND (SELECT admitted_at IS NOT NULL FROM public.tournament_registrations WHERE id = r1), j::text);
  j := pg_temp.it_json(format('SELECT public.community_admin_action(%s, %s, %L)', r3, adm, 'admit'));
  PERFORM pg_temp.it_err('admin.capacity_full', format('SELECT public.community_admin_action(%s, %s, %L)', r5, adm, 'admit'), 'COMMUNITY_CAPACITY_FULL');
  PERFORM pg_temp.it_err('admin.invalid_transition', format('SELECT public.community_admin_action(%s, %s, %L)', r1, adm, 'restore'), 'COMMUNITY_INVALID_TRANSITION');
  PERFORM pg_temp.it_err('admin.not_admin', format('SELECT public.community_admin_action(%s, %s, %L)', r5, 999999999, 'admit'), 'COMMUNITY_NOT_FOUND');

  -- ===== phí =====
  j := pg_temp.it_json(format('SELECT public.community_admin_action(%s, %s, %L)', r1, adm, 'fee_confirm'));
  PERFORM pg_temp.it_ok('fee.confirm', (j->>'fee_confirmed')::boolean AND (SELECT fee_confirmed_by_platform_account_id = adm FROM public.tournament_registrations WHERE id = r1), j::text);
  j := pg_temp.it_json(format('SELECT public.community_admin_action(%s, %s, %L)', r1, adm, 'fee_unconfirm'));
  PERFORM pg_temp.it_ok('fee.unconfirm', NOT (j->>'fee_confirmed')::boolean, j::text);
  j := pg_temp.it_json(format('SELECT public.community_register(%s, %s, %L)', dB, a1, '0900000102'));
  rid := (j->>'registration_id')::bigint;
  PERFORM pg_temp.it_ok('single.submitted_directly', j->>'status' = 'submitted' AND NOT EXISTS (SELECT 1 FROM public.tournament_pair_invites WHERE from_registration_id = rid), j::text);
  PERFORM pg_temp.it_err('fee.not_applicable', format('SELECT public.community_admin_action(%s, %s, %L)', rid, adm, 'fee_confirm'), 'COMMUNITY_FEE_NOT_APPLICABLE');

  -- ===== rút đơn giải phóng suất =====
  j := pg_temp.it_json(format('SELECT public.community_player_action(%s, %s, %L)', r1, a2, 'withdraw'));
  PERFORM pg_temp.it_ok('withdraw.by_seat2_member', j->>'status' = 'withdrawn', j::text);
  j := pg_temp.it_json(format('SELECT public.community_admin_action(%s, %s, %L)', r5, adm, 'admit'));
  PERFORM pg_temp.it_ok('admin.admit_after_withdraw', j->>'status' = 'approved', j::text);
  PERFORM pg_temp.it_err('withdraw.stranger', format('SELECT public.community_player_action(%s, %s, %L)', r5, a8, 'withdraw'), 'COMMUNITY_NOT_FOUND');
  PERFORM pg_temp.it_ok('withdrawn.can_register_again', (pg_temp.it_json(format('SELECT public.community_register(%s, %s, NULL)', dA, a2))->>'status') = 'awaiting_partner', NULL);

  -- ===== cửa sổ đăng ký =====
  UPDATE public.tournament_divisions SET registration_deadline = now() - interval '1 hour' WHERE id = dA;
  PERFORM pg_temp.it_err('window.deadline_passed', format('SELECT public.community_register(%s, %s, NULL)', dA, a7), 'COMMUNITY_DEADLINE_PASSED');
  UPDATE public.tournament_divisions SET registration_deadline = NULL, registration_open = false WHERE id = dA;
  PERFORM pg_temp.it_err('window.division_closed', format('SELECT public.community_register(%s, %s, NULL)', dA, a7), 'COMMUNITY_NOT_OPEN');
  UPDATE public.tournament_divisions SET registration_open = true WHERE id = dA;
  UPDATE public.tournaments SET settings = settings || '{"open_registration": false}'::jsonb WHERE id = t;
  PERFORM pg_temp.it_err('window.tournament_closed', format('SELECT public.community_register(%s, %s, NULL)', dA, a7), 'COMMUNITY_NOT_OPEN');
  UPDATE public.tournaments SET settings = settings || '{"open_registration": true}'::jsonb, status = 'scheduled' WHERE id = t;
  PERFORM pg_temp.it_err('window.locked_register', format('SELECT public.community_register(%s, %s, NULL)', dA, a7), 'COMMUNITY_TOURNAMENT_LOCKED');
  PERFORM pg_temp.it_err('window.locked_admin', format('SELECT public.community_admin_action(%s, %s, %L)', r3, adm, 'remove'), 'COMMUNITY_TOURNAMENT_LOCKED');
  UPDATE public.tournaments SET status = 'registration_open' WHERE id = t;

  -- ===== không phải giải cộng đồng =====
  UPDATE public.tournaments SET organizer_type = 'platform' WHERE id = t;
  PERFORM pg_temp.it_err('scope.not_community', format('SELECT public.community_register(%s, %s, NULL)', dA, a7), 'COMMUNITY_NOT_FOUND');
  UPDATE public.tournaments SET organizer_type = 'community' WHERE id = t;

  -- ===== quyền thực thi =====
  PERFORM pg_temp.it_ok('grant.public_rpc_service_only',
    has_function_privilege('service_role', 'public.community_register(bigint, bigint, text)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.community_admin_action(bigint, bigint, text, text, bigint, bigint)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.community_register(bigint, bigint, text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.community_admin_action(bigint, bigint, text, text, bigint, bigint)', 'EXECUTE'), NULL);
  PERFORM pg_temp.it_ok('grant.internal_no_one',
    NOT has_function_privilege('service_role', 'public.community_merge_registrations(bigint, bigint)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.community_lock_division(bigint, boolean)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.community_join_pair(jsonb, bigint, bigint)', 'EXECUTE'), NULL);

  INSERT INTO it_result VALUES ('zz.ALL', 'ok');
END
$it$;
SELECT k, v FROM it_result ORDER BY k;
`;

process.stdout.write(`-- Kiểm thử tích hợp Epic 4 C2: migration 113 (nạp trong transaction) + đăng ký / lời mời / link / ghép cặp / duyệt / hạn mức / phí / cửa sổ.
-- Sinh bởi scripts/qa/epic4-c2-integration.js. MỘT transaction, ROLLBACK ở cuối.
-- Kỳ vọng: bảng it_result liệt kê mọi ca (k, v), dòng cuối 'zz.ALL' = 'ok'. Ca sai → lỗi 'IT_FAIL <ca>: …' và không có bảng.
BEGIN;
${body}${tests}ROLLBACK;
`);
