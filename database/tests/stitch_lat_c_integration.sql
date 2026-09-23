-- Kiểm thử tích hợp Lát C: migration 107 (nạp trong transaction) + tiến cấp khi thi đấu.
-- Sinh bởi scripts/qa/stitch-lat-c-integration.js. Toàn bộ trong một transaction, ROLLBACK ở cuối.
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
  c_allowed_formats constant text[] := ARRAY['group_knockout', 'round_robin', 'knockout'];
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
    OR COALESCE(v_draft->'tournament'->>'organizerMode', '') <> 'internal'
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

  -- Cặp: đúng tập cặp của bản nháp, mỗi cặp hai ref khác nhau, mỗi người đúng một cặp,
  -- mọi người tham gia đều có cặp (không dự bị, không cặp một người).
  v_pair_count := jsonb_array_length(v_draft->'pairs');
  v_participant_count := jsonb_array_length(v_draft->'participants'->'memberIds') + jsonb_array_length(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb));
  IF v_pair_count < 2 OR jsonb_array_length(p_plan->'pairs') <> v_pair_count OR v_participant_count <> v_pair_count * 2
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_draft->'pairs') x
               WHERE jsonb_typeof(x->'participantRefs') IS DISTINCT FROM 'array' OR jsonb_array_length(x->'participantRefs') <> 2
                  OR x->'participantRefs'->>0 = x->'participantRefs'->>1
                  OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'pairs') y
                                 WHERE y->>'pairId' = x->>'pairId'
                                   AND (SELECT array_agg(r ORDER BY r) FROM jsonb_array_elements_text(y->'refs') r)
                                     = (SELECT array_agg(r ORDER BY r) FROM jsonb_array_elements_text(x->'participantRefs') r)))
    OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(v_draft->'pairs') x, jsonb_array_elements_text(x->'participantRefs') r) <> v_pair_count * 2
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
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_draft->'pairs') x
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
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'stages') s WHERE s->>'scheduleFormat' NOT IN ('round_robin', 'knockout') OR nullif(s->>'planKey', '') IS NULL)
    OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'groups') gr, jsonb_array_elements_text(gr->'entryIds') e) <> v_pair_count
    OR (SELECT count(DISTINCT e) FROM jsonb_array_elements(p_plan->'groups') gr, jsonb_array_elements_text(gr->'entryIds') e) <> v_pair_count
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'groups') gr, jsonb_array_elements_text(gr->'entryIds') e
               WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_draft->'pairs') x WHERE x->>'pairId' = e))
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
  INSERT INTO public.tournament_setup_mutations(group_id, operation, division_id, idempotency_key, payload_fingerprint, response)
  VALUES (p_group_id, 'finalize_internal_setup_v4', p_division_id, p_idempotency_key, v_request_fingerprint, v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) TO service_role;
COMMENT ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) IS 'Chốt giải v3: kiểm plan khớp bản nháp đã lưu, ghi VĐV (kể cả khách), cặp, entry, stage, trận, tuyến đi tiếp nguyên tử.';

CREATE TEMP TABLE it_result(k text, v text) ON COMMIT DROP;
DO $it$
DECLARE
  g bigint; mid bigint; eid bigint; ver integer; members bigint[] := ARRAY[]::bigint[];
  r jsonb; r2 jsonb; t_id bigint; d_id bigint; rev bigint; draft jsonb; pairs jsonb; plan jsonb; kstage bigint;
