'use strict';
// Sinh SQL kiểm thử tích hợp Epic 3 F2 (MỘT transaction, ROLLBACK ở cuối). Nạp thân migration 111 trong transaction nên
// kiểm được TRƯỚC khi apply thật. 110 đã apply trên production (evidence.md) → dùng RPC F1 đang chạy để mời / nhận /
// gửi / duyệt. Dữ liệu tạm trong transaction: thành viên + hồ sơ thi đấu tạm ở group chủ nhà 59, ở group 19 (CLB khách
// nghiệm thu, D48; thiếu thì dùng group tạm) và một group tạm B; các giải friendly/internal của 59. Plan dựng bằng
// buildSetupPlan (+ entryClubs) với khóa cặp khách giữ chỗ `c99900<i>.1.p<n>`; SQL thay bằng khóa thật
// `c<tournament_clubs.id>.<roster_approved_version>.p<n>` sau khi duyệt (111 không băm lại nội dung plan, chỉ so
// fingerprint với bản nháp). Mọi kiểm tra sai → RAISE 'IT_FAIL <ca>: …' (transaction hỏng, không gì được ghi).
//
// Dùng:
//   node scripts/qa/epic3-f2-integration.js              > database/tests/epic3_f2_integration.sql
//   node scripts/qa/epic3-f2-integration.js --applied    (111 đã apply: bỏ thân migration, dùng hàm đang chạy)
//   node scripts/qa/epic3-f2-integration.js --post-check (câu kiểm sau ROLLBACK: mọi cột = 0)
//   node scripts/qa/epic3-f2-integration.js --md5        (md5(prosrc) kỳ vọng của finalize_internal_setup_v4 + câu SQL so)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildSetupPlan } = require('../../lib/tournament/setupPlans');

const HOST = 59;
const GUEST_REAL = 19;
const FN = 'finalize_internal_setup_v4';
const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/111_finalize_v4_friendly.sql'), 'utf8')
  .replace(/\r\n?/g, '\n');

