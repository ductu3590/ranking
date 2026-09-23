-- Lát B: mở round_robin cho finalize_internal_setup_v4 (spec Lát B §5).
-- CREATE OR REPLACE giữ nguyên signature và grants. Thêm bất biến riêng cho vòng tròn:
-- đúng 1 stage, không có tuyến đi tiếp, n(n-1)/2 trận, mỗi cặp đá n-1 trận, không cặp nào
-- gặp nhau hai lần. Thể thức cho phép đồng bộ với lib/tournament/setupFormats.js.
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
  c_allowed_formats constant text[] := ARRAY['group_knockout', 'round_robin'];
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
               WHERE m->>'stageKind' = 'knockout' AND (m->>'entryAId' IS NOT NULL OR m->>'entryBId' IS NOT NULL
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

  -- Cặp vào bảng.
  FOR v_group IN SELECT value FROM jsonb_array_elements(p_plan->'groups') LOOP
    v_index := 0;
    FOR v_part IN SELECT e FROM jsonb_array_elements_text(v_group->'entryIds') e LOOP
      v_index := v_index + 1;
      INSERT INTO public.tournament_stage_entrants(group_id, stage_id, division_id, entry_id, group_label, seed_in_stage)
      VALUES (p_group_id, (v_stage_ids->>'group-stage')::bigint, p_division_id, (v_pair_entries->>v_part)::bigint, v_group->>'label', v_index);
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
COMMIT;
