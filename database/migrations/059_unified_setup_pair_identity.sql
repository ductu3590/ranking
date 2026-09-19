-- Persistent, stable pair identity for division entries.
-- Forward-only: existing pairs and entries remain valid and are not backfilled.
BEGIN;

ALTER TABLE public.tournament_entries
  ADD COLUMN IF NOT EXISTS pair_id bigint;

ALTER TABLE public.tournament_entries
  DROP CONSTRAINT IF EXISTS tournament_entries_pair_id_fk,
  ADD CONSTRAINT tournament_entries_pair_id_fk
    FOREIGN KEY (pair_id) REFERENCES public.tournament_pairs(id) ON DELETE SET NULL
    NOT VALID;

CREATE INDEX IF NOT EXISTS idx_tournament_entries_group_division_pair
  ON public.tournament_entries(group_id, division_id, pair_id)
  WHERE pair_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_entries_pair_identity
  ON public.tournament_entries(pair_id)
  WHERE pair_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_tournament_entry_pair_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pair_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tournament_pairs p
    WHERE p.id = NEW.pair_id
      AND p.group_id = NEW.group_id
      AND p.division_id = NEW.division_id
  ) THEN
    RAISE EXCEPTION 'PAIR_ENTRY_SCOPE_MISMATCH' USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournament_entries_pair_identity_trg ON public.tournament_entries;
CREATE TRIGGER tournament_entries_pair_identity_trg
  BEFORE INSERT OR UPDATE OF group_id, division_id, pair_id ON public.tournament_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tournament_entry_pair_identity();

CREATE OR REPLACE FUNCTION public.enforce_tournament_pair_member_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pair_group_id bigint;
  pair_division_id bigint;
  division_tournament_id bigint;
BEGIN
  SELECT p.group_id, p.division_id, d.tournament_id
    INTO pair_group_id, pair_division_id, division_tournament_id
  FROM public.tournament_pairs p
  JOIN public.tournament_divisions d ON d.id = p.division_id AND d.group_id = p.group_id
  WHERE p.id = NEW.pair_id;

  IF NOT FOUND OR pair_group_id <> NEW.group_id THEN
    RAISE EXCEPTION 'PAIR_MEMBER_SCOPE_MISMATCH' USING ERRCODE = '23503';
  END IF;

  -- Serialize the cross-pair check because it cannot be represented by one index.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    pair_group_id::text || ':pair-member:' || pair_division_id::text || ':' || NEW.tournament_athlete_id::text,
    0
  ));

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_athletes a
    WHERE a.id = NEW.tournament_athlete_id
      AND a.group_id = pair_group_id
      AND a.tournament_id = division_tournament_id
  ) THEN
    RAISE EXCEPTION 'PAIR_ATHLETE_SCOPE_MISMATCH' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tournament_pair_members other_member
    JOIN public.tournament_pairs other_pair ON other_pair.id = other_member.pair_id
    WHERE other_member.tournament_athlete_id = NEW.tournament_athlete_id
      AND other_pair.group_id = pair_group_id
      AND other_pair.division_id = pair_division_id
      AND other_member.pair_id <> NEW.pair_id
  ) THEN
    RAISE EXCEPTION 'ATHLETE_ALREADY_PAIRED_IN_DIVISION' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournament_pair_members_identity_trg ON public.tournament_pair_members;
CREATE TRIGGER tournament_pair_members_identity_trg
  BEFORE INSERT OR UPDATE OF group_id, pair_id, tournament_athlete_id ON public.tournament_pair_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tournament_pair_member_identity();

