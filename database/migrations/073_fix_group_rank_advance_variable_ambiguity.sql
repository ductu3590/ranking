-- Resolve PL/pgSQL entry_id ambiguity in explicit group-rank advancement.
BEGIN;
CREATE OR REPLACE FUNCTION public.advance_division_group_rank_transitions(
  p_group_id bigint, p_stage_id bigint, p_ranked jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.tournament_stages%ROWTYPE; cached public.tournament_stage_advance_mutations%ROWTYPE; fingerprint text; edge public.tournament_stage_transitions%ROWTYPE; ranked jsonb; target public.tournament_matches%ROWTYPE; v_entry_id bigint; result jsonb; assignments integer:=0;
BEGIN
 IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_ranked) IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_ranked) x WHERE coalesce(x->>'entry_id','') !~ '^\d+$' OR nullif(x->>'group_label','') IS NULL OR coalesce(x->>'rank','') !~ '^\d+$') THEN RAISE EXCEPTION 'INVALID_GROUP_RANKINGS' USING ERRCODE='22023'; END IF;
 fingerprint:=md5(jsonb_build_object('stage_id',p_stage_id,'ranked',p_ranked)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text||':group-rank-advance:'||p_idempotency_key,0));
 SELECT * INTO cached FROM public.tournament_stage_advance_mutations WHERE group_id=p_group_id AND operation='advance_division_group_rank_transitions' AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF FOUND THEN IF cached.stage_id<>p_stage_id OR cached.payload_fingerprint<>fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023'; END IF; RETURN cached.response; END IF;
 SELECT * INTO s FROM public.tournament_stages WHERE id=p_stage_id AND group_id=p_group_id FOR UPDATE;
 IF NOT FOUND OR s.division_id IS NULL THEN RAISE EXCEPTION 'DIVISION_GROUP_STAGE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM public.tournament_matches m WHERE m.group_id=p_group_id AND m.stage_id=p_stage_id AND m.status NOT IN ('finalized','done')) THEN RAISE EXCEPTION 'STAGE_NOT_COMPLETE' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tournament_stage_transitions t WHERE t.group_id=p_group_id AND t.source_stage_id=p_stage_id AND t.source_kind='group_rank') THEN RAISE EXCEPTION 'GROUP_TRANSITION_PLAN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 FOR edge IN SELECT * FROM public.tournament_stage_transitions WHERE group_id=p_group_id AND source_stage_id=p_stage_id AND source_kind='group_rank' ORDER BY target_match_id,target_slot FOR UPDATE LOOP
  SELECT value INTO ranked FROM jsonb_array_elements(p_ranked) WHERE value->>'group_label'=edge.source_group_label AND (value->>'rank')::integer=edge.source_rank;
  IF ranked IS NULL THEN RAISE EXCEPTION 'GROUP_RANKING_MISSING' USING ERRCODE='22023'; END IF;
  v_entry_id:=(ranked->>'entry_id')::bigint;
  IF NOT EXISTS(SELECT 1 FROM public.tournament_entries e WHERE e.id=v_entry_id AND e.group_id=p_group_id AND e.division_id=s.division_id AND e.status='approved') THEN RAISE EXCEPTION 'GROUP_RANK_ENTRY_SCOPE_MISMATCH' USING ERRCODE='23503'; END IF;
  SELECT * INTO target FROM public.tournament_matches WHERE id=edge.target_match_id FOR UPDATE;
  IF (edge.target_slot='a' AND target.entry_a_id IS NOT NULL AND target.entry_a_id<>v_entry_id) OR (edge.target_slot='b' AND target.entry_b_id IS NOT NULL AND target.entry_b_id<>v_entry_id) THEN RAISE EXCEPTION 'PLAYOFF_TARGET_CONFLICT' USING ERRCODE='40001'; END IF;
  UPDATE public.tournament_matches SET entry_a_id=CASE WHEN edge.target_slot='a' THEN v_entry_id ELSE entry_a_id END,entry_b_id=CASE WHEN edge.target_slot='b' THEN v_entry_id ELSE entry_b_id END,version=version+1 WHERE id=target.id AND group_id=p_group_id;
  INSERT INTO public.tournament_stage_entrants(group_id,stage_id,division_id,entry_id,seed_in_stage) VALUES(p_group_id,edge.target_stage_id,s.division_id,v_entry_id,CASE WHEN edge.target_slot='a' THEN 1 ELSE 2 END) ON CONFLICT (group_id,stage_id,entry_id) WHERE entry_id IS NOT NULL DO NOTHING;
  assignments:=assignments+1;
 END LOOP;
 UPDATE public.tournament_stages SET status='completed' WHERE id=s.id AND group_id=p_group_id;
 UPDATE public.tournament_stages p SET status='pending' WHERE p.group_id=p_group_id AND EXISTS(SELECT 1 FROM public.tournament_stage_transitions t WHERE t.target_stage_id=p.id AND t.source_stage_id=s.id);
 result:=jsonb_build_object('success',true,'advanced',assignments,'transitioned',true);
 INSERT INTO public.tournament_stage_advance_mutations(group_id,operation,stage_id,next_stage_id,idempotency_key,payload_fingerprint,response) VALUES(p_group_id,'advance_division_group_rank_transitions',p_stage_id,NULL,p_idempotency_key,fingerprint,result);
 RETURN result;
END;$$;
REVOKE ALL ON FUNCTION public.advance_division_group_rank_transitions(bigint,bigint,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_division_group_rank_transitions(bigint,bigint,jsonb,text) TO service_role;
COMMIT;
