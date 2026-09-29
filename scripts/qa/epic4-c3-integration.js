'use strict';
// Sinh SQL kiểm thử tích hợp Epic 4 C3 (MỘT transaction, ROLLBACK ở cuối) cho nhánh cộng đồng của
// finalize_internal_setup_v4 (migration 114). Nạp luôn thân migration 114 trong transaction nên kiểm được TRƯỚC khi apply thật.
// Dữ liệu tạm (giải cộng đồng + tài khoản + đơn đã duyệt) tạo trong transaction rồi ROLLBACK — không ghi dữ liệu thật.
// Ca sai → RAISE EXCEPTION 'IT_FAIL <ca>: …'.
//
// Dùng:
//   node scripts/qa/epic4-c3-integration.js            > database/tests/epic4_c3_integration.sql
//   node scripts/qa/epic4-c3-integration.js --applied  (114 đã apply: bỏ thân migration, dùng hàm đang chạy)
//   node scripts/qa/epic4-c3-integration.js --md5      (md5(prosrc) kỳ vọng của hàm finalize + câu SQL so)
//   node scripts/qa/epic4-c3-integration.js --post-check (câu kiểm sau ROLLBACK: 0 dòng tạm còn lại)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SYSTEM_GROUP_ID = 8;

const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/114_finalize_v4_community.sql'), 'utf8')
  .replace(/\r\n?/g, '\n');

if (process.argv.includes('--md5')) {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.finalize_internal_setup_v4(');
  const open = migration.indexOf('AS $$', start) + 'AS $$'.length;
  const close = migration.indexOf('$$;', open);
  const md5 = crypto.createHash('md5').update(migration.slice(open, close), 'utf8').digest('hex');
  process.stdout.write(`finalize_internal_setup_v4\t${md5}\n-- So trên DB sau khi apply:\n`
    + `SELECT proname, md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'finalize_internal_setup_v4';\n`
    + `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'tournament_athletes_source_ck';\n`);
  process.exit(0);
}

if (process.argv.includes('--post-check')) {
  process.stdout.write(`-- Chạy SAU file tích hợp (đã ROLLBACK): mọi cột phải = 0.
SELECT
  (SELECT count(*) FROM public.tournaments WHERE name LIKE 'ZZE4C3 %') AS tournaments_tmp,
  (SELECT count(*) FROM public.player_accounts WHERE display_name LIKE 'ZZE4C3 %') AS accounts_tmp,
  (SELECT count(*) FROM public.athletes WHERE display_name LIKE 'ZZE4C3 %') AS athletes_tmp;
`);
  process.exit(0);
}

const body = process.argv.includes('--applied')
  ? ''
  : migration.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '');

const FP = 'a'.repeat(64);

