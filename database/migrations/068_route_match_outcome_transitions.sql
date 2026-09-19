-- Finalize scores and explicit winner/loser playoff routing in one transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.replace_tournament_games_with_transitions(
  p_group_id bigint,
  p_match_id bigint,
  p_games jsonb,
  p_winner_entrant_id bigint DEFAULT NULL,
  p_status text DEFAULT 'live',
  p_parent_field text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  source_match public.tournament_matches%ROWTYPE;
  target_match public.tournament_matches%ROWTYPE;
  edge public.tournament_stage_transitions%ROWTYPE;
  base_result jsonb;
  winner_id bigint;
  loser_id bigint;
  routed jsonb := '[]'::jsonb;
  assigned_id bigint;
  changed boolean;
BEGIN
  -- The legacy RPC still owns game validation, source version CAS, and old parent routing.
  base_result := public.replace_tournament_games(
    p_group_id, p_match_id, p_games, p_winner_entrant_id, p_status,
    p_parent_field, p_expected_version, p_idempotency_key
  );
  IF p_status <> 'finalized' OR p_winner_entrant_id IS NULL THEN
    RETURN base_result || jsonb_build_object('transitions', jsonb_build_object('routed', 0, 'assignments', routed));
  END IF;

  SELECT * INTO source_match FROM public.tournament_matches
  WHERE id = p_match_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF source_match.division_id IS NULL THEN
    RETURN base_result || jsonb_build_object('transitions', jsonb_build_object('routed', 0, 'assignments', routed));
  END IF;
  IF source_match.entry_a_id IS NULL OR source_match.entry_b_id IS NULL
    OR p_winner_entrant_id NOT IN (source_match.entry_a_id, source_match.entry_b_id) THEN
    RAISE EXCEPTION 'MATCH_OUTCOME_UNRESOLVABLE' USING ERRCODE = '22023';
  END IF;
  winner_id := p_winner_entrant_id;
  loser_id := CASE WHEN winner_id = source_match.entry_a_id THEN source_match.entry_b_id ELSE source_match.entry_a_id END;

  FOR edge IN
    SELECT * FROM public.tournament_stage_transitions
    WHERE group_id = p_group_id
      AND source_kind = 'match_outcome'
      AND source_match_id = source_match.id
      AND source_stage_id = source_match.stage_id
      AND division_id IS NOT DISTINCT FROM source_match.division_id
    ORDER BY target_match_id, target_slot
    FOR UPDATE
  LOOP
    SELECT * INTO target_match FROM public.tournament_matches
    WHERE id = edge.target_match_id
      AND group_id = p_group_id
      AND stage_id = edge.target_stage_id
      AND division_id IS NOT DISTINCT FROM source_match.division_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PLAYOFF_TARGET_NOT_FOUND' USING ERRCODE = '23503'; END IF;
    assigned_id := CASE WHEN edge.source_outcome = 'winner' THEN winner_id ELSE loser_id END;
    changed := (edge.target_slot = 'a' AND target_match.entry_a_id IS NULL)
      OR (edge.target_slot = 'b' AND target_match.entry_b_id IS NULL);
    IF (edge.target_slot = 'a' AND target_match.entry_a_id IS NOT NULL AND target_match.entry_a_id <> assigned_id)
      OR (edge.target_slot = 'b' AND target_match.entry_b_id IS NOT NULL AND target_match.entry_b_id <> assigned_id)
      OR target_match.status NOT IN ('pending', 'warmup') THEN
      RAISE EXCEPTION 'PLAYOFF_TARGET_CONFLICT' USING ERRCODE = '40001';
    END IF;
    IF changed THEN
      UPDATE public.tournament_matches
      SET entry_a_id = CASE WHEN edge.target_slot = 'a' THEN assigned_id ELSE entry_a_id END,
          entry_b_id = CASE WHEN edge.target_slot = 'b' THEN assigned_id ELSE entry_b_id END,
          version = version + 1
      WHERE id = target_match.id AND group_id = p_group_id;
    END IF;
    routed := routed || jsonb_build_array(jsonb_build_object(
      'target_match_id', target_match.id, 'target_slot', edge.target_slot,
      'entry_id', assigned_id, 'outcome', edge.source_outcome
    ));
  END LOOP;
  RETURN base_result || jsonb_build_object('transitions', jsonb_build_object('routed', jsonb_array_length(routed), 'assignments', routed));
END;
$$;

REVOKE ALL ON FUNCTION public.replace_tournament_games_with_transitions(bigint,bigint,jsonb,bigint,text,text,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_tournament_games_with_transitions(bigint,bigint,jsonb,bigint,text,text,integer,text)
  TO service_role;
COMMENT ON FUNCTION public.replace_tournament_games_with_transitions
  IS 'Lưu điểm nguyên tử, giữ parent routing legacy và route winner/loser theo đồ thị playoff tường minh.';
COMMIT;
