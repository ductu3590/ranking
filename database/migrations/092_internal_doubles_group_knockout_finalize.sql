-- Finalize the persisted internal doubles group-knockout draft without accepting a client stage plan.
-- This RPC is intentionally service-role only; the server must derive group_id from its session.
BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_internal_doubles_group_knockout_v2(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint,
  p_expected_setup_revision bigint,
  p_idempotency_key text,
  p_preview_fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.tournament_divisions%ROWTYPE;
  t public.tournaments%ROWTYPE;
  cached public.tournament_setup_mutations%ROWTYPE;
  v_draft jsonb;
  v_draw jsonb;
  v_assignments jsonb;
  v_pairs jsonb;
  v_selected jsonb;
  v_reserves jsonb;
  v_unpaired jsonb;
  v_fingerprint text;
  v_request_fingerprint text;
  v_host_club_id bigint;
  v_group_stage_id bigint;
  v_knockout_stage_id bigint;
  v_sf1 bigint;
  v_sf2 bigint;
  v_final bigint;
  v_bronze bigint;
  v_pair jsonb;
  v_member jsonb;
  v_assignment jsonb;
  v_member_id bigint;
  v_athlete_id bigint;
  v_tournament_athlete_id bigint;
  v_pair_id bigint;
  v_entry_id bigint;
  v_name text;
  v_group_label text;
  v_slot integer;
  v_entry_a bigint;
  v_entry_b bigint;
  v_match_order integer := 0;
  v_pair_entries jsonb := '{}'::jsonb;
  v_member_athletes jsonb := '{}'::jsonb;
  v_result jsonb;
  v_third_place boolean;
BEGIN
  IF p_group_id IS NULL OR p_tournament_id IS NULL OR p_division_id IS NULL
    OR p_expected_setup_revision IS NULL OR p_expected_setup_revision < 1
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
    OR p_preview_fingerprint IS NULL OR p_preview_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  v_request_fingerprint := encode(digest(convert_to(jsonb_build_object(
    'tournament_id', p_tournament_id, 'division_id', p_division_id,
    'expected_setup_revision', p_expected_setup_revision,
    'preview_fingerprint', lower(p_preview_fingerprint)
  )::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_group_id::text || ':internal-doubles-finalize:' || btrim(p_idempotency_key), 0
  ));
  SELECT * INTO cached FROM public.tournament_setup_mutations
  WHERE group_id = p_group_id
    AND operation = 'finalize_internal_doubles_group_knockout_v2'
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF cached.division_id <> p_division_id OR cached.payload_fingerprint <> v_request_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '22023';
    END IF;
    RETURN cached.response;
  END IF;

  SELECT * INTO d FROM public.tournament_divisions
  WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DIVISION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO t FROM public.tournaments
  WHERE id = p_tournament_id AND group_id = p_group_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF d.setup_revision <> p_expected_setup_revision THEN
    RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF d.roster_lock_status <> 'open' THEN RAISE EXCEPTION 'ROSTER_LOCKED' USING ERRCODE = '40001'; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_stages s WHERE s.group_id=p_group_id AND s.tournament_id=p_tournament_id AND s.division_id=p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_entries e WHERE e.group_id=p_group_id AND e.division_id=p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_pairs p WHERE p.group_id=p_group_id AND p.division_id=p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_stage_transitions x WHERE x.group_id=p_group_id AND x.tournament_id=p_tournament_id AND x.division_id=p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_matches m JOIN public.tournament_stages s ON s.id=m.stage_id WHERE m.group_id=p_group_id AND s.tournament_id=p_tournament_id AND s.division_id=p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_games g JOIN public.tournament_matches m ON m.id=g.match_id JOIN public.tournament_stages s ON s.id=m.stage_id WHERE g.group_id=p_group_id AND s.tournament_id=p_tournament_id AND s.division_id=p_division_id) THEN
    RAISE EXCEPTION 'FINALIZE_STRUCTURE_ALREADY_EXISTS' USING ERRCODE = '40001';
  END IF;

  v_draft := d.setup_draft;
  v_draw := v_draft->'draw';
  v_assignments := v_draw->'assignments';
  v_pairs := v_draft->'pairs';
  v_selected := v_draft->'participants'->'selectedMemberIds';
  v_reserves := COALESCE(v_draft->'reserveMemberIds', '[]'::jsonb);
  v_unpaired := COALESCE(v_draft->'unpairedMemberIds', '[]'::jsonb);
  IF COALESCE(v_draft->'tournament'->>'organizerMode','') <> 'internal'
    OR d.play_type <> 'doubles'
    OR COALESCE(v_draft->'format'->>'entrantType','') <> 'doubles'
    OR COALESCE(v_draft->'format'->>'formatKey','') <> 'group_knockout'
    OR jsonb_typeof(v_pairs) <> 'array' OR jsonb_array_length(v_pairs) <> 7
    OR jsonb_typeof(v_selected) <> 'array' OR jsonb_array_length(v_selected) <> 14
    OR jsonb_typeof(v_assignments) <> 'array' OR jsonb_array_length(v_assignments) <> 7
    OR jsonb_array_length(v_reserves) <> 0 OR jsonb_array_length(v_unpaired) <> 0 THEN
    RAISE EXCEPTION 'INTERNAL_DOUBLES_GROUP_KNOCKOUT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_draft->'format'->'config'->>'groupCount', '2') !~ '^2$'
    OR COALESCE(v_draft->'format'->'config'->>'qualifiersPerGroup', v_draft->'format'->'config'->>'advancePerGroup', '2') !~ '^2$' THEN
    RAISE EXCEPTION 'INTERNAL_DOUBLES_GROUP_KNOCKOUT_INVALID' USING ERRCODE = '22023';
  END IF;

  -- The canonical plan builder creates this fingerprint during preview and the
  -- aggregate save persists it. SQL accepts no client-supplied plan structure.
  v_fingerprint := lower(COALESCE(v_draw->>'previewFingerprint', v_draw->>'fingerprint', ''));
  IF v_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'DRAW_FINGERPRINT_MISSING' USING ERRCODE = '22023';
  END IF;
  IF lower(p_preview_fingerprint) <> v_fingerprint THEN
    RAISE EXCEPTION 'DRAW_FINGERPRINT_MISMATCH' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_selected) x WHERE jsonb_typeof(x) <> 'string' OR x #>> '{}' !~ '^[1-9][0-9]*$')
    OR (SELECT count(DISTINCT x #>> '{}') FROM jsonb_array_elements(v_selected) x) <> 14
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_selected) x WHERE NOT EXISTS (
      SELECT 1 FROM public.club_members cm WHERE cm.id=(x #>> '{}')::bigint AND cm.group_id=p_group_id AND cm.is_active IS DISTINCT FROM false
    )) THEN RAISE EXCEPTION 'MEMBER_NOT_ACTIVE_IN_GROUP' USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_selected) x WHERE NOT EXISTS (
    SELECT 1 FROM public.athletes a JOIN public.club_members cm ON cm.id=a.legacy_club_member_id
    WHERE cm.id=(x #>> '{}')::bigint AND cm.group_id=p_group_id
  )) THEN RAISE EXCEPTION 'ATHLETE_IDENTITY_MISSING' USING ERRCODE = '23503'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) x WHERE jsonb_typeof(x) <> 'object'
      OR nullif(btrim(x->>'pairId'),'') IS NULL OR jsonb_typeof(x->'memberIds') <> 'array' OR jsonb_array_length(x->'memberIds') <> 2)
    OR (SELECT count(DISTINCT x->>'pairId') FROM jsonb_array_elements(v_pairs) x) <> 7
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p, jsonb_array_elements(p->'memberIds') m
      WHERE jsonb_typeof(m) <> 'string' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_selected) s WHERE s #>> '{}' = m #>> '{}'))
    OR (SELECT count(DISTINCT m #>> '{}') FROM jsonb_array_elements(v_pairs) p, jsonb_array_elements(p->'memberIds') m) <> 14 THEN
    RAISE EXCEPTION 'PAIRING_INVALID' USING ERRCODE = '22023';
  END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_assignments) a WHERE jsonb_typeof(a) <> 'object'
      OR a->>'entrantId' IS NULL OR a->>'groupLabel' NOT IN ('A','B') OR COALESCE(a->>'slot','') !~ '^[1-9][0-9]*$')
    OR (SELECT count(DISTINCT a->>'entrantId') FROM jsonb_array_elements(v_assignments) a) <> 7
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_assignments) a WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p WHERE p->>'pairId'=a->>'entrantId'))
    OR (SELECT count(*) FROM jsonb_array_elements(v_assignments) a WHERE a->>'groupLabel'='A') <> 4
    OR (SELECT count(*) FROM jsonb_array_elements(v_assignments) a WHERE a->>'groupLabel'='B') <> 3
    OR (SELECT count(DISTINCT a->>'slot') FROM jsonb_array_elements(v_assignments) a WHERE a->>'groupLabel'='A') <> 4
    OR (SELECT count(DISTINCT a->>'slot') FROM jsonb_array_elements(v_assignments) a WHERE a->>'groupLabel'='B') <> 3
    OR EXISTS (SELECT 1 FROM generate_series(1,4) n WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_assignments) a WHERE a->>'groupLabel'='A' AND a->>'slot'=n::text))
    OR EXISTS (SELECT 1 FROM generate_series(1,3) n WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_assignments) a WHERE a->>'groupLabel'='B' AND a->>'slot'=n::text)) THEN
    RAISE EXCEPTION 'DRAW_ASSIGNMENTS_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tournament_clubs(group_id,tournament_id,club_id,invitation_status)
  VALUES (p_group_id,p_tournament_id,p_group_id,'approved')
  ON CONFLICT (tournament_id,club_id) WHERE club_id IS NOT NULL DO UPDATE SET version=public.tournament_clubs.version
  RETURNING id INTO v_host_club_id;
  IF v_host_club_id IS NULL THEN SELECT id INTO v_host_club_id FROM public.tournament_clubs WHERE group_id=p_group_id AND tournament_id=p_tournament_id AND club_id=p_group_id; END IF;

  FOR v_member IN SELECT value FROM jsonb_array_elements(v_selected) LOOP
    v_member_id := (v_member #>> '{}')::bigint;
    SELECT a.id INTO v_athlete_id FROM public.athletes a WHERE a.legacy_club_member_id=v_member_id;
    SELECT id INTO v_tournament_athlete_id FROM public.tournament_athletes WHERE group_id=p_group_id AND tournament_id=p_tournament_id AND athlete_id=v_athlete_id AND tournament_club_id=v_host_club_id FOR UPDATE;
    IF v_tournament_athlete_id IS NULL AND EXISTS (
      SELECT 1 FROM public.tournament_athletes WHERE group_id=p_group_id AND tournament_id=p_tournament_id AND athlete_id=v_athlete_id
    ) THEN RAISE EXCEPTION 'TOURNAMENT_ATHLETE_CLUB_SCOPE_MISMATCH' USING ERRCODE = '23503'; END IF;
    IF v_tournament_athlete_id IS NULL THEN
      INSERT INTO public.tournament_athletes(group_id,tournament_id,tournament_club_id,athlete_id,display_name_snapshot,source)
      SELECT p_group_id,p_tournament_id,v_host_club_id,a.id,cm.full_name,'club_member'
      FROM public.club_members cm JOIN public.athletes a ON a.legacy_club_member_id=cm.id
      WHERE cm.id=v_member_id AND cm.group_id=p_group_id RETURNING id INTO v_tournament_athlete_id;
    END IF;
    v_member_athletes := v_member_athletes || jsonb_build_object(v_member_id::text, v_tournament_athlete_id);
    INSERT INTO public.tournament_division_roster_members(group_id,division_id,tournament_athlete_id)
    VALUES(p_group_id,p_division_id,v_tournament_athlete_id) ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_pair IN SELECT value FROM jsonb_array_elements(v_pairs) LOOP
    v_name := NULLIF(btrim(COALESCE(v_pair->>'nameSnapshot','')), '');
    IF v_name IS NULL THEN SELECT string_agg(cm.full_name, ' / ' ORDER BY cm.id) INTO v_name FROM jsonb_array_elements(v_pair->'memberIds') x JOIN public.club_members cm ON cm.id=(x #>> '{}')::bigint AND cm.group_id=p_group_id; END IF;
    INSERT INTO public.tournament_pairs(group_id,division_id,name_snapshot,pairing_mode,status)
    VALUES(p_group_id,p_division_id,v_name,'manual','locked') RETURNING id INTO v_pair_id;
    FOR v_member IN SELECT value FROM jsonb_array_elements(v_pair->'memberIds') LOOP
      v_tournament_athlete_id := (v_member_athletes->>(v_member #>> '{}'))::bigint;
      INSERT INTO public.tournament_pair_members(group_id,pair_id,tournament_athlete_id) VALUES(p_group_id,v_pair_id,v_tournament_athlete_id);
    END LOOP;
    INSERT INTO public.tournament_entries(group_id,division_id,tournament_club_id,pair_id,name_snapshot,status)
    VALUES(p_group_id,p_division_id,v_host_club_id,v_pair_id,v_name,'approved') RETURNING id INTO v_entry_id;
    FOR v_member IN SELECT value FROM jsonb_array_elements(v_pair->'memberIds') LOOP
      v_tournament_athlete_id := (v_member_athletes->>(v_member #>> '{}'))::bigint;
      SELECT athlete_id INTO v_athlete_id FROM public.tournament_athletes WHERE id=v_tournament_athlete_id AND group_id=p_group_id;
      SELECT full_name INTO v_name FROM public.club_members WHERE id=(v_member #>> '{}')::bigint AND group_id=p_group_id;
      INSERT INTO public.tournament_entry_members(group_id,entry_id,athlete_id,display_name_snapshot,roster_role)
      VALUES(p_group_id,v_entry_id,v_athlete_id,v_name,'player');
    END LOOP;
    v_pair_entries := v_pair_entries || jsonb_build_object(v_pair->>'pairId',v_entry_id);
  END LOOP;

  IF COALESCE(v_draft->'format'->'config'->>'thirdPlaceEnabled', 'false') NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'INTERNAL_DOUBLES_GROUP_KNOCKOUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_third_place := COALESCE(v_draft->'format'->'config'->>'thirdPlaceEnabled', 'false') = 'true';
  INSERT INTO public.tournament_stages(group_id,tournament_id,division_id,stage_order,name,schedule_format,match_format,status,config)
  VALUES(p_group_id,p_tournament_id,p_division_id,1,'Vòng bảng','round_robin','simple','pending',jsonb_build_object('groupCount',2,'advancePerGroup',2,'draw',jsonb_build_object('status','locked','fingerprint',v_fingerprint))) RETURNING id INTO v_group_stage_id;
  INSERT INTO public.tournament_stages(group_id,tournament_id,division_id,stage_order,name,schedule_format,match_format,status,config)
  VALUES(p_group_id,p_tournament_id,p_division_id,2,'Chung kết','knockout','simple','pending',jsonb_build_object('thirdPlaceEnabled',v_third_place)) RETURNING id INTO v_knockout_stage_id;
  FOR v_assignment IN SELECT value FROM jsonb_array_elements(v_assignments) LOOP
    v_group_label:=v_assignment->>'groupLabel'; v_slot:=(v_assignment->>'slot')::integer; v_entry_id:=(v_pair_entries->>(v_assignment->>'entrantId'))::bigint;
    INSERT INTO public.tournament_stage_entrants(group_id,stage_id,division_id,entry_id,group_label,seed_in_stage)
    VALUES(p_group_id,v_group_stage_id,p_division_id,v_entry_id,v_group_label,v_slot);
  END LOOP;
  FOR v_group_label IN SELECT unnest(ARRAY['A','B']) LOOP
    FOR v_assignment IN SELECT value FROM jsonb_array_elements(v_assignments) WHERE value->>'groupLabel'=v_group_label ORDER BY (value->>'slot')::integer LOOP
      FOR v_member IN SELECT value FROM jsonb_array_elements(v_assignments) WHERE value->>'groupLabel'=v_group_label AND (value->>'slot')::integer>(v_assignment->>'slot')::integer ORDER BY (value->>'slot')::integer LOOP
        v_match_order:=v_match_order+1;
        INSERT INTO public.tournament_matches(group_id,division_id,stage_id,round,bracket_slot,group_label,match_order,match_key,entry_a_id,entry_b_id,status,result_type)
        VALUES(p_group_id,p_division_id,v_group_stage_id,1,v_match_order,v_group_label,v_match_order,'GROUP-'||v_group_label||'-'||v_match_order,(v_pair_entries->>(v_assignment->>'entrantId'))::bigint,(v_pair_entries->>(v_member->>'entrantId'))::bigint,'pending','simple');
      END LOOP;
    END LOOP;
  END LOOP;
  INSERT INTO public.tournament_matches(group_id,division_id,stage_id,round,bracket_slot,match_order,match_key,status,result_type) VALUES
    (p_group_id,p_division_id,v_knockout_stage_id,1,0,0,'SF1','pending','simple') RETURNING id INTO v_sf1;
  INSERT INTO public.tournament_matches(group_id,division_id,stage_id,round,bracket_slot,match_order,match_key,status,result_type) VALUES
    (p_group_id,p_division_id,v_knockout_stage_id,1,1,1,'SF2','pending','simple') RETURNING id INTO v_sf2;
  INSERT INTO public.tournament_matches(group_id,division_id,stage_id,round,bracket_slot,match_order,match_key,status,result_type) VALUES
    (p_group_id,p_division_id,v_knockout_stage_id,2,0,2,'F','pending','simple') RETURNING id INTO v_final;
  IF v_third_place THEN INSERT INTO public.tournament_matches(group_id,division_id,stage_id,round,bracket_slot,match_order,match_key,status,result_type) VALUES(p_group_id,p_division_id,v_knockout_stage_id,2,1,3,'BRONZE','pending','simple') RETURNING id INTO v_bronze; END IF;
  INSERT INTO public.tournament_stage_transitions(group_id,tournament_id,division_id,source_stage_id,source_kind,source_group_label,source_rank,target_stage_id,target_match_id,target_slot) VALUES
    (p_group_id,p_tournament_id,p_division_id,v_group_stage_id,'group_rank','A',1,v_knockout_stage_id,v_sf1,'a'),(p_group_id,p_tournament_id,p_division_id,v_group_stage_id,'group_rank','B',2,v_knockout_stage_id,v_sf1,'b'),(p_group_id,p_tournament_id,p_division_id,v_group_stage_id,'group_rank','B',1,v_knockout_stage_id,v_sf2,'a'),(p_group_id,p_tournament_id,p_division_id,v_group_stage_id,'group_rank','A',2,v_knockout_stage_id,v_sf2,'b');
  INSERT INTO public.tournament_stage_transitions(group_id,tournament_id,division_id,source_stage_id,source_kind,source_match_id,source_outcome,target_stage_id,target_match_id,target_slot) VALUES
    (p_group_id,p_tournament_id,p_division_id,v_knockout_stage_id,'match_outcome',v_sf1,'winner',v_knockout_stage_id,v_final,'a'),(p_group_id,p_tournament_id,p_division_id,v_knockout_stage_id,'match_outcome',v_sf2,'winner',v_knockout_stage_id,v_final,'b');
  IF v_bronze IS NOT NULL THEN INSERT INTO public.tournament_stage_transitions(group_id,tournament_id,division_id,source_stage_id,source_kind,source_match_id,source_outcome,target_stage_id,target_match_id,target_slot) VALUES(p_group_id,p_tournament_id,p_division_id,v_knockout_stage_id,'match_outcome',v_sf1,'loser',v_knockout_stage_id,v_bronze,'a'),(p_group_id,p_tournament_id,p_division_id,v_knockout_stage_id,'match_outcome',v_sf2,'loser',v_knockout_stage_id,v_bronze,'b'); END IF;
  UPDATE public.tournament_divisions SET roster_lock_status='locked',roster_locked_at=now(),setup_revision=setup_revision+1,setup_updated_at=now(),setup_draft=jsonb_set(jsonb_set(jsonb_set(setup_draft,'{state}','"finalized"'::jsonb,true),'{draw,status}','"locked"'::jsonb,true),'{finalizedAt}',to_jsonb(now()),true) WHERE id=d.id AND group_id=p_group_id RETURNING setup_revision INTO d.setup_revision;
  v_result:=jsonb_build_object('success',true,'setup_revision',d.setup_revision,'group_stage_id',v_group_stage_id,'knockout_stage_id',v_knockout_stage_id,'group_fixtures',9,'matches',jsonb_build_object('SF1',v_sf1,'SF2',v_sf2,'F',v_final,'BRONZE',v_bronze),'draw_fingerprint',v_fingerprint);
  INSERT INTO public.tournament_setup_mutations(group_id,operation,division_id,idempotency_key,payload_fingerprint,response) VALUES(p_group_id,'finalize_internal_doubles_group_knockout_v2',p_division_id,p_idempotency_key,v_request_fingerprint,v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_internal_doubles_group_knockout_v2(bigint,bigint,bigint,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_internal_doubles_group_knockout_v2(bigint,bigint,bigint,bigint,text,text) TO service_role;
COMMENT ON FUNCTION public.finalize_internal_doubles_group_knockout_v2(bigint,bigint,bigint,bigint,text,text) IS 'Chot draft noi bo doubles group_knockout tu snapshot da luu, tao 2 stage, 9 tran bang va nhanh playoff nguyen tu.';

COMMIT;