const tests = `
CREATE TEMP TABLE it_result (k text, v text);
CREATE TEMP SEQUENCE it_seq;

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

-- Dựng một giải + nội dung + p_pairs đơn approved (mỗi đơn 2 ghế, 2 tài khoản). p_type: 'community' | 'club'.
-- Trả { t, d, regs: [..] }. Bản nháp: nội bộ, thể thức vòng tròn, đã bốc thăm (fingerprint cố định).
CREATE FUNCTION pg_temp.mk_case(p_tag text, p_pairs integer, p_type text DEFAULT 'community') RETURNS jsonb
LANGUAGE plpgsql AS $f$
DECLARE
  g bigint := ${SYSTEM_GROUP_ID};
  t bigint; d bigint; r bigint; a bigint; b bigint; i integer; regs jsonb := '[]'::jsonb; accs jsonb := '[]'::jsonb;
BEGIN
  INSERT INTO public.tournaments (group_id, name, organizer_type, organizer_club_id, status, entrant_type, settings, visibility, public_slug)
  VALUES (g, 'ZZE4C3 ' || p_tag, p_type, CASE WHEN p_type = 'club' THEN g END, 'draft', 'pair',
          jsonb_build_object('organizer_mode', CASE WHEN p_type = 'community' THEN 'community' ELSE 'internal' END), 'unlisted',
          'zze4c3-' || substr(md5(random()::text), 1, 10))
  RETURNING id INTO t;
  INSERT INTO public.tournament_divisions (group_id, tournament_id, name, entrant_type, play_type, competition_template, gender_mode, entry_fee,
                                           setup_draft)
  VALUES (g, t, 'ZZE4C3 Đôi ' || p_tag, 'pair', 'doubles', 'unified_setup_draft_v2', 'any', 100000,
          jsonb_build_object('draftVersion', 3, 'currentStep', 4, 'tournament', jsonb_build_object('name', 'ZZE4C3 ' || p_tag, 'organizerMode', 'internal'),
            'participants', jsonb_build_object('memberIds', '[]'::jsonb, 'guests', '[]'::jsonb), 'pairs', '[]'::jsonb, 'unpairedRefs', '[]'::jsonb,
            'format', jsonb_build_object('formatKey', 'round_robin', 'config', '{}'::jsonb),
            'draw', jsonb_build_object('status', 'draft', 'seed', 's', 'previewFingerprint', '${FP}')))
  RETURNING id INTO d;
  FOR i IN 1..p_pairs LOOP
    INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender, self_declared_phr)
    VALUES ('0977' || lpad(nextval('it_seq')::text, 6, '0'), 'x', 'ZZE4C3 ' || p_tag || ' N' || i, 'male', 3.0) RETURNING id INTO a;
    INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender, self_declared_phr)
    VALUES ('0977' || lpad(nextval('it_seq')::text, 6, '0'), 'x', 'ZZE4C3 ' || p_tag || ' F' || i, 'female', 3.0) RETURNING id INTO b;
    INSERT INTO public.tournament_registrations (group_id, division_id, tournament_club_id, entrant_type, status, origin, contact_phone_norm, needs_partner, player_account_id)
    VALUES (g, d, NULL, 'pair', 'approved', 'public_self', '0900000000', false, a) RETURNING id INTO r;
    INSERT INTO public.tournament_registration_members (group_id, registration_id, seat, full_name, phone_norm, self_declared_phr, gender, player_account_id)
    VALUES (g, r, 1, 'ZZE4C3 ' || p_tag || ' N' || i, '0900000000', 3.0, 'male', a),
           (g, r, 2, 'ZZE4C3 ' || p_tag || ' F' || i, '0900000001', 3.0, 'female', b);
    regs := regs || to_jsonb(r);
    accs := accs || jsonb_build_array(jsonb_build_array(a, b));
  END LOOP;
  RETURN jsonb_build_object('t', t, 'd', d, 'regs', regs, 'accs', accs);
END
$f$;

-- Khóa cặp theo đúng công thức của TS (communityPairKey), đọc từ dữ liệu hiện tại của nội dung.
CREATE FUNCTION pg_temp.pair_keys(p_d bigint) RETURNS text[] LANGUAGE sql AS $f$
  SELECT COALESCE(array_agg('r' || r.id || '.' || m1.player_account_id || '.' || m2.player_account_id ORDER BY r.id), ARRAY[]::text[])
  FROM public.tournament_registrations r
  JOIN public.tournament_registration_members m1 ON m1.registration_id = r.id AND m1.seat = 1
  JOIN public.tournament_registration_members m2 ON m2.registration_id = r.id AND m2.seat = 2
  WHERE r.division_id = p_d AND r.status = 'approved' AND r.merged_into IS NULL AND m1.player_account_id IS NOT NULL AND m2.player_account_id IS NOT NULL
$f$;

-- p_plan vòng tròn 1 bảng từ danh sách khóa cặp (giống hình dạng buildSetupPlan; fingerprint cố định khớp bản nháp).
CREATE FUNCTION pg_temp.mk_plan(p_d bigint, p_keys text[]) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  n integer := COALESCE(array_length(p_keys, 1), 0);
  matches jsonb; pairs jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('matchKey', 'GROUP-A-' || x.ord, 'stagePlanKey', 'group-stage', 'stageKind', 'group', 'groupLabel', 'A',
                                               'round', 1, 'entryAId', x.a, 'entryBId', x.b, 'order', x.ord) ORDER BY x.ord), '[]'::jsonb)
  INTO matches
  FROM (SELECT row_number() OVER (ORDER BY i, j) AS ord, p_keys[i] AS a, p_keys[j] AS b
        FROM generate_series(1, n) i, generate_series(1, n) j WHERE i < j) x;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('pairId', k, 'refs', (
           SELECT jsonb_build_array('player:' || m1.player_account_id, 'player:' || m2.player_account_id)
           FROM public.tournament_registrations r
           JOIN public.tournament_registration_members m1 ON m1.registration_id = r.id AND m1.seat = 1
           JOIN public.tournament_registration_members m2 ON m2.registration_id = r.id AND m2.seat = 2
           WHERE r.division_id = p_d AND k = 'r' || r.id || '.' || m1.player_account_id || '.' || m2.player_account_id))), '[]'::jsonb)
  INTO pairs FROM unnest(p_keys) AS k;
  RETURN jsonb_build_object('planVersion', 4, 'formatKey', 'round_robin', 'divisionId', p_d::text, 'seed', 's', 'layout', 'single-group',
    'stages', jsonb_build_array(jsonb_build_object('planKey', 'group-stage', 'name', 'Vòng tròn', 'scheduleFormat', 'round_robin', 'order', 1,
                                                   'config', jsonb_build_object('groupCount', 1, 'advancePerGroup', 0))),
    'groups', jsonb_build_array(jsonb_build_object('label', 'A', 'entryIds', to_jsonb(p_keys))),
    'matches', matches, 'progressions', '[]'::jsonb,
    'counts', jsonb_build_object('groupMatches', n * (n - 1) / 2, 'knockoutMatches', 0, 'total', n * (n - 1) / 2),
    'pairs', pairs, 'warnings', '[]'::jsonb, 'fingerprint', '${FP}');
END
$f$;

-- Câu gọi finalize (chuỗi SQL để it_err chạy trong khối con).
CREATE FUNCTION pg_temp.fin_sql(p_case jsonb, p_plan jsonb, p_key text) RETURNS text LANGUAGE sql AS $f$
  SELECT format('SELECT public.finalize_internal_setup_v4(%s, %s, %s, %s, %L, %L, %L::jsonb)',
    ${SYSTEM_GROUP_ID}, p_case->>'t', p_case->>'d',
    (SELECT setup_revision FROM public.tournament_divisions WHERE id = (p_case->>'d')::bigint), p_key, '${FP}', p_plan::text)
$f$;

CREATE FUNCTION pg_temp.fin(p_case jsonb, p_plan jsonb, p_key text) RETURNS jsonb LANGUAGE plpgsql AS $f$
BEGIN
  RETURN pg_temp.it_json(pg_temp.fin_sql(p_case, p_plan, p_key));
END
$f$;

DO $it$
DECLARE
  g bigint := ${SYSTEM_GROUP_ID};
  cA jsonb; cB jsonb; dA bigint; tA bigint; keys text[]; plan jsonb; res jsonb; res2 jsonb;
  n integer; n_before integer; n_pre integer; a1 bigint; a2 bigint; a3 bigint; ath bigint; extra_reg bigint; j jsonb;
  acc jsonb; stmt1 text; noise_acc bigint; s text;
BEGIN
  -- ===== Ca chính: 8 cặp đã duyệt + đơn nhiễu, trong đó 3 tài khoản ĐÃ có athletes =====
  cA := pg_temp.mk_case('chinh', 8);
  dA := (cA->>'d')::bigint; tA := (cA->>'t')::bigint;
  -- đơn nhiễu: chờ duyệt, đang tìm bạn, bị từ chối, đã rút (mỗi đơn một tài khoản riêng) — không được vào giải, không đổi trạng thái
  FOREACH s IN ARRAY ARRAY['submitted', 'awaiting_partner', 'rejected', 'withdrawn'] LOOP
    INSERT INTO public.player_accounts (phone_norm, password_hash, display_name, gender, self_declared_phr)
    VALUES ('0977' || lpad(nextval('it_seq')::text, 6, '0'), 'x', 'ZZE4C3 chinh nhieu ' || s, 'male', 3.0) RETURNING id INTO noise_acc;
    INSERT INTO public.tournament_registrations (group_id, division_id, entrant_type, status, origin, contact_phone_norm, needs_partner, player_account_id)
    VALUES (g, dA, 'pair', s, 'public_self', '0900000000', s = 'awaiting_partner', noise_acc);
  END LOOP;
  SELECT (cA->'accs'->0->>0)::bigint, (cA->'accs'->0->>1)::bigint, (cA->'accs'->1->>0)::bigint INTO a1, a2, a3;
  INSERT INTO public.athletes (display_name, normalized_name, status) VALUES ('ZZE4C3 chinh N1', 'zze4c3 chinh n1', 'linked') RETURNING id INTO ath;
  UPDATE public.player_accounts SET athlete_id = ath WHERE id = a1;
  INSERT INTO public.athletes (display_name, normalized_name, status) VALUES ('ZZE4C3 chinh F1', 'zze4c3 chinh f1', 'linked') RETURNING id INTO ath;
  UPDATE public.player_accounts SET athlete_id = ath WHERE id = a2;
  INSERT INTO public.athletes (display_name, normalized_name, status) VALUES ('ZZE4C3 chinh N2', 'zze4c3 chinh n2', 'linked') RETURNING id INTO ath;
  UPDATE public.player_accounts SET athlete_id = ath WHERE id = a3;
  SELECT count(*) INTO n_before FROM public.athletes;
  keys := pg_temp.pair_keys(dA);
  PERFORM pg_temp.it_ok('A.keys', array_length(keys, 1) = 8, keys::text);
  plan := pg_temp.mk_plan(dA, keys);

  stmt1 := pg_temp.fin_sql(cA, plan, 'it-c3-a-1');
  res := pg_temp.it_json(stmt1);
  PERFORM pg_temp.it_ok('A.result', (res->>'success')::boolean AND (res->>'entry_count')::int = 8 AND (res->>'match_count')::int = 28
    AND (res->>'community_pairs')::int = 8, res::text);
  SELECT count(*) INTO n FROM public.tournament_entries WHERE division_id = dA AND status = 'approved';
  PERFORM pg_temp.it_ok('A.entries', n = 8, format('n=%s', n));
  SELECT count(*) INTO n FROM public.tournament_athletes WHERE tournament_id = tA AND source = 'community';
  PERFORM pg_temp.it_ok('A.tournament_athletes_community', n = 16, format('n=%s', n));
  SELECT count(*) INTO n FROM public.tournament_athletes WHERE tournament_id = tA;
  PERFORM pg_temp.it_ok('A.tournament_athletes_total', n = 16, format('n=%s', n));
  SELECT count(*) INTO n FROM public.player_accounts WHERE display_name LIKE 'ZZE4C3 chinh %' AND display_name NOT LIKE 'ZZE4C3 chinh nhieu %' AND athlete_id IS NOT NULL;
  PERFORM pg_temp.it_ok('A.accounts_linked', n = 16, format('n=%s', n));
  SELECT count(*) INTO n FROM public.player_accounts WHERE display_name LIKE 'ZZE4C3 chinh nhieu %' AND athlete_id IS NOT NULL;
  PERFORM pg_temp.it_ok('A.noise_accounts_not_linked', n = 0, format('n=%s', n));
  SELECT count(*) INTO n FROM public.athletes;
  PERFORM pg_temp.it_ok('A.athletes_new_13', n - n_before = 13, format('mới=%s', n - n_before));
  SELECT count(*) INTO n FROM public.athletes WHERE display_name LIKE 'ZZE4C3 chinh %' AND legacy_club_member_id IS NOT NULL;
  PERFORM pg_temp.it_ok('A.athletes_no_legacy_member', n = 0, format('n=%s', n));
  PERFORM pg_temp.it_ok('A.existing_athlete_reused', (SELECT athlete_id FROM public.tournament_athletes WHERE tournament_id = tA
    AND athlete_id = (SELECT athlete_id FROM public.player_accounts WHERE id = a1)) IS NOT NULL, NULL);
  SELECT count(*) INTO n FROM public.tournament_pairs WHERE division_id = dA AND status = 'locked';
  PERFORM pg_temp.it_ok('A.pairs', n = 8, format('n=%s', n));
  SELECT count(*) INTO n FROM public.tournament_entry_members em JOIN public.tournament_entries e ON e.id = em.entry_id WHERE e.division_id = dA AND em.athlete_id IS NOT NULL;
  PERFORM pg_temp.it_ok('A.entry_members', n = 16, format('n=%s', n));
  SELECT count(*) INTO n FROM public.tournament_matches WHERE division_id = dA;
  PERFORM pg_temp.it_ok('A.matches', n = 28, format('n=%s', n));
  SELECT count(*) INTO n FROM public.tournament_stage_entrants WHERE division_id = dA;
  PERFORM pg_temp.it_ok('A.stage_entrants', n = 8, format('n=%s', n));
  PERFORM pg_temp.it_ok('A.locked', (SELECT roster_lock_status = 'locked' AND setup_draft->>'state' = 'finalized' FROM public.tournament_divisions WHERE id = dA), NULL);
  PERFORM pg_temp.it_ok('A.entry_names_are_player_names', (SELECT bool_and(name_snapshot LIKE 'ZZE4C3 chinh N% / ZZE4C3 chinh F%') FROM public.tournament_entries WHERE division_id = dA), NULL);
  PERFORM pg_temp.it_ok('A.other_registrations_untouched', (SELECT count(*) FROM public.tournament_registrations WHERE division_id = dA AND status IN ('submitted', 'awaiting_partner', 'rejected', 'withdrawn')) = 4
    AND (SELECT count(*) FROM public.tournament_registrations WHERE division_id = dA AND status = 'approved') = 8, NULL);
  PERFORM pg_temp.it_ok('A.host_club_row', EXISTS (SELECT 1 FROM public.tournament_clubs WHERE tournament_id = tA AND club_id = g), NULL);

  -- Phát lại cùng khóa: cùng phản hồi, không sinh thêm athletes.
  SELECT count(*) INTO n_before FROM public.athletes;
  res2 := pg_temp.it_json(stmt1);
  PERFORM pg_temp.it_ok('A.replay_same', res2 = res, res2::text);
  SELECT count(*) INTO n FROM public.athletes;
  PERFORM pg_temp.it_ok('A.replay_no_new_athletes', n = n_before, format('n=%s', n));
  -- Khóa mới sau khi đã chốt: bị chặn, không tạo thêm.
  PERFORM pg_temp.it_err('A.second_finalize_blocked', pg_temp.fin_sql(cA, plan, 'it-c3-a-2'), 'ROSTER_LOCKED');
  SELECT count(*) INTO n FROM public.athletes;
  PERFORM pg_temp.it_ok('A.second_no_new_athletes', n = n_before, format('n=%s', n));

  -- ===== Ca âm =====
  -- B1: bản nháp có thành viên CLB
  cB := pg_temp.mk_case('b1', 3);
  UPDATE public.tournament_divisions SET setup_draft = jsonb_set(setup_draft, '{participants,memberIds}', '["5"]'::jsonb) WHERE id = (cB->>'d')::bigint;
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  PERFORM pg_temp.it_err('B1.member_pick', pg_temp.fin_sql(cB, pg_temp.mk_plan((cB->>'d')::bigint, keys), 'it-b1'), 'COMMUNITY_MEMBER_PICK_NOT_ALLOWED');

  -- B2: plan dựng trên tập cặp khác (thiếu một cặp)
  cB := pg_temp.mk_case('b2', 3);
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  PERFORM pg_temp.it_err('B2.plan_missing_pair', pg_temp.fin_sql(cB, pg_temp.mk_plan((cB->>'d')::bigint, keys[1:2]), 'it-b2'), 'COMMUNITY_ROSTER_CHANGED');

  -- B3: đổi thành viên sau khi bốc thăm (ghép hộ) → khóa đổi
  cB := pg_temp.mk_case('b3', 3);
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  plan := pg_temp.mk_plan((cB->>'d')::bigint, keys);
  UPDATE public.tournament_registration_members SET player_account_id = (cB->'accs'->2->>0)::bigint
   WHERE registration_id = (cB->'regs'->>0)::bigint AND seat = 2;
  PERFORM pg_temp.it_err('B3.members_changed', pg_temp.fin_sql(cB, plan, 'it-b3'), 'COMMUNITY_ROSTER_CHANGED');

  -- B4: chỉ 1 cặp đã duyệt
  cB := pg_temp.mk_case('b4', 1);
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  PERFORM pg_temp.it_err('B4.too_few', pg_temp.fin_sql(cB, pg_temp.mk_plan((cB->>'d')::bigint, keys), 'it-b4'), 'COMMUNITY_TOO_FEW_PAIRS');

  -- B5: đơn đã duyệt chỉ có 1 ghế
  cB := pg_temp.mk_case('b5', 3);
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  plan := pg_temp.mk_plan((cB->>'d')::bigint, keys);
  DELETE FROM public.tournament_registration_members WHERE registration_id = (cB->'regs'->>0)::bigint AND seat = 2;
  PERFORM pg_temp.it_err('B5.single_seat', pg_temp.fin_sql(cB, plan, 'it-b5'), 'PAIRING_INVALID');

  -- B6: tài khoản không còn hoạt động
  cB := pg_temp.mk_case('b6', 3);
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  plan := pg_temp.mk_plan((cB->>'d')::bigint, keys);
  UPDATE public.player_accounts SET status = 'disabled' WHERE id = (cB->'accs'->0->>0)::bigint;
  PERFORM pg_temp.it_err('B6.inactive_account', pg_temp.fin_sql(cB, plan, 'it-b6'), 'PAIRING_INVALID');

  -- B7: hai tài khoản trỏ cùng một athletes
  cB := pg_temp.mk_case('b7', 3);
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  plan := pg_temp.mk_plan((cB->>'d')::bigint, keys);
  INSERT INTO public.athletes (display_name, normalized_name, status) VALUES ('ZZE4C3 b7 chung', 'zze4c3 b7 chung', 'linked') RETURNING id INTO ath;
  UPDATE public.player_accounts SET athlete_id = ath WHERE id IN ((cB->'accs'->0->>0)::bigint, (cB->'accs'->1->>0)::bigint);
  PERFORM pg_temp.it_err('B7.shared_athlete', pg_temp.fin_sql(cB, plan, 'it-b7'), 'PAIRING_INVALID');

  -- B8: bản nháp 'friendly' trên giải cộng đồng
  cB := pg_temp.mk_case('b8', 3);
  UPDATE public.tournament_divisions SET setup_draft = jsonb_set(setup_draft, '{tournament,organizerMode}', '"friendly"'::jsonb) WHERE id = (cB->>'d')::bigint;
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  PERFORM pg_temp.it_err('B8.friendly_draft', pg_temp.fin_sql(cB, pg_temp.mk_plan((cB->>'d')::bigint, keys), 'it-b8'), 'FINALIZE_DRAFT_INVALID');

  -- B9: giải CLB có dữ liệu đơn giống hệt KHÔNG đi nhánh cộng đồng (không tạo athletes, không lỗi COMMUNITY_*)
  cB := pg_temp.mk_case('b9', 3, 'club');
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  SELECT count(*) INTO n_before FROM public.athletes;
  BEGIN
    PERFORM pg_temp.fin(cB, pg_temp.mk_plan((cB->>'d')::bigint, keys), 'it-b9');
    RAISE EXCEPTION 'IT_FAIL B9.club_unchanged: giải CLB không được chốt bằng đơn cộng đồng';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%IT_FAIL%' THEN RAISE; END IF;
    PERFORM pg_temp.it_ok('B9.club_no_community_branch', SQLERRM NOT LIKE '%COMMUNITY_%', SQLERRM);
  END;
  SELECT count(*) INTO n FROM public.athletes;
  PERFORM pg_temp.it_ok('B9.club_no_new_athletes', n = n_before, format('n=%s', n));

  -- B10: đổi cờ phí + version giữa lúc bốc thăm và chốt KHÔNG làm hỏng chốt
  cB := pg_temp.mk_case('b10', 4);
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  plan := pg_temp.mk_plan((cB->>'d')::bigint, keys);
  UPDATE public.tournament_registrations SET fee_confirmed_at = now(), version = version + 5 WHERE id = (cB->'regs'->>0)::bigint;
  j := pg_temp.fin(cB, plan, 'it-b10');
  PERFORM pg_temp.it_ok('B10.fee_toggle_ok', (j->>'success')::boolean AND (j->>'community_pairs')::int = 4 AND (j->>'match_count')::int = 6, j::text);

  -- Idempotent: tài khoản chưa có athlete_id được gán lại đúng một lần
  cB := pg_temp.mk_case('b11', 2);
  keys := pg_temp.pair_keys((cB->>'d')::bigint);
  plan := pg_temp.mk_plan((cB->>'d')::bigint, keys);
  j := pg_temp.fin(cB, plan, 'it-b11');
  PERFORM pg_temp.it_ok('B11.linked_status', (SELECT bool_and(a.status = 'linked') FROM public.athletes a JOIN public.player_accounts p ON p.athlete_id = a.id
    WHERE p.display_name LIKE 'ZZE4C3 b11 %'), NULL);
  RAISE NOTICE 'IT_DONE';
END
$it$;

SELECT k, v FROM it_result ORDER BY 1;
`;

process.stdout.write(`-- Epic 4 C3 — kiểm thử tích hợp nhánh cộng đồng của finalize_internal_setup_v4 (sinh bởi scripts/qa/epic4-c3-integration.js)\nBEGIN;\n${body}\n${tests}\nROLLBACK;\n`);
