-- Fix NULL-safe source/target existence checks for the explicit playoff graph.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_tournament_stage_transition_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE source_stage public.tournament_stages%ROWTYPE; target_stage public.tournament_stages%ROWTYPE; target_match public.tournament_matches%ROWTYPE; source_match public.tournament_matches%ROWTYPE;
BEGIN
  SELECT * INTO source_stage FROM public.tournament_stages WHERE id = NEW.source_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_TRANSITION_SOURCE_STAGE_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  SELECT * INTO target_stage FROM public.tournament_stages WHERE id = NEW.target_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_TRANSITION_TARGET_STAGE_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  SELECT * INTO target_match FROM public.tournament_matches WHERE id = NEW.target_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_TRANSITION_TARGET_MATCH_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  IF source_stage.group_id IS DISTINCT FROM NEW.group_id OR target_stage.group_id IS DISTINCT FROM NEW.group_id
    OR source_stage.tournament_id IS DISTINCT FROM NEW.tournament_id OR target_stage.tournament_id IS DISTINCT FROM NEW.tournament_id
    OR target_match.group_id IS DISTINCT FROM NEW.group_id OR target_match.stage_id IS DISTINCT FROM NEW.target_stage_id
    OR target_match.division_id IS DISTINCT FROM NEW.division_id OR source_stage.division_id IS DISTINCT FROM NEW.division_id
    OR target_stage.division_id IS DISTINCT FROM NEW.division_id THEN
    RAISE EXCEPTION 'STAGE_TRANSITION_SCOPE_MISMATCH' USING ERRCODE = '23503';
  END IF;
  IF NEW.source_kind = 'match_outcome' THEN
    SELECT * INTO source_match FROM public.tournament_matches WHERE id = NEW.source_match_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_TRANSITION_SOURCE_MATCH_NOT_FOUND' USING ERRCODE = '23503'; END IF;
    IF source_match.group_id IS DISTINCT FROM NEW.group_id OR source_match.stage_id IS DISTINCT FROM NEW.source_stage_id OR source_match.division_id IS DISTINCT FROM NEW.division_id THEN
      RAISE EXCEPTION 'STAGE_TRANSITION_SOURCE_MATCH_SCOPE_MISMATCH' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_top_two_group_playoff_revisioned(
  p_group_id bigint, p_tournament_id bigint, p_division_id bigint, p_group_stage_id bigint,
  p_playoff_stage_id bigint, p_bronze boolean, p_expected_setup_revision bigint, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.tournament_divisions%ROWTYPE; g public.tournament_stages%ROWTYPE; p public.tournament_stages%ROWTYPE; cached public.tournament_setup_mutations%ROWTYPE; fingerprint text; sf1 bigint; sf2 bigint; final_id bigint; bronze_id bigint; result jsonb;
BEGIN
  IF p_expected_setup_revision IS NULL OR p_expected_setup_revision < 1 THEN RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE='22023'; END IF;
  fingerprint:=md5(jsonb_build_object('group_stage_id',p_group_stage_id,'playoff_stage_id',p_playoff_stage_id,'bronze',coalesce(p_bronze,false))::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text||':playoff-plan:'||p_idempotency_key,0));
  SELECT * INTO cached FROM public.tournament_setup_mutations WHERE group_id=p_group_id AND operation='configure_top_two_group_playoff_revisioned' AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN IF cached.division_id<>p_division_id OR cached.payload_fingerprint<>fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023'; END IF; RETURN cached.response; END IF;
  SELECT * INTO d FROM public.tournament_divisions WHERE id=p_division_id AND group_id=p_group_id AND tournament_id=p_tournament_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'division not found in tournament scope' USING ERRCODE='P0002'; END IF;
  IF d.setup_revision<>p_expected_setup_revision THEN RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE='40001'; END IF; IF d.roster_lock_status<>'open' THEN RAISE EXCEPTION 'ROSTER_LOCKED' USING ERRCODE='40001'; END IF;
  SELECT * INTO g FROM public.tournament_stages WHERE id=p_group_stage_id AND group_id=p_group_id AND tournament_id=p_tournament_id AND division_id=p_division_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'PLAYOFF_GROUP_STAGE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT * INTO p FROM public.tournament_stages WHERE id=p_playoff_stage_id AND group_id=p_group_id AND tournament_id=p_tournament_id AND division_id=p_division_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'PLAYOFF_STAGE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF g.schedule_format IS DISTINCT FROM 'round_robin' OR p.schedule_format IS DISTINCT FROM 'knockout' THEN RAISE EXCEPTION 'PLAYOFF_STAGE_PLAN_INVALID' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.tournament_matches m WHERE m.group_id=p_group_id AND m.stage_id=p_playoff_stage_id) OR EXISTS(SELECT 1 FROM public.tournament_stage_transitions t WHERE t.group_id=p_group_id AND (t.source_stage_id=p_group_stage_id OR t.target_stage_id=p_playoff_stage_id)) THEN RAISE EXCEPTION 'PLAYOFF_PLAN_ALREADY_EXISTS' USING ERRCODE='40001'; END IF;
  INSERT INTO public.tournament_matches(group_id,division_id,stage_id,round,bracket_slot,match_order,match_key,status,result_type) VALUES(p_group_id,p_division_id,p_playoff_stage_id,1,0,0,'SF1','pending','simple') RETURNING id INTO sf1;
  INSERT INTO public.tournament_matches(group_id,division_id,stage_id,round,bracket_slot,match_order,match_key,status,result_type) VALUES(p_group_id,p_division_id,p_playoff_stage_id,1,1,1,'SF2','pending','simple') RETURNING id INTO sf2;
  INSERT INTO public.tournament_matches(group_id,division_id,stage_id,round,bracket_slot,match_order,match_key,status,result_type) VALUES(p_group_id,p_division_id,p_playoff_stage_id,2,0,2,'F','pending','simple') RETURNING id INTO final_id;
  IF coalesce(p_bronze,false) THEN INSERT INTO public.tournament_matches(group_id,division_id,stage_id,round,bracket_slot,match_order,match_key,status,result_type) VALUES(p_group_id,p_division_id,p_playoff_stage_id,2,1,3,'BRONZE','pending','simple') RETURNING id INTO bronze_id; END IF;
  INSERT INTO public.tournament_stage_transitions(group_id,tournament_id,division_id,source_stage_id,source_kind,source_group_label,source_rank,target_stage_id,target_match_id,target_slot) VALUES (p_group_id,p_tournament_id,p_division_id,p_group_stage_id,'group_rank','A',1,p_playoff_stage_id,sf1,'a'),(p_group_id,p_tournament_id,p_division_id,p_group_stage_id,'group_rank','B',2,p_playoff_stage_id,sf1,'b'),(p_group_id,p_tournament_id,p_division_id,p_group_stage_id,'group_rank','B',1,p_playoff_stage_id,sf2,'a'),(p_group_id,p_tournament_id,p_division_id,p_group_stage_id,'group_rank','A',2,p_playoff_stage_id,sf2,'b'),(p_group_id,p_tournament_id,p_division_id,p_playoff_stage_id,'match_outcome',NULL,NULL,sf1,'winner',p_playoff_stage_id,final_id,'a'),(p_group_id,p_tournament_id,p_division_id,p_playoff_stage_id,'match_outcome',NULL,NULL,sf2,'winner',p_playoff_stage_id,final_id,'b');
  IF bronze_id IS NOT NULL THEN INSERT INTO public.tournament_stage_transitions(group_id,tournament_id,division_id,source_stage_id,source_kind,source_match_id,source_outcome,target_stage_id,target_match_id,target_slot) VALUES(p_group_id,p_tournament_id,p_division_id,p_playoff_stage_id,'match_outcome',sf1,'loser',p_playoff_stage_id,bronze_id,'a'),(p_group_id,p_tournament_id,p_division_id,p_playoff_stage_id,'match_outcome',sf2,'loser',p_playoff_stage_id,bronze_id,'b'); END IF;
  UPDATE public.tournament_divisions SET setup_revision=setup_revision+1,setup_updated_at=now() WHERE id=d.id AND group_id=p_group_id RETURNING setup_revision INTO d.setup_revision;
  result:=jsonb_build_object('success',true,'setup_revision',d.setup_revision,'group_stage_id',p_group_stage_id,'playoff_stage_id',p_playoff_stage_id,'matches',jsonb_build_object('SF1',sf1,'SF2',sf2,'F',final_id,'BRONZE',bronze_id),'bronze',coalesce(p_bronze,false)); INSERT INTO public.tournament_setup_mutations(group_id,operation,division_id,idempotency_key,payload_fingerprint,response) VALUES(p_group_id,'configure_top_two_group_playoff_revisioned',p_division_id,p_idempotency_key,fingerprint,result); RETURN result;
END;
$$;
COMMIT;
