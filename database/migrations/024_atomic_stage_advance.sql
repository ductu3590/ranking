-- PickHub Phase 1: atomically finalize a stage and seed its successor.
-- The route computes standings in JavaScript; this server-only function owns
-- every related write and makes retries replay the original response.

CREATE OR REPLACE FUNCTION public.advance_tournament_stage(
  p_group_id bigint,
  p_stage_id bigint,
  p_next_stage_id bigint,
  p_seeded jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_stage public.tournament_stages%ROWTYPE;
  next_stage public.tournament_stages%ROWTYPE;
  replay jsonb;
  result jsonb;
  item jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(jsonb_typeof(p_seeded), '') <> 'array' THEN
    RAISE EXCEPTION 'seeded entrants must be an array' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    format('%s:%s:%s', p_group_id, 'advance_tournament_stage', p_idempotency_key), 0
  ));
  SELECT response INTO replay
  FROM public.pickhub_mutation_idempotency
  WHERE group_id = p_group_id
    AND operation = 'advance_tournament_stage'
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  SELECT * INTO current_stage
  FROM public.tournament_stages
  WHERE id = p_stage_id AND group_id = p_group_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current stage not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_next_stage_id IS NOT NULL THEN
    SELECT * INTO next_stage
    FROM public.tournament_stages
    WHERE id = p_next_stage_id AND group_id = p_group_id
    FOR UPDATE;
    IF NOT FOUND
       OR next_stage.tournament_id IS DISTINCT FROM current_stage.tournament_id
       OR next_stage.stage_order IS DISTINCT FROM current_stage.stage_order + 1 THEN
      RAISE EXCEPTION 'next stage does not belong to the current tournament' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_seeded) AS seeded(item)
    WHERE jsonb_typeof(item) <> 'object'
       OR COALESCE(item->>'entrant_id', '') !~ '^\d+$'
       OR (item ? 'seed_in_stage' AND COALESCE(item->>'seed_in_stage', '') !~ '^\d+$')
  ) THEN
    RAISE EXCEPTION 'invalid seeded entrant payload' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT item->>'entrant_id'
    FROM jsonb_array_elements(p_seeded) AS seeded(item)
    GROUP BY item->>'entrant_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate seeded entrant' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_seeded) AS seeded(item)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.tournament_entrants entrant
      WHERE entrant.id = (item->>'entrant_id')::bigint
        AND entrant.group_id = p_group_id
    )
  ) THEN
    RAISE EXCEPTION 'seeded entrant does not belong to group' USING ERRCODE = '23503';
  END IF;

  IF p_next_stage_id IS NULL THEN
    UPDATE public.tournament_stages
    SET status = 'completed'
    WHERE id = p_stage_id AND group_id = p_group_id;
    result := jsonb_build_object(
      'success', true,
      'final', true,
      'champion', p_seeded
    );
  ELSE
    DELETE FROM public.tournament_stage_entrants
    WHERE group_id = p_group_id AND stage_id = p_next_stage_id;

    FOR item IN SELECT value FROM jsonb_array_elements(p_seeded) LOOP
      INSERT INTO public.tournament_stage_entrants (
        group_id, stage_id, entrant_id, seed_in_stage
      ) VALUES (
        p_group_id,
        p_next_stage_id,
        (item->>'entrant_id')::bigint,
        COALESCE(NULLIF(item->>'seed_in_stage', '')::integer, 1)
      );
    END LOOP;

    UPDATE public.tournament_stages
    SET status = 'completed'
    WHERE id = p_stage_id AND group_id = p_group_id;
    UPDATE public.tournament_stages
    SET status = 'pending'
    WHERE id = p_next_stage_id AND group_id = p_group_id;

    result := jsonb_build_object(
      'success', true,
      'nextStageId', p_next_stage_id,
      'advanced', jsonb_array_length(p_seeded)
    );
  END IF;

  INSERT INTO public.pickhub_mutation_idempotency (
    group_id, operation, idempotency_key, response, response_hash
  ) VALUES (
    p_group_id, 'advance_tournament_stage', p_idempotency_key, result, md5(result::text)
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_tournament_stage(bigint, bigint, bigint, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_tournament_stage(bigint, bigint, bigint, jsonb, text)
  TO service_role;

COMMENT ON FUNCTION public.advance_tournament_stage IS
  'Atomic server-only stage finalization and next-stage seeding';