if (process.argv.includes('--md5')) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${FN}(`);
  const open = migration.indexOf('AS $$', start) + 'AS $$'.length;
  const close = migration.indexOf('$$;', open);
  const md5 = crypto.createHash('md5').update(migration.slice(open, close), 'utf8').digest('hex');
  process.stdout.write(`${FN}\t${md5}\n-- So trên DB sau khi apply:\n`
    + `SELECT proname, md5(prosrc) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = '${FN}';\n`
    + `SELECT proname, proacl::text, prosecdef, proconfig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = '${FN}';\n`);
  process.exit(0);
}

if (process.argv.includes('--post-check')) {
  process.stdout.write(`-- Chạy SAU file tích hợp (đã ROLLBACK): mọi cột phải = 0.
SELECT
  (SELECT count(*) FROM public.groups WHERE code LIKE 'zzf2-%') AS groups_tmp,
  (SELECT count(*) FROM public.club_members WHERE full_name LIKE 'ZZF2 VĐV%') AS members_tmp,
  (SELECT count(*) FROM public.athletes WHERE normalized_name LIKE 'zzf2 vdv%') AS athletes_tmp,
  (SELECT count(*) FROM public.tournaments WHERE name LIKE 'ZZF2 IT%') AS tournaments_tmp,
  (SELECT count(*) FROM public.club_notifications WHERE payload->>'tournamentName' LIKE 'ZZF2 IT%') AS notifications_tmp,
  (SELECT count(*) FROM public.tournament_setup_mutations WHERE idempotency_key LIKE 'zzf2-%') AS mutations_tmp;
`);
  process.exit(0);
}

const applied = process.argv.includes('--applied');
const body = applied
  ? '-- 111 đã apply: dùng hàm đang chạy.'
  : migration.slice(migration.indexOf('\nBEGIN;\n') + '\nBEGIN;\n'.length, migration.lastIndexOf('COMMIT;')).trim();

// Plan của một kịch bản: cặp chủ nhà h1..hN rồi cặp khách giữ chỗ c99900<i>.1.p<n> (i = thứ tự CLB khách, từ 1).
// friendly → entryClubs (rải CLB như route); internal → không entryClubs (đúng đường cũ).
function scenarioPlan({ hostPairs, guestPairs = [], formatKey, config, seed, friendly = true }) {
  const host = Array.from({ length: hostPairs }, (_, i) => `h${i + 1}`);
  const guests = guestPairs.flatMap((count, g) => Array.from({ length: count }, (_, n) => `c99900${g + 1}.1.p${n + 1}`));
  const pairIds = [...host, ...guests];
  const entryClubs = Object.fromEntries(pairIds.map((id) => [id, id.startsWith('c') ? `tc:${id.slice(1, 7)}` : 'host']));
  const plan = buildSetupPlan({ formatKey, config, pairIds, seed, divisionId: null, ...(friendly ? { entryClubs } : {}) });
  // Bỏ khóa chỉ để hiển thị (111 không đọc) cho SQL gọn; fingerprint vẫn là của plan đầy đủ.
  const { clubSpread, inputSignature, ...compact } = plan;
  return { plan: compact, format: { entrantType: 'doubles', formatKey, config } };
}

const GK = { groupCount: 2, qualifiersPerGroup: 2 };
const PLANS = {
  g1: scenarioPlan({ hostPairs: 4, guestPairs: [3], formatKey: 'group_knockout', config: GK, seed: 'zzf2-g1' }),
  g1b: scenarioPlan({ hostPairs: 4, guestPairs: [3], formatKey: 'group_knockout', config: { ...GK, thirdPlaceEnabled: true }, seed: 'zzf2-g1b' }),
  core3: scenarioPlan({ hostPairs: 3, guestPairs: [2, 2], formatKey: 'group_knockout', config: GK, seed: 'zzf2-core3' }),
  ko: scenarioPlan({ hostPairs: 4, guestPairs: [3], formatKey: 'knockout', config: {}, seed: 'zzf2-ko' }),
  neg: scenarioPlan({ hostPairs: 2, guestPairs: [2], formatKey: 'round_robin', config: {}, seed: 'zzf2-neg' }),
  i14: scenarioPlan({ hostPairs: 7, formatKey: 'group_knockout', config: GK, seed: 'zzf2-i14', friendly: false }),
  irr: scenarioPlan({ hostPairs: 4, formatKey: 'round_robin', config: {}, seed: 'zzf2-irr', friendly: false }),
  iko: scenarioPlan({ hostPairs: 5, formatKey: 'knockout', config: {}, seed: 'zzf2-iko', friendly: false }),
  ide: scenarioPlan({ hostPairs: 4, formatKey: 'double_elimination', config: {}, seed: 'zzf2-ide', friendly: false }),
};
const q = (value) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

const out = [];
out.push(`-- Kiểm thử tích hợp Epic 3 F2: migration 111 (finalize_internal_setup_v4 nhánh friendly, nạp trong transaction) +
-- RPC F1 (110, đã apply). Sinh bởi scripts/qa/epic3-f2-integration.js${applied ? ' --applied' : ''}. MỘT transaction, ROLLBACK ở cuối.
-- Kỳ vọng: bảng it_result liệt kê mọi ca (k, v), dòng 'zz.ALL' = 'ok'. Ca sai → lỗi 'IT_FAIL <ca>: …', không có bảng.
-- D50 (private → unlisted + slug) do route finalize làm sau RPC; ở đây chỉ chạy đúng câu UPDATE của route để kiểm ràng buộc.
BEGIN;
${body}

CREATE TEMP TABLE it_result(k text, v text) ON COMMIT DROP;
CREATE TEMP SEQUENCE it_member_seq;
CREATE FUNCTION pg_temp.it_ok(p_key text, p_cond boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_cond IS NOT TRUE THEN RAISE EXCEPTION 'IT_FAIL %: điều kiện sai (%)', p_key, COALESCE(p_detail, 'null'); END IF;
  INSERT INTO it_result VALUES (p_key, COALESCE(p_detail, 'ok'));
END $f$;
-- Thành viên + hồ sơ thi đấu tạm của group g.
CREATE FUNCTION pg_temp.f2_members(g bigint, n integer) RETURNS bigint[] LANGUAGE plpgsql AS $f$
DECLARE ids bigint[] := ARRAY[]::bigint[]; mid bigint; sfx text;
BEGIN
  FOR k IN 1..n LOOP
    -- Hậu tố duy nhất trong cả transaction: production có unique index tên thành viên theo group.
    sfx := g || '-' || nextval('pg_temp.it_member_seq');
    INSERT INTO public.club_members(group_id, full_name, is_active) VALUES (g, 'ZZF2 VĐV ' || sfx, true) RETURNING id INTO mid;
    INSERT INTO public.athletes(display_name, normalized_name, legacy_club_member_id) VALUES ('ZZF2 VĐV ' || sfx, 'zzf2 vdv ' || sfx, mid)
    ON CONFLICT (legacy_club_member_id) DO NOTHING;
    ids := ids || mid;
  END LOOP;
  RETURN ids;
END $f$;
-- Giải của chủ nhà 59 qua RPC lưu v3; CLB khách mời → nhận → lưu → gửi → duyệt qua RPC F1; bản nháp bước 4 mang plan.
-- Trả { t, d, rev, plan (khóa khách thật + pairs), clubs: [tournament_clubs.id], hm: [thành viên chủ nhà] }.
CREATE FUNCTION pg_temp.f2_setup(label text, mode text, host_pairs integer, host_guest boolean, guest_groups bigint[],
                                 guest_pairs integer[], plan jsonb, fmt jsonb) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE
  hm bigint[]; gm bigint[]; r jsonb; t bigint; d bigint; tc bigint; ver bigint; mids jsonb; ptext text;
  pairs jsonb := '[]'::jsonb; ppairs jsonb := '[]'::jsonb; guests jsonb := '[]'::jsonb; clubs jsonb := '[]'::jsonb;
BEGIN
  hm := pg_temp.f2_members(59, host_pairs * 2);
  IF host_guest THEN guests := jsonb_build_array(jsonb_build_object('clientRef', 'zzf2guest0001', 'displayName', 'Khách IT')); END IF;
  FOR n IN 1..host_pairs LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object('pairId', 'h' || n, 'locked', false, 'participantRefs', jsonb_build_array('member:' || hm[2 * n - 1],
      CASE WHEN host_guest AND n = host_pairs THEN 'guest:zzf2guest0001' ELSE 'member:' || hm[2 * n] END)));
  END LOOP;
  mids := (SELECT jsonb_agg(hm[k]::text ORDER BY k) FROM generate_series(1, host_pairs * 2 - CASE WHEN host_guest THEN 1 ELSE 0 END) k);
  r := public.save_unified_setup_aggregate_draft(59, NULL, NULL, 'zzf2-' || label, jsonb_build_object('currentStep', 1,
    'tournament', jsonb_build_object('name', 'ZZF2 IT ' || label, 'organizerMode', mode),
    'participants', jsonb_build_object('memberIds', mids, 'guests', guests)), 1, 'zzf2-save1-' || label);
  t := (r->>'tournament_id')::bigint; d := (r->>'division_id')::bigint;
  ptext := plan::text;
  FOR i IN 1..COALESCE(array_length(guest_groups, 1), 0) LOOP
    gm := pg_temp.f2_members(guest_groups[i], guest_pairs[i] * 2);
    tc := (public.friendly_invite_club(59, t, guest_groups[i], NULL, NULL, 31, md5(label || i) || md5(label || i || 'x'))->>'id')::bigint;
    PERFORM public.friendly_club_action(guest_groups[i], 'guest', tc, 'accept', (SELECT version FROM public.tournament_clubs WHERE id = tc), '{}'::jsonb);
    PERFORM public.friendly_club_action(guest_groups[i], 'guest', tc, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = tc),
      jsonb_build_object('roster', jsonb_build_object('unpairedRefs', '[]'::jsonb,
        'memberIds', (SELECT jsonb_agg(gm[k]::text ORDER BY k) FROM generate_series(1, guest_pairs[i] * 2) k),
        'pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', 'p' || k, 'locked', false,
                    'participantRefs', jsonb_build_array('member:' || gm[2 * k - 1], 'member:' || gm[2 * k])) ORDER BY k)
                  FROM generate_series(1, guest_pairs[i]) k))));
    PERFORM public.friendly_club_action(guest_groups[i], 'guest', tc, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = tc), '{}'::jsonb);
    ver := (public.friendly_club_action(59, 'host', tc, 'approve', (SELECT version FROM public.tournament_clubs WHERE id = tc), '{}'::jsonb)->>'roster_approved_version')::bigint;
    ppairs := ppairs || (SELECT jsonb_agg(jsonb_build_object('pairId', 'c' || tc || '.' || ver || '.p' || k,
      'refs', jsonb_build_array('member:' || gm[2 * k - 1], 'member:' || gm[2 * k])) ORDER BY k) FROM generate_series(1, guest_pairs[i]) k);
    ptext := replace(ptext, '"c99900' || i || '.1.', '"c' || tc || '.' || ver || '.');
    clubs := clubs || to_jsonb(tc);
  END LOOP;
  plan := ptext::jsonb;
  r := public.save_unified_setup_aggregate_draft(59, t, d, 'zzf2-' || label, jsonb_build_object('draftVersion', 3, 'currentStep', 4,
    'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'ZZF2 IT ' || label, 'eventDate', '2026-10-12', 'courtCount', 3, 'organizerMode', mode),
    'division', jsonb_build_object('name', 'ZZF2 IT ' || label, 'playType', 'doubles'),
    'participants', jsonb_build_object('memberIds', mids, 'guests', guests), 'format', fmt, 'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan)),
    (r->>'setup_revision')::bigint, 'zzf2-save2-' || label);
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs'))
    FROM jsonb_array_elements(pairs) p) || ppairs);
  RETURN jsonb_build_object('t', t, 'd', d, 'rev', (r->>'setup_revision')::bigint, 'plan', plan, 'clubs', clubs, 'hm', to_jsonb(hm));
