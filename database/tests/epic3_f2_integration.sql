-- Kiểm thử tích hợp Epic 3 F2: migration 111 (finalize_internal_setup_v4 nhánh friendly, nạp trong transaction) +
-- RPC F1 (110, đã apply). Sinh bởi scripts/qa/epic3-f2-integration.js. MỘT transaction, ROLLBACK ở cuối.
-- Kỳ vọng: bảng it_result liệt kê mọi ca (k, v), dòng 'zz.ALL' = 'ok'. Ca sai → lỗi 'IT_FAIL <ca>: …', không có bảng.
-- D50 (private → unlisted + slug) do route finalize làm sau RPC; ở đây chỉ chạy đúng câu UPDATE của route để kiểm ràng buộc.
BEGIN;
CREATE OR REPLACE FUNCTION public.finalize_internal_setup_v4(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint,
  p_expected_setup_revision bigint,
  p_idempotency_key text,
  p_preview_fingerprint text,
  p_plan jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c_allowed_formats constant text[] := ARRAY['group_knockout', 'round_robin', 'knockout', 'double_elimination'];
  d public.tournament_divisions%ROWTYPE;
  t public.tournaments%ROWTYPE;
  cached public.tournament_setup_mutations%ROWTYPE;
  v_draft jsonb;
  v_request_fingerprint text;
  v_fingerprint text;
  v_host_club_id bigint;
  v_pair jsonb;
  v_ref text;
  v_member_id bigint;
  v_client_ref text;
  v_guest jsonb;
  v_ta_id bigint;
  v_athlete_id bigint;
  v_name text;
  v_part text;
  v_pair_id bigint;
  v_entry_id bigint;
  v_stage jsonb;
  v_stage_id bigint;
  v_group jsonb;
  v_index integer;
  v_match jsonb;
  v_match_id bigint;
  v_prog jsonb;
  v_source jsonb;
  v_target_match jsonb;
  v_ref_athletes jsonb := '{}'::jsonb;
  v_ref_names jsonb := '{}'::jsonb;
  v_pair_entries jsonb := '{}'::jsonb;
  v_stage_ids jsonb := '{}'::jsonb;
  v_match_ids jsonb := '{}'::jsonb;
  v_pair_count integer;
  v_participant_count integer;
  v_result jsonb;
  v_mode text; -- friendly:decl
  v_pairs jsonb; -- friendly:decl
  v_guest_pairs jsonb := '[]'::jsonb; -- friendly:decl
  v_max_guest integer; -- friendly:decl
  v_friendly_clubs integer := 0; -- friendly:decl
  v_detail jsonb; -- friendly:decl
  v_club record; -- friendly:decl
BEGIN
  IF p_group_id IS NULL OR p_tournament_id IS NULL OR p_division_id IS NULL
    OR p_expected_setup_revision IS NULL OR p_expected_setup_revision < 1
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
    OR p_preview_fingerprint IS NULL OR lower(p_preview_fingerprint) !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  v_request_fingerprint := md5(jsonb_build_object(
    'tournament_id', p_tournament_id, 'division_id', p_division_id,
    'expected_setup_revision', p_expected_setup_revision,
    'preview_fingerprint', lower(p_preview_fingerprint), 'plan', md5(p_plan::text)
  )::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':setup-finalize-v4:' || btrim(p_idempotency_key), 0));
  SELECT * INTO cached FROM public.tournament_setup_mutations
  WHERE group_id = p_group_id AND operation = 'finalize_internal_setup_v4' AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF cached.division_id <> p_division_id OR cached.payload_fingerprint <> v_request_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'PH409';
    END IF;
    RETURN cached.response;
  END IF;

  SELECT * INTO d FROM public.tournament_divisions
  WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DIVISION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO t FROM public.tournaments WHERE id = p_tournament_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF d.setup_revision <> p_expected_setup_revision THEN RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = 'PH409'; END IF;
  IF d.roster_lock_status <> 'open' THEN RAISE EXCEPTION 'ROSTER_LOCKED' USING ERRCODE = 'PH409'; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_stages s WHERE s.group_id = p_group_id AND s.division_id = p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_entries e WHERE e.group_id = p_group_id AND e.division_id = p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_pairs p WHERE p.group_id = p_group_id AND p.division_id = p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_stage_transitions x WHERE x.group_id = p_group_id AND x.division_id = p_division_id) THEN
    RAISE EXCEPTION 'FINALIZE_STRUCTURE_ALREADY_EXISTS' USING ERRCODE = 'PH409';
  END IF;

  -- Bản nháp đã lưu là nguồn sự thật; plan phải khớp nó.
  v_draft := d.setup_draft;
  v_fingerprint := lower(p_preview_fingerprint);
  IF jsonb_typeof(v_draft) IS DISTINCT FROM 'object'
    OR COALESCE(v_draft->>'draftVersion', '') <> '3'
    OR COALESCE(v_draft->'tournament'->>'organizerMode', '') NOT IN ('internal', 'friendly')
    OR d.play_type <> 'doubles'
    OR jsonb_typeof(v_draft->'pairs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_draft->'participants'->'memberIds') IS DISTINCT FROM 'array'
    OR jsonb_typeof(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'FINALIZE_DRAFT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT (COALESCE(v_draft->'format'->>'formatKey', '') = ANY (c_allowed_formats))
    OR p_plan->>'formatKey' IS DISTINCT FROM v_draft->'format'->>'formatKey' THEN
    RAISE EXCEPTION 'FORMAT_NOT_AVAILABLE' USING ERRCODE = '22023';
  END IF;
  IF lower(COALESCE(v_draft->'draw'->>'previewFingerprint', '')) <> v_fingerprint
    OR lower(COALESCE(p_plan->>'fingerprint', '')) <> v_fingerprint THEN
    RAISE EXCEPTION 'DRAW_FINGERPRINT_MISMATCH' USING ERRCODE = 'PH409';
  END IF;
  IF jsonb_typeof(p_plan->'pairs') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'stages') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_plan->'groups') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'matches') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_plan->'progressions') IS DISTINCT FROM 'array'
    OR jsonb_typeof(COALESCE(p_plan->'guests', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'FINALIZE_PLAN_INVALID' USING ERRCODE = '22023';
  END IF;

  -- friendly:begin — giải giao hữu liên CLB (Epic 3 F2 §6): cặp hiệu lực = cặp chủ nhà (bản nháp) + cặp của CLB khách
  -- đã duyệt, đọc thẳng từ tournament_clubs dưới khoá (không tin client). Giải nội bộ: v_pairs = cặp bản nháp.
  v_mode := v_draft->'tournament'->>'organizerMode';
  v_pairs := v_draft->'pairs';
  IF v_mode = 'friendly' THEN
    IF t.settings->>'organizer_mode' IS DISTINCT FROM 'friendly' THEN
      RAISE EXCEPTION 'FINALIZE_DRAFT_INVALID' USING ERRCODE = '22023';
    END IF;
    -- D49: phía chủ nhà không có khách mời.
    IF jsonb_array_length(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'FRIENDLY_HOST_GUEST_NOT_ALLOWED' USING ERRCODE = 'PH409',
        DETAIL = jsonb_build_object('count', jsonb_array_length(v_draft->'participants'->'guests'))::text;
    END IF;
    -- D46: hạn mức CLB khách do server tính (friendlyEntitlements) và đặt vào p_plan; số nguyên 1–31.
    IF jsonb_typeof(p_plan->'friendly'->'maxGuestClubs') IS DISTINCT FROM 'number'
      OR (p_plan->'friendly'->>'maxGuestClubs') !~ '^[0-9]{1,2}$' THEN
      RAISE EXCEPTION 'FINALIZE_PLAN_INVALID' USING ERRCODE = '22023';
    END IF;
    v_max_guest := (p_plan->'friendly'->>'maxGuestClubs')::integer;
    IF v_max_guest < 1 OR v_max_guest > 31 THEN
      RAISE EXCEPTION 'FINALIZE_PLAN_INVALID' USING ERRCODE = '22023';
    END IF;
    -- Khoá dòng CLB khách: thứ tự khoá division → tournament → club (như 110), khách không ghi được giữa chừng.
    PERFORM 1 FROM public.tournament_clubs tc WHERE tc.tournament_id = p_tournament_id AND tc.group_id = p_group_id AND tc.club_id IS DISTINCT FROM p_group_id ORDER BY tc.id FOR UPDATE;
    SELECT jsonb_agg(COALESCE(g.name, 'CLB #' || tc.id) ORDER BY tc.id) INTO v_detail
    FROM public.tournament_clubs tc LEFT JOIN public.groups g ON g.id = tc.club_id
    WHERE tc.tournament_id = p_tournament_id AND tc.group_id = p_group_id AND tc.club_id IS DISTINCT FROM p_group_id
      AND (COALESCE(tc.invitation_status, '') NOT IN ('approved', 'declined', 'withdrawn')
           OR (tc.invitation_status = 'approved' AND tc.roster_approved_version IS NULL));
    IF v_detail IS NOT NULL THEN
      RAISE EXCEPTION 'FRIENDLY_CLUB_NOT_READY' USING ERRCODE = 'PH409', DETAIL = jsonb_build_object('clubs', v_detail)::text;
    END IF;
    IF EXISTS (SELECT 1 FROM public.tournament_clubs tc WHERE tc.tournament_id = p_tournament_id AND tc.group_id = p_group_id AND tc.club_id IS DISTINCT FROM p_group_id AND tc.invitation_status = 'approved' AND tc.external_club_id IS NOT NULL) THEN
      RAISE EXCEPTION 'EXTERNAL_CLUB_NOT_SUPPORTED' USING ERRCODE = 'PH409';
    END IF;
    SELECT count(*) INTO v_friendly_clubs FROM public.tournament_clubs tc WHERE tc.tournament_id = p_tournament_id AND tc.group_id = p_group_id AND tc.club_id IS DISTINCT FROM p_group_id AND tc.invitation_status = 'approved';
    IF v_friendly_clubs > v_max_guest THEN
      RAISE EXCEPTION 'FRIENDLY_CLUB_LIMIT_REACHED' USING ERRCODE = 'PH409',
        DETAIL = jsonb_build_object('max', v_max_guest, 'used', v_friendly_clubs)::text;
    END IF;
    -- Cặp khách: khóa c<id>.<roster_approved_version>.<pairId>, theo id dòng rồi thứ tự cặp đã gửi.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'pairId', 'c' || tc.id || '.' || tc.roster_approved_version || '.' || (pair->>'pairId'),
             'participantRefs', pair->'participantRefs', 'tournamentClubId', tc.id, 'clubId', tc.club_id) ORDER BY tc.id, x.ord), '[]'::jsonb)
    INTO v_guest_pairs
    FROM public.tournament_clubs tc
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(tc.roster_submitted->'pairs') = 'array' THEN tc.roster_submitted->'pairs' ELSE '[]'::jsonb END) WITH ORDINALITY AS x(pair, ord)
    WHERE tc.tournament_id = p_tournament_id AND tc.group_id = p_group_id AND tc.club_id IS DISTINCT FROM p_group_id AND tc.invitation_status = 'approved';
    -- Plan phải được dựng trên đúng tập cặp khách đang duyệt (duyệt lại → version đổi → khóa đổi).
    IF (SELECT COALESCE(array_agg(y->>'pairId' ORDER BY y->>'pairId'), ARRAY[]::text[]) FROM jsonb_array_elements(p_plan->'pairs') y
        WHERE y->>'pairId' ~ '^c([0-9]+)\.([0-9]+)\.([A-Za-z0-9_-]{1,64})$')
      IS DISTINCT FROM (SELECT COALESCE(array_agg(x->>'pairId' ORDER BY x->>'pairId'), ARRAY[]::text[]) FROM jsonb_array_elements(v_guest_pairs) x) THEN
      RAISE EXCEPTION 'FRIENDLY_ROSTER_CHANGED' USING ERRCODE = 'PH409';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_guest_pairs) x WHERE jsonb_typeof(x->'participantRefs') IS DISTINCT FROM 'array') THEN
      RAISE EXCEPTION 'PAIRING_INVALID' USING ERRCODE = '22023';
    END IF;
    -- D38: đội CLB khách chỉ gồm thành viên (không khách mời).
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_guest_pairs) x, jsonb_array_elements_text(x->'participantRefs') r WHERE r !~ '^member:[1-9][0-9]*$') THEN
      RAISE EXCEPTION 'FRIENDLY_GUEST_NOT_ALLOWED' USING ERRCODE = 'PH409';
    END IF;
    -- Ref thuộc danh sách đã gửi của CHÍNH dòng đó.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_guest_pairs) x, jsonb_array_elements_text(x->'participantRefs') r
               WHERE NOT EXISTS (SELECT 1 FROM public.tournament_clubs tc,
                                   jsonb_array_elements_text(CASE WHEN jsonb_typeof(tc.roster_submitted->'memberIds') = 'array' THEN tc.roster_submitted->'memberIds' ELSE '[]'::jsonb END) m
                                 WHERE tc.id = (x->>'tournamentClubId')::bigint AND m = substr(r, 8))) THEN
      RAISE EXCEPTION 'PAIRING_INVALID' USING ERRCODE = '22023';
    END IF;
    -- D17: thành viên đang hoạt động của đúng CLB khách, có danh tính thi đấu.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_guest_pairs) x, jsonb_array_elements_text(x->'participantRefs') r
               WHERE NOT EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = substr(r, 8)::bigint AND cm.group_id = (x->>'clubId')::bigint AND cm.is_active IS DISTINCT FROM false)) THEN
      RAISE EXCEPTION 'MEMBER_NOT_ACTIVE_IN_GROUP' USING ERRCODE = '23503';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_guest_pairs) x, jsonb_array_elements_text(x->'participantRefs') r
               WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.legacy_club_member_id = substr(r, 8)::bigint)) THEN
      RAISE EXCEPTION 'ATHLETE_IDENTITY_MISSING' USING ERRCODE = '23503';
    END IF;
    v_detail := NULL;
    SELECT jsonb_build_object('quota', tc.quota, 'count', q.n, 'club', COALESCE(g.name, 'CLB #' || tc.id)) INTO v_detail
    FROM public.tournament_clubs tc LEFT JOIN public.groups g ON g.id = tc.club_id
    CROSS JOIN LATERAL (SELECT count(*) AS n FROM jsonb_array_elements(v_guest_pairs) x WHERE (x->>'tournamentClubId')::bigint = tc.id) q
    WHERE tc.tournament_id = p_tournament_id AND tc.group_id = p_group_id AND tc.club_id IS DISTINCT FROM p_group_id AND tc.invitation_status = 'approved' AND tc.quota IS NOT NULL AND q.n > tc.quota
    ORDER BY tc.id LIMIT 1;
    IF v_detail IS NOT NULL THEN
      RAISE EXCEPTION 'FRIENDLY_QUOTA_EXCEEDED' USING ERRCODE = 'PH409', DETAIL = v_detail::text;
    END IF;
    -- Một VĐV không thi đấu cho hai CLB (trước unique (tournament_id, athlete_id) của tournament_athletes).
    v_detail := NULL;
    SELECT jsonb_build_object('name', COALESCE(max(a.display_name), ''), 'athleteId', a.id) INTO v_detail
    FROM (SELECT 0::bigint AS club, m::bigint AS member_id FROM jsonb_array_elements_text(v_draft->'participants'->'memberIds') m WHERE m ~ '^[1-9][0-9]{0,17}$'
          UNION ALL
          SELECT (x->>'tournamentClubId')::bigint, substr(r, 8)::bigint FROM jsonb_array_elements(v_guest_pairs) x, jsonb_array_elements_text(x->'participantRefs') r) s
    JOIN public.athletes a ON a.legacy_club_member_id = s.member_id
    GROUP BY a.id HAVING count(DISTINCT s.club) > 1 ORDER BY a.id LIMIT 1;
    IF v_detail IS NOT NULL THEN
      RAISE EXCEPTION 'FRIENDLY_ATHLETE_DUPLICATE' USING ERRCODE = 'PH409', DETAIL = v_detail::text;
    END IF;
    IF (CASE WHEN jsonb_array_length(v_draft->'pairs') > 0 THEN 1 ELSE 0 END)
       + (SELECT count(DISTINCT x->>'tournamentClubId') FROM jsonb_array_elements(v_guest_pairs) x) < 2 THEN
      RAISE EXCEPTION 'FRIENDLY_CLUBS_TOO_FEW' USING ERRCODE = 'PH409';
    END IF;
    v_pairs := v_draft->'pairs' || v_guest_pairs;
    IF (SELECT count(DISTINCT x->>'pairId') FROM jsonb_array_elements(v_pairs) x) <> jsonb_array_length(v_pairs) THEN
      RAISE EXCEPTION 'PAIRING_INVALID' USING ERRCODE = '22023';
    END IF;
  END IF;
  -- friendly:end
  -- Cặp: đúng tập cặp của bản nháp, mỗi cặp hai ref khác nhau, mỗi người đúng một cặp,
  -- mọi người tham gia đều có cặp (không dự bị, không cặp một người).
  v_pair_count := jsonb_array_length(v_pairs);
  v_participant_count := jsonb_array_length(v_draft->'participants'->'memberIds') + jsonb_array_length(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb));
  -- friendly:begin
  v_participant_count := v_participant_count + 2 * jsonb_array_length(v_guest_pairs);
  -- friendly:end
  IF v_pair_count < 2 OR jsonb_array_length(p_plan->'pairs') <> v_pair_count OR v_participant_count <> v_pair_count * 2
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) x
               WHERE jsonb_typeof(x->'participantRefs') IS DISTINCT FROM 'array' OR jsonb_array_length(x->'participantRefs') <> 2
                  OR x->'participantRefs'->>0 = x->'participantRefs'->>1
                  OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'pairs') y
                                 WHERE y->>'pairId' = x->>'pairId'
                                   AND (SELECT array_agg(r ORDER BY r) FROM jsonb_array_elements_text(y->'refs') r)
                                     = (SELECT array_agg(r ORDER BY r) FROM jsonb_array_elements_text(x->'participantRefs') r)))
    OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(v_pairs) x, jsonb_array_elements_text(x->'participantRefs') r) <> v_pair_count * 2
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_draft->'pairs') x, jsonb_array_elements_text(x->'participantRefs') r
               WHERE NOT (
                 (r ~ '^member:[1-9][0-9]*$' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_draft->'participants'->'memberIds') m WHERE m = substr(r, 8)))
                 OR (r ~ '^guest:[A-Za-z0-9_-]{8,64}$' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) g WHERE g->>'clientRef' = substr(r, 7)))
               )) THEN
    RAISE EXCEPTION 'PAIRING_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Thành viên: đang hoạt động trong đúng CLB và có danh tính thi đấu.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_draft->'participants'->'memberIds') m
             WHERE m !~ '^[1-9][0-9]*$' OR NOT EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = m::bigint AND cm.group_id = p_group_id AND cm.is_active IS DISTINCT FROM false)) THEN
    RAISE EXCEPTION 'MEMBER_NOT_ACTIVE_IN_GROUP' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_draft->'participants'->'memberIds') m
             WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.legacy_club_member_id = m::bigint)) THEN
    RAISE EXCEPTION 'ATHLETE_IDENTITY_MISSING' USING ERRCODE = '23503';
  END IF;
  -- Khách: tên lấy từ bản nháp đã lưu (không tin tên trong p_plan).
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) g
             WHERE COALESCE(g->>'clientRef', '') !~ '^[A-Za-z0-9_-]{8,64}$' OR length(btrim(COALESCE(g->>'displayName', ''))) NOT BETWEEN 2 AND 60) THEN
    RAISE EXCEPTION 'GUEST_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Cấu trúc plan: 2 stage có planKey, mỗi cặp đúng một bảng, matchKey duy nhất,
  -- trận bảng dùng cặp của bảng đó, trận loại trực tiếp để trống và có đúng hai nguồn.
  IF (p_plan->>'formatKey' = 'group_knockout' AND jsonb_array_length(p_plan->'stages') <> 2)
    OR (p_plan->>'formatKey' = 'round_robin' AND (
      jsonb_array_length(p_plan->'stages') <> 1
      OR jsonb_array_length(p_plan->'progressions') <> 0
      OR jsonb_array_length(p_plan->'matches') <> v_pair_count * (v_pair_count - 1) / 2
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) x
                 WHERE (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m
                        WHERE m->>'entryAId' = x->>'pairId' OR m->>'entryBId' = x->>'pairId') <> v_pair_count - 1)
      OR (SELECT count(DISTINCT LEAST(m->>'entryAId', m->>'entryBId') || '~' || GREATEST(m->>'entryAId', m->>'entryBId'))
          FROM jsonb_array_elements(p_plan->'matches') m) <> jsonb_array_length(p_plan->'matches')))
    OR (p_plan->>'formatKey' = 'knockout' AND (
      jsonb_array_length(p_plan->'stages') <> 1
      OR p_plan->'stages'->0->>'scheduleFormat' IS DISTINCT FROM 'knockout'
      OR jsonb_array_length(p_plan->'groups') <> 1
      OR p_plan->'groups'->0->>'stagePlanKey' IS DISTINCT FROM p_plan->'stages'->0->>'planKey'
      OR jsonb_array_length(p_plan->'matches') <> v_pair_count - 1
           + (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' = 'BRONZE')::integer
      OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' = 'F') <> 1
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'stageKind' IS DISTINCT FROM 'knockout' OR m->>'entryAId' = m->>'entryBId')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->'source'->>'kind' IS DISTINCT FROM 'match_outcome')
      -- Mỗi ô của mỗi trận: hoặc có cặp (vòng 1 / bye), hoặc đúng một tuyến đi tới.
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m, (VALUES ('a', 'entryAId'), ('b', 'entryBId')) side(slot, field)
                 WHERE (CASE WHEN m->>side.field IS NULL THEN 0 ELSE 1 END)
                   + (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->>'targetMatchKey' = m->>'matchKey' AND pr->>'targetSlot' = side.slot) <> 1)
      -- Mỗi cặp vào nhánh đúng một lần.
      OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id) WHERE e.id IS NOT NULL) <> v_pair_count
      OR (SELECT count(DISTINCT e.id) FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id) WHERE e.id IS NOT NULL) <> v_pair_count
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id)
                 WHERE e.id IS NOT NULL AND NOT (p_plan->'groups'->0->'entryIds' ? e.id))
      -- Tuyến chỉ đi tới vòng sau; trận thua chỉ vào tranh hạng ba, từ hai bán kết.
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr
                 JOIN jsonb_array_elements(p_plan->'matches') src ON src->>'matchKey' = pr->'source'->>'matchKey'
                 JOIN jsonb_array_elements(p_plan->'matches') dst ON dst->>'matchKey' = pr->>'targetMatchKey'
                 WHERE (src->>'round')::integer >= (dst->>'round')::integer
                    OR pr->'source'->>'outcome' NOT IN ('winner', 'loser')
                    OR (pr->'source'->>'outcome' = 'loser' AND (pr->>'targetMatchKey' <> 'BRONZE' OR pr->'source'->>'matchKey' NOT IN ('SF1', 'SF2'))))
      -- F là trận duy nhất không có cạnh thắng đi ra (không tính BRONZE, cũng không có cạnh ra).
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
                 WHERE (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr
                        WHERE pr->'source'->>'matchKey' = m->>'matchKey' AND pr->'source'->>'outcome' = 'winner')
                       <> CASE WHEN m->>'matchKey' IN ('F', 'BRONZE') THEN 0 ELSE 1 END)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->'source'->>'matchKey' IN ('F', 'BRONZE'))))
    OR (p_plan->>'formatKey' = 'double_elimination' AND (
      jsonb_array_length(p_plan->'stages') <> 1
      OR p_plan->'stages'->0->>'scheduleFormat' IS DISTINCT FROM 'double_elim'
      OR p_plan->'stages'->0->'config'->'grandFinalReset' IS DISTINCT FROM 'false'::jsonb
      OR jsonb_array_length(p_plan->'groups') <> 1
      OR p_plan->'groups'->0->>'stagePlanKey' IS DISTINCT FROM p_plan->'stages'->0->>'planKey'
      -- 2n − 2 trận: nhánh thắng n − 1, nhánh thua n − 2, đúng một WF / LF / GF.
      OR jsonb_array_length(p_plan->'matches') <> 2 * v_pair_count - 2
      OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' ~ '^W([0-9]+-[0-9]+|F)$') <> v_pair_count - 1
      OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' ~ '^L([0-9]+-[0-9]+|F)$') <> v_pair_count - 2
      OR (SELECT count(DISTINCT m->>'matchKey') FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' IN ('WF', 'LF', 'GF')) <> 3
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
                 WHERE COALESCE(m->>'matchKey', '') !~ '^(W[0-9]+-[0-9]+|WF|L[0-9]+-[0-9]+|LF|GF)$'
                    OR m->>'stageKind' IS DISTINCT FROM 'knockout' OR m->>'entryAId' = m->>'entryBId')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr
                 WHERE pr->'source'->>'kind' IS DISTINCT FROM 'match_outcome' OR COALESCE(pr->'source'->>'outcome', '') NOT IN ('winner', 'loser'))
      -- Mỗi ô của mỗi trận: hoặc có cặp (nhánh thắng / bye), hoặc đúng một tuyến đi tới → không trận một bên.
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m, (VALUES ('a', 'entryAId'), ('b', 'entryBId')) side(slot, field)
                 WHERE (CASE WHEN m->>side.field IS NULL THEN 0 ELSE 1 END)
                   + (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->>'targetMatchKey' = m->>'matchKey' AND pr->>'targetSlot' = side.slot) <> 1)
      -- Cặp chỉ vào nhánh thắng, mỗi cặp đúng một lần, đều là cặp của bản nháp.
      OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id) WHERE e.id IS NOT NULL) <> v_pair_count
      OR (SELECT count(DISTINCT e.id) FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id) WHERE e.id IS NOT NULL) <> v_pair_count
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id)
                 WHERE e.id IS NOT NULL AND (NOT (p_plan->'groups'->0->'entryIds' ? e.id) OR m->>'matchKey' !~ '^W'))
      -- Tuyến: nguồn/đích có thật, chỉ tới lượt sau; thua chỉ từ nhánh thắng xuống nhánh thua;
      -- thắng ở lại nhánh, riêng WF và LF vào GF.
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr
                 LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(p_plan->'matches') WHERE value->>'matchKey' = pr->'source'->>'matchKey') src(m) ON true
                 LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(p_plan->'matches') WHERE value->>'matchKey' = pr->>'targetMatchKey') dst(m) ON true
                 WHERE src.m IS NULL OR dst.m IS NULL
                    OR (src.m->>'round')::integer >= (dst.m->>'round')::integer
                    OR (pr->'source'->>'outcome' = 'loser' AND NOT (src.m->>'matchKey' ~ '^W' AND dst.m->>'matchKey' ~ '^L'))
                    OR (pr->'source'->>'outcome' = 'winner' AND src.m->>'matchKey' IN ('WF', 'LF') AND dst.m->>'matchKey' <> 'GF')
                    OR (pr->'source'->>'outcome' = 'winner' AND src.m->>'matchKey' NOT IN ('WF', 'LF') AND left(src.m->>'matchKey', 1) <> left(dst.m->>'matchKey', 1)))
      -- Mọi trận trừ GF đúng một cạnh thắng ra; mọi trận nhánh thắng đúng một cạnh thua ra; GF không có cạnh ra.
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
                 WHERE (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr
                        WHERE pr->'source'->>'matchKey' = m->>'matchKey' AND pr->'source'->>'outcome' = 'winner')
                       <> CASE WHEN m->>'matchKey' = 'GF' THEN 0 ELSE 1 END
                    OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr
                        WHERE pr->'source'->>'matchKey' = m->>'matchKey' AND pr->'source'->>'outcome' = 'loser')
                       <> CASE WHEN m->>'matchKey' ~ '^W' THEN 1 ELSE 0 END)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->'source'->>'matchKey' = 'GF')))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'stages') s WHERE s->>'scheduleFormat' NOT IN ('round_robin', 'knockout', 'double_elim') OR nullif(s->>'planKey', '') IS NULL)
    OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'groups') gr, jsonb_array_elements_text(gr->'entryIds') e) <> v_pair_count
    OR (SELECT count(DISTINCT e) FROM jsonb_array_elements(p_plan->'groups') gr, jsonb_array_elements_text(gr->'entryIds') e) <> v_pair_count
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'groups') gr, jsonb_array_elements_text(gr->'entryIds') e
               WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) x WHERE x->>'pairId' = e))
    OR (SELECT count(DISTINCT m->>'matchKey') FROM jsonb_array_elements(p_plan->'matches') m) <> jsonb_array_length(p_plan->'matches')
    OR jsonb_array_length(p_plan->'matches') <> COALESCE((p_plan->'counts'->>'total')::integer, -1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
               WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'stages') s WHERE s->>'planKey' = m->>'stagePlanKey'))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
               WHERE m->>'stageKind' = 'group' AND (
                 m->>'entryAId' IS NULL OR m->>'entryBId' IS NULL OR m->>'entryAId' = m->>'entryBId'
                 OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'groups') gr
                                WHERE gr->>'label' = m->>'groupLabel' AND gr->'entryIds' ? (m->>'entryAId') AND gr->'entryIds' ? (m->>'entryBId'))))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
               WHERE p_plan->>'formatKey' = 'group_knockout' AND m->>'stageKind' = 'knockout' AND (m->>'entryAId' IS NOT NULL OR m->>'entryBId' IS NOT NULL
                 OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->>'targetMatchKey' = m->>'matchKey') <> 2
                 OR (SELECT count(DISTINCT pr->>'targetSlot') FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->>'targetMatchKey' = m->>'matchKey' AND pr->>'targetSlot' IN ('a', 'b')) <> 2))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr
               WHERE pr->'source'->>'kind' NOT IN ('group_rank', 'group_rank_pool', 'match_outcome')
                  OR (pr->'source'->>'kind' = 'match_outcome' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' = pr->'source'->>'matchKey' AND m->>'stageKind' = 'knockout'))
                  OR (pr->'source'->>'kind' = 'group_rank' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'groups') gr WHERE gr->>'label' = pr->'source'->>'groupLabel'))) THEN
    RAISE EXCEPTION 'FINALIZE_PLAN_INVALID' USING ERRCODE = '22023';
  END IF;

  -- CLB chủ nhà.
  INSERT INTO public.tournament_clubs(group_id, tournament_id, club_id, invitation_status) VALUES (p_group_id, p_tournament_id, p_group_id, 'approved')
  ON CONFLICT (tournament_id, club_id) WHERE club_id IS NOT NULL DO UPDATE SET version = public.tournament_clubs.version RETURNING id INTO v_host_club_id;
  IF v_host_club_id IS NULL THEN
    SELECT id INTO v_host_club_id FROM public.tournament_clubs WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND club_id = p_group_id;
  END IF;

  -- VĐV của giải: thành viên (theo athlete) và khách (athlete_id rỗng, theo client_ref).
  FOR v_ref IN SELECT 'member:' || m FROM jsonb_array_elements_text(v_draft->'participants'->'memberIds') m LOOP
    v_member_id := substr(v_ref, 8)::bigint;
    SELECT a.id INTO v_athlete_id FROM public.athletes a WHERE a.legacy_club_member_id = v_member_id;
    SELECT full_name INTO v_name FROM public.club_members WHERE id = v_member_id AND group_id = p_group_id;
    v_ta_id := NULL;
    SELECT id INTO v_ta_id FROM public.tournament_athletes
    WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND athlete_id = v_athlete_id AND tournament_club_id = v_host_club_id FOR UPDATE;
    IF v_ta_id IS NULL AND EXISTS (SELECT 1 FROM public.tournament_athletes WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND athlete_id = v_athlete_id) THEN
      RAISE EXCEPTION 'TOURNAMENT_ATHLETE_CLUB_SCOPE_MISMATCH' USING ERRCODE = '23503';
    END IF;
    IF v_ta_id IS NULL THEN
      INSERT INTO public.tournament_athletes(group_id, tournament_id, tournament_club_id, athlete_id, display_name_snapshot, source)
      VALUES (p_group_id, p_tournament_id, v_host_club_id, v_athlete_id, v_name, 'club_member') RETURNING id INTO v_ta_id;
    END IF;
    v_ref_athletes := v_ref_athletes || jsonb_build_object(v_ref, jsonb_build_object('ta', v_ta_id, 'athlete', v_athlete_id));
    v_ref_names := v_ref_names || jsonb_build_object(v_ref, v_name);
  END LOOP;
  FOR v_guest IN SELECT value FROM jsonb_array_elements(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) LOOP
    v_client_ref := v_guest->>'clientRef';
    v_name := btrim(v_guest->>'displayName');
    INSERT INTO public.tournament_athletes(group_id, tournament_id, tournament_club_id, athlete_id, display_name_snapshot, source, client_ref)
    VALUES (p_group_id, p_tournament_id, v_host_club_id, NULL, v_name, 'guest', v_client_ref)
    ON CONFLICT (group_id, tournament_id, client_ref) WHERE client_ref IS NOT NULL
    DO UPDATE SET display_name_snapshot = EXCLUDED.display_name_snapshot
    RETURNING id INTO v_ta_id;
    v_ref_athletes := v_ref_athletes || jsonb_build_object('guest:' || v_client_ref, jsonb_build_object('ta', v_ta_id, 'athlete', NULL));
    v_ref_names := v_ref_names || jsonb_build_object('guest:' || v_client_ref, v_name);
  END LOOP;
  INSERT INTO public.tournament_division_roster_members(group_id, division_id, tournament_athlete_id)
  SELECT p_group_id, p_division_id, (value->>'ta')::bigint FROM jsonb_each(v_ref_athletes) ON CONFLICT DO NOTHING;

  -- Cặp → entry.
  FOR v_pair IN SELECT value FROM jsonb_array_elements(v_draft->'pairs') LOOP
    SELECT string_agg(v_ref_names->>r, ' / ' ORDER BY ord) INTO v_name
    FROM jsonb_array_elements_text(v_pair->'participantRefs') WITH ORDINALITY AS x(r, ord);
    INSERT INTO public.tournament_pairs(group_id, division_id, name_snapshot, pairing_mode, status)
    VALUES (p_group_id, p_division_id, v_name, 'manual', 'locked') RETURNING id INTO v_pair_id;
    INSERT INTO public.tournament_entries(group_id, division_id, tournament_club_id, pair_id, name_snapshot, status)
    VALUES (p_group_id, p_division_id, v_host_club_id, v_pair_id, v_name, 'approved') RETURNING id INTO v_entry_id;
    FOR v_part IN SELECT r FROM jsonb_array_elements_text(v_pair->'participantRefs') r LOOP
      INSERT INTO public.tournament_pair_members(group_id, pair_id, tournament_athlete_id)
      VALUES (p_group_id, v_pair_id, (v_ref_athletes->v_part->>'ta')::bigint);
      INSERT INTO public.tournament_entry_members(group_id, entry_id, athlete_id, display_name_snapshot, roster_role)
      VALUES (p_group_id, v_entry_id, NULLIF(v_ref_athletes->v_part->>'athlete', '')::bigint, v_ref_names->>v_part, 'player');
    END LOOP;
    v_pair_entries := v_pair_entries || jsonb_build_object(v_pair->>'pairId', v_entry_id);
  END LOOP;

  -- friendly:begin — VĐV / cặp / entry của từng CLB khách đã duyệt: tournament_club_id = dòng CLB đó,
  -- club_name_snapshot = groups.name; v_pair_entries nhận khóa cặp khách để bảng / trận bên dưới dùng chung.
  IF v_mode = 'friendly' THEN
    FOR v_club IN SELECT tc.id, tc.club_id, g.name FROM public.tournament_clubs tc JOIN public.groups g ON g.id = tc.club_id
                  WHERE tc.tournament_id = p_tournament_id AND tc.group_id = p_group_id AND tc.club_id IS DISTINCT FROM p_group_id AND tc.invitation_status = 'approved' ORDER BY tc.id LOOP
      FOR v_ref IN SELECT r FROM jsonb_array_elements(v_guest_pairs) x, jsonb_array_elements_text(x->'participantRefs') r WHERE (x->>'tournamentClubId')::bigint = v_club.id LOOP
        v_member_id := substr(v_ref, 8)::bigint;
        SELECT a.id INTO v_athlete_id FROM public.athletes a WHERE a.legacy_club_member_id = v_member_id;
        SELECT full_name INTO v_name FROM public.club_members WHERE id = v_member_id AND group_id = v_club.club_id;
        v_ta_id := NULL;
        SELECT id INTO v_ta_id FROM public.tournament_athletes
        WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND athlete_id = v_athlete_id AND tournament_club_id = v_club.id FOR UPDATE;
        IF v_ta_id IS NULL AND EXISTS (SELECT 1 FROM public.tournament_athletes WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND athlete_id = v_athlete_id) THEN
          RAISE EXCEPTION 'TOURNAMENT_ATHLETE_CLUB_SCOPE_MISMATCH' USING ERRCODE = '23503';
        END IF;
        IF v_ta_id IS NULL THEN
          INSERT INTO public.tournament_athletes(group_id, tournament_id, tournament_club_id, athlete_id, display_name_snapshot, club_name_snapshot, source)
          VALUES (p_group_id, p_tournament_id, v_club.id, v_athlete_id, v_name, v_club.name, 'club_member') RETURNING id INTO v_ta_id;
        END IF;
        INSERT INTO public.tournament_division_roster_members(group_id, division_id, tournament_athlete_id)
        VALUES (p_group_id, p_division_id, v_ta_id) ON CONFLICT DO NOTHING;
        v_ref_athletes := v_ref_athletes || jsonb_build_object(v_ref, jsonb_build_object('ta', v_ta_id, 'athlete', v_athlete_id));
        v_ref_names := v_ref_names || jsonb_build_object(v_ref, v_name);
      END LOOP;
      FOR v_pair IN SELECT value FROM jsonb_array_elements(v_guest_pairs) WHERE (value->>'tournamentClubId')::bigint = v_club.id LOOP
        SELECT string_agg(v_ref_names->>r, ' / ' ORDER BY ord) INTO v_name
        FROM jsonb_array_elements_text(v_pair->'participantRefs') WITH ORDINALITY AS x(r, ord);
        INSERT INTO public.tournament_pairs(group_id, division_id, name_snapshot, pairing_mode, status)
        VALUES (p_group_id, p_division_id, v_name, 'manual', 'locked') RETURNING id INTO v_pair_id;
        INSERT INTO public.tournament_entries(group_id, division_id, tournament_club_id, pair_id, name_snapshot, status)
        VALUES (p_group_id, p_division_id, v_club.id, v_pair_id, v_name, 'approved') RETURNING id INTO v_entry_id;
        FOR v_part IN SELECT r FROM jsonb_array_elements_text(v_pair->'participantRefs') r LOOP
          INSERT INTO public.tournament_pair_members(group_id, pair_id, tournament_athlete_id)
          VALUES (p_group_id, v_pair_id, (v_ref_athletes->v_part->>'ta')::bigint);
          INSERT INTO public.tournament_entry_members(group_id, entry_id, athlete_id, display_name_snapshot, club_name_snapshot, roster_role)
          VALUES (p_group_id, v_entry_id, (v_ref_athletes->v_part->>'athlete')::bigint, v_ref_names->>v_part, v_club.name, 'player');
        END LOOP;
        v_pair_entries := v_pair_entries || jsonb_build_object(v_pair->>'pairId', v_entry_id);
      END LOOP;
    END LOOP;
  END IF;
  -- friendly:end
  -- Stage theo plan; stage đầu mang khóa bốc thăm.
  FOR v_stage IN SELECT value FROM jsonb_array_elements(p_plan->'stages') ORDER BY (value->>'order')::integer LOOP
    INSERT INTO public.tournament_stages(group_id, tournament_id, division_id, stage_order, name, schedule_format, match_format, status, config)
    VALUES (p_group_id, p_tournament_id, p_division_id, (v_stage->>'order')::integer, v_stage->>'name', v_stage->>'scheduleFormat', 'simple', 'pending',
            COALESCE(v_stage->'config', '{}'::jsonb) || jsonb_build_object('draw', jsonb_build_object('status', 'locked', 'fingerprint', v_fingerprint)))
    RETURNING id INTO v_stage_id;
    v_stage_ids := v_stage_ids || jsonb_build_object(v_stage->>'planKey', v_stage_id);
  END LOOP;

  -- Cặp vào bảng (vòng bảng/vòng tròn) hoặc thứ tự bốc thăm của nhánh (loại trực tiếp, không nhãn).
  FOR v_group IN SELECT value FROM jsonb_array_elements(p_plan->'groups') LOOP
    v_index := 0;
    FOR v_part IN SELECT e FROM jsonb_array_elements_text(v_group->'entryIds') e LOOP
      v_index := v_index + 1;
      INSERT INTO public.tournament_stage_entrants(group_id, stage_id, division_id, entry_id, group_label, seed_in_stage)
      VALUES (p_group_id, (v_stage_ids->>COALESCE(v_group->>'stagePlanKey', 'group-stage'))::bigint, p_division_id, (v_pair_entries->>v_part)::bigint, v_group->>'label', v_index);
    END LOOP;
  END LOOP;

  -- Trận: bảng có cặp; loại trực tiếp để trống chờ tiến cấp.
  FOR v_match IN SELECT value FROM jsonb_array_elements(p_plan->'matches') ORDER BY (value->>'order')::integer LOOP
    INSERT INTO public.tournament_matches(group_id, division_id, stage_id, round, bracket_slot, group_label, match_order, match_key, entry_a_id, entry_b_id, status, result_type)
    VALUES (p_group_id, p_division_id, (v_stage_ids->>(v_match->>'stagePlanKey'))::bigint,
            COALESCE((v_match->>'round')::integer, 1),
            COALESCE((v_match->>'bracketSlot')::integer, (v_match->>'order')::integer),
            v_match->>'groupLabel', (v_match->>'order')::integer, v_match->>'matchKey',
            (v_pair_entries->>(v_match->>'entryAId'))::bigint, (v_pair_entries->>(v_match->>'entryBId'))::bigint, 'pending', 'simple')
    RETURNING id INTO v_match_id;
    v_match_ids := v_match_ids || jsonb_build_object(v_match->>'matchKey', v_match_id);
  END LOOP;

  -- Tuyến đi tiếp tường minh (không suy ra bằng stage_order + 1).
  FOR v_prog IN SELECT value FROM jsonb_array_elements(p_plan->'progressions') LOOP
    v_source := v_prog->'source';
    SELECT value INTO v_target_match FROM jsonb_array_elements(p_plan->'matches') WHERE value->>'matchKey' = v_prog->>'targetMatchKey';
    INSERT INTO public.tournament_stage_transitions(
      group_id, tournament_id, division_id, source_stage_id, source_kind,
      source_group_label, source_rank, source_pool_position, source_match_id, source_outcome,
      target_stage_id, target_match_id, target_slot)
    VALUES (
      p_group_id, p_tournament_id, p_division_id, (v_stage_ids->>(v_prog->>'sourceStagePlanKey'))::bigint, v_source->>'kind',
      CASE WHEN v_source->>'kind' = 'group_rank' THEN v_source->>'groupLabel' END,
      CASE WHEN v_source->>'kind' IN ('group_rank', 'group_rank_pool') THEN (v_source->>'rank')::integer END,
      CASE WHEN v_source->>'kind' = 'group_rank_pool' THEN (v_source->>'poolPosition')::integer END,
      CASE WHEN v_source->>'kind' = 'match_outcome' THEN (v_match_ids->>(v_source->>'matchKey'))::bigint END,
      CASE WHEN v_source->>'kind' = 'match_outcome' THEN v_source->>'outcome' END,
      (v_stage_ids->>(v_target_match->>'stagePlanKey'))::bigint, (v_match_ids->>(v_prog->>'targetMatchKey'))::bigint, v_prog->>'targetSlot');
  END LOOP;

  UPDATE public.tournament_divisions
  SET roster_lock_status = 'locked', roster_locked_at = now(), setup_revision = setup_revision + 1, setup_updated_at = now(),
      setup_draft = jsonb_set(jsonb_set(jsonb_set(setup_draft, '{state}', '"finalized"'::jsonb, true), '{draw,status}', '"locked"'::jsonb, true), '{finalizedAt}', to_jsonb(now()), true)
  WHERE id = d.id AND group_id = p_group_id RETURNING setup_revision INTO d.setup_revision;

  v_result := jsonb_build_object(
    'success', true, 'setup_revision', d.setup_revision, 'stages', v_stage_ids,
    'match_count', jsonb_array_length(p_plan->'matches'), 'entry_count', v_pair_count,
    'draw_fingerprint', v_fingerprint
  );
  -- friendly:begin
  IF v_mode = 'friendly' THEN
    v_result := v_result || jsonb_build_object('friendly_clubs', v_friendly_clubs);
  END IF;
  -- friendly:end
  INSERT INTO public.tournament_setup_mutations(group_id, operation, division_id, idempotency_key, payload_fingerprint, response)
  VALUES (p_group_id, 'finalize_internal_setup_v4', p_division_id, p_idempotency_key, v_request_fingerprint, v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) TO service_role;
