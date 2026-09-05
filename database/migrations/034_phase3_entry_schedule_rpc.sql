-- Task 3 continuation: atomic schedule replacement for division-scoped entries.
-- Legacy replace_tournament_schedule remains available only for the read adapter.

CREATE OR REPLACE FUNCTION public.replace_tournament_entry_schedule(
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
  item jsonb;
  child_key text;
  parent_key text;
  match_id bigint;
  inserted_count integer := 0;
  result jsonb;
BEGIN
  IF COALESCE(jsonb_typeof(p_matches), '') <> 'array' THEN
    RAISE EXCEPTION 'matches must be an array' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO stage_row
  FROM public.tournament_stages
  WHERE id = p_stage_id AND group_id = p_group_id
  FOR UPDATE;
  IF NOT FOUND OR stage_row.division_id IS NULL THEN
    RAISE EXCEPTION 'division-scoped stage not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_matches) row_data
    WHERE ((row_data->>'entry_a_id') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tournament_entries e
      WHERE e.id = (row_data->>'entry_a_id')::bigint
        AND e.group_id = p_group_id AND e.division_id = stage_row.division_id
    )) OR ((row_data->>'entry_b_id') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.tournament_entries e
      WHERE e.id = (row_data->>'entry_b_id')::bigint
        AND e.group_id = p_group_id AND e.division_id = stage_row.division_id
    ))
  ) THEN
    RAISE EXCEPTION 'schedule entry does not belong to stage division' USING ERRCODE = '23503';
  END IF;

  CREATE TEMP TABLE entry_schedule_map (
    map_key text PRIMARY KEY,
    parent_key text,
    match_id bigint NOT NULL
  ) ON COMMIT DROP;

  DELETE FROM public.tournament_matches
  WHERE group_id = p_group_id AND stage_id = p_stage_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
    child_key := COALESCE(item->>'_key', item->>'slot', item->>'order');
    parent_key := NULLIF(COALESCE(item->>'_parent_key', item->>'parent_slot'), '');
    IF child_key IS NULL OR child_key = '' THEN
      RAISE EXCEPTION 'schedule row key is required' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.tournament_matches (
      group_id, division_id, stage_id, round, bracket_slot, group_label,
      court, match_order, entry_a_id, entry_b_id, status, result_type
    ) VALUES (
      p_group_id, stage_row.division_id, p_stage_id,
      COALESCE(NULLIF(item->>'round', '')::integer, 1),
      NULLIF(item->>'bracket_slot', '')::integer,
      NULLIF(item->>'group_label', ''), NULLIF(item->>'court', ''),
      NULLIF(COALESCE(item->>'match_order', item->>'order'), '')::integer,
      NULLIF(item->>'entry_a_id', '')::bigint,
      NULLIF(item->>'entry_b_id', '')::bigint,
      'pending', 'simple'
    ) RETURNING id INTO match_id;
    INSERT INTO entry_schedule_map(map_key, parent_key, match_id)
    VALUES (child_key, parent_key, match_id);
    inserted_count := inserted_count + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM entry_schedule_map child
    LEFT JOIN entry_schedule_map parent ON parent.map_key = child.parent_key
    WHERE child.parent_key IS NOT NULL AND parent.map_key IS NULL
  ) THEN
    RAISE EXCEPTION 'schedule parent key is missing' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tournament_matches child
  SET parent_match_id = parent.match_id
  FROM entry_schedule_map child_map
  JOIN entry_schedule_map parent ON parent.map_key = child_map.parent_key
  WHERE child.id = child_map.match_id;

  UPDATE public.tournament_stages SET status = 'active'
  WHERE id = p_stage_id AND group_id = p_group_id;

  result := jsonb_build_object('success', true, 'matchCount', inserted_count);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_tournament_entry_schedule(bigint, bigint, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_tournament_entry_schedule(bigint, bigint, jsonb, text) TO service_role;
