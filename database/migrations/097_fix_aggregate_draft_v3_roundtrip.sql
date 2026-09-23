-- The deployed aggregate v1 normalizer predates memberIds/guests. Adapt the
-- input only while calling it, then restore the v3 aggregate snapshot so a
-- save/reload never turns participant selection into selectedMemberIds:null.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_unified_setup_aggregate_draft(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint,
  p_client_draft_key text,
  p_draft jsonb,
  p_expected_setup_revision bigint,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  compat_draft jsonb;
  restored_draft jsonb;
  result jsonb;
  v_division_id bigint;
BEGIN
  IF jsonb_typeof(p_draft) <> 'object'
    OR jsonb_typeof(p_draft->'participants'->'memberIds') <> 'array'
    OR jsonb_typeof(coalesce(p_draft->'participants'->'guests', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  -- The old atomic writer still owns CAS/idempotency. It receives its legacy
  -- field only as an in-transaction compatibility projection.
  compat_draft := jsonb_set(p_draft, '{participants,selectedMemberIds}', p_draft->'participants'->'memberIds', true);
  result := public.save_unified_setup_aggregate_draft_v1(
    p_group_id, p_tournament_id, p_division_id, p_client_draft_key,
    compat_draft, p_expected_setup_revision, p_idempotency_key
  );
  v_division_id := (result->>'division_id')::bigint;

  restored_draft := p_draft || jsonb_build_object(
    'tournamentId', result->>'tournament_id',
    'divisionId', result->>'division_id',
    'clientDraftKey', btrim(p_client_draft_key),
    'revision', result->>'setup_revision',
    'state', 'server_draft'
  );
  UPDATE public.tournament_divisions
  SET setup_draft = restored_draft
  WHERE id = v_division_id AND group_id = p_group_id;

  RETURN result || jsonb_build_object('draft', restored_draft);
END;
$$;

REVOKE ALL ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) TO service_role;
COMMENT ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) IS 'Aggregate v3 round-trip: preserve memberIds, guests, pairs and metadata after legacy CAS/idempotency writer.';
COMMIT;