COMMENT ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) IS 'Chốt giải v3: kiểm plan khớp bản nháp đã lưu, ghi VĐV (kể cả khách), cặp, entry, stage, trận, tuyến đi tiếp nguyên tử.';

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


DO $it$
DECLARE
  ga bigint; gb bigint; s jsonb; s2 jsonb; r jsonb; r2 jsonb; e text; m bigint; hm1 bigint; rs jsonb; x bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = 59) THEN RAISE EXCEPTION 'IT_FAIL setup: không có group chủ nhà 59'; END IF;
  -- CLB khách A = group 19 (D48; chỉ thêm thành viên tạm trong transaction), thiếu thì group tạm. B luôn tạm.
  IF EXISTS (SELECT 1 FROM public.groups WHERE id = 19) THEN ga := 19;
  ELSE
    INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
    VALUES ('zzf2-a-' || substr(md5(random()::text), 1, 8), 'ZZF2 IT khách A (rollback)', 'x', 'x') RETURNING id INTO ga;
  END IF;
  INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
  VALUES ('zzf2-b-' || substr(md5(random()::text), 1, 8), 'ZZF2 IT khách B (rollback)', 'x', 'x') RETURNING id INTO gb;
  INSERT INTO it_result VALUES ('setup.guest_a', ga::text);

  -- ===== G1: 59 = 4 cặp, A = 3 cặp, 2x2, hạn mức 1 → 12 trận =====
  s := pg_temp.f2_setup('g1', 'friendly', 4, false, ARRAY[ga]::bigint[], ARRAY[3]::integer[], '{"planVersion":4,"formatKey":"group_knockout","divisionId":null,"seed":"zzf2-g1","layout":"2x2","stages":[{"planKey":"group-stage","name":"Vòng bảng","scheduleFormat":"round_robin","order":1,"config":{"groupCount":2,"advancePerGroup":2,"poolCount":0,"qualifiersTarget":4,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}},{"planKey":"knockout-stage","name":"Vòng loại trực tiếp","scheduleFormat":"knockout","order":2,"config":{"thirdPlaceEnabled":false,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":"A","entryIds":["h2","h4","c999001.1.p1","c999001.1.p3"]},{"label":"B","entryIds":["h1","h3","c999001.1.p2"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"h2","entryBId":"c999001.1.p3","order":1},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"h4","entryBId":"c999001.1.p1","order":2},{"matchKey":"GROUP-B-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":1,"entryAId":"h3","entryBId":"c999001.1.p2","order":3},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"h2","entryBId":"c999001.1.p1","order":4},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"c999001.1.p3","entryBId":"h4","order":5},{"matchKey":"GROUP-B-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":2,"entryAId":"h1","entryBId":"c999001.1.p2","order":6},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"h2","entryBId":"h4","order":7},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"c999001.1.p1","entryBId":"c999001.1.p3","order":8},{"matchKey":"GROUP-B-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":3,"entryAId":"h1","entryBId":"h3","order":9},{"matchKey":"SF1","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":0,"slotA":{"kind":"progression","label":"Nhất A"},"slotB":{"kind":"progression","label":"Nhì B"},"order":10},{"matchKey":"SF2","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":1,"slotA":{"kind":"progression","label":"Nhất B"},"slotB":{"kind":"progression","label":"Nhì A"},"order":11},{"matchKey":"F","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":0,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":12}],"progressions":[{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"A","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"B","rank":2}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"B","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"A","rank":2}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"counts":{"groupMatches":9,"knockoutMatches":3,"total":12},"finalBestOf":1,"warnings":["GROUP_SIZE_IMBALANCE","FRIENDLY_CLUB_SPREAD_LIMITED"],"fingerprint":"ab2cb6674c4dae1bc0c6370ef0d8e2f2367c5b0d4ca254bee2b2ee756419b0ce"}'::jsonb, '{"entrantType":"doubles","formatKey":"group_knockout","config":{"groupCount":2,"qualifiersPerGroup":2}}'::jsonb);
  PERFORM pg_temp.it_ok('g1.before.private', (SELECT visibility = 'private' FROM public.tournaments WHERE id = (s->>'t')::bigint));
  r := pg_temp.f2_fin(s, 'g1', 1);
  PERFORM pg_temp.it_ok('g1.finalize.match_count', (r->>'match_count')::int = 12 AND (r->>'entry_count')::int = 7 AND (r->>'friendly_clubs')::int = 1, r->>'match_count');
  PERFORM pg_temp.it_ok('g1.entries.club', (SELECT count(*) FROM public.tournament_entries WHERE division_id = (s->>'d')::bigint AND tournament_club_id = (SELECT id FROM public.tournament_clubs WHERE tournament_id = (s->>'t')::bigint AND club_id = 59)) = 4 AND (SELECT count(*) FROM public.tournament_entries WHERE division_id = (s->>'d')::bigint AND tournament_club_id = (s->'clubs'->>0)::bigint) = 3);
  PERFORM pg_temp.it_ok('g1.matches.interclub', (SELECT count(*) FROM public.tournament_matches m WHERE m.division_id = (s->>'d')::bigint AND m.group_label IS NOT NULL AND (SELECT tournament_club_id FROM public.tournament_entries WHERE id = m.entry_a_id) <> (SELECT tournament_club_id FROM public.tournament_entries WHERE id = m.entry_b_id)) = 6 AND (SELECT count(*) FROM public.tournament_matches m WHERE m.division_id = (s->>'d')::bigint AND m.group_label IS NOT NULL) = 9);
  PERFORM pg_temp.it_ok('g1.athletes.guest', (SELECT count(*) = 6 AND bool_and(ta.group_id = 59 AND ta.source = 'club_member' AND ta.athlete_id IS NOT NULL AND ta.club_name_snapshot = (SELECT name FROM public.groups WHERE id = ga)) FROM public.tournament_athletes ta WHERE ta.tournament_club_id = (s->'clubs'->>0)::bigint));
  PERFORM pg_temp.it_ok('g1.athletes.host', (SELECT count(*) = 8 FROM public.tournament_athletes WHERE tournament_club_id = (SELECT id FROM public.tournament_clubs WHERE tournament_id = (s->>'t')::bigint AND club_id = 59)));
  PERFORM pg_temp.it_ok('g1.entry_members.guest', (SELECT count(*) = 6 AND bool_and(em.club_name_snapshot = (SELECT name FROM public.groups WHERE id = ga)) FROM public.tournament_entry_members em JOIN public.tournament_entries en ON en.id = em.entry_id WHERE en.tournament_club_id = (s->'clubs'->>0)::bigint));
  PERFORM pg_temp.it_ok('g1.roster_members', (SELECT count(*) = 14 FROM public.tournament_division_roster_members WHERE division_id = (s->>'d')::bigint) AND (SELECT count(*) = 14 FROM public.tournament_pair_members pm JOIN public.tournament_pairs p ON p.id = pm.pair_id WHERE p.division_id = (s->>'d')::bigint));
  PERFORM pg_temp.it_ok('g1.structure', (SELECT count(*) = 2 FROM public.tournament_stages WHERE division_id = (s->>'d')::bigint) AND (SELECT count(*) = 4 FROM public.tournament_stage_transitions WHERE division_id = (s->>'d')::bigint AND source_kind = 'group_rank') AND (SELECT count(*) = 7 FROM public.tournament_stage_entrants se JOIN public.tournament_stages st ON st.id = se.stage_id WHERE st.division_id = (s->>'d')::bigint));
  PERFORM pg_temp.it_ok('g1.division_locked', (SELECT roster_lock_status = 'locked' AND setup_draft->>'state' = 'finalized' FROM public.tournament_divisions WHERE id = (s->>'d')::bigint));
  r2 := pg_temp.f2_fin(s, 'g1', 1);
  PERFORM pg_temp.it_ok('g1.replay', r2 = r);
  -- Sau chốt: CLB khách không sửa được danh sách; không còn thông báo mở cho dòng khách.
  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(ga, 'guest', (s->'clubs'->>0)::bigint, 'withdraw', (SELECT version FROM public.tournament_clubs WHERE id = (s->'clubs'->>0)::bigint), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_ok('g1.after.guest_closed', e = 'FRIENDLY_REGISTRATION_CLOSED', e);
  PERFORM pg_temp.it_ok('g1.after.notifications_closed', NOT EXISTS (SELECT 1 FROM public.club_notifications WHERE subject_type = 'tournament_club' AND subject_id = (s->'clubs'->>0)::bigint AND status = 'open'));
  -- D50: đúng câu UPDATE của route (publishFriendlyTournament) — private → unlisted + slug, trang công khai tìm thấy.
  UPDATE public.tournaments SET visibility = 'unlisted', public_slug = COALESCE(public_slug, 'zzf2-it-g1-' || substr(md5(random()::text), 1, 18)), updated_at = now()
  WHERE id = (s->>'t')::bigint AND group_id = 59 AND visibility = 'private';
  PERFORM pg_temp.it_ok('d50.after', EXISTS (SELECT 1 FROM public.tournaments WHERE id = (s->>'t')::bigint AND visibility = 'unlisted' AND public_slug IS NOT NULL AND settings->>'organizer_mode' = 'friendly' AND public_slug IN (SELECT public_slug FROM public.tournaments WHERE visibility IN ('unlisted', 'public'))));

  -- ===== G1 + tranh hạng ba → 13 trận =====
  s := pg_temp.f2_setup('g1b', 'friendly', 4, false, ARRAY[ga]::bigint[], ARRAY[3]::integer[], '{"planVersion":4,"formatKey":"group_knockout","divisionId":null,"seed":"zzf2-g1b","layout":"2x2","stages":[{"planKey":"group-stage","name":"Vòng bảng","scheduleFormat":"round_robin","order":1,"config":{"groupCount":2,"advancePerGroup":2,"poolCount":0,"qualifiersTarget":4,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}},{"planKey":"knockout-stage","name":"Vòng loại trực tiếp","scheduleFormat":"knockout","order":2,"config":{"thirdPlaceEnabled":true,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":"A","entryIds":["h4","h2","c999001.1.p1","c999001.1.p2"]},{"label":"B","entryIds":["h3","h1","c999001.1.p3"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"h4","entryBId":"c999001.1.p2","order":1},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"h2","entryBId":"c999001.1.p1","order":2},{"matchKey":"GROUP-B-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":1,"entryAId":"h1","entryBId":"c999001.1.p3","order":3},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"h4","entryBId":"c999001.1.p1","order":4},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"c999001.1.p2","entryBId":"h2","order":5},{"matchKey":"GROUP-B-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":2,"entryAId":"h3","entryBId":"c999001.1.p3","order":6},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"h4","entryBId":"h2","order":7},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"c999001.1.p1","entryBId":"c999001.1.p2","order":8},{"matchKey":"GROUP-B-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":3,"entryAId":"h3","entryBId":"h1","order":9},{"matchKey":"SF1","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":0,"slotA":{"kind":"progression","label":"Nhất A"},"slotB":{"kind":"progression","label":"Nhì B"},"order":10},{"matchKey":"SF2","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":1,"slotA":{"kind":"progression","label":"Nhất B"},"slotB":{"kind":"progression","label":"Nhì A"},"order":11},{"matchKey":"BRONZE","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":1,"slotA":{"kind":"progression","label":"Thua bán kết 1"},"slotB":{"kind":"progression","label":"Thua bán kết 2"},"order":12},{"matchKey":"F","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":0,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":13}],"progressions":[{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"A","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"B","rank":2}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"B","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"A","rank":2}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"BRONZE","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"loser"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"BRONZE","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"loser"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"counts":{"groupMatches":9,"knockoutMatches":4,"total":13},"finalBestOf":1,"warnings":["GROUP_SIZE_IMBALANCE","FRIENDLY_CLUB_SPREAD_LIMITED"],"fingerprint":"3ca6f00016d33a0bb619d9e8be7755fe29720c5cd6e06ffc3054e3723f5a6349"}'::jsonb, '{"entrantType":"doubles","formatKey":"group_knockout","config":{"groupCount":2,"qualifiersPerGroup":2,"thirdPlaceEnabled":true}}'::jsonb);
  r := pg_temp.f2_fin(s, 'g1b', 1);
  PERFORM pg_temp.it_ok('g1b.finalize.match_count', (r->>'match_count')::int = 13, r->>'match_count');

  -- ===== G-core3: 59 = 3, A = 2, B = 2; hạn mức 1 → chặn, hạn mức 2 → 12 trận =====
  s := pg_temp.f2_setup('core3', 'friendly', 3, false, ARRAY[ga, gb]::bigint[], ARRAY[2, 2]::integer[], '{"planVersion":4,"formatKey":"group_knockout","divisionId":null,"seed":"zzf2-core3","layout":"2x2","stages":[{"planKey":"group-stage","name":"Vòng bảng","scheduleFormat":"round_robin","order":1,"config":{"groupCount":2,"advancePerGroup":2,"poolCount":0,"qualifiersTarget":4,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}},{"planKey":"knockout-stage","name":"Vòng loại trực tiếp","scheduleFormat":"knockout","order":2,"config":{"thirdPlaceEnabled":false,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":"A","entryIds":["h1","h3","c999001.1.p2","c999002.1.p2"]},{"label":"B","entryIds":["h2","c999001.1.p1","c999002.1.p1"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"h1","entryBId":"c999002.1.p2","order":1},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"h3","entryBId":"c999001.1.p2","order":2},{"matchKey":"GROUP-B-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":1,"entryAId":"c999001.1.p1","entryBId":"c999002.1.p1","order":3},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"h1","entryBId":"c999001.1.p2","order":4},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"c999002.1.p2","entryBId":"h3","order":5},{"matchKey":"GROUP-B-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":2,"entryAId":"h2","entryBId":"c999002.1.p1","order":6},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"h1","entryBId":"h3","order":7},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"c999001.1.p2","entryBId":"c999002.1.p2","order":8},{"matchKey":"GROUP-B-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":3,"entryAId":"h2","entryBId":"c999001.1.p1","order":9},{"matchKey":"SF1","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":0,"slotA":{"kind":"progression","label":"Nhất A"},"slotB":{"kind":"progression","label":"Nhì B"},"order":10},{"matchKey":"SF2","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":1,"slotA":{"kind":"progression","label":"Nhất B"},"slotB":{"kind":"progression","label":"Nhì A"},"order":11},{"matchKey":"F","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":0,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":12}],"progressions":[{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"A","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"B","rank":2}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"B","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"A","rank":2}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"counts":{"groupMatches":9,"knockoutMatches":3,"total":12},"finalBestOf":1,"warnings":["GROUP_SIZE_IMBALANCE","FRIENDLY_CLUB_SPREAD_LIMITED"],"fingerprint":"8df13301576e02417695b8db7b58d0cc252942f93c2d28332bf87dcae0381e7b"}'::jsonb, '{"entrantType":"doubles","formatKey":"group_knockout","config":{"groupCount":2,"qualifiersPerGroup":2}}'::jsonb);
  PERFORM pg_temp.f2_err('limit.over', s, 1, 'FRIENDLY_CLUB_LIMIT_REACHED');
  r := pg_temp.f2_fin(s, 'core3', 2);
  PERFORM pg_temp.it_ok('core3.finalize.match_count', (r->>'match_count')::int = 12 AND (r->>'friendly_clubs')::int = 2, r->>'match_count');
  PERFORM pg_temp.it_ok('core3.entries.club', (SELECT count(*) FROM public.tournament_entries WHERE division_id = (s->>'d')::bigint AND tournament_club_id = (SELECT id FROM public.tournament_clubs WHERE tournament_id = (s->>'t')::bigint AND club_id = 59)) = 3 AND (SELECT count(*) FROM public.tournament_entries WHERE division_id = (s->>'d')::bigint AND tournament_club_id = (s->'clubs'->>0)::bigint) = 2 AND (SELECT count(*) FROM public.tournament_entries WHERE division_id = (s->>'d')::bigint AND tournament_club_id = (s->'clubs'->>1)::bigint) = 2);

  -- ===== G2-KO: 59 = 4, A = 3, loại trực tiếp (nhánh 8, 1 bye) → 6 trận =====
  s := pg_temp.f2_setup('ko', 'friendly', 4, false, ARRAY[ga]::bigint[], ARRAY[3]::integer[], '{"planVersion":4,"formatKey":"knockout","divisionId":null,"seed":"zzf2-ko","layout":"bracket-8","stages":[{"planKey":"knockout","name":"Loại trực tiếp","scheduleFormat":"knockout","order":1,"config":{"thirdPlaceEnabled":false,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":null,"stagePlanKey":"knockout","entryIds":["h3","h4","h1","c999001.1.p3","h2","c999001.1.p1","c999001.1.p2"]}],"matches":[{"matchKey":"QF2","title":"Tứ kết 1","roundLabel":"Tứ kết","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":1,"entryAId":"h2","entryBId":"c999001.1.p3","slotA":{"kind":"entry","entryId":"h2"},"slotB":{"kind":"entry","entryId":"c999001.1.p3"},"order":1},{"matchKey":"QF3","title":"Tứ kết 2","roundLabel":"Tứ kết","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":2,"entryAId":"h1","entryBId":"c999001.1.p1","slotA":{"kind":"entry","entryId":"h1"},"slotB":{"kind":"entry","entryId":"c999001.1.p1"},"order":2},{"matchKey":"QF4","title":"Tứ kết 3","roundLabel":"Tứ kết","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":3,"entryAId":"c999001.1.p2","entryBId":"h4","slotA":{"kind":"entry","entryId":"c999001.1.p2"},"slotB":{"kind":"entry","entryId":"h4"},"order":3},{"matchKey":"SF1","title":"Bán kết 1","roundLabel":"Bán kết","stagePlanKey":"knockout","stageKind":"knockout","round":2,"bracketSlot":0,"entryAId":"h3","entryBId":null,"slotA":{"kind":"entry","entryId":"h3"},"slotB":{"kind":"progression","label":"Thắng tứ kết 1"},"order":4},{"matchKey":"SF2","title":"Bán kết 2","roundLabel":"Bán kết","stagePlanKey":"knockout","stageKind":"knockout","round":2,"bracketSlot":1,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thắng tứ kết 2"},"slotB":{"kind":"progression","label":"Thắng tứ kết 3"},"order":5},{"matchKey":"F","title":"Chung kết","roundLabel":"Chung kết","stagePlanKey":"knockout","stageKind":"knockout","round":3,"bracketSlot":0,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":6}],"progressions":[{"sourceStagePlanKey":"knockout","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"QF2","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"QF3","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"SF2","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"QF4","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"byeEntryIds":["h3"],"counts":{"groupMatches":0,"knockoutMatches":6,"total":6},"rounds":3,"finalBestOf":1,"warnings":["KNOCKOUT_BYE","FRIENDLY_CLUB_SPREAD_LIMITED"],"fingerprint":"e80a9738277ad643e1c20c7a676546a0768baacbefa0df5b6f784959407762ae"}'::jsonb, '{"entrantType":"doubles","formatKey":"knockout","config":{}}'::jsonb);
  r := pg_temp.f2_fin(s, 'ko', 1);
  PERFORM pg_temp.it_ok('ko.finalize.match_count', (r->>'match_count')::int = 6 AND (SELECT count(*) FROM public.tournament_entries WHERE division_id = (s->>'d')::bigint AND tournament_club_id = (s->'clubs'->>0)::bigint) = 3, r->>'match_count');
  PERFORM pg_temp.it_ok('ko.round1.no_same_club', (SELECT count(*) FROM public.tournament_matches m WHERE m.division_id = (s->>'d')::bigint AND m.round = 1 AND m.entry_a_id IS NOT NULL AND m.entry_b_id IS NOT NULL AND (SELECT tournament_club_id FROM public.tournament_entries WHERE id = m.entry_a_id) = (SELECT tournament_club_id FROM public.tournament_entries WHERE id = m.entry_b_id)) = 0);


  -- ===== D49: giải friendly có khách mời phía chủ nhà → chặn =====
  s := pg_temp.f2_setup('d49', 'friendly', 2, true, ARRAY[gb]::bigint[], ARRAY[2]::integer[], '{"planVersion":4,"formatKey":"round_robin","divisionId":null,"seed":"zzf2-neg","layout":"single-group","stages":[{"planKey":"group-stage","name":"Vòng tròn","scheduleFormat":"round_robin","order":1,"config":{"groupCount":1,"advancePerGroup":0,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":"A","entryIds":["c999001.1.p1","c999001.1.p2","h1","h2"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"c999001.1.p1","entryBId":"h2","order":1},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"c999001.1.p2","entryBId":"h1","order":2},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"c999001.1.p1","entryBId":"h1","order":3},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"h2","entryBId":"c999001.1.p2","order":4},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"c999001.1.p1","entryBId":"c999001.1.p2","order":5},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"h1","entryBId":"h2","order":6}],"progressions":[],"counts":{"groupMatches":6,"knockoutMatches":0,"total":6},"rounds":3,"finalBestOf":1,"warnings":[],"fingerprint":"c83de321c94a0246df007469b02c3deb26d8fa5f23300b96df822b2e86a35edf"}'::jsonb, '{"entrantType":"doubles","formatKey":"round_robin","config":{}}'::jsonb);
  PERFORM pg_temp.f2_err('d49.host_guest', s, 1, 'FRIENDLY_HOST_GUEST_NOT_ALLOWED');

  -- ===== Ca âm trên một giải (59 = 2, A = 2, vòng tròn) =====
  s := pg_temp.f2_setup('neg', 'friendly', 2, false, ARRAY[ga]::bigint[], ARRAY[2]::integer[], '{"planVersion":4,"formatKey":"round_robin","divisionId":null,"seed":"zzf2-neg","layout":"single-group","stages":[{"planKey":"group-stage","name":"Vòng tròn","scheduleFormat":"round_robin","order":1,"config":{"groupCount":1,"advancePerGroup":0,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":"A","entryIds":["c999001.1.p1","c999001.1.p2","h1","h2"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"c999001.1.p1","entryBId":"h2","order":1},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"c999001.1.p2","entryBId":"h1","order":2},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"c999001.1.p1","entryBId":"h1","order":3},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"h2","entryBId":"c999001.1.p2","order":4},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"c999001.1.p1","entryBId":"c999001.1.p2","order":5},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"h1","entryBId":"h2","order":6}],"progressions":[],"counts":{"groupMatches":6,"knockoutMatches":0,"total":6},"rounds":3,"finalBestOf":1,"warnings":[],"fingerprint":"c83de321c94a0246df007469b02c3deb26d8fa5f23300b96df822b2e86a35edf"}'::jsonb, '{"entrantType":"doubles","formatKey":"round_robin","config":{}}'::jsonb);
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
  rs := (SELECT roster_submitted FROM public.tournament_clubs WHERE id = (s->'clubs'->>0)::bigint);
  UPDATE public.tournament_clubs SET roster_submitted = jsonb_set(rs, '{pairs,0,participantRefs,1}', '"guest:zzf2x0000001"') WHERE id = (s->'clubs'->>0)::bigint;
  PERFORM pg_temp.f2_err('guest_ref', s, 1, 'FRIENDLY_GUEST_NOT_ALLOWED');
  UPDATE public.tournament_clubs SET roster_submitted = jsonb_set(rs, '{memberIds}', (rs->'memberIds') - (m::text)) WHERE id = (s->'clubs'->>0)::bigint;
  PERFORM pg_temp.f2_err('ref_not_submitted', s, 1, 'PAIRING_INVALID');
  UPDATE public.tournament_clubs SET roster_submitted = rs, quota = 1 WHERE id = (s->'clubs'->>0)::bigint;
  PERFORM pg_temp.f2_err('quota', s, 1, 'FRIENDLY_QUOTA_EXCEEDED');
  UPDATE public.tournament_clubs SET quota = NULL WHERE id = (s->'clubs'->>0)::bigint;
  -- FRIENDLY_ATHLETE_DUPLICATE không dựng được trên production: athletes.legacy_club_member_id UNIQUE (một VĐV ↔ một
  -- thành viên ↔ một CLB) và FK club_member_athlete_map_legacy_fk (id, group_id) cấm chuyển CLB. Khẳng định chính các
  -- ràng buộc đó; nhánh RAISE trong 111 là lớp phòng thủ (đã kiểm trên PGlite).
  PERFORM pg_temp.it_ok('neg.athlete_duplicate.unreachable', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'athletes_legacy_club_member_id_key') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'club_member_athlete_map_legacy_fk'));
  UPDATE public.tournament_clubs SET roster_submitted = rs WHERE id = (s->'clubs'->>0)::bigint;
  -- Duyệt lại sau bốc thăm (version đổi) → plan cũ lệch khóa.
  PERFORM public.friendly_club_action(59, 'host', (s->'clubs'->>0)::bigint, 'request_changes', (SELECT version FROM public.tournament_clubs WHERE id = (s->'clubs'->>0)::bigint), '{"note": "Đổi cặp"}'::jsonb);
  PERFORM public.friendly_club_action(ga, 'guest', (s->'clubs'->>0)::bigint, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = (s->'clubs'->>0)::bigint), '{}'::jsonb);
  PERFORM public.friendly_club_action(59, 'host', (s->'clubs'->>0)::bigint, 'approve', (SELECT version FROM public.tournament_clubs WHERE id = (s->'clubs'->>0)::bigint), '{}'::jsonb);
  PERFORM pg_temp.f2_err('roster_changed', s, 1, 'FRIENDLY_ROSTER_CHANGED');
  -- CLB ngoài còn hiệu lực.
  INSERT INTO public.tournament_external_clubs(group_id, name) VALUES (59, 'ZZF2 IT CLB ngoài') RETURNING id INTO x;
  INSERT INTO public.tournament_clubs(group_id, tournament_id, external_club_id, invitation_status, roster_approved_version)
  VALUES (59, (s->>'t')::bigint, x, 'approved', 1) RETURNING id INTO x;
  PERFORM pg_temp.f2_err('external', s, 2, 'EXTERNAL_CLUB_NOT_SUPPORTED');
  UPDATE public.tournament_clubs SET invitation_status = 'withdrawn' WHERE id = x;
  -- A rút → chỉ còn chủ nhà (plan chỉ cặp chủ nhà) → quá ít CLB.
  PERFORM public.friendly_club_action(59, 'host', (s->'clubs'->>0)::bigint, 'remove', (SELECT version FROM public.tournament_clubs WHERE id = (s->'clubs'->>0)::bigint), '{}'::jsonb);
  PERFORM pg_temp.f2_err('too_few', s, 1, 'FRIENDLY_CLUBS_TOO_FEW', jsonb_set(s->'plan', '{pairs}', (SELECT jsonb_agg(p) FROM jsonb_array_elements(s->'plan'->'pairs') p WHERE p->>'pairId' LIKE 'h%')));

  -- ===== Hồi quy giải nội bộ (đi đúng đường 108) =====
  -- 14 người (13 thành viên + 1 khách mời) = 7 cặp, 2x2 → 12 trận; không khóa friendly_clubs.
  s := pg_temp.f2_setup('i14', 'internal', 7, true, ARRAY[]::bigint[], ARRAY[]::integer[], '{"planVersion":4,"formatKey":"group_knockout","divisionId":null,"seed":"zzf2-i14","layout":"2x2","stages":[{"planKey":"group-stage","name":"Vòng bảng","scheduleFormat":"round_robin","order":1,"config":{"groupCount":2,"advancePerGroup":2,"poolCount":0,"qualifiersTarget":4,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}},{"planKey":"knockout-stage","name":"Vòng loại trực tiếp","scheduleFormat":"knockout","order":2,"config":{"thirdPlaceEnabled":false,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":"A","entryIds":["h5","h2","h3","h6"]},{"label":"B","entryIds":["h1","h7","h4"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"h5","entryBId":"h6","order":1},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"h2","entryBId":"h3","order":2},{"matchKey":"GROUP-B-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":1,"entryAId":"h7","entryBId":"h4","order":3},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"h5","entryBId":"h3","order":4},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"h6","entryBId":"h2","order":5},{"matchKey":"GROUP-B-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":2,"entryAId":"h1","entryBId":"h4","order":6},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"h5","entryBId":"h2","order":7},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"h3","entryBId":"h6","order":8},{"matchKey":"GROUP-B-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":3,"entryAId":"h1","entryBId":"h7","order":9},{"matchKey":"SF1","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":0,"slotA":{"kind":"progression","label":"Nhất A"},"slotB":{"kind":"progression","label":"Nhì B"},"order":10},{"matchKey":"SF2","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":1,"slotA":{"kind":"progression","label":"Nhất B"},"slotB":{"kind":"progression","label":"Nhì A"},"order":11},{"matchKey":"F","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":0,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":12}],"progressions":[{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"A","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"B","rank":2}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"B","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"A","rank":2}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"counts":{"groupMatches":9,"knockoutMatches":3,"total":12},"finalBestOf":1,"warnings":["GROUP_SIZE_IMBALANCE"],"fingerprint":"ce0b690b0eac3097b4ccae8eb22fc5cef9fc5c450cf211d7390087606649a49c"}'::jsonb, '{"entrantType":"doubles","formatKey":"group_knockout","config":{"groupCount":2,"qualifiersPerGroup":2}}'::jsonb);
  r := pg_temp.f2_fin(s, 'i14', NULL);
  PERFORM pg_temp.it_ok('internal14.match_count', (r->>'match_count')::int = 12 AND (r->>'entry_count')::int = 7 AND NOT (r ? 'friendly_clubs') AND (SELECT count(*) FROM public.tournament_entries WHERE division_id = (s->>'d')::bigint AND tournament_club_id = (SELECT id FROM public.tournament_clubs WHERE tournament_id = (s->>'t')::bigint AND club_id = 59)) = 7, r->>'match_count');
  PERFORM pg_temp.it_ok('internal14.guest_athlete', (SELECT count(*) = 1 FROM public.tournament_athletes WHERE tournament_id = (s->>'t')::bigint AND source = 'guest' AND athlete_id IS NULL));
  s := pg_temp.f2_setup('irr', 'internal', 4, false, ARRAY[]::bigint[], ARRAY[]::integer[], '{"planVersion":4,"formatKey":"round_robin","divisionId":null,"seed":"zzf2-irr","layout":"single-group","stages":[{"planKey":"group-stage","name":"Vòng tròn","scheduleFormat":"round_robin","order":1,"config":{"groupCount":1,"advancePerGroup":0,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":"A","entryIds":["h1","h4","h3","h2"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"h1","entryBId":"h2","order":1},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"h4","entryBId":"h3","order":2},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"h1","entryBId":"h3","order":3},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"h2","entryBId":"h4","order":4},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"h1","entryBId":"h4","order":5},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"h3","entryBId":"h2","order":6}],"progressions":[],"counts":{"groupMatches":6,"knockoutMatches":0,"total":6},"rounds":3,"finalBestOf":1,"warnings":[],"fingerprint":"b63e6e2d00f6d308c9455f38c8b0d8b69c0675f45cd09d0a95face1ba84aac30"}'::jsonb, '{"entrantType":"doubles","formatKey":"round_robin","config":{}}'::jsonb);
  r := pg_temp.f2_fin(s, 'irr', NULL);
  PERFORM pg_temp.it_ok('internal.round_robin', (r->>'match_count')::int = 6, r->>'match_count');
  s := pg_temp.f2_setup('iko', 'internal', 5, false, ARRAY[]::bigint[], ARRAY[]::integer[], '{"planVersion":4,"formatKey":"knockout","divisionId":null,"seed":"zzf2-iko","layout":"bracket-8","stages":[{"planKey":"knockout","name":"Loại trực tiếp","scheduleFormat":"knockout","order":1,"config":{"thirdPlaceEnabled":false,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":null,"stagePlanKey":"knockout","entryIds":["h4","h5","h1","h3","h2"]}],"matches":[{"matchKey":"QF2","title":"Tứ kết 1","roundLabel":"Tứ kết","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":1,"entryAId":"h2","entryBId":"h3","slotA":{"kind":"entry","entryId":"h2"},"slotB":{"kind":"entry","entryId":"h3"},"order":1},{"matchKey":"SF1","title":"Bán kết 1","roundLabel":"Bán kết","stagePlanKey":"knockout","stageKind":"knockout","round":2,"bracketSlot":0,"entryAId":"h4","entryBId":null,"slotA":{"kind":"entry","entryId":"h4"},"slotB":{"kind":"progression","label":"Thắng tứ kết 1"},"order":2},{"matchKey":"SF2","title":"Bán kết 2","roundLabel":"Bán kết","stagePlanKey":"knockout","stageKind":"knockout","round":2,"bracketSlot":1,"entryAId":"h1","entryBId":"h5","slotA":{"kind":"entry","entryId":"h1"},"slotB":{"kind":"entry","entryId":"h5"},"order":3},{"matchKey":"F","title":"Chung kết","roundLabel":"Chung kết","stagePlanKey":"knockout","stageKind":"knockout","round":3,"bracketSlot":0,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":4}],"progressions":[{"sourceStagePlanKey":"knockout","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"QF2","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"byeEntryIds":["h4","h5","h1"],"counts":{"groupMatches":0,"knockoutMatches":4,"total":4},"rounds":3,"finalBestOf":1,"warnings":["KNOCKOUT_BYE"],"fingerprint":"25a7c309aceabd2eacde9a26a5a8fdcfcd3d8824911bd2bd248082d2df76bd1d"}'::jsonb, '{"entrantType":"doubles","formatKey":"knockout","config":{}}'::jsonb);
  r := pg_temp.f2_fin(s, 'iko', NULL);
  PERFORM pg_temp.it_ok('internal.knockout', (r->>'match_count')::int = 4, r->>'match_count');
  s := pg_temp.f2_setup('ide', 'internal', 4, false, ARRAY[]::bigint[], ARRAY[]::integer[], '{"planVersion":4,"formatKey":"double_elimination","divisionId":null,"seed":"zzf2-ide","layout":"double-elim-4","stages":[{"planKey":"double-elim","name":"Loại kép","scheduleFormat":"double_elim","order":1,"config":{"setupPlanVersion":4,"grandFinalReset":false,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":null,"stagePlanKey":"double-elim","entryIds":["h1","h3","h2","h4"]}],"matches":[{"matchKey":"W1-1","title":"Trận 1","roundLabel":"Bán kết nhánh thắng","stagePlanKey":"double-elim","stageKind":"knockout","bracket":"W","bracketRound":1,"round":1,"bracketSlot":0,"entryAId":"h1","entryBId":"h4","slotA":{"kind":"entry","entryId":"h1"},"slotB":{"kind":"entry","entryId":"h4"},"order":1},{"matchKey":"W1-2","title":"Trận 2","roundLabel":"Bán kết nhánh thắng","stagePlanKey":"double-elim","stageKind":"knockout","bracket":"W","bracketRound":1,"round":1,"bracketSlot":1,"entryAId":"h2","entryBId":"h3","slotA":{"kind":"entry","entryId":"h2"},"slotB":{"kind":"entry","entryId":"h3"},"order":2},{"matchKey":"WF","title":"Chung kết nhánh thắng","roundLabel":"Chung kết nhánh thắng","stagePlanKey":"double-elim","stageKind":"knockout","bracket":"W","bracketRound":2,"round":2,"bracketSlot":0,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thắng trận 1"},"slotB":{"kind":"progression","label":"Thắng trận 2"},"order":3},{"matchKey":"L1-1","title":"Trận 4","roundLabel":"Nhánh thua · Vòng 1","stagePlanKey":"double-elim","stageKind":"knockout","bracket":"L","bracketRound":1,"round":2,"bracketSlot":0,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thua trận 1"},"slotB":{"kind":"progression","label":"Thua trận 2"},"order":4},{"matchKey":"LF","title":"Chung kết nhánh thua","roundLabel":"Chung kết nhánh thua","stagePlanKey":"double-elim","stageKind":"knockout","bracket":"L","bracketRound":2,"round":3,"bracketSlot":0,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thắng trận 4"},"slotB":{"kind":"progression","label":"Thua chung kết nhánh thắng"},"order":5},{"matchKey":"GF","title":"Chung kết tổng","roundLabel":"Chung kết tổng","stagePlanKey":"double-elim","stageKind":"knockout","bracket":"GF","bracketRound":1,"round":4,"bracketSlot":0,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thắng chung kết nhánh thắng"},"slotB":{"kind":"progression","label":"Thắng chung kết nhánh thua"},"order":6}],"progressions":[{"sourceStagePlanKey":"double-elim","targetMatchKey":"WF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"WF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W1-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-1","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W1-2","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"LF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L1-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"LF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"WF","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"GF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"WF","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"GF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"LF","outcome":"winner"}}],"byeEntryIds":[],"counts":{"groupMatches":0,"knockoutMatches":6,"total":6,"winners":3,"losers":2,"grandFinal":1},"rounds":4,"winnersRounds":2,"losersRounds":2,"finalBestOf":1,"warnings":[],"fingerprint":"3460409b3097f5d8cb178c53c7b7f66dc3983d860b30c2010af6ed925a9b8bb6"}'::jsonb, '{"entrantType":"doubles","formatKey":"double_elimination","config":{}}'::jsonb);
  r := pg_temp.f2_fin(s, 'ide', NULL);
  PERFORM pg_temp.it_ok('internal.double_elimination', (r->>'match_count')::int = 6, r->>'match_count');

  INSERT INTO it_result VALUES ('zz.ALL', 'ok');
END
$it$;
SELECT k, v FROM it_result ORDER BY k;
ROLLBACK;
