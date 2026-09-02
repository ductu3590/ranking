-- PickHub Phase 1: atomic tournament mutations.
-- Apply manually after 018 and verify RPC grants before deploying the route changes.

CREATE TABLE IF NOT EXISTS public.pickhub_mutation_idempotency (
  group_id       bigint NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  operation      text NOT NULL,
  idempotency_key text NOT NULL,
  response       jsonb NOT NULL,
  response_hash  text NOT NULL CHECK (response_hash ~ '^[0-9a-f]{32}$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, operation, idempotency_key)
);

ALTER TABLE public.pickhub_mutation_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pickhub_mutation_idempotency FROM PUBLIC, anon, authenticated;

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tournament_matches'::regclass
      AND conname = 'tournament_matches_version_positive'
  ) THEN
    ALTER TABLE public.tournament_matches
      ADD CONSTRAINT tournament_matches_version_positive CHECK (version > 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_games_match_game_no
  ON public.tournament_games(group_id, match_id, game_no);

CREATE OR REPLACE FUNCTION public.replace_tournament_games(
  p_group_id bigint,
  p_match_id bigint,
  p_games jsonb,
  p_winner_entrant_id bigint DEFAULT NULL,
  p_status text DEFAULT 'live',
  p_parent_field text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  match_row public.tournament_matches%ROWTYPE;
  parent_row public.tournament_matches%ROWTYPE;
  replay jsonb;
  result jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      format('%s:%s:%s', p_group_id, 'replace_tournament_games', p_idempotency_key), 0
    ));
    SELECT response INTO replay
    FROM public.pickhub_mutation_idempotency
    WHERE group_id = p_group_id
      AND operation = 'replace_tournament_games'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF replay IS NOT NULL THEN RETURN replay; END IF;
  END IF;

  IF COALESCE(jsonb_typeof(p_games), '') <> 'array' THEN
    RAISE EXCEPTION 'games must be an array' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('pending', 'live', 'done') THEN
    RAISE EXCEPTION 'invalid match status' USING ERRCODE = '22023';
  END IF;
  IF p_parent_field IS NOT NULL AND p_parent_field NOT IN ('entrant_a_id', 'entrant_b_id') THEN
    RAISE EXCEPTION 'invalid parent field' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO match_row
  FROM public.tournament_matches
  WHERE id = p_match_id AND group_id = p_group_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_version IS NOT NULL AND match_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'match version conflict' USING ERRCODE = '40001';
  END IF;
  IF p_winner_entrant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tournament_entrants
    WHERE id = p_winner_entrant_id AND group_id = p_group_id
  ) THEN
    RAISE EXCEPTION 'winner does not belong to group' USING ERRCODE = '23503';
  END IF;

  IF p_parent_field IS NOT NULL THEN
    IF match_row.parent_match_id IS NULL THEN
      RAISE EXCEPTION 'parent match is missing' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO parent_row
    FROM public.tournament_matches
    WHERE id = match_row.parent_match_id AND group_id = p_group_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent match does not belong to group' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_games) AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR COALESCE(item->>'kind', 'game') NOT IN ('game','womens','mens','mixed1','mixed2','dreambreaker')
       OR COALESCE((item->>'score_a')::integer, 0) < 0
       OR COALESCE((item->>'score_b')::integer, 0) < 0
  ) THEN
    RAISE EXCEPTION 'invalid game payload' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.tournament_games
  WHERE group_id = p_group_id AND match_id = p_match_id;

  INSERT INTO public.tournament_games (
    group_id, match_id, game_no, kind, score_a, score_b, lineup
  )
  SELECT
    p_group_id,
    p_match_id,
    COALESCE(NULLIF(item->>'game_no', '')::integer, ordinality::integer),
    COALESCE(item->>'kind', 'game'),
    COALESCE(NULLIF(item->>'score_a', '')::integer, 0),
    COALESCE(NULLIF(item->>'score_b', '')::integer, 0),
    CASE WHEN jsonb_typeof(item->'lineup') = 'object' THEN item->'lineup' ELSE '{}'::jsonb END
  FROM jsonb_array_elements(p_games) WITH ORDINALITY AS rows(item, ordinality);

  UPDATE public.tournament_matches
  SET status = p_status,
      winner_entrant_id = p_winner_entrant_id,
      version = version + 1
  WHERE id = p_match_id AND group_id = p_group_id;

  IF p_parent_field IS NOT NULL AND p_winner_entrant_id IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.tournament_matches SET %I = $1, version = version + 1 WHERE id = $2 AND group_id = $3',
      p_parent_field
    ) USING p_winner_entrant_id, parent_row.id, p_group_id;
  END IF;

  result := jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'complete', p_status = 'done',
    'winner_entrant_id', p_winner_entrant_id,
    'version', match_row.version + 1
  );
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.pickhub_mutation_idempotency (
      group_id, operation, idempotency_key, response, response_hash
    ) VALUES (
      p_group_id, 'replace_tournament_games', p_idempotency_key, result, md5(result::text)
    );
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_tournament_schedule(
  p_group_id bigint,
  p_stage_id bigint,
  p_matches jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stage_row public.tournament_stages%ROWTYPE;
  replay jsonb;
  result jsonb;
  item jsonb;
  match_id bigint;
  v_map_key text;
  v_parent_key text;
  inserted_count integer := 0;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      format('%s:%s:%s', p_group_id, 'replace_tournament_schedule', p_idempotency_key), 0
    ));
    SELECT response INTO replay
    FROM public.pickhub_mutation_idempotency
    WHERE group_id = p_group_id
      AND operation = 'replace_tournament_schedule'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF replay IS NOT NULL THEN RETURN replay; END IF;
  END IF;

  IF COALESCE(jsonb_typeof(p_matches), '') <> 'array' THEN
    RAISE EXCEPTION 'matches must be an array' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO stage_row
  FROM public.tournament_stages
  WHERE id = p_stage_id AND group_id = p_group_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stage not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_matches) AS row_data
    WHERE (row_data->>'entrant_a_id') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.tournament_entrants entrant
        WHERE entrant.id = (row_data->>'entrant_a_id')::bigint
          AND entrant.group_id = p_group_id
      )
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_matches) AS row_data
    WHERE (row_data->>'entrant_b_id') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.tournament_entrants entrant
        WHERE entrant.id = (row_data->>'entrant_b_id')::bigint
          AND entrant.group_id = p_group_id
      )
  ) THEN
    RAISE EXCEPTION 'schedule entrant does not belong to group' USING ERRCODE = '23503';
  END IF;

  CREATE TEMP TABLE schedule_map (
    map_key text PRIMARY KEY,
    parent_key text,
    match_id bigint NOT NULL
  ) ON COMMIT DROP;

  DELETE FROM public.tournament_matches
  WHERE group_id = p_group_id AND stage_id = p_stage_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
    IF jsonb_typeof(item) <> 'object' THEN
      RAISE EXCEPTION 'invalid schedule row' USING ERRCODE = '22023';
    END IF;
    v_map_key := COALESCE(item->>'_key', item->>'slot', item->>'order');
    v_parent_key := COALESCE(item->>'_parent_key', item->>'parent_slot');
    IF v_map_key IS NULL OR v_map_key = '' THEN
      RAISE EXCEPTION 'schedule row key is required' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.tournament_matches (
      group_id, stage_id, round, bracket_slot, group_label, court, match_order,
      entrant_a_id, entrant_b_id, status
    ) VALUES (
      p_group_id, p_stage_id,
      COALESCE(NULLIF(item->>'round', '')::integer, 1),
      NULLIF(item->>'bracket_slot', '')::integer,
      NULLIF(item->>'group_label', ''),
      NULLIF(item->>'court', ''),
      NULLIF(COALESCE(item->>'match_order', item->>'order'), '')::integer,
      NULLIF(item->>'entrant_a_id', '')::bigint,
      NULLIF(item->>'entrant_b_id', '')::bigint,
      'pending'
    ) RETURNING id INTO match_id;
    INSERT INTO schedule_map(map_key, parent_key, match_id)
    VALUES (v_map_key, NULLIF(v_parent_key, ''), match_id);
    inserted_count := inserted_count + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM schedule_map child_map
    LEFT JOIN schedule_map parent_map ON parent_map.map_key = child_map.parent_key
    WHERE child_map.parent_key IS NOT NULL AND parent_map.map_key IS NULL
  ) THEN
    RAISE EXCEPTION 'schedule parent key is missing' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_matches child
  SET parent_match_id = parent_map.match_id
  FROM schedule_map child_map
  JOIN schedule_map parent_map ON parent_map.map_key = child_map.parent_key
  WHERE child.id = child_map.match_id;

  UPDATE public.tournament_stages
  SET status = 'active'
  WHERE id = p_stage_id AND group_id = p_group_id;

  result := jsonb_build_object('success', true, 'matchCount', inserted_count);
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.pickhub_mutation_idempotency (
      group_id, operation, idempotency_key, response, response_hash
    ) VALUES (
      p_group_id, 'replace_tournament_schedule', p_idempotency_key, result, md5(result::text)
    );
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_tournament_games(bigint, bigint, jsonb, bigint, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_tournament_schedule(bigint, bigint, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_tournament_games(bigint, bigint, jsonb, bigint, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_tournament_schedule(bigint, bigint, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.replace_tournament_games IS 'Atomic server-only replacement of match games and result propagation';
COMMENT ON FUNCTION public.replace_tournament_schedule IS 'Atomic server-only regeneration of a stage schedule';