CREATE OR REPLACE FUNCTION public.enforce_tournament_pair_division_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  division_tournament_id bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_divisions d
    WHERE d.id = NEW.division_id AND d.group_id = NEW.group_id
  ) THEN
    RAISE EXCEPTION 'PAIR_DIVISION_SCOPE_MISMATCH' USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.group_id, NEW.division_id) IS DISTINCT FROM (OLD.group_id, OLD.division_id) THEN
    IF EXISTS (
      SELECT 1 FROM public.tournament_entries e
      WHERE e.pair_id = NEW.id
        AND (e.group_id, e.division_id) IS DISTINCT FROM (NEW.group_id, NEW.division_id)
    ) THEN
      RAISE EXCEPTION 'PAIR_ENTRY_SCOPE_MISMATCH' USING ERRCODE = '23503';
    END IF;

    SELECT tournament_id INTO division_tournament_id
    FROM public.tournament_divisions
    WHERE id = NEW.division_id AND group_id = NEW.group_id;

    IF EXISTS (
      SELECT 1
      FROM public.tournament_pair_members pm
      JOIN public.tournament_athletes a ON a.id = pm.tournament_athlete_id
      WHERE pm.pair_id = NEW.id
        AND (pm.group_id <> NEW.group_id OR a.group_id <> NEW.group_id OR a.tournament_id <> division_tournament_id)
    ) THEN
      RAISE EXCEPTION 'PAIR_MEMBER_SCOPE_MISMATCH' USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournament_pairs_division_identity_trg ON public.tournament_pairs;
CREATE TRIGGER tournament_pairs_division_identity_trg
  BEFORE INSERT OR UPDATE OF group_id, division_id ON public.tournament_pairs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tournament_pair_division_identity();

