-- Friendly club invites for unified setup finalize/save-draft.
-- Additive RPC-only migration: no table shape changes.

CREATE OR REPLACE FUNCTION public.replace_tournament_invited_clubs_revisioned(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint,
  p_invited_clubs jsonb,
  p_expected_setup_revision integer,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.tournament_divisions%ROWTYPE;
  cached public.tournament_setup_mutations%ROWTYPE;
  fingerprint text;
  item jsonb;
  item_source text;
  item_name text;
  item_club_id bigint;
  item_external_id bigint;
  result jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_invited_clubs, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  fingerprint := md5(jsonb_build_object(
    'group_id', p_group_id,
    'tournament_id', p_tournament_id,
    'division_id', p_division_id,
    'invited_clubs', COALESCE(p_invited_clubs, '[]'::jsonb),
    'expected_revision', p_expected_setup_revision
  )::text);

  SELECT * INTO cached
  FROM public.tournament_setup_mutations
  WHERE group_id = p_group_id
    AND operation = 'replace_tournament_invited_clubs_revisioned'
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF cached.payload_fingerprint <> fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'PH409';
    END IF;
    RETURN cached.response;
  END IF;

  SELECT * INTO d
  FROM public.tournament_divisions
  WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DIVISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF d.setup_revision IS DISTINCT FROM p_expected_setup_revision THEN
    RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = 'PH409';
  END IF;

  UPDATE public.tournament_clubs
  SET invitation_status = 'withdrawn', updated_at = now(), version = version + 1
  WHERE group_id = p_group_id
    AND tournament_id = p_tournament_id
    AND invitation_status = 'invited';

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_invited_clubs, '[]'::jsonb)) LOOP
    item_source := COALESCE(NULLIF(item->>'source', ''), CASE WHEN item ? 'clubId' THEN 'system' ELSE 'external' END);
    item_name := NULLIF(trim(COALESCE(item->>'name', item->>'clubName', item->>'externalClubName', '')), '');
    item_club_id := NULLIF(COALESCE(item->>'clubId', item->>'club_id'), '')::bigint;
    item_external_id := NULLIF(COALESCE(item->>'externalClubId', item->>'external_club_id'), '')::bigint;

    IF item_source = 'system' THEN
      IF item_club_id IS NULL THEN
        RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = item_club_id) THEN
        RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.tournament_clubs(group_id, tournament_id, club_id, invitation_status, invitation_note)
      VALUES (p_group_id, p_tournament_id, item_club_id, 'invited', NULLIF(item->>'note', ''))
      ON CONFLICT (tournament_id, club_id) WHERE club_id IS NOT NULL
      DO UPDATE SET invitation_status = 'invited', updated_at = now(), version = public.tournament_clubs.version + 1;
    ELSE
      IF item_external_id IS NULL THEN
        IF item_name IS NULL THEN
          RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.tournament_external_clubs(group_id, name, contact_name, contact_channel)
        VALUES (p_group_id, item_name, NULLIF(item->>'contactName', ''), NULLIF(item->>'contactChannel', ''))
        ON CONFLICT (group_id, name) DO UPDATE SET updated_at = now()
        RETURNING id INTO item_external_id;
      END IF;
      INSERT INTO public.tournament_clubs(group_id, tournament_id, external_club_id, invitation_status, invitation_note)
      VALUES (p_group_id, p_tournament_id, item_external_id, 'invited', NULLIF(item->>'note', ''))
      ON CONFLICT (tournament_id, external_club_id) WHERE external_club_id IS NOT NULL
      DO UPDATE SET invitation_status = 'invited', updated_at = now(), version = public.tournament_clubs.version + 1;
    END IF;
  END LOOP;

  UPDATE public.tournament_divisions
  SET setup_revision = setup_revision + 1, setup_updated_at = now()
  WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id
  RETURNING setup_revision INTO d.setup_revision;

  result := jsonb_build_object(
    'success', true,
    'setup_revision', d.setup_revision,
    'invited_clubs_count', jsonb_array_length(COALESCE(p_invited_clubs, '[]'::jsonb))
  );
  INSERT INTO public.tournament_setup_mutations(group_id, operation, division_id, idempotency_key, payload_fingerprint, response)
  VALUES (p_group_id, 'replace_tournament_invited_clubs_revisioned', p_division_id, p_idempotency_key, fingerprint, result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_tournament_invited_clubs_revisioned(bigint,bigint,bigint,jsonb,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_tournament_invited_clubs_revisioned(bigint,bigint,bigint,jsonb,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_unified_setup_v2(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint,
  p_expected_revision integer,
  p_stage_plan jsonb,
  p_idempotency_key text,
  p_invited_clubs jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  stage jsonb;
  stage_id bigint;
  result jsonb := '[]'::jsonb;
  current_revision integer;
  item jsonb;
  item_source text;
  item_name text;
  item_club_id bigint;
  item_external_id bigint;
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
  IF jsonb_typeof(COALESCE(p_invited_clubs, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_invited_clubs, '[]'::jsonb)) LOOP
    item_source := COALESCE(NULLIF(item->>'source', ''), CASE WHEN item ? 'clubId' THEN 'system' ELSE 'external' END);
    item_name := NULLIF(trim(COALESCE(item->>'name', item->>'clubName', item->>'externalClubName', '')), '');
    item_club_id := NULLIF(COALESCE(item->>'clubId', item->>'club_id'), '')::bigint;
    item_external_id := NULLIF(COALESCE(item->>'externalClubId', item->>'external_club_id'), '')::bigint;

    IF item_source = 'system' THEN
      IF item_club_id IS NULL THEN
        RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.tournament_clubs(group_id, tournament_id, club_id, invitation_status, invitation_note)
      VALUES (p_group_id, p_tournament_id, item_club_id, 'invited', NULLIF(item->>'note', ''))
      ON CONFLICT (tournament_id, club_id) WHERE club_id IS NOT NULL
      DO UPDATE SET invitation_status = 'invited', updated_at = now(), version = public.tournament_clubs.version + 1;
    ELSE
      IF item_external_id IS NULL THEN
        IF item_name IS NULL THEN
          RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.tournament_external_clubs(group_id, name, contact_name, contact_channel)
        VALUES (p_group_id, item_name, NULLIF(item->>'contactName', ''), NULLIF(item->>'contactChannel', ''))
        ON CONFLICT (group_id, name) DO UPDATE SET updated_at = now()
        RETURNING id INTO item_external_id;
      END IF;
      INSERT INTO public.tournament_clubs(group_id, tournament_id, external_club_id, invitation_status, invitation_note)
      VALUES (p_group_id, p_tournament_id, item_external_id, 'invited', NULLIF(item->>'note', ''))
      ON CONFLICT (tournament_id, external_club_id) WHERE external_club_id IS NOT NULL
      DO UPDATE SET invitation_status = 'invited', updated_at = now(), version = public.tournament_clubs.version + 1;
    END IF;
  END LOOP;

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
REVOKE ALL ON FUNCTION public.finalize_unified_setup_v2(bigint,bigint,bigint,integer,jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_unified_setup_v2(bigint,bigint,bigint,integer,jsonb,text,jsonb) TO service_role;
