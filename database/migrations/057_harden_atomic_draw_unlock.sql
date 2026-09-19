-- Harden unlock against concurrent score/status writes.  The stage row lock
-- serializes draw mutations; this table lock also serializes every fixture
-- insert/update/delete while unlock performs its played-fixture check/delete.
CREATE OR REPLACE FUNCTION public.unlock_tournament_draw(
  p_group_id bigint,
  p_stage_id bigint,
  p_expected_config jsonb,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.tournament_stages%ROWTYPE;
  replay jsonb;
  unlocked_draw jsonb;
  result jsonb;
  deleted_matches integer := 0;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:%s:%s', p_group_id, 'unlock_tournament_draw', p_idempotency_key), 0
  ));
  SELECT response INTO replay
  FROM public.pickhub_mutation_idempotency
  WHERE group_id = p_group_id
    AND operation = 'unlock_tournament_draw'
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF replay IS NOT NULL THEN
    IF (replay->>'stageId')::bigint IS DISTINCT FROM p_stage_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '40001';
    END IF;
    RETURN replay;
  END IF;

  SELECT * INTO s FROM public.tournament_stages
  WHERE id = p_stage_id AND group_id = p_group_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF s.config IS DISTINCT FROM p_expected_config THEN
    RAISE EXCEPTION 'DRAW_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF s.config->'draw'->>'status' IS DISTINCT FROM 'locked' THEN
    RAISE EXCEPTION 'DRAW_NOT_LOCKED' USING ERRCODE = '40001';
  END IF;

  LOCK TABLE public.tournament_matches IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM public.tournament_matches
    WHERE group_id = p_group_id
      AND stage_id = p_stage_id
      AND status IN ('warmup', 'live', 'paused', 'finalized')
  ) THEN
    RAISE EXCEPTION 'DRAW_HAS_PLAYED_MATCHES' USING ERRCODE = '40001';
  END IF;

  DELETE FROM public.tournament_matches
  WHERE group_id = p_group_id AND stage_id = p_stage_id;
  GET DIAGNOSTICS deleted_matches = ROW_COUNT;
  DELETE FROM public.tournament_stage_entrants
  WHERE group_id = p_group_id AND stage_id = p_stage_id;

  unlocked_draw := (s.config->'draw') || jsonb_build_object(
    'status', 'draft', 'locked_at', NULL, 'finalize_key', NULL,
    'finalize_result', NULL, 'unlocked_at', now()
  );
  UPDATE public.tournament_stages
  SET config = jsonb_set(s.config, '{draw}', unlocked_draw), status = 'pending'
  WHERE id = p_stage_id AND group_id = p_group_id;

  result := jsonb_build_object(
    'success', true, 'stageId', p_stage_id, 'draw', unlocked_draw,
    'deletedMatchCount', deleted_matches
  );
  INSERT INTO public.pickhub_mutation_idempotency (
    group_id, operation, idempotency_key, response, response_hash
  ) VALUES (
    p_group_id, 'unlock_tournament_draw', p_idempotency_key, result, md5(result::text)
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_tournament_draw(bigint,bigint,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_tournament_draw(bigint,bigint,jsonb,text,text) TO service_role;