-- These SECURITY DEFINER helpers are invoked only by table triggers.
REVOKE ALL ON FUNCTION public.enforce_tournament_entry_pair_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_tournament_pair_member_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_tournament_pair_division_identity() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_tournament_pairs_atomic(
  p_group_id bigint, p_division_id bigint, p_pairs jsonb, p_pairing_mode text DEFAULT 'manual', p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.tournament_divisions%ROWTYPE;
  pair jsonb;
  mem jsonb;
  athlete public.tournament_athletes%ROWTYPE;
  pair_row public.tournament_pairs%ROWTYPE;
  entry_row public.tournament_entries%ROWTYPE;
  result jsonb;
  cached jsonb;
  pair_count integer := 0;
  ids bigint[];
  member_ids bigint[];
  name text;
  first_club bigint;
  pair_ids jsonb := '[]'::jsonb;
  entry_ids jsonb := '[]'::jsonb;
  created_pairs jsonb := '[]'::jsonb;
  request_hash text;
BEGIN
  IF COALESCE(jsonb_typeof(p_pairs), '') <> 'array' THEN
    RAISE EXCEPTION 'pairs must be an array' USING ERRCODE = '22023';
  END IF;
  IF p_pairing_mode NOT IN ('manual', 'random_balanced') THEN
    RAISE EXCEPTION 'invalid pairing mode' USING ERRCODE = '22023';
  END IF;

  request_hash := md5(jsonb_build_object(
    'division_id', p_division_id, 'pairs', p_pairs, 'pairing_mode', p_pairing_mode
  )::text);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':pairs:' || p_idempotency_key, 0));
    SELECT response INTO cached
    FROM public.pickhub_mutation_idempotency
    WHERE group_id = p_group_id
      AND operation = 'create_tournament_pairs_atomic'
      AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      -- Legacy rows did not retain request semantics; preserve their replay behavior.
      IF cached ? 'idempotency_context' AND (
        cached->'idempotency_context'->>'division_id' IS DISTINCT FROM p_division_id::text
        OR cached->'idempotency_context'->>'request_hash' IS DISTINCT FROM request_hash
      ) THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '22023';
      END IF;
      RETURN cached;
    END IF;
  END IF;

  SELECT * INTO d
  FROM public.tournament_divisions
  WHERE id = p_division_id AND group_id = p_group_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'division not found' USING ERRCODE = 'P0002';
  END IF;

  FOR pair IN SELECT value FROM jsonb_array_elements(p_pairs) LOOP
    IF jsonb_typeof(pair) IS DISTINCT FROM 'object'
      OR jsonb_typeof(pair->'members') IS DISTINCT FROM 'array'
      OR jsonb_array_length(pair->'members') <> 2 THEN
      RAISE EXCEPTION 'each pair requires exactly two members' USING ERRCODE = '22023';
    END IF;

    ids := ARRAY[]::bigint[];
    name := '';
    first_club := NULL;
    FOR mem IN SELECT value FROM jsonb_array_elements(pair->'members') LOOP
      SELECT * INTO athlete
      FROM public.tournament_athletes
      WHERE id = (mem->>'tournament_athlete_id')::bigint
        AND group_id = p_group_id
        AND tournament_id = d.tournament_id
      FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'pair athlete not found in tournament' USING ERRCODE = '23503';
      END IF;
      IF athlete.id = ANY(ids) THEN
        RAISE EXCEPTION 'duplicate athlete in pair' USING ERRCODE = '23505';
      END IF;
      ids := array_append(ids, athlete.id);
      name := concat_ws(' / ', name, COALESCE(athlete.display_name_snapshot, 'VĐV #' || athlete.id));
      IF first_club IS NULL THEN
        first_club := athlete.tournament_club_id;
      END IF;
    END LOOP;

    INSERT INTO public.tournament_pairs(group_id, division_id, name_snapshot, pairing_mode, status)
    VALUES (p_group_id, p_division_id, name, p_pairing_mode, 'confirmed')
    RETURNING * INTO pair_row;

    FOR mem IN SELECT value FROM jsonb_array_elements(pair->'members') LOOP
      INSERT INTO public.tournament_pair_members(group_id, pair_id, tournament_athlete_id, role)
      VALUES (p_group_id, pair_row.id, (mem->>'tournament_athlete_id')::bigint,
        COALESCE(NULLIF(mem->>'role', ''), 'player'));
    END LOOP;

    INSERT INTO public.tournament_entries(group_id, division_id, tournament_club_id, pair_id, name_snapshot, status)
    VALUES (p_group_id, p_division_id, first_club, pair_row.id, name, 'approved')
    RETURNING * INTO entry_row;

    FOR mem IN SELECT value FROM jsonb_array_elements(pair->'members') LOOP
      SELECT * INTO athlete
      FROM public.tournament_athletes
      WHERE id = (mem->>'tournament_athlete_id')::bigint AND group_id = p_group_id;
      INSERT INTO public.tournament_entry_members(group_id, entry_id, athlete_id, display_name_snapshot, club_name_snapshot, skill_snapshot, roster_role)
      VALUES (p_group_id, entry_row.id, athlete.athlete_id,
        COALESCE(athlete.display_name_snapshot, 'VĐV #' || athlete.id), athlete.club_name_snapshot,
        athlete.phr_rating, COALESCE(NULLIF(mem->>'role', ''), 'player'));
    END LOOP;

    pair_count := pair_count + 1;
    pair_ids := pair_ids || jsonb_build_array(pair_row.id);
    entry_ids := entry_ids || jsonb_build_array(entry_row.id);
    created_pairs := created_pairs || jsonb_build_array(jsonb_build_object(
      'pair_id', pair_row.id, 'entry_id', entry_row.id, 'member_ids', to_jsonb(ids)
    ));
  END LOOP;

  result := jsonb_build_object(
    'success', true,
    'pairCount', pair_count,
    'pairIds', pair_ids,
    'entryIds', entry_ids,
    'pairs', created_pairs,
    'idempotency_context', jsonb_build_object('division_id', p_division_id, 'request_hash', request_hash)
  );
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.pickhub_mutation_idempotency(group_id, operation, idempotency_key, response, response_hash)
    VALUES (p_group_id, 'create_tournament_pairs_atomic', p_idempotency_key, result, md5(result::text));
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament_pairs_atomic(bigint,bigint,jsonb,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tournament_pairs_atomic(bigint,bigint,jsonb,text,text)
  TO service_role;

COMMENT ON COLUMN public.tournament_entries.pair_id IS 'Cặp ổn định tạo entry này; NULL giữ nguyên entry legacy hoặc không phải đôi.';
COMMENT ON FUNCTION public.create_tournament_pairs_atomic(bigint,bigint,jsonb,text,text)
  IS 'Tạo pair và entry liên kết pair_id nguyên tử; idempotency mới ràng buộc division và payload.';

COMMIT;
