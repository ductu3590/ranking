-- Epic 4 C3 — kiểm thử tích hợp nhánh cộng đồng của finalize_internal_setup_v4 (sinh bởi scripts/qa/epic4-c3-integration.js)
BEGIN;
-- Epic 4 C3 (giải cộng đồng): nhánh community cho finalize_internal_setup_v4
-- (spec docs/superpowers/specs/2026-09-29-epic-4-community/lat-c3-tao-giai-va-chot.md §4, ADR-007 D61–D63).
-- Dựng từ 111 — bản mới nhất có hàm này (112/113 không đụng hàm). CREATE OR REPLACE giữ nguyên signature, SECURITY DEFINER,
-- search_path, REVOKE/GRANT, COMMENT. Chỉ khác 111 ở các khối đánh dấu community (begin/end) và các dòng khai báo biến community (decl)
-- (test khoá tests/stitch-setup/epic-4/c3-migration-lock.test.js theo COMMUNITY_FINALIZE_SQL_CONTRACT của lib/tournament/communitySetup.js):
--   1. Nhánh cộng đồng chỉ khi tournaments.organizer_type = 'community' (không lấy từ bản nháp của client; bản nháp giữ organizerMode 'internal').
--   2. Cặp hiệu lực = đơn approved (chưa gộp, 2 ghế khác tài khoản) của nội dung, khóa r<đơn>.<tk1>.<tk2>; lệch p_plan → COMMUNITY_ROSTER_CHANGED.
--   3. Tạo athletes cho tài khoản chưa có athlete_id và gán lại player_accounts.athlete_id cùng giao dịch; tournament_athletes.source = 'community'.
--   4. Khối ghi cặp → entry cho cặp cộng đồng; result thêm 'community_pairs'.
-- Kèm: tournament_athletes_source_ck mở thêm 'community' (chỉ nới, dữ liệu cũ vẫn hợp lệ).
-- Giải CLB / giao hữu: v_community = false, v_community_pairs rỗng → đi đúng đường 111. Không DROP dữ liệu, không sửa dữ liệu có sẵn.