BEGIN
  INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
  VALUES ('itlc-' || substr(md5(random()::text), 1, 8), 'IT Lát C (rollback)', 'x', 'x') RETURNING id INTO g;
  FOR i IN 1..16 LOOP
    INSERT INTO public.club_members(group_id, full_name, is_active) VALUES (g, 'IT VĐV ' || i, true) RETURNING id INTO mid;
    INSERT INTO public.athletes(display_name, normalized_name, legacy_club_member_id) VALUES ('IT VĐV ' || i, 'it vdv ' || i, mid) ON CONFLICT (legacy_club_member_id) DO NOTHING;
    members := members || mid;
  END LOOP;

  -- ===== Kịch bản K6 =====
  pairs := '[]'::jsonb;
  FOR i IN 0..5 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05","it_pair_06"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN true AND i = 5 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"knockout","divisionId":null,"seed":"it-seed-k6","layout":"bracket-8","stages":[{"planKey":"knockout","name":"Loại trực tiếp","scheduleFormat":"knockout","order":1,"config":{"thirdPlaceEnabled":true,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null},"match_scoring":{"F":{"best_of":3}}}}],"groups":[{"label":null,"stagePlanKey":"knockout","entryIds":["it_pair_04","it_pair_05","it_pair_06","it_pair_03","it_pair_02","it_pair_01"]}],"matches":[{"matchKey":"QF2","title":"Tứ kết 1","roundLabel":"Tứ kết","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":1,"entryAId":"it_pair_02","entryBId":"it_pair_03","slotA":{"kind":"entry","entryId":"it_pair_02"},"slotB":{"kind":"entry","entryId":"it_pair_03"},"order":1},{"matchKey":"QF3","title":"Tứ kết 2","roundLabel":"Tứ kết","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":2,"entryAId":"it_pair_06","entryBId":"it_pair_01","slotA":{"kind":"entry","entryId":"it_pair_06"},"slotB":{"kind":"entry","entryId":"it_pair_01"},"order":2},{"matchKey":"SF1","title":"Bán kết 1","roundLabel":"Bán kết","stagePlanKey":"knockout","stageKind":"knockout","round":2,"bracketSlot":0,"entryAId":"it_pair_04","entryBId":null,"slotA":{"kind":"entry","entryId":"it_pair_04"},"slotB":{"kind":"progression","label":"Thắng tứ kết 1"},"order":3},{"matchKey":"SF2","title":"Bán kết 2","roundLabel":"Bán kết","stagePlanKey":"knockout","stageKind":"knockout","round":2,"bracketSlot":1,"entryAId":null,"entryBId":"it_pair_05","slotA":{"kind":"progression","label":"Thắng tứ kết 2"},"slotB":{"kind":"entry","entryId":"it_pair_05"},"order":4},{"matchKey":"BRONZE","title":"Tranh hạng ba","roundLabel":"Chung kết","stagePlanKey":"knockout","stageKind":"knockout","round":3,"bracketSlot":1,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thua bán kết 1"},"slotB":{"kind":"progression","label":"Thua bán kết 2"},"order":5},{"matchKey":"F","title":"Chung kết","roundLabel":"Chung kết","stagePlanKey":"knockout","stageKind":"knockout","round":3,"bracketSlot":0,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":6}],"progressions":[{"sourceStagePlanKey":"knockout","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"QF2","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"QF3","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"BRONZE","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"loser"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"BRONZE","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"loser"}}],"byeEntryIds":["it_pair_04","it_pair_05"],"counts":{"groupMatches":0,"knockoutMatches":6,"total":6},"rounds":3,"finalBestOf":3,"warnings":["KNOCKOUT_BYE"],"inputSignature":"{\"config\":{\"finalBestOf\":3,\"thirdPlaceEnabled\":true},\"formatKey\":\"knockout\",\"pairIds\":[\"it_pair_01\",\"it_pair_02\",\"it_pair_03\",\"it_pair_04\",\"it_pair_05\",\"it_pair_06\"]}","fingerprint":"a511c8389b9602a84b4198c14624eab17fc652eb14d4d9826c92e5d31dad4b9e"}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT K6', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT K6', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 11) k),
      'guests', jsonb_build_array(jsonb_build_object('clientRef', 'g_it_guest_0001', 'displayName', 'Khách IT'))),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'knockout', 'config', '{"thirdPlaceEnabled":true,"finalBestOf":3}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-key-K6', draft, 1, 'it-save-K6-1');
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K6-drop_match', plan->>'fingerprint', jsonb_set(plan, '{matches}', (plan->'matches') - 0, false) || jsonb_build_object('counts', (plan->'counts') || '{"total":5}'::jsonb));
    INSERT INTO it_result VALUES ('K6.tampered.drop_match', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('K6.tampered.drop_match', SQLERRM);
  END;

  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K6-bye_slot_also_edge', plan->>'fingerprint', jsonb_set(plan, '{progressions,0,targetSlot}', to_jsonb(CASE WHEN plan->'progressions'->0->>'targetSlot' = 'a' THEN 'b' ELSE 'a' END)));
    INSERT INTO it_result VALUES ('K6.tampered.bye_slot_also_edge', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('K6.tampered.bye_slot_also_edge', SQLERRM);
  END;

  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K6-loser_to_final', plan->>'fingerprint', jsonb_set(plan, '{progressions}', (SELECT jsonb_agg(CASE WHEN p->'source'->>'outcome' = 'winner' AND p->>'targetMatchKey' = 'F' AND p->>'targetSlot' = 'a' THEN jsonb_set(p, '{source,outcome}', '"loser"') ELSE p END) FROM jsonb_array_elements(plan->'progressions') p)));
    INSERT INTO it_result VALUES ('K6.tampered.loser_to_final', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('K6.tampered.loser_to_final', SQLERRM);
  END;

  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K6-foreign_entry', plan->>'fingerprint', jsonb_set(plan, '{matches,0,entryAId}', '"it_pair_99"'));
    INSERT INTO it_result VALUES ('K6.tampered.foreign_entry', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('K6.tampered.foreign_entry', SQLERRM);
  END;

  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K6-two_stages', plan->>'fingerprint', jsonb_set(plan, '{stages}', (plan->'stages') || (plan->'stages')));
    INSERT INTO it_result VALUES ('K6.tampered.two_stages', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('K6.tampered.two_stages', SQLERRM);
  END;

  INSERT INTO it_result VALUES ('K6.tampered.stages_after', (SELECT count(*) FROM public.tournament_stages WHERE division_id = d_id)::text);
  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K6', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('K6.finalize.match_count', r->>'match_count');
  SELECT id INTO kstage FROM public.tournament_stages WHERE division_id = d_id;
  INSERT INTO it_result VALUES ('K6.db.stages', (SELECT string_agg(schedule_format || ':F=' || COALESCE(config->'match_scoring'->'F'->>'best_of', '-') || ':bo=' || (config->'scoring'->>'best_of'), ',') FROM public.tournament_stages WHERE division_id = d_id));
  INSERT INTO it_result VALUES ('K6.db.entrants', (SELECT count(*) || ' label_null=' || count(*) FILTER (WHERE group_label IS NULL) FROM public.tournament_stage_entrants WHERE stage_id = kstage));
  INSERT INTO it_result VALUES ('K6.db.keys', (SELECT string_agg(match_key || '@r' || round || ':' || (CASE WHEN entry_a_id IS NULL THEN '_' ELSE 'A' END) || (CASE WHEN entry_b_id IS NULL THEN '_' ELSE 'B' END), ',' ORDER BY match_order) FROM public.tournament_matches WHERE division_id = d_id));
  INSERT INTO it_result VALUES ('K6.db.transitions', (SELECT string_agg(source_outcome || '=' || c, ',' ORDER BY source_outcome) FROM (SELECT source_outcome, count(*) c FROM public.tournament_stage_transitions WHERE division_id = d_id AND source_kind = 'match_outcome' GROUP BY 1) x));
  INSERT INTO it_result VALUES ('K6.db.guest_athlete', (SELECT concat_ws('|', source, COALESCE(athlete_id::text, 'NULL')) FROM public.tournament_athletes WHERE tournament_id = t_id AND source = 'guest'));
  INSERT INTO it_result VALUES ('K6.db.tournament_status', (SELECT status FROM public.tournaments WHERE id = t_id));
  r2 := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K6', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('K6.replay.same_response', (r2 = r)::text);
  INSERT INTO it_result VALUES ('K6.replay.matches_after', (SELECT count(*) FROM public.tournament_matches WHERE division_id = d_id)::text);

  SELECT id, entry_a_id, version INTO mid, eid, ver FROM public.tournament_matches WHERE division_id = d_id AND match_key = 'QF2';
  r := public.replace_tournament_games_with_transitions(g, mid, '[{"game_no":1,"kind":"game","score_a":11,"score_b":5,"lineup":{}}]'::jsonb, eid, 'finalized', NULL, ver, 'it-game-QF2-' || d_id);
  INSERT INTO it_result VALUES ('K6.route.QF2', (r->'transitions'->>'routed'));

  SELECT id, entry_a_id, version INTO mid, eid, ver FROM public.tournament_matches WHERE division_id = d_id AND match_key = 'QF3';
  r := public.replace_tournament_games_with_transitions(g, mid, '[{"game_no":1,"kind":"game","score_a":11,"score_b":5,"lineup":{}}]'::jsonb, eid, 'finalized', NULL, ver, 'it-game-QF3-' || d_id);
  INSERT INTO it_result VALUES ('K6.route.QF3', (r->'transitions'->>'routed'));

  SELECT id, entry_a_id, version INTO mid, eid, ver FROM public.tournament_matches WHERE division_id = d_id AND match_key = 'SF1';
  r := public.replace_tournament_games_with_transitions(g, mid, '[{"game_no":1,"kind":"game","score_a":11,"score_b":5,"lineup":{}}]'::jsonb, eid, 'finalized', NULL, ver, 'it-game-SF1-' || d_id);
  INSERT INTO it_result VALUES ('K6.route.SF1', (r->'transitions'->>'routed'));

  SELECT id, entry_a_id, version INTO mid, eid, ver FROM public.tournament_matches WHERE division_id = d_id AND match_key = 'SF2';
  r := public.replace_tournament_games_with_transitions(g, mid, '[{"game_no":1,"kind":"game","score_a":11,"score_b":5,"lineup":{}}]'::jsonb, eid, 'finalized', NULL, ver, 'it-game-SF2-' || d_id);
  INSERT INTO it_result VALUES ('K6.route.SF2', (r->'transitions'->>'routed'));

  INSERT INTO it_result VALUES ('K6.after.SF', (SELECT string_agg(match_key || ':' || (CASE WHEN entry_a_id IS NULL THEN '_' ELSE 'A' END) || (CASE WHEN entry_b_id IS NULL THEN '_' ELSE 'B' END), ',' ORDER BY match_key) FROM public.tournament_matches WHERE division_id = d_id AND match_key IN ('SF1', 'SF2', 'F', 'BRONZE')));
  INSERT INTO it_result VALUES ('K6.after.bronze_are_sf_losers', (SELECT (b.entry_a_id = CASE WHEN s1.winner_entry_id = s1.entry_a_id THEN s1.entry_b_id ELSE s1.entry_a_id END
      AND b.entry_b_id = CASE WHEN s2.winner_entry_id = s2.entry_a_id THEN s2.entry_b_id ELSE s2.entry_a_id END)::text
    FROM public.tournament_matches b, public.tournament_matches s1, public.tournament_matches s2
    WHERE b.division_id = d_id AND b.match_key = 'BRONZE' AND s1.division_id = d_id AND s1.match_key = 'SF1' AND s2.division_id = d_id AND s2.match_key = 'SF2'));
  INSERT INTO it_result VALUES ('K6.after.final_are_sf_winners', (SELECT (f.entry_a_id = s1.winner_entry_id AND f.entry_b_id = s2.winner_entry_id)::text
    FROM public.tournament_matches f, public.tournament_matches s1, public.tournament_matches s2
    WHERE f.division_id = d_id AND f.match_key = 'F' AND s1.division_id = d_id AND s1.match_key = 'SF1' AND s2.division_id = d_id AND s2.match_key = 'SF2'));

  SELECT id, entry_a_id, version INTO mid, eid, ver FROM public.tournament_matches WHERE division_id = d_id AND match_key = 'BRONZE';
  r := public.replace_tournament_games_with_transitions(g, mid, '[{"game_no":1,"kind":"game","score_a":11,"score_b":5,"lineup":{}}]'::jsonb, eid, 'finalized', NULL, ver, 'it-game-BRONZE-' || d_id);
  INSERT INTO it_result VALUES ('K6.route.BRONZE', (r->'transitions'->>'routed'));

  SELECT id, entry_a_id, version INTO mid, eid, ver FROM public.tournament_matches WHERE division_id = d_id AND match_key = 'F';
  r := public.replace_tournament_games_with_transitions(g, mid, '[{"game_no":1,"kind":"game","score_a":11,"score_b":5,"lineup":{}},{"game_no":2,"kind":"game","score_a":11,"score_b":5,"lineup":{}}]'::jsonb, eid, 'finalized', NULL, ver, 'it-game-F-' || d_id);
  INSERT INTO it_result VALUES ('K6.route.F', (r->'transitions'->>'routed'));

  INSERT INTO it_result VALUES ('K6.done.finalized', (SELECT count(*) FILTER (WHERE status = 'finalized') || '/' || count(*) FROM public.tournament_matches WHERE division_id = d_id));

  -- ===== Kịch bản K8 =====
  pairs := '[]'::jsonb;
  FOR i IN 0..7 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05","it_pair_06","it_pair_07","it_pair_08"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN false AND i = 7 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"knockout","divisionId":null,"seed":"it-seed-k8","layout":"bracket-8","stages":[{"planKey":"knockout","name":"Loại trực tiếp","scheduleFormat":"knockout","order":1,"config":{"thirdPlaceEnabled":false,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":null,"stagePlanKey":"knockout","entryIds":["it_pair_08","it_pair_02","it_pair_03","it_pair_07","it_pair_04","it_pair_06","it_pair_01","it_pair_05"]}],"matches":[{"matchKey":"QF1","title":"Tứ kết 1","roundLabel":"Tứ kết","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":0,"entryAId":"it_pair_08","entryBId":"it_pair_05","slotA":{"kind":"entry","entryId":"it_pair_08"},"slotB":{"kind":"entry","entryId":"it_pair_05"},"order":1},{"matchKey":"QF2","title":"Tứ kết 2","roundLabel":"Tứ kết","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":1,"entryAId":"it_pair_04","entryBId":"it_pair_07","slotA":{"kind":"entry","entryId":"it_pair_04"},"slotB":{"kind":"entry","entryId":"it_pair_07"},"order":2},{"matchKey":"QF3","title":"Tứ kết 3","roundLabel":"Tứ kết","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":2,"entryAId":"it_pair_03","entryBId":"it_pair_06","slotA":{"kind":"entry","entryId":"it_pair_03"},"slotB":{"kind":"entry","entryId":"it_pair_06"},"order":3},{"matchKey":"QF4","title":"Tứ kết 4","roundLabel":"Tứ kết","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":3,"entryAId":"it_pair_01","entryBId":"it_pair_02","slotA":{"kind":"entry","entryId":"it_pair_01"},"slotB":{"kind":"entry","entryId":"it_pair_02"},"order":4},{"matchKey":"SF1","title":"Bán kết 1","roundLabel":"Bán kết","stagePlanKey":"knockout","stageKind":"knockout","round":2,"bracketSlot":0,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thắng tứ kết 1"},"slotB":{"kind":"progression","label":"Thắng tứ kết 2"},"order":5},{"matchKey":"SF2","title":"Bán kết 2","roundLabel":"Bán kết","stagePlanKey":"knockout","stageKind":"knockout","round":2,"bracketSlot":1,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thắng tứ kết 3"},"slotB":{"kind":"progression","label":"Thắng tứ kết 4"},"order":6},{"matchKey":"F","title":"Chung kết","roundLabel":"Chung kết","stagePlanKey":"knockout","stageKind":"knockout","round":3,"bracketSlot":0,"entryAId":null,"entryBId":null,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":7}],"progressions":[{"sourceStagePlanKey":"knockout","targetMatchKey":"SF1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"QF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"QF2","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"QF3","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"SF2","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"QF4","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"byeEntryIds":[],"counts":{"groupMatches":0,"knockoutMatches":7,"total":7},"rounds":3,"finalBestOf":1,"warnings":[],"inputSignature":"{\"config\":{\"finalBestOf\":1,\"thirdPlaceEnabled\":false},\"formatKey\":\"knockout\",\"pairIds\":[\"it_pair_01\",\"it_pair_02\",\"it_pair_03\",\"it_pair_04\",\"it_pair_05\",\"it_pair_06\",\"it_pair_07\",\"it_pair_08\"]}","fingerprint":"6e467dbc9bd91e0efc3f58b3d8c4bfa832963d6ccef08ff0b460fd3498db098c"}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT K8', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT K8', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 16) k),
      'guests', '[]'::jsonb),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'knockout', 'config', '{"thirdPlaceEnabled":false,"finalBestOf":1}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-key-K8', draft, 1, 'it-save-K8-1');
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K8', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('K8.finalize.match_count', r->>'match_count');
  INSERT INTO it_result VALUES ('K8.db.keys', (SELECT string_agg(match_key || '@r' || round, ',' ORDER BY match_order) FROM public.tournament_matches WHERE division_id = d_id));
  INSERT INTO it_result VALUES ('K8.db.transitions', (SELECT count(*) FROM public.tournament_stage_transitions WHERE division_id = d_id)::text);
  INSERT INTO it_result VALUES ('K8.db.no_match_scoring', (SELECT (config->'match_scoring' IS NULL)::text FROM public.tournament_stages WHERE division_id = d_id));

  -- ===== Kịch bản GK =====
  pairs := '[]'::jsonb;
  FOR i IN 0..6 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05","it_pair_06","it_pair_07"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN false AND i = 6 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"group_knockout","divisionId":null,"seed":"it-seed-gk","layout":"2x2","stages":[{"planKey":"group-stage","name":"Vòng bảng","scheduleFormat":"round_robin","order":1,"config":{"groupCount":2,"advancePerGroup":2,"poolCount":0,"qualifiersTarget":4,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}},{"planKey":"knockout-stage","name":"Vòng loại trực tiếp","scheduleFormat":"knockout","order":2,"config":{"thirdPlaceEnabled":true,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null},"match_scoring":{"F":{"best_of":3}}}}],"groups":[{"label":"A","entryIds":["it_pair_07","it_pair_02","it_pair_06","it_pair_03"]},{"label":"B","entryIds":["it_pair_01","it_pair_04","it_pair_05"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"it_pair_07","entryBId":"it_pair_03","order":1},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"it_pair_02","entryBId":"it_pair_06","order":2},{"matchKey":"GROUP-B-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":1,"entryAId":"it_pair_04","entryBId":"it_pair_05","order":3},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"it_pair_07","entryBId":"it_pair_06","order":4},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"it_pair_03","entryBId":"it_pair_02","order":5},{"matchKey":"GROUP-B-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":2,"entryAId":"it_pair_01","entryBId":"it_pair_05","order":6},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"it_pair_07","entryBId":"it_pair_02","order":7},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"it_pair_06","entryBId":"it_pair_03","order":8},{"matchKey":"GROUP-B-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":3,"entryAId":"it_pair_01","entryBId":"it_pair_04","order":9},{"matchKey":"SF1","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":0,"slotA":{"kind":"progression","label":"Nhất A"},"slotB":{"kind":"progression","label":"Nhì B"},"order":10},{"matchKey":"SF2","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":1,"slotA":{"kind":"progression","label":"Nhất B"},"slotB":{"kind":"progression","label":"Nhì A"},"order":11},{"matchKey":"BRONZE","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":1,"slotA":{"kind":"progression","label":"Thua bán kết 1"},"slotB":{"kind":"progression","label":"Thua bán kết 2"},"order":12},{"matchKey":"F","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":0,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":13}],"progressions":[{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"A","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"B","rank":2}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"B","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"A","rank":2}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"BRONZE","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"loser"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"BRONZE","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"loser"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"counts":{"groupMatches":9,"knockoutMatches":4,"total":13},"finalBestOf":3,"warnings":["GROUP_SIZE_IMBALANCE"],"inputSignature":"{\"config\":{\"finalBestOf\":3,\"groupCount\":2,\"qualifiersPerGroup\":2,\"thirdPlaceEnabled\":true},\"formatKey\":\"group_knockout\",\"pairIds\":[\"it_pair_01\",\"it_pair_02\",\"it_pair_03\",\"it_pair_04\",\"it_pair_05\",\"it_pair_06\",\"it_pair_07\"]}","fingerprint":"139d28849c4729f083ea70424ba52ab87eeabeae6577e7ca7bab2386a61ae95d"}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT GK', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT GK', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 14) k),
      'guests', '[]'::jsonb),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'group_knockout', 'config', '{"groupCount":2,"qualifiersPerGroup":2,"thirdPlaceEnabled":true,"finalBestOf":3}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-key-GK', draft, 1, 'it-save-GK-1');
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-GK', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('GK.finalize', (r->>'match_count') || ' trận');
  INSERT INTO it_result VALUES ('GK.db', (SELECT string_agg(s.schedule_format || ':entrants=' || (SELECT count(*) FROM public.tournament_stage_entrants se WHERE se.stage_id = s.id), ',' ORDER BY s.stage_order) FROM public.tournament_stages s WHERE s.division_id = d_id));

  -- ===== Kịch bản RR =====
  pairs := '[]'::jsonb;
  FOR i IN 0..4 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN true AND i = 4 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"round_robin","divisionId":null,"seed":"it-seed-rr","layout":"single-group","stages":[{"planKey":"group-stage","name":"Vòng tròn","scheduleFormat":"round_robin","order":1,"config":{"groupCount":1,"advancePerGroup":0,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":"A","entryIds":["it_pair_03","it_pair_02","it_pair_05","it_pair_04","it_pair_01"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"it_pair_02","entryBId":"it_pair_01","order":1},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"it_pair_05","entryBId":"it_pair_04","order":2},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"it_pair_03","entryBId":"it_pair_01","order":3},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"it_pair_02","entryBId":"it_pair_05","order":4},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"it_pair_03","entryBId":"it_pair_04","order":5},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"it_pair_01","entryBId":"it_pair_05","order":6},{"matchKey":"GROUP-A-7","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":4,"entryAId":"it_pair_03","entryBId":"it_pair_05","order":7},{"matchKey":"GROUP-A-8","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":4,"entryAId":"it_pair_04","entryBId":"it_pair_02","order":8},{"matchKey":"GROUP-A-9","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":5,"entryAId":"it_pair_03","entryBId":"it_pair_02","order":9},{"matchKey":"GROUP-A-10","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":5,"entryAId":"it_pair_04","entryBId":"it_pair_01","order":10}],"progressions":[],"counts":{"groupMatches":10,"knockoutMatches":0,"total":10},"rounds":5,"finalBestOf":1,"warnings":[],"inputSignature":"{\"config\":{},\"formatKey\":\"round_robin\",\"pairIds\":[\"it_pair_01\",\"it_pair_02\",\"it_pair_03\",\"it_pair_04\",\"it_pair_05\"]}","fingerprint":"6511209efc4e4025aafeb7965ea2c1a4834a66198bb2048fa274198370038fb0"}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT RR', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT RR', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 9) k),
      'guests', jsonb_build_array(jsonb_build_object('clientRef', 'g_it_guest_0001', 'displayName', 'Khách IT'))),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'round_robin', 'config', '{}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-key-RR', draft, 1, 'it-save-RR-1');
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-RR', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('RR.finalize', (r->>'match_count') || ' trận');
  INSERT INTO it_result VALUES ('RR.db', (SELECT string_agg(s.schedule_format || ':entrants=' || (SELECT count(*) FROM public.tournament_stage_entrants se WHERE se.stage_id = s.id), ',' ORDER BY s.stage_order) FROM public.tournament_stages s WHERE s.division_id = d_id));

END
$it$;
SELECT k, v FROM it_result ORDER BY k;
ROLLBACK;
