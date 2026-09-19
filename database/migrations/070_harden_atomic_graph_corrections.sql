-- Harden correction payload validation and prevent duplicate legacy/graph routing.
BEGIN;

CREATE OR REPLACE FUNCTION public.apply_tournament_result_correction_graph_aware(
  p_group_id bigint, p_match_id bigint, p_games jsonb, p_winner_entrant_id bigint,
  p_expected_version integer, p_reason text, p_actor text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  source_match public.tournament_matches%ROWTYPE; source_stage public.tournament_stages%ROWTYPE;
  target_match public.tournament_matches%ROWTYPE; edge public.tournament_stage_transitions%ROWTYPE;
  cached public.tournament_result_correction_mutations%ROWTYPE; old_games jsonb; old_winner bigint; old_loser bigint;
  new_loser bigint; target_old_id bigint; target_new_id bigint; parent_slot text; correction_id bigint;
  fingerprint text; result jsonb; winner_changed boolean; has_graph_transitions boolean := false; final_standings_cleared boolean := false; final_standings_rows bigint := 0;
BEGIN
  IF p_expected_version IS NULL OR p_expected_version < 1 THEN RAISE EXCEPTION 'MATCH_VERSION_CONFLICT' USING ERRCODE = '40001'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 OR p_reason IS NULL OR length(btrim(p_reason)) = 0 OR p_actor IS NULL OR length(btrim(p_actor)) = 0 OR COALESCE(jsonb_typeof(p_games), '') <> 'array' THEN RAISE EXCEPTION 'CORRECTION_PAYLOAD_INVALID' USING ERRCODE = '22023'; END IF;
  fingerprint := md5(jsonb_build_object('match_id', p_match_id, 'games', p_games, 'winner', p_winner_entrant_id, 'expected_version', p_expected_version, 'reason', btrim(p_reason))::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':result-correction:' || p_idempotency_key, 0));
  SELECT * INTO cached FROM public.tournament_result_correction_mutations WHERE group_id = p_group_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN IF cached.match_id <> p_match_id OR cached.payload_fingerprint <> fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '22023'; END IF; RETURN cached.response; END IF;
  SELECT * INTO source_match FROM public.tournament_matches WHERE id = p_match_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF source_match.status <> 'finalized' THEN RAISE EXCEPTION 'MATCH_NOT_FINALIZED' USING ERRCODE = '40001'; END IF;
  IF source_match.version <> p_expected_version THEN RAISE EXCEPTION 'MATCH_VERSION_CONFLICT' USING ERRCODE = '40001'; END IF;
  IF p_winner_entrant_id IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_games) WITH ORDINALITY AS rows(item, ordinality) WHERE jsonb_typeof(item) <> 'object' OR COALESCE(NULLIF(item->>'game_no', '')::integer, ordinality::integer) < 1) OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_games) WITH ORDINALITY AS rows(item, ordinality) GROUP BY COALESCE(NULLIF(item->>'game_no', '')::integer, ordinality::integer) HAVING count(*) > 1) THEN RAISE EXCEPTION 'CORRECTION_PAYLOAD_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT * INTO source_stage FROM public.tournament_stages WHERE id = source_match.stage_id AND group_id = p_group_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  old_winner := COALESCE(source_match.winner_entry_id, source_match.winner_entrant_id);
  IF source_match.entry_a_id IS NOT NULL OR source_match.entry_b_id IS NOT NULL THEN
    IF p_winner_entrant_id NOT IN (source_match.entry_a_id, source_match.entry_b_id) THEN RAISE EXCEPTION 'MATCH_OUTCOME_UNRESOLVABLE' USING ERRCODE = '22023'; END IF;
    old_loser := CASE WHEN old_winner = source_match.entry_a_id THEN source_match.entry_b_id ELSE source_match.entry_a_id END; new_loser := CASE WHEN p_winner_entrant_id = source_match.entry_a_id THEN source_match.entry_b_id ELSE source_match.entry_a_id END;
  ELSE
    IF p_winner_entrant_id NOT IN (source_match.entrant_a_id, source_match.entrant_b_id) THEN RAISE EXCEPTION 'MATCH_OUTCOME_UNRESOLVABLE' USING ERRCODE = '22023'; END IF;
    old_loser := CASE WHEN old_winner = source_match.entrant_a_id THEN source_match.entrant_b_id ELSE source_match.entrant_a_id END; new_loser := CASE WHEN p_winner_entrant_id = source_match.entrant_a_id THEN source_match.entrant_b_id ELSE source_match.entrant_a_id END;
  END IF;
  winner_changed := old_winner IS DISTINCT FROM p_winner_entrant_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('game_no', game_no, 'kind', kind, 'score_a', score_a, 'score_b', score_b, 'lineup', lineup) ORDER BY game_no), '[]'::jsonb) INTO old_games FROM public.tournament_games WHERE group_id = p_group_id AND match_id = p_match_id;
  IF winner_changed THEN
    SELECT EXISTS(SELECT 1 FROM public.tournament_stage_transitions WHERE group_id = p_group_id AND source_kind = 'match_outcome' AND source_match_id = source_match.id AND source_stage_id = source_match.stage_id AND division_id IS NOT DISTINCT FROM source_match.division_id) INTO has_graph_transitions;
    FOR edge IN SELECT * FROM public.tournament_stage_transitions WHERE group_id = p_group_id AND source_kind = 'match_outcome' AND source_match_id = source_match.id AND source_stage_id = source_match.stage_id AND division_id IS NOT DISTINCT FROM source_match.division_id ORDER BY target_match_id, target_slot FOR UPDATE LOOP
      SELECT * INTO target_match FROM public.tournament_matches WHERE id = edge.target_match_id AND group_id = p_group_id FOR UPDATE;
      IF NOT FOUND OR target_match.status <> 'pending' THEN RAISE EXCEPTION 'CORRECTION_BLOCKED_DOWNSTREAM' USING ERRCODE = '40001'; END IF;
      target_old_id := CASE WHEN edge.source_outcome = 'winner' THEN old_winner ELSE old_loser END; target_new_id := CASE WHEN edge.source_outcome = 'winner' THEN p_winner_entrant_id ELSE new_loser END;
      IF (edge.target_slot = 'a' AND target_match.entry_a_id IS DISTINCT FROM target_old_id) OR (edge.target_slot = 'b' AND target_match.entry_b_id IS DISTINCT FROM target_old_id) THEN RAISE EXCEPTION 'PLAYOFF_TARGET_CONFLICT' USING ERRCODE = '40001'; END IF;
      UPDATE public.tournament_matches SET entry_a_id = CASE WHEN edge.target_slot = 'a' THEN target_new_id ELSE entry_a_id END, entry_b_id = CASE WHEN edge.target_slot = 'b' THEN target_new_id ELSE entry_b_id END, version = version + 1 WHERE id = target_match.id AND group_id = p_group_id;
    END LOOP;
    IF source_match.parent_match_id IS NOT NULL AND NOT has_graph_transitions THEN
      SELECT * INTO target_match FROM public.tournament_matches WHERE id = source_match.parent_match_id AND group_id = p_group_id FOR UPDATE;
      IF NOT FOUND OR target_match.status <> 'pending' THEN RAISE EXCEPTION 'CORRECTION_BLOCKED_DOWNSTREAM' USING ERRCODE = '40001'; END IF;
      parent_slot := CASE WHEN COALESCE(source_match.bracket_slot, 0) % 2 = 0 THEN 'a' ELSE 'b' END; target_old_id := old_winner;
      IF (parent_slot = 'a' AND COALESCE(target_match.entry_a_id, target_match.entrant_a_id) IS DISTINCT FROM target_old_id) OR (parent_slot = 'b' AND COALESCE(target_match.entry_b_id, target_match.entrant_b_id) IS DISTINCT FROM target_old_id) THEN RAISE EXCEPTION 'PLAYOFF_TARGET_CONFLICT' USING ERRCODE = '40001'; END IF;
      IF source_match.entry_a_id IS NOT NULL OR source_match.entry_b_id IS NOT NULL THEN UPDATE public.tournament_matches SET entry_a_id = CASE WHEN parent_slot = 'a' THEN p_winner_entrant_id ELSE entry_a_id END, entry_b_id = CASE WHEN parent_slot = 'b' THEN p_winner_entrant_id ELSE entry_b_id END, version = version + 1 WHERE id = target_match.id AND group_id = p_group_id; ELSE UPDATE public.tournament_matches SET entrant_a_id = CASE WHEN parent_slot = 'a' THEN p_winner_entrant_id ELSE entrant_a_id END, entrant_b_id = CASE WHEN parent_slot = 'b' THEN p_winner_entrant_id ELSE entrant_b_id END, version = version + 1 WHERE id = target_match.id AND group_id = p_group_id; END IF;
    END IF;
  END IF;
  DELETE FROM public.tournament_games WHERE group_id = p_group_id AND match_id = p_match_id;
  INSERT INTO public.tournament_games(group_id, match_id, game_no, kind, score_a, score_b, lineup) SELECT p_group_id, p_match_id, COALESCE(NULLIF(item->>'game_no', '')::integer, ordinality::integer), COALESCE(item->>'kind', 'game'), COALESCE(NULLIF(item->>'score_a', '')::integer, 0), COALESCE(NULLIF(item->>'score_b', '')::integer, 0), CASE WHEN jsonb_typeof(item->'lineup') = 'object' THEN item->'lineup' ELSE '{}'::jsonb END FROM jsonb_array_elements(p_games) WITH ORDINALITY AS rows(item, ordinality);
  UPDATE public.tournament_matches SET winner_entry_id = CASE WHEN source_match.entry_a_id IS NOT NULL OR source_match.entry_b_id IS NOT NULL THEN p_winner_entrant_id ELSE NULL END, winner_entrant_id = CASE WHEN source_match.entry_a_id IS NULL AND source_match.entry_b_id IS NULL THEN p_winner_entrant_id ELSE NULL END, version = version + 1 WHERE id = source_match.id AND group_id = p_group_id;
  INSERT INTO public.tournament_result_corrections(group_id, tournament_id, division_id, match_id, before_payload, after_payload, reason, requester, approver, status, approved_at, applied_at) VALUES (p_group_id, source_stage.tournament_id, source_stage.division_id, p_match_id, jsonb_build_object('games', old_games, 'winner', old_winner), jsonb_build_object('games', p_games, 'winner', p_winner_entrant_id), btrim(p_reason), p_actor, p_actor, 'applied', now(), now()) RETURNING id INTO correction_id;
  UPDATE public.tournament_divisions d SET final_standings = NULL WHERE d.id = source_stage.division_id AND d.group_id = p_group_id AND EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = source_stage.tournament_id AND t.group_id = p_group_id AND t.status = 'completed');
  GET DIAGNOSTICS final_standings_rows = ROW_COUNT;
  final_standings_cleared := final_standings_rows > 0;
  result := jsonb_build_object('success', true, 'match_id', p_match_id, 'correction_id', correction_id, 'winner_changed', winner_changed, 'winner_entrant_id', p_winner_entrant_id, 'version', source_match.version + 1, 'final_standings_cleared', final_standings_cleared);
  INSERT INTO public.tournament_result_correction_mutations(group_id, match_id, correction_id, idempotency_key, payload_fingerprint, response) VALUES (p_group_id, p_match_id, correction_id, p_idempotency_key, fingerprint, result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_tournament_result_correction_graph_aware(bigint,bigint,jsonb,bigint,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tournament_result_correction_graph_aware(bigint,bigint,jsonb,bigint,integer,text,text,text) TO service_role;
COMMIT;