ALTER TABLE public.tournament_athletes DROP CONSTRAINT IF EXISTS tournament_athletes_source_ck;
ALTER TABLE public.tournament_athletes
  ADD CONSTRAINT tournament_athletes_source_ck CHECK (source = ANY (ARRAY['club_member'::text, 'guest'::text, 'community'::text]));

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
  v_community boolean := false; -- community:decl
  v_community_pairs jsonb := '[]'::jsonb; -- community:decl
  v_acc record; -- community:decl
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
  -- community:begin — giải cộng đồng (Epic 4 C3, D61): cặp hiệu lực = đơn ĐÃ DUYỆT của nội dung, đọc thẳng từ
  -- tournament_registrations dưới khoá (không tin client, không tin bản nháp). Nhận diện bằng tournaments.organizer_type.
  v_community := (t.organizer_type = 'community');
  IF v_community THEN
    IF v_mode <> 'internal' THEN
      RAISE EXCEPTION 'FINALIZE_DRAFT_INVALID' USING ERRCODE = '22023';
    END IF;
    -- Người tham gia là các cặp đã duyệt: bản nháp không được chứa thành viên CLB, khách mời hay cặp tự ghép.
    IF jsonb_array_length(v_draft->'pairs') > 0
      OR jsonb_array_length(v_draft->'participants'->'memberIds') > 0
      OR jsonb_array_length(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'COMMUNITY_MEMBER_PICK_NOT_ALLOWED' USING ERRCODE = 'PH409';
    END IF;
    -- Cùng khoá với community_admin_action (113): admin không duyệt / ghép giữa chừng khi đang chốt.
    PERFORM pg_advisory_xact_lock(hashtextextended('community_division:' || p_division_id::text, 0));
    PERFORM 1 FROM public.tournament_registrations r
    WHERE r.division_id = p_division_id AND r.group_id = p_group_id AND r.player_account_id IS NOT NULL ORDER BY r.id FOR UPDATE;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'pairId', 'r' || r.id || '.' || m1.player_account_id || '.' || m2.player_account_id,
             'participantRefs', jsonb_build_array('player:' || m1.player_account_id, 'player:' || m2.player_account_id),
             'registrationId', r.id) ORDER BY r.id), '[]'::jsonb)
    INTO v_community_pairs
    FROM public.tournament_registrations r
    JOIN public.tournament_registration_members m1 ON m1.registration_id = r.id AND m1.seat = 1
    JOIN public.tournament_registration_members m2 ON m2.registration_id = r.id AND m2.seat = 2
    WHERE r.division_id = p_division_id AND r.group_id = p_group_id AND r.status = 'approved' AND r.merged_into IS NULL
      AND r.player_account_id IS NOT NULL AND m1.player_account_id IS NOT NULL AND m2.player_account_id IS NOT NULL
      AND m1.player_account_id <> m2.player_account_id;
    -- Đơn đã duyệt mà không thành cặp hợp lệ (thiếu ghế, cùng tài khoản) hoặc tài khoản không còn hoạt động: dừng, không đoán.
    IF (SELECT count(*) FROM public.tournament_registrations r
        WHERE r.division_id = p_division_id AND r.group_id = p_group_id AND r.status = 'approved' AND r.merged_into IS NULL AND r.player_account_id IS NOT NULL)
       <> jsonb_array_length(v_community_pairs)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_community_pairs) x, jsonb_array_elements_text(x->'participantRefs') pr
                 WHERE NOT EXISTS (SELECT 1 FROM public.player_accounts pa WHERE pa.id = substr(pr, 8)::bigint AND pa.status = 'active')) THEN
      RAISE EXCEPTION 'PAIRING_INVALID' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_community_pairs) < 2 THEN
      RAISE EXCEPTION 'COMMUNITY_TOO_FEW_PAIRS' USING ERRCODE = 'PH409';
    END IF;
    -- Plan phải được dựng trên đúng tập cặp đang duyệt (ghép hộ / đổi thành viên → khóa đổi).
    IF (SELECT COALESCE(array_agg(y->>'pairId' ORDER BY y->>'pairId'), ARRAY[]::text[]) FROM jsonb_array_elements(p_plan->'pairs') y)
      IS DISTINCT FROM (SELECT COALESCE(array_agg(x->>'pairId' ORDER BY x->>'pairId'), ARRAY[]::text[]) FROM jsonb_array_elements(v_community_pairs) x) THEN
      RAISE EXCEPTION 'COMMUNITY_ROSTER_CHANGED' USING ERRCODE = 'PH409';
    END IF;
    v_pairs := v_community_pairs;
  END IF;
  -- community:end
  -- Cặp: đúng tập cặp của bản nháp, mỗi cặp hai ref khác nhau, mỗi người đúng một cặp,
  -- mọi người tham gia đều có cặp (không dự bị, không cặp một người).
  v_pair_count := jsonb_array_length(v_pairs);
  v_participant_count := jsonb_array_length(v_draft->'participants'->'memberIds') + jsonb_array_length(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb));
  -- friendly:begin
  v_participant_count := v_participant_count + 2 * jsonb_array_length(v_guest_pairs);
  -- friendly:end
  -- community:begin
  v_participant_count := v_participant_count + 2 * jsonb_array_length(v_community_pairs);
  -- community:end
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
  -- community:begin — VĐV của giải cộng đồng theo tài khoản người chơi. Tài khoản chưa có athlete_id → tạo athletes
  -- (không legacy_club_member_id, không vào danh bạ / xếp hạng CLB) và gán lại player_accounts.athlete_id CÙNG giao dịch.
  IF v_community THEN
    FOR v_pair IN SELECT value FROM jsonb_array_elements(v_community_pairs) LOOP
      FOR v_ref IN SELECT r FROM jsonb_array_elements_text(v_pair->'participantRefs') r LOOP
        SELECT * INTO v_acc FROM public.player_accounts WHERE id = substr(v_ref, 8)::bigint FOR UPDATE;
        SELECT COALESCE(NULLIF(btrim(rm.full_name), ''), v_acc.display_name) INTO v_name
        FROM public.tournament_registration_members rm
        WHERE rm.registration_id = (v_pair->>'registrationId')::bigint AND rm.player_account_id = v_acc.id;
        v_athlete_id := v_acc.athlete_id;
        IF v_athlete_id IS NULL THEN
          INSERT INTO public.athletes(display_name, normalized_name, status)
          VALUES (v_name, lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g')), 'linked') RETURNING id INTO v_athlete_id;
          UPDATE public.player_accounts SET athlete_id = v_athlete_id, updated_at = now() WHERE id = v_acc.id;
        END IF;
        IF EXISTS (SELECT 1 FROM public.tournament_athletes WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND athlete_id = v_athlete_id) THEN
          RAISE EXCEPTION 'PAIRING_INVALID' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.tournament_athletes(group_id, tournament_id, tournament_club_id, athlete_id, display_name_snapshot, source)
        VALUES (p_group_id, p_tournament_id, v_host_club_id, v_athlete_id, v_name, 'community') RETURNING id INTO v_ta_id;
        v_ref_athletes := v_ref_athletes || jsonb_build_object(v_ref, jsonb_build_object('ta', v_ta_id, 'athlete', v_athlete_id));
        v_ref_names := v_ref_names || jsonb_build_object(v_ref, v_name);
      END LOOP;
    END LOOP;
  END IF;
  -- community:end
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
  -- community:begin — cặp → entry của giải cộng đồng: tournament_club_id = dòng CLB chủ nhà (nhóm hệ thống).
  IF v_community THEN
    FOR v_pair IN SELECT value FROM jsonb_array_elements(v_community_pairs) LOOP
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
  END IF;
  -- community:end
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
  -- community:begin
  IF v_community THEN
    v_result := v_result || jsonb_build_object('community_pairs', jsonb_array_length(v_community_pairs));
  END IF;
  -- community:end
  INSERT INTO public.tournament_setup_mutations(group_id, operation, division_id, idempotency_key, payload_fingerprint, response)
  VALUES (p_group_id, 'finalize_internal_setup_v4', p_division_id, p_idempotency_key, v_request_fingerprint, v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) TO service_role;
COMMENT ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) IS 'Chốt giải v3: kiểm plan khớp bản nháp đã lưu, ghi VĐV (kể cả khách), cặp, entry, stage, trận, tuyến đi tiếp nguyên tử.';


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
  g bigint := 8;
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
            'draw', jsonb_build_object('status', 'draft', 'seed', 's', 'previewFingerprint', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')))
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
    'pairs', pairs, 'warnings', '[]'::jsonb, 'fingerprint', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
END
$f$;

-- Câu gọi finalize (chuỗi SQL để it_err chạy trong khối con).
CREATE FUNCTION pg_temp.fin_sql(p_case jsonb, p_plan jsonb, p_key text) RETURNS text LANGUAGE sql AS $f$
  SELECT format('SELECT public.finalize_internal_setup_v4(%s, %s, %s, %s, %L, %L, %L::jsonb)',
    8, p_case->>'t', p_case->>'d',
    (SELECT setup_revision FROM public.tournament_divisions WHERE id = (p_case->>'d')::bigint), p_key, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', p_plan::text)
$f$;

CREATE FUNCTION pg_temp.fin(p_case jsonb, p_plan jsonb, p_key text) RETURNS jsonb LANGUAGE plpgsql AS $f$
BEGIN
  RETURN pg_temp.it_json(pg_temp.fin_sql(p_case, p_plan, p_key));
END
$f$;

DO $it$
DECLARE
  g bigint := 8;
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

ROLLBACK;
