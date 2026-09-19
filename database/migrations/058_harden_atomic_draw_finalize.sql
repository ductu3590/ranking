-- Serialize draw finalization with all tournament_matches fixture writers.
-- Lock ordering deliberately matches 057: stage row first, then matches table.
-- This prevents finalize from validating an empty fixture set while a concurrent
-- writer inserts/updates fixtures for the same stage.
CREATE OR REPLACE FUNCTION public.finalize_tournament_draw(
  p_group_id bigint, p_stage_id bigint, p_expected_config jsonb,
  p_matches jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.tournament_stages%ROWTYPE;
  slot jsonb;
  slots jsonb;
  result jsonb;
  locked_draw jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO s FROM public.tournament_stages
  WHERE id = p_stage_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF s.config->'draw'->>'status' = 'locked'
    AND s.config->'draw'->>'finalize_key' = p_idempotency_key THEN
    RETURN s.config->'draw'->'finalize_result';
  END IF;
  IF s.config IS DISTINCT FROM p_expected_config
    OR s.config->'draw'->>'status' IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'DRAW_CONFLICT' USING ERRCODE = '40001';
  END IF;

  LOCK TABLE public.tournament_matches IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM public.tournament_matches
    WHERE group_id = p_group_id AND stage_id = p_stage_id
  ) THEN
    RAISE EXCEPTION 'DRAW_HAS_EXISTING_MATCHES' USING ERRCODE = '40001';
  END IF;

  slots := s.config->'draw'->'slots';
  IF jsonb_typeof(slots) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'DRAW_INVALID_SLOTS' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(slots) < 2 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(slots) x GROUP BY x->>'entry_id'
    HAVING count(*) > 1 OR x->>'entry_id' IS NULL
  ) THEN RAISE EXCEPTION 'DRAW_INVALID_SLOTS' USING ERRCODE = '22023'; END IF;

  IF s.division_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(slots) x WHERE NOT EXISTS (
      SELECT 1 FROM public.tournament_entries e WHERE e.id = (x->>'entry_id')::bigint
        AND e.group_id = p_group_id AND e.division_id = s.division_id
    )) OR jsonb_array_length(slots) <> (SELECT count(*) FROM public.tournament_entries
      WHERE group_id = p_group_id AND division_id = s.division_id) THEN
      RAISE EXCEPTION 'DRAW_MEMBERSHIP_CHANGED' USING ERRCODE = '40001';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(slots) x WHERE NOT EXISTS (
      SELECT 1 FROM public.tournament_entrants e WHERE e.id = (x->>'entry_id')::bigint
        AND e.group_id = p_group_id AND e.tournament_id = s.tournament_id
    )) THEN RAISE EXCEPTION 'DRAW_MEMBERSHIP_CHANGED' USING ERRCODE = '40001'; END IF;
  END IF;

  DELETE FROM public.tournament_stage_entrants
  WHERE group_id = p_group_id AND stage_id = p_stage_id;
  FOR slot IN SELECT value FROM jsonb_array_elements(slots) LOOP
    INSERT INTO public.tournament_stage_entrants(group_id, stage_id, division_id, entry_id, entrant_id, group_label, seed_in_stage)
    VALUES (p_group_id, p_stage_id, s.division_id,
      CASE WHEN s.division_id IS NOT NULL THEN (slot->>'entry_id')::bigint END,
      CASE WHEN s.division_id IS NULL THEN (slot->>'entry_id')::bigint END,
      slot->>'group_label', (slot->>'seed_in_stage')::integer);
  END LOOP;

  IF s.division_id IS NOT NULL THEN
    result := public.replace_tournament_entry_schedule(p_group_id, p_stage_id, p_matches, NULL);
  ELSE
    result := public.replace_tournament_schedule(p_group_id, p_stage_id, p_matches, NULL);
  END IF;
  locked_draw := (s.config->'draw') || jsonb_build_object(
    'status', 'locked', 'locked_at', now(), 'finalize_key', p_idempotency_key
  );
  result := result || jsonb_build_object('draw', locked_draw);
  UPDATE public.tournament_stages SET config = jsonb_set(s.config, '{draw}',
    locked_draw || jsonb_build_object('finalize_result', result))
  WHERE id = p_stage_id AND group_id = p_group_id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_tournament_draw(bigint,bigint,jsonb,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tournament_draw(bigint,bigint,jsonb,jsonb,text)
  TO service_role;