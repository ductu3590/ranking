-- Finalize v3 keeps the v2 atomic materializer, but adapts the persisted
-- aggregate-v3 shape (memberIds, no reserves) and writes the canonical
-- per-stage round_scoring configuration created by preview.
BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_internal_doubles_group_knockout_v3(
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
  cached public.tournament_setup_mutations%ROWTYPE;
  original_draft jsonb;
  compat_draft jsonb;
  result jsonb;
  group_stage_id bigint;
  knockout_stage_id bigint;
  group_round_scoring jsonb;
  knockout_round_scoring jsonb;
  request_fingerprint text;
BEGIN
  IF p_group_id IS NULL OR p_tournament_id IS NULL OR p_division_id IS NULL
    OR p_expected_setup_revision IS NULL OR p_expected_setup_revision < 1
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
    OR p_preview_fingerprint IS NULL OR lower(p_preview_fingerprint) !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  request_fingerprint := md5(jsonb_build_object(
    'tournament_id', p_tournament_id, 'division_id', p_division_id,
    'expected_setup_revision', p_expected_setup_revision,
    'preview_fingerprint', lower(p_preview_fingerprint)
  )::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_group_id::text || ':internal-doubles-finalize:' || btrim(p_idempotency_key), 0
  ));
  SELECT * INTO cached FROM public.tournament_setup_mutations
  WHERE group_id = p_group_id
    AND operation = 'finalize_internal_doubles_group_knockout_v2'
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF cached.division_id <> p_division_id OR cached.payload_fingerprint <> request_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '22023';
    END IF;
    RETURN cached.response || jsonb_build_object('finalize_version', 'v3', 'idempotent_replay', true);
  END IF;

  SELECT * INTO d
  FROM public.tournament_divisions
  WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DIVISION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF d.setup_revision <> p_expected_setup_revision THEN
    RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = 'PH409';
  END IF;
  IF jsonb_typeof(d.setup_draft) <> 'object'
    OR jsonb_typeof(d.setup_draft->'participants'->'memberIds') <> 'array'
    OR jsonb_typeof(d.setup_draft->'pairs') <> 'array'
    OR jsonb_typeof(d.setup_draft->'draw') <> 'object' THEN
    RAISE EXCEPTION 'FINALIZE_DRAFT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF lower(coalesce(d.setup_draft->'draw'->>'previewFingerprint', '')) <> lower(p_preview_fingerprint) THEN
    RAISE EXCEPTION 'DRAW_FINGERPRINT_MISMATCH' USING ERRCODE = 'PH409';
  END IF;

  original_draft := d.setup_draft;
  -- v2 is the existing atomic writer. This compatibility projection lives only
  -- inside this transaction and is immediately restored after materialization.
  compat_draft := jsonb_set(original_draft, '{participants,selectedMemberIds}', original_draft->'participants'->'memberIds', true);
  compat_draft := jsonb_set(compat_draft, '{reserveMemberIds}', '[]'::jsonb, true);
  UPDATE public.tournament_divisions
  SET setup_draft = compat_draft
  WHERE id = d.id AND group_id = p_group_id;

  result := public.finalize_internal_doubles_group_knockout_v2(
    p_group_id, p_tournament_id, p_division_id, p_expected_setup_revision,
    p_idempotency_key, lower(p_preview_fingerprint)
  );

  group_stage_id := (result->>'group_stage_id')::bigint;
  knockout_stage_id := (result->>'knockout_stage_id')::bigint;
  group_round_scoring := coalesce(original_draft->'format'->'config'->'roundScoring'->'group', '{}'::jsonb);
  knockout_round_scoring := coalesce(original_draft->'format'->'config'->'roundScoring'->'knockout', '{}'::jsonb);
  IF jsonb_typeof(group_round_scoring) <> 'object' OR jsonb_typeof(knockout_round_scoring) <> 'object' THEN
    RAISE EXCEPTION 'ROUND_SCORING_INVALID' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_stages
  SET config = config || jsonb_build_object('round_scoring', group_round_scoring)
  WHERE id = group_stage_id AND group_id = p_group_id;
  UPDATE public.tournament_stages
  SET config = config || jsonb_build_object('round_scoring', knockout_round_scoring)
  WHERE id = knockout_stage_id AND group_id = p_group_id;

  -- Restore the aggregate-v3 projection and only add lifecycle facts owned by finalize.
  UPDATE public.tournament_divisions
  SET setup_draft = jsonb_set(
        jsonb_set(
          jsonb_set(original_draft, '{state}', '"finalized"'::jsonb, true),
          '{draw,status}', '"locked"'::jsonb, true
        ),
        '{finalizedAt}', to_jsonb(now()), true
      )
  WHERE id = d.id AND group_id = p_group_id;

  RETURN result || jsonb_build_object(
    'finalize_version', 'v3',
    'round_scoring', jsonb_build_object('group', group_round_scoring, 'knockout', knockout_round_scoring)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_internal_doubles_group_knockout_v3(bigint,bigint,bigint,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_internal_doubles_group_knockout_v3(bigint,bigint,bigint,bigint,text,text) TO service_role;
COMMENT ON FUNCTION public.finalize_internal_doubles_group_knockout_v3(bigint,bigint,bigint,bigint,text,text) IS 'Finalize aggregate setup v3: adapts memberIds, preserves aggregate snapshot, materializes v2 atomically, and persists stage round_scoring.';
COMMIT;