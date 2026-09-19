-- Duplicate-safe tournament identity + division participant replacement.
-- Forward-only, additive. Existing rows keep NULL client_ref / client_draft_key
-- and therefore keep their current behaviour.
BEGIN;

ALTER TABLE public.tournament_athletes
  ADD COLUMN IF NOT EXISTS client_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_athletes_client_ref
  ON public.tournament_athletes(group_id, tournament_id, client_ref)
  WHERE client_ref IS NOT NULL;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS client_draft_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_client_draft_key
  ON public.tournaments(group_id, client_draft_key)
  WHERE client_draft_key IS NOT NULL;

-- Thay toan bo danh sach VDV cua mot noi dung trong mot transaction.
-- client_ref la khoa chong trung duy nhat cho danh tinh khach (athlete_id NULL).
CREATE OR REPLACE FUNCTION public.replace_division_participants_revisioned(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint,
  p_tournament_club_id bigint,
  p_participants jsonb,
  p_expected_setup_revision bigint,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.tournament_divisions%ROWTYPE;
  cached public.tournament_setup_mutations%ROWTYPE;
  fingerprint text;
  item jsonb;
  v_client_ref text;
  v_display_name text;
  v_athlete_id bigint;
  v_source text;
  v_phr numeric;
  v_existing_id bigint;
  v_row_id bigint;
  v_created boolean;
  athlete_ids bigint[] := ARRAY[]::bigint[];
  athletes_report jsonb := '[]'::jsonb;
  result jsonb;
BEGIN
  -- 0. Payload contract. Every rejection here happens before any write.
  IF p_expected_setup_revision IS NULL OR p_expected_setup_revision < 1 THEN
    RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_participants) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_participants) < 1
    OR jsonb_array_length(p_participants) > 128 THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_participants) x
    WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
      OR btrim(COALESCE(x->>'client_ref', '')) = ''
      OR length(btrim(x->>'client_ref')) > 200
      OR btrim(COALESCE(x->>'display_name', '')) = ''
      OR COALESCE(x->>'source', '') NOT IN ('club_member', 'guest')
      OR (x->>'source' = 'club_member' AND NULLIF(btrim(COALESCE(x->>'athlete_id', '')), '') IS NULL)
      OR (x->>'source' = 'guest' AND NULLIF(btrim(COALESCE(x->>'athlete_id', '')), '') IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT btrim(x->>'client_ref')) FROM jsonb_array_elements(p_participants) x)
    <> jsonb_array_length(p_participants) THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  -- Hai client_ref khac nhau khong duoc tro ve cung mot athlete toan cuc:
  -- (tournament_id, athlete_id) la UNIQUE nen do se la mot phep gop danh tinh ngam.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_participants) x
    WHERE NULLIF(btrim(COALESCE(x->>'athlete_id', '')), '') IS NOT NULL
    GROUP BY (x->>'athlete_id')::bigint HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  -- 1. Replay cache: same key + same fingerprint + same scope replays unchanged.
  fingerprint := md5(jsonb_build_object(
    'division_id', p_division_id,
    'tournament_club_id', p_tournament_club_id,
    'participants', p_participants
  )::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':division-participants:' || p_idempotency_key, 0));
  SELECT * INTO cached FROM public.tournament_setup_mutations
  WHERE group_id = p_group_id
    AND operation = 'replace_division_participants_revisioned'
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF cached.division_id <> p_division_id OR cached.payload_fingerprint <> fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '22023';
    END IF;
    RETURN cached.response;
  END IF;

  -- 2. CAS + lock guard on the division, inside the tenant scope.
  SELECT * INTO d FROM public.tournament_divisions
  WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'division not found in tournament scope' USING ERRCODE = 'P0002';
  END IF;
  IF d.setup_revision <> p_expected_setup_revision THEN
    RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF d.roster_lock_status <> 'open' THEN
    RAISE EXCEPTION 'ROSTER_LOCKED' USING ERRCODE = '40001';
  END IF;

  -- 3. Parent chain: the hosting club and every referenced global athlete.
  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_clubs c
    WHERE c.id = p_tournament_club_id AND c.group_id = p_group_id AND c.tournament_id = p_tournament_id
  ) THEN
    RAISE EXCEPTION 'SETUP_SCOPE_MISMATCH' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_participants) x
    WHERE NULLIF(btrim(COALESCE(x->>'athlete_id', '')), '') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = (x->>'athlete_id')::bigint)
  ) THEN
    RAISE EXCEPTION 'SETUP_SCOPE_MISMATCH' USING ERRCODE = '23503';
  END IF;

  -- 4. Upsert identities keyed on client_ref; club-linked rows reconcile with
  --    the pre-existing (tournament_id, athlete_id) unique key instead of failing.
  FOR item IN SELECT value FROM jsonb_array_elements(p_participants) LOOP
    v_client_ref := btrim(item->>'client_ref');
    v_display_name := btrim(item->>'display_name');
    v_athlete_id := NULLIF(btrim(COALESCE(item->>'athlete_id', '')), '')::bigint;
    v_source := item->>'source';
    v_phr := NULLIF(btrim(COALESCE(item->>'phr_rating', '')), '')::numeric;
    v_created := false;

    v_existing_id := NULL;
    SELECT a.id INTO v_existing_id FROM public.tournament_athletes a
    WHERE a.group_id = p_group_id AND a.tournament_id = p_tournament_id AND a.client_ref = v_client_ref
    FOR UPDATE;
    IF v_existing_id IS NULL AND v_athlete_id IS NOT NULL THEN
      SELECT a.id INTO v_existing_id FROM public.tournament_athletes a
      WHERE a.group_id = p_group_id AND a.tournament_id = p_tournament_id AND a.athlete_id = v_athlete_id
      FOR UPDATE;
    END IF;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.tournament_athletes SET
        client_ref = v_client_ref,
        display_name_snapshot = v_display_name,
        athlete_id = v_athlete_id,
        source = v_source,
        tournament_club_id = p_tournament_club_id,
        phr_rating = CASE WHEN item ? 'phr_rating' THEN v_phr ELSE phr_rating END
      WHERE id = v_existing_id AND group_id = p_group_id
      RETURNING id INTO v_row_id;
    ELSE
      INSERT INTO public.tournament_athletes(
        group_id, tournament_id, tournament_club_id, athlete_id,
        display_name_snapshot, phr_rating, source, client_ref
      ) VALUES (
        p_group_id, p_tournament_id, p_tournament_club_id, v_athlete_id,
        v_display_name, v_phr, v_source, v_client_ref
      ) RETURNING id INTO v_row_id;
      v_created := true;
    END IF;

    IF v_row_id = ANY(athlete_ids) THEN
      RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
    END IF;
    athlete_ids := array_append(athlete_ids, v_row_id);
    athletes_report := athletes_report || jsonb_build_array(jsonb_build_object(
      'client_ref', v_client_ref,
      'tournament_athlete_id', v_row_id,
      'created', v_created
    ));
  END LOOP;

  -- 5. Roster becomes exactly the resulting athlete set. Removing a member that
  --    is still inside an active pair is refused before anything is deleted.
  IF EXISTS (
    SELECT 1
    FROM public.tournament_division_roster_members r
    JOIN public.tournament_pair_members pm
      ON pm.group_id = p_group_id AND pm.tournament_athlete_id = r.tournament_athlete_id
    JOIN public.tournament_pairs p
      ON p.id = pm.pair_id AND p.group_id = p_group_id AND p.division_id = p_division_id
     AND p.status IN ('confirmed', 'locked')
    WHERE r.group_id = p_group_id AND r.division_id = p_division_id
      AND NOT (r.tournament_athlete_id = ANY(athlete_ids))
  ) THEN
    RAISE EXCEPTION 'ROSTER_MEMBER_IN_ACTIVE_PAIR' USING ERRCODE = '40001';
  END IF;

  DELETE FROM public.tournament_division_roster_members
  WHERE group_id = p_group_id
    AND division_id = p_division_id
    AND NOT (tournament_athlete_id = ANY(athlete_ids));
  INSERT INTO public.tournament_division_roster_members(group_id, division_id, tournament_athlete_id)
  SELECT p_group_id, p_division_id, id FROM unnest(athlete_ids) id
  ON CONFLICT (group_id, division_id, tournament_athlete_id) DO NOTHING;

  -- 6. Exactly one revision bump per successful mutation.
  UPDATE public.tournament_divisions
  SET setup_revision = setup_revision + 1, setup_updated_at = now()
  WHERE id = d.id AND group_id = p_group_id
  RETURNING setup_revision INTO d.setup_revision;

  -- 7. Cache the response so a retry with the same key replays it unchanged.
  result := jsonb_build_object(
    'success', true,
    'setup_revision', d.setup_revision,
    'athletes', athletes_report,
    'roster_count', COALESCE(array_length(athlete_ids, 1), 0)
  );
  INSERT INTO public.tournament_setup_mutations(
    group_id, operation, division_id, idempotency_key, payload_fingerprint, response
  ) VALUES (
    p_group_id, 'replace_division_participants_revisioned', p_division_id,
    p_idempotency_key, fingerprint, result
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_division_participants_revisioned(bigint,bigint,bigint,bigint,jsonb,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_division_participants_revisioned(bigint,bigint,bigint,bigint,jsonb,bigint,text)
  TO service_role;

COMMENT ON COLUMN public.tournament_athletes.client_ref
  IS 'Token on dinh do client sinh cho mot dong trong ban nhap; chong trung khi thu lai, khong phai danh tinh nguoi.';
COMMENT ON COLUMN public.tournaments.client_draft_key
  IS 'Token on dinh do client sinh cho mot ban nhap giai; chong tao trung khi thu lai.';
COMMENT ON FUNCTION public.replace_division_participants_revisioned(bigint,bigint,bigint,bigint,jsonb,bigint,text)
  IS 'Thay toan bo danh sach VDV cua noi dung: upsert theo client_ref, dong bo roster, tang setup_revision dung mot lan.';

COMMIT;
