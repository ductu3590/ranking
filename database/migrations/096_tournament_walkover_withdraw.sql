-- Atomic withdrawal: a mid-match withdrawal becomes a walkover. The minimal
-- BO score is retained for match/bracket completion, but standings excludes it
-- from game/point differentials by result_type.
BEGIN;

CREATE OR REPLACE FUNCTION public.withdraw_tournament_match_walkover(
  p_group_id bigint,
  p_match_id bigint,
  p_loser_entry_id bigint,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m public.tournament_matches%ROWTYPE;
  s public.tournament_stages%ROWTYPE;
  winner_id bigint;
  best_of integer;
  wins_needed integer;
  points_to integer;
  round_key text;
  round_override jsonb;
  games jsonb;
  result jsonb;
BEGIN
  IF p_group_id IS NULL OR p_match_id IS NULL OR p_loser_entry_id IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) = 0
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'WITHDRAW_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO m FROM public.tournament_matches
  WHERE id = p_match_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF m.status = 'finalized' THEN RAISE EXCEPTION 'MATCH_ALREADY_FINALIZED' USING ERRCODE = 'PH409'; END IF;
  IF p_loser_entry_id NOT IN (m.entry_a_id, m.entry_b_id) THEN
    RAISE EXCEPTION 'MATCH_ENTRY_INVALID' USING ERRCODE = '22023';
  END IF;
  winner_id := CASE WHEN m.entry_a_id = p_loser_entry_id THEN m.entry_b_id ELSE m.entry_a_id END;
  IF winner_id IS NULL THEN RAISE EXCEPTION 'MATCH_ENTRY_INVALID' USING ERRCODE = '22023'; END IF;

  SELECT * INTO s FROM public.tournament_stages
  WHERE id = m.stage_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  round_key := coalesce(m.round::text, '1');
  round_override := coalesce(s.config->'round_scoring'->round_key, '{}'::jsonb);
  best_of := coalesce(nullif(round_override->>'best_of', '')::integer, nullif(s.config->'scoring'->>'best_of', '')::integer, nullif(s.config->>'best_of', '')::integer, 3);
  IF best_of NOT IN (1, 3, 5) THEN RAISE EXCEPTION 'INVALID_BEST_OF' USING ERRCODE = '22023'; END IF;
  wins_needed := (best_of + 1) / 2;
  points_to := coalesce(nullif(round_override->>'points_to', '')::integer, nullif(s.config->'scoring'->>'points_to', '')::integer, nullif(s.config->>'points_to', '')::integer, 11);
  games := (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'game_no', n,
      'kind', 'game',
      'score_a', CASE WHEN m.entry_a_id = winner_id THEN points_to ELSE 0 END,
      'score_b', CASE WHEN m.entry_b_id = winner_id THEN points_to ELSE 0 END,
      'lineup', jsonb_build_object('walkover', true)
    ) ORDER BY n), '[]'::jsonb)
    FROM generate_series(1, wins_needed) AS n
  );

  -- The existing atomic result RPC deletes any in-progress games, stores the
  -- BO-minimum score, finalizes the match and routes its winner through the
  -- explicit playoff graph while every involved row is locked.
  result := public.replace_tournament_games_with_transitions(
    p_group_id, p_match_id, games, winner_id, 'finalized', NULL,
    m.version, p_idempotency_key
  );
  UPDATE public.tournament_matches
  SET result_type = 'walkover'
  WHERE id = p_match_id AND group_id = p_group_id;

  RETURN coalesce(result, '{}'::jsonb) || jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'winner_entry_id', winner_id,
    'loser_entry_id', p_loser_entry_id,
    'result_type', 'walkover',
    'best_of', best_of,
    'games', games
  );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_tournament_match_walkover(bigint,bigint,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_tournament_match_walkover(bigint,bigint,bigint,text,text) TO service_role;
COMMENT ON FUNCTION public.withdraw_tournament_match_walkover(bigint,bigint,bigint,text,text) IS 'Rút lui giữa trận: thay game dang do bằng W.O. BO tối thiểu, route winner atomically, standings bỏ hiệu số W.O.';
COMMIT;