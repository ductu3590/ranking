-- Phase 3 integrity: atomic entry/pair writes and independent club confirmation.
-- Forward-only and idempotent. Apply after 037.
BEGIN;

ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS club_confirmation_actor text,
  ADD COLUMN IF NOT EXISTS club_confirmation_version bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_club_confirmation
  ON public.tournament_registrations(group_id, tournament_club_id, club_confirmation_status, version);

CREATE OR REPLACE FUNCTION public.create_tournament_entry_atomic(
  p_group_id bigint,
  p_division_id bigint,
  p_tournament_club_id bigint,
  p_name_snapshot text,
  p_members jsonb DEFAULT '[]'::jsonb,
  p_source_registration_id bigint DEFAULT NULL,
  p_color_snapshot text DEFAULT NULL,
  p_seed integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.tournament_divisions%ROWTYPE; e public.tournament_entries%ROWTYPE;
  m jsonb; member_count integer := 0; result jsonb; cached jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':entry:' || p_idempotency_key, 0)); END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response INTO cached FROM public.pickhub_mutation_idempotency
      WHERE group_id=p_group_id AND operation='create_tournament_entry_atomic' AND idempotency_key=p_idempotency_key;
    IF FOUND THEN RETURN cached; END IF;
  END IF;
  IF COALESCE(jsonb_typeof(p_members),'') <> 'array' THEN RAISE EXCEPTION 'members must be an array' USING ERRCODE='22023'; END IF;
  SELECT * INTO d FROM public.tournament_divisions WHERE id=p_division_id AND group_id=p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'division not found' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournament_clubs WHERE id=p_tournament_club_id AND group_id=p_group_id AND tournament_id=d.tournament_id) THEN
    RAISE EXCEPTION 'tournament club not found' USING ERRCODE='P0002';
  END IF;
  INSERT INTO public.tournament_entries(group_id,division_id,tournament_club_id,source_registration_id,name_snapshot,color_snapshot,seed,status)
    VALUES(p_group_id,p_division_id,p_tournament_club_id,p_source_registration_id,btrim(p_name_snapshot),p_color_snapshot,p_seed,'approved') RETURNING * INTO e;
  FOR m IN SELECT value FROM jsonb_array_elements(p_members) LOOP
    IF btrim(COALESCE(m->>'display_name',''))='' THEN RAISE EXCEPTION 'member display_name is required' USING ERRCODE='22023'; END IF;
    INSERT INTO public.tournament_entry_members(group_id,entry_id,athlete_id,display_name_snapshot,club_name_snapshot,skill_snapshot,roster_role)
      VALUES(p_group_id,e.id,NULLIF(m->>'athlete_id','')::bigint,btrim(m->>'display_name'),NULLIF(m->>'club_name',''),NULLIF(m->>'phr_rating','')::numeric,COALESCE(NULLIF(m->>'roster_role',''),'player'));
    member_count := member_count + 1;
  END LOOP;
  result := jsonb_build_object('success',true,'entry',to_jsonb(e),'memberCount',member_count);
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.pickhub_mutation_idempotency(group_id,operation,idempotency_key,response,response_hash)
      VALUES(p_group_id,'create_tournament_entry_atomic',p_idempotency_key,result,md5(result::text));
  END IF;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_tournament_registration_club(
  p_group_id bigint, p_registration_id bigint, p_expected_version bigint, p_actor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.tournament_registrations%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO r FROM public.tournament_registrations WHERE id=p_registration_id AND group_id=p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration not found' USING ERRCODE='P0002'; END IF;
  IF p_expected_version IS NOT NULL AND r.version <> p_expected_version THEN RAISE EXCEPTION 'registration version conflict' USING ERRCODE='40001'; END IF;
  IF r.club_confirmation_status='confirmed' THEN RETURN jsonb_build_object('success',true,'registration',to_jsonb(r)); END IF;
  UPDATE public.tournament_registrations SET club_confirmation_status='confirmed', confirmed_at=now(), club_confirmation_actor=NULLIF(btrim(p_actor),''), club_confirmation_version=club_confirmation_version+1, updated_at=now(), version=version+1 WHERE id=r.id RETURNING * INTO r;
  result := jsonb_build_object('success',true,'registration',to_jsonb(r)); RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.create_tournament_pairs_atomic(
  p_group_id bigint, p_division_id bigint, p_pairs jsonb, p_pairing_mode text DEFAULT 'manual', p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.tournament_divisions%ROWTYPE; pair jsonb; mem jsonb; athlete public.tournament_athletes%ROWTYPE;
  pair_row public.tournament_pairs%ROWTYPE; entry_row public.tournament_entries%ROWTYPE; result jsonb; cached jsonb; pair_count integer:=0;
  ids bigint[]; name text; first_club bigint; pair_ids jsonb := '[]'::jsonb; entry_ids jsonb := '[]'::jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':pairs:' || p_idempotency_key, 0)); END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT response INTO cached FROM public.pickhub_mutation_idempotency WHERE group_id=p_group_id AND operation='create_tournament_pairs_atomic' AND idempotency_key=p_idempotency_key;
    IF FOUND THEN RETURN cached; END IF;
  END IF;
  IF COALESCE(jsonb_typeof(p_pairs),'') <> 'array' THEN RAISE EXCEPTION 'pairs must be an array' USING ERRCODE='22023'; END IF;
  IF p_pairing_mode NOT IN ('manual','random_balanced') THEN RAISE EXCEPTION 'invalid pairing mode' USING ERRCODE='22023'; END IF;
  SELECT * INTO d FROM public.tournament_divisions WHERE id=p_division_id AND group_id=p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'division not found' USING ERRCODE='P0002'; END IF;
  FOR pair IN SELECT value FROM jsonb_array_elements(p_pairs) LOOP
    IF jsonb_array_length(COALESCE(pair->'members','[]'::jsonb)) <> 2 THEN RAISE EXCEPTION 'each pair requires exactly two members' USING ERRCODE='22023'; END IF;
    ids := ARRAY[]::bigint[]; name := ''; first_club := NULL;
    FOR mem IN SELECT value FROM jsonb_array_elements(pair->'members') LOOP
      SELECT * INTO athlete FROM public.tournament_athletes WHERE id=(mem->>'tournament_athlete_id')::bigint AND group_id=p_group_id AND tournament_id=d.tournament_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'pair athlete not found in tournament' USING ERRCODE='23503'; END IF;
      IF (mem->>'tournament_athlete_id')::bigint = ANY(ids) THEN RAISE EXCEPTION 'duplicate athlete in pair' USING ERRCODE='23505'; END IF;
      ids := array_append(ids, athlete.id); name := concat_ws(' / ', name, COALESCE(athlete.display_name_snapshot, 'VĐV #'||athlete.id));
      IF first_club IS NULL THEN SELECT tournament_club_id INTO first_club FROM public.tournament_athletes WHERE id=athlete.id; END IF;
    END LOOP;
    INSERT INTO public.tournament_pairs(group_id,division_id,name_snapshot,pairing_mode,status) VALUES(p_group_id,p_division_id,name,p_pairing_mode,'confirmed') RETURNING * INTO pair_row;
    FOR mem IN SELECT value FROM jsonb_array_elements(pair->'members') LOOP
      INSERT INTO public.tournament_pair_members(group_id,pair_id,tournament_athlete_id,role) VALUES(p_group_id,pair_row.id,(mem->>'tournament_athlete_id')::bigint,COALESCE(NULLIF(mem->>'role',''),'player'));
    END LOOP;
    INSERT INTO public.tournament_entries(group_id,division_id,tournament_club_id,name_snapshot,status) VALUES(p_group_id,p_division_id,first_club,name,'approved') RETURNING * INTO entry_row;
    FOR mem IN SELECT value FROM jsonb_array_elements(pair->'members') LOOP
      SELECT * INTO athlete FROM public.tournament_athletes WHERE id=(mem->>'tournament_athlete_id')::bigint AND group_id=p_group_id;
      INSERT INTO public.tournament_entry_members(group_id,entry_id,athlete_id,display_name_snapshot,club_name_snapshot,skill_snapshot,roster_role)
        VALUES(p_group_id,entry_row.id,athlete.athlete_id,COALESCE(athlete.display_name_snapshot,'VĐV #'||athlete.id),athlete.club_name_snapshot,athlete.phr_rating,COALESCE(NULLIF(mem->>'role',''),'player'));
    END LOOP;
    pair_count := pair_count + 1;
    pair_ids := pair_ids || jsonb_build_array(pair_row.id);
    entry_ids := entry_ids || jsonb_build_array(entry_row.id);
  END LOOP;
  result := jsonb_build_object('success',true,'pairCount',pair_count,'pairIds',pair_ids,'entryIds',entry_ids);
  IF p_idempotency_key IS NOT NULL THEN INSERT INTO public.pickhub_mutation_idempotency(group_id,operation,idempotency_key,response,response_hash) VALUES(p_group_id,'create_tournament_pairs_atomic',p_idempotency_key,result,md5(result::text)); END IF;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.create_tournament_entry_atomic(bigint,bigint,bigint,text,jsonb,bigint,text,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_tournament_registration_club(bigint,bigint,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tournament_entry_atomic(bigint,bigint,bigint,text,jsonb,bigint,text,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_tournament_registration_club(bigint,bigint,bigint,text) TO service_role;
REVOKE ALL ON FUNCTION public.create_tournament_pairs_atomic(bigint,bigint,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tournament_pairs_atomic(bigint,bigint,jsonb,text,text) TO service_role;
COMMIT;