END $f$;
-- Chốt như route: p_plan.friendly.maxGuestClubs chỉ khi max IS NOT NULL. override thay p_plan (ca plan bị sửa).
CREATE FUNCTION pg_temp.f2_fin(s jsonb, k text, mx integer, override jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT public.finalize_internal_setup_v4(59, (s->>'t')::bigint, (s->>'d')::bigint, (s->>'rev')::bigint, 'zzf2-fin-' || k,
    s->'plan'->>'fingerprint', COALESCE(override, s->'plan')
      || CASE WHEN mx IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('friendly', jsonb_build_object('maxGuestClubs', mx)) END);
$f$;
-- Chốt phải lỗi đúng mã và không ghi gì (stage / entry của division vẫn 0).
CREATE FUNCTION pg_temp.f2_err(k text, s jsonb, mx integer, code text, override jsonb DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE e text;
BEGIN
  BEGIN
    PERFORM pg_temp.f2_fin(s, k, mx, override);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  IF e IS DISTINCT FROM code THEN RAISE EXCEPTION 'IT_FAIL %: mong lỗi % nhưng được %', k, code, COALESCE(e, 'không lỗi'); END IF;
  PERFORM pg_temp.it_ok(k, NOT EXISTS (SELECT 1 FROM public.tournament_stages WHERE division_id = (s->>'d')::bigint)
    AND NOT EXISTS (SELECT 1 FROM public.tournament_entries WHERE division_id = (s->>'d')::bigint), e);
END $f$;
`);

const setup = (label, mode, hostPairs, hostGuest, groups, counts, key) => `  s := pg_temp.f2_setup('${label}', '${mode}', ${hostPairs}, ${hostGuest}, ARRAY[${groups}]::bigint[], ARRAY[${counts}]::integer[], ${q(PLANS[key].plan)}, ${q(PLANS[key].format)});`;
const ok = (key, cond, detail) => `  PERFORM pg_temp.it_ok('${key}', ${cond}${detail ? `, ${detail}` : ''});`;
// Số entry theo dòng CLB: 'h' = dòng chủ nhà (club_id = 59), còn lại theo thứ tự s->'clubs'.
const entriesOf = (tcExpr) => `(SELECT count(*) FROM public.tournament_entries WHERE division_id = (s->>'d')::bigint AND tournament_club_id = ${tcExpr})`;
const hostTc = `(SELECT id FROM public.tournament_clubs WHERE tournament_id = (s->>'t')::bigint AND club_id = 59)`;
const guestTc = (i) => `(s->'clubs'->>${i})::bigint`;
const matchCount = (where = 'true') => `(SELECT count(*) FROM public.tournament_matches m WHERE m.division_id = (s->>'d')::bigint AND ${where})`;
const clubOfEntry = (col) => `(SELECT tournament_club_id FROM public.tournament_entries WHERE id = m.${col})`;

out.push(`
DO $it$
DECLARE
  ga bigint; gb bigint; s jsonb; s2 jsonb; r jsonb; r2 jsonb; e text; m bigint; hm1 bigint; rs jsonb; x bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = 59) THEN RAISE EXCEPTION 'IT_FAIL setup: không có group chủ nhà 59'; END IF;
  -- CLB khách A = group ${GUEST_REAL} (D48; chỉ thêm thành viên tạm trong transaction), thiếu thì group tạm. B luôn tạm.
  IF EXISTS (SELECT 1 FROM public.groups WHERE id = ${GUEST_REAL}) THEN ga := ${GUEST_REAL};
  ELSE
    INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
    VALUES ('zzf2-a-' || substr(md5(random()::text), 1, 8), 'ZZF2 IT khách A (rollback)', 'x', 'x') RETURNING id INTO ga;
  END IF;
  INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
  VALUES ('zzf2-b-' || substr(md5(random()::text), 1, 8), 'ZZF2 IT khách B (rollback)', 'x', 'x') RETURNING id INTO gb;
  INSERT INTO it_result VALUES ('setup.guest_a', ga::text);

  -- ===== G1: 59 = 4 cặp, A = 3 cặp, 2x2, hạn mức 1 → 12 trận =====
${setup('g1', 'friendly', 4, false, 'ga', '3', 'g1')}
${ok('g1.before.private', `(SELECT visibility = 'private' FROM public.tournaments WHERE id = (s->>'t')::bigint)`)}
  r := pg_temp.f2_fin(s, 'g1', 1);
${ok('g1.finalize.match_count', `(r->>'match_count')::int = 12 AND (r->>'entry_count')::int = 7 AND (r->>'friendly_clubs')::int = 1`, "r->>'match_count'")}
${ok('g1.entries.club', `${entriesOf(hostTc)} = 4 AND ${entriesOf(guestTc(0))} = 3`)}
${ok('g1.matches.interclub', `${matchCount(`m.group_label IS NOT NULL AND ${clubOfEntry('entry_a_id')} <> ${clubOfEntry('entry_b_id')}`)} = 6 AND ${matchCount('m.group_label IS NOT NULL')} = 9`)}
${ok('g1.athletes.guest', `(SELECT count(*) = 6 AND bool_and(ta.group_id = 59 AND ta.source = 'club_member' AND ta.athlete_id IS NOT NULL AND ta.club_name_snapshot = (SELECT name FROM public.groups WHERE id = ga)) FROM public.tournament_athletes ta WHERE ta.tournament_club_id = ${guestTc(0)})`)}
${ok('g1.athletes.host', `(SELECT count(*) = 8 FROM public.tournament_athletes WHERE tournament_club_id = ${hostTc})`)}
${ok('g1.entry_members.guest', `(SELECT count(*) = 6 AND bool_and(em.club_name_snapshot = (SELECT name FROM public.groups WHERE id = ga)) FROM public.tournament_entry_members em JOIN public.tournament_entries en ON en.id = em.entry_id WHERE en.tournament_club_id = ${guestTc(0)})`)}
${ok('g1.roster_members', `(SELECT count(*) = 14 FROM public.tournament_division_roster_members WHERE division_id = (s->>'d')::bigint) AND (SELECT count(*) = 14 FROM public.tournament_pair_members pm JOIN public.tournament_pairs p ON p.id = pm.pair_id WHERE p.division_id = (s->>'d')::bigint)`)}
${ok('g1.structure', `(SELECT count(*) = 2 FROM public.tournament_stages WHERE division_id = (s->>'d')::bigint) AND (SELECT count(*) = 4 FROM public.tournament_stage_transitions WHERE division_id = (s->>'d')::bigint AND source_kind = 'group_rank') AND (SELECT count(*) = 7 FROM public.tournament_stage_entrants se JOIN public.tournament_stages st ON st.id = se.stage_id WHERE st.division_id = (s->>'d')::bigint)`)}
${ok('g1.division_locked', `(SELECT roster_lock_status = 'locked' AND setup_draft->>'state' = 'finalized' FROM public.tournament_divisions WHERE id = (s->>'d')::bigint)`)}
  r2 := pg_temp.f2_fin(s, 'g1', 1);
${ok('g1.replay', 'r2 = r')}
  -- Sau chốt: CLB khách không sửa được danh sách; không còn thông báo mở cho dòng khách.
  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(ga, 'guest', ${guestTc(0)}, 'withdraw', (SELECT version FROM public.tournament_clubs WHERE id = ${guestTc(0)}), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
${ok('g1.after.guest_closed', `e = 'FRIENDLY_REGISTRATION_CLOSED'`, 'e')}
${ok('g1.after.notifications_closed', `NOT EXISTS (SELECT 1 FROM public.club_notifications WHERE subject_type = 'tournament_club' AND subject_id = ${guestTc(0)} AND status = 'open')`)}
  -- D50: đúng câu UPDATE của route (publishFriendlyTournament) — private → unlisted + slug, trang công khai tìm thấy.
  UPDATE public.tournaments SET visibility = 'unlisted', public_slug = COALESCE(public_slug, 'zzf2-it-g1-' || substr(md5(random()::text), 1, 18)), updated_at = now()
  WHERE id = (s->>'t')::bigint AND group_id = 59 AND visibility = 'private';
${ok('d50.after', `EXISTS (SELECT 1 FROM public.tournaments WHERE id = (s->>'t')::bigint AND visibility = 'unlisted' AND public_slug IS NOT NULL AND settings->>'organizer_mode' = 'friendly' AND public_slug IN (SELECT public_slug FROM public.tournaments WHERE visibility IN ('unlisted', 'public')))`)}

  -- ===== G1 + tranh hạng ba → 13 trận =====
${setup('g1b', 'friendly', 4, false, 'ga', '3', 'g1b')}
  r := pg_temp.f2_fin(s, 'g1b', 1);
${ok('g1b.finalize.match_count', `(r->>'match_count')::int = 13`, "r->>'match_count'")}

  -- ===== G-core3: 59 = 3, A = 2, B = 2; hạn mức 1 → chặn, hạn mức 2 → 12 trận =====
${setup('core3', 'friendly', 3, false, 'ga, gb', '2, 2', 'core3')}
  PERFORM pg_temp.f2_err('limit.over', s, 1, 'FRIENDLY_CLUB_LIMIT_REACHED');
  r := pg_temp.f2_fin(s, 'core3', 2);
${ok('core3.finalize.match_count', `(r->>'match_count')::int = 12 AND (r->>'friendly_clubs')::int = 2`, "r->>'match_count'")}
${ok('core3.entries.club', `${entriesOf(hostTc)} = 3 AND ${entriesOf(guestTc(0))} = 2 AND ${entriesOf(guestTc(1))} = 2`)}

  -- ===== G2-KO: 59 = 4, A = 3, loại trực tiếp (nhánh 8, 1 bye) → 6 trận =====
${setup('ko', 'friendly', 4, false, 'ga', '3', 'ko')}
  r := pg_temp.f2_fin(s, 'ko', 1);
${ok('ko.finalize.match_count', `(r->>'match_count')::int = 6 AND ${entriesOf(guestTc(0))} = 3`, "r->>'match_count'")}
${ok('ko.round1.no_same_club', `${matchCount(`m.round = 1 AND m.entry_a_id IS NOT NULL AND m.entry_b_id IS NOT NULL AND ${clubOfEntry('entry_a_id')} = ${clubOfEntry('entry_b_id')}`)} = 0`)}
`);

// Dòng CLB khách của kịch bản âm (một khách A); mỗi ca sửa → chốt lỗi đúng mã, không ghi gì → trả lại.
const ga0 = guestTc(0);
out.push(`
  -- ===== D49: giải friendly có khách mời phía chủ nhà → chặn =====
${setup('d49', 'friendly', 2, true, 'gb', '2', 'neg')}
  PERFORM pg_temp.f2_err('d49.host_guest', s, 1, 'FRIENDLY_HOST_GUEST_NOT_ALLOWED');

  -- ===== Ca âm trên một giải (59 = 2, A = 2, vòng tròn) =====
${setup('neg', 'friendly', 2, false, 'ga', '2', 'neg')}
  PERFORM pg_temp.f2_err('max.missing', s, NULL, 'FINALIZE_PLAN_INVALID');
  PERFORM pg_temp.f2_err('max.zero', s, 0, 'FINALIZE_PLAN_INVALID');
  PERFORM pg_temp.f2_err('max.over_core', s, 32, 'FINALIZE_PLAN_INVALID');
  PERFORM pg_temp.f2_err('max.string', s, NULL, 'FINALIZE_PLAN_INVALID', (s->'plan') || '{"friendly": {"maxGuestClubs": "1"}}'::jsonb);
  UPDATE public.tournaments SET settings = settings || '{"organizer_mode": "internal"}'::jsonb WHERE id = (s->>'t')::bigint;
  PERFORM pg_temp.f2_err('mode.settings_mismatch', s, 1, 'FINALIZE_DRAFT_INVALID');
  UPDATE public.tournaments SET settings = settings || '{"organizer_mode": "friendly"}'::jsonb WHERE id = (s->>'t')::bigint;
  -- CLB B mới mời (invited) → chưa sẵn sàng; rút B → tiếp.
  x := (public.friendly_invite_club(59, (s->>'t')::bigint, gb, NULL, NULL, 31, md5('negB') || md5('negBx'))->>'id')::bigint;
  PERFORM pg_temp.f2_err('not_ready', s, 2, 'FRIENDLY_CLUB_NOT_READY');
  PERFORM public.friendly_club_action(59, 'host', x, 'remove', (SELECT version FROM public.tournament_clubs WHERE id = x), '{}'::jsonb);
  -- Thành viên khách nghỉ sau khi duyệt.
  m := substr(s->'plan'->'pairs'->2->'refs'->>0, 8)::bigint;
  UPDATE public.club_members SET is_active = false WHERE id = m;
  PERFORM pg_temp.f2_err('inactive', s, 1, 'MEMBER_NOT_ACTIVE_IN_GROUP');
  UPDATE public.club_members SET is_active = true WHERE id = m;
  -- Sửa tay dòng đã duyệt (không qua RPC): khách mời, ref ngoài danh sách đã gửi, vượt hạn mức cặp, VĐV ở hai CLB.
  rs := (SELECT roster_submitted FROM public.tournament_clubs WHERE id = ${ga0});
  UPDATE public.tournament_clubs SET roster_submitted = jsonb_set(rs, '{pairs,0,participantRefs,1}', '"guest:zzf2x0000001"') WHERE id = ${ga0};
  PERFORM pg_temp.f2_err('guest_ref', s, 1, 'FRIENDLY_GUEST_NOT_ALLOWED');
  UPDATE public.tournament_clubs SET roster_submitted = jsonb_set(rs, '{memberIds}', (rs->'memberIds') - (m::text)) WHERE id = ${ga0};
  PERFORM pg_temp.f2_err('ref_not_submitted', s, 1, 'PAIRING_INVALID');
  UPDATE public.tournament_clubs SET roster_submitted = rs, quota = 1 WHERE id = ${ga0};
  PERFORM pg_temp.f2_err('quota', s, 1, 'FRIENDLY_QUOTA_EXCEEDED');
  UPDATE public.tournament_clubs SET quota = NULL WHERE id = ${ga0};
  hm1 := (s->'hm'->>0)::bigint;
  UPDATE public.club_members SET group_id = ga WHERE id = hm1;
  UPDATE public.tournament_clubs SET roster_submitted = jsonb_set(jsonb_set(rs, '{pairs,0,participantRefs,0}', to_jsonb('member:' || hm1)),
    '{memberIds}', ((rs->'memberIds') - (m::text)) || to_jsonb(hm1::text)) WHERE id = ${ga0};
  PERFORM pg_temp.f2_err('athlete_duplicate', s, 1, 'FRIENDLY_ATHLETE_DUPLICATE');
  UPDATE public.club_members SET group_id = 59 WHERE id = hm1;
  UPDATE public.tournament_clubs SET roster_submitted = rs WHERE id = ${ga0};
  -- Duyệt lại sau bốc thăm (version đổi) → plan cũ lệch khóa.
  PERFORM public.friendly_club_action(59, 'host', ${ga0}, 'request_changes', (SELECT version FROM public.tournament_clubs WHERE id = ${ga0}), '{"note": "Đổi cặp"}'::jsonb);
  PERFORM public.friendly_club_action(ga, 'guest', ${ga0}, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = ${ga0}), '{}'::jsonb);
  PERFORM public.friendly_club_action(59, 'host', ${ga0}, 'approve', (SELECT version FROM public.tournament_clubs WHERE id = ${ga0}), '{}'::jsonb);
  PERFORM pg_temp.f2_err('roster_changed', s, 1, 'FRIENDLY_ROSTER_CHANGED');
  -- CLB ngoài còn hiệu lực.
  INSERT INTO public.tournament_external_clubs(group_id, name) VALUES (59, 'ZZF2 IT CLB ngoài') RETURNING id INTO x;
  INSERT INTO public.tournament_clubs(group_id, tournament_id, external_club_id, invitation_status, roster_approved_version)
  VALUES (59, (s->>'t')::bigint, x, 'approved', 1) RETURNING id INTO x;
  PERFORM pg_temp.f2_err('external', s, 2, 'EXTERNAL_CLUB_NOT_SUPPORTED');
  UPDATE public.tournament_clubs SET invitation_status = 'withdrawn' WHERE id = x;
  -- A rút → chỉ còn chủ nhà (plan chỉ cặp chủ nhà) → quá ít CLB.
  PERFORM public.friendly_club_action(59, 'host', ${ga0}, 'remove', (SELECT version FROM public.tournament_clubs WHERE id = ${ga0}), '{}'::jsonb);
  PERFORM pg_temp.f2_err('too_few', s, 1, 'FRIENDLY_CLUBS_TOO_FEW', jsonb_set(s->'plan', '{pairs}', (SELECT jsonb_agg(p) FROM jsonb_array_elements(s->'plan'->'pairs') p WHERE p->>'pairId' LIKE 'h%')));

  -- ===== Hồi quy giải nội bộ (đi đúng đường 108) =====
  -- 14 người (13 thành viên + 1 khách mời) = 7 cặp, 2x2 → 12 trận; không khóa friendly_clubs.
${setup('i14', 'internal', 7, true, '', '', 'i14')}
  r := pg_temp.f2_fin(s, 'i14', NULL);
${ok('internal14.match_count', `(r->>'match_count')::int = 12 AND (r->>'entry_count')::int = 7 AND NOT (r ? 'friendly_clubs') AND ${entriesOf(hostTc)} = 7`, "r->>'match_count'")}
${ok('internal14.guest_athlete', `(SELECT count(*) = 1 FROM public.tournament_athletes WHERE tournament_id = (s->>'t')::bigint AND source = 'guest' AND athlete_id IS NULL)`)}
${setup('irr', 'internal', 4, false, '', '', 'irr')}
  r := pg_temp.f2_fin(s, 'irr', NULL);
${ok('internal.round_robin', `(r->>'match_count')::int = 6`, "r->>'match_count'")}
${setup('iko', 'internal', 5, false, '', '', 'iko')}
  r := pg_temp.f2_fin(s, 'iko', NULL);
${ok('internal.knockout', `(r->>'match_count')::int = 4`, "r->>'match_count'")}
${setup('ide', 'internal', 4, false, '', '', 'ide')}
  r := pg_temp.f2_fin(s, 'ide', NULL);
${ok('internal.double_elimination', `(r->>'match_count')::int = 6`, "r->>'match_count'")}

  INSERT INTO it_result VALUES ('zz.ALL', 'ok');
END
$it$;
SELECT k, v FROM it_result ORDER BY k;
ROLLBACK;`);
process.stdout.write(out.join('\n') + '\n');

