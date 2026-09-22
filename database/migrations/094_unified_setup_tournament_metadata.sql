-- Keep final-step tournament information with the aggregate draft while the
-- existing CAS/idempotency implementation remains the single writer.
BEGIN;

ALTER FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text)
  RENAME TO save_unified_setup_aggregate_draft_v1;

CREATE FUNCTION public.save_unified_setup_aggregate_draft(
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
  result jsonb;
  v_tournament_id bigint;
  v_division_id bigint;
  v_display_name text;
  v_event_date date;
  v_location text;
  v_description text;
  v_poster_url text;
  v_tournament jsonb;
BEGIN
  result := public.save_unified_setup_aggregate_draft_v1(
    p_group_id, p_tournament_id, p_division_id, p_client_draft_key,
    p_draft, p_expected_setup_revision, p_idempotency_key
  );

  v_tournament_id := (result->>'tournament_id')::bigint;
  v_division_id := (result->>'division_id')::bigint;
  v_display_name := NULLIF(btrim(p_draft->'tournament'->>'name'), '');
  v_event_date := NULLIF(p_draft->'tournament'->>'eventDate', '')::date;
  v_location := NULLIF(btrim(p_draft->'tournament'->>'location'), '');
  v_description := NULLIF(btrim(p_draft->'tournament'->>'description'), '');
  v_poster_url := NULLIF(btrim(p_draft->'tournament'->>'posterUrl'), '');

  IF v_display_name IS NOT NULL OR v_event_date IS NOT NULL OR v_location IS NOT NULL
     OR NULLIF(p_draft->'tournament'->>'startTime', '') IS NOT NULL
     OR v_description IS NOT NULL OR v_poster_url IS NOT NULL THEN
    UPDATE public.tournaments
    SET name = COALESCE(v_display_name, name),
        event_date = v_event_date,
        location = v_location,
        description = v_description,
        settings = settings || jsonb_build_object('poster_url', v_poster_url, 'start_time', COALESCE(p_draft->'tournament'->>'startTime', '')),
        updated_at = now()
    WHERE id = v_tournament_id AND group_id = p_group_id;
  END IF;

  -- Preserve presentation metadata in the snapshot without allowing arbitrary
  -- fields through the legacy aggregate validator.
  SELECT setup_draft->'tournament' INTO v_tournament
  FROM public.tournament_divisions
  WHERE id = v_division_id AND group_id = p_group_id
  FOR UPDATE;
  v_tournament := v_tournament || jsonb_build_object(
    'eventDate', COALESCE(p_draft->'tournament'->>'eventDate', ''),
    'startTime', COALESCE(p_draft->'tournament'->>'startTime', ''),
    'location', COALESCE(p_draft->'tournament'->>'location', ''),
    'description', COALESCE(p_draft->'tournament'->>'description', ''),
    'posterUrl', COALESCE(p_draft->'tournament'->>'posterUrl', '')
  );
  UPDATE public.tournament_divisions
  SET setup_draft = jsonb_set(setup_draft, '{tournament}', v_tournament, true)
  WHERE id = v_division_id AND group_id = p_group_id;

  result := result || jsonb_build_object(
    'draft', (SELECT setup_draft FROM public.tournament_divisions WHERE id = v_division_id AND group_id = p_group_id)
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) TO service_role;
COMMENT ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) IS 'Luu aggregate draft co CAS/idempotency va metadata cua buoc hoan tat.';
COMMIT;