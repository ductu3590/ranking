-- Atomic wrapper for unified setup finalization. Existing draw RPCs remain the single
-- stage writer; this wrapper makes all stage checkpoints one transaction.
CREATE OR REPLACE FUNCTION public.finalize_unified_setup_v2(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint,
  p_expected_revision integer,
  p_stage_plan jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  stage jsonb;
  stage_id bigint;
  result jsonb := '[]'::jsonb;
  current_revision integer;
BEGIN
  SELECT setup_revision INTO current_revision
  FROM tournament_divisions
  WHERE id = p_division_id AND group_id = p_group_id
    AND tournament_id = p_tournament_id
  FOR UPDATE;
  IF current_revision IS NULL THEN
    RAISE EXCEPTION 'DIVISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF current_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'REVISION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF jsonb_typeof(p_stage_plan) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'STAGE_PLAN_INVALID' USING ERRCODE = '22023';
  END IF;
  FOR stage IN SELECT value FROM jsonb_array_elements(p_stage_plan) LOOP
    stage_id := (stage->>'stage_id')::bigint;
    IF stage_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM tournament_stages
      WHERE id = stage_id AND group_id = p_group_id
        AND tournament_id = p_tournament_id AND division_id = p_division_id
    ) THEN
      RAISE EXCEPTION 'STAGE_PLAN_INVALID' USING ERRCODE = 'P0002';
    END IF;
    result := result || jsonb_build_array(jsonb_build_object(
      'stage_id', stage_id,
      'result', finalize_tournament_draw(
        p_group_id, stage_id, stage->'expected_config',
        COALESCE(stage->'matches', '[]'::jsonb),
        p_idempotency_key || ':' || stage_id::text
      )
    ));
  END LOOP;
  RETURN jsonb_build_object('success', true, 'revision', p_expected_revision + 1, 'stages', result);
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_unified_setup_v2(bigint,bigint,bigint,integer,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_unified_setup_v2(bigint,bigint,bigint,integer,jsonb,text) TO service_role;
