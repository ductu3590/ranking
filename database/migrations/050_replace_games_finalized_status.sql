-- 050_replace_games_finalized_status.sql
-- RPC replace_tournament_games (migration 019) vẫn kiểm p_status theo bộ cũ
-- ('pending','live','done'), trong khi app đã ghi 'finalized' và bảng đã đổi CHECK
-- sang pending|warmup|live|paused|finalized (migration 046). Hậu quả: MỌI trận chốt
-- xong đều vỡ với 'invalid match status' — không giải nào kết thúc được trận nào.
--
-- Đồng thời nới phần kiểm người thắng: giải tạo bằng wizard lưu đội ở
-- tournament_entries (entry), giải cũ lưu ở tournament_entrants (entrant). RPC cũ chỉ
-- biết entrant nên giải theo division luôn báo 'winner does not belong to group'.
-- Người thắng giờ được ghi vào đúng cột tương ứng với nguồn của nó.
--
-- Chỉ thay thế định nghĩa hàm; không đụng bảng hay dữ liệu.

CREATE OR REPLACE FUNCTION public.replace_tournament_games(
  p_group_id bigint,
  p_match_id bigint,
  p_games jsonb,
  p_winner_entrant_id bigint DEFAULT NULL::bigint,
  p_status text DEFAULT 'live'::text,
  p_parent_field text DEFAULT NULL::text,
  p_expected_version integer DEFAULT NULL::integer,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  match_row public.tournament_matches%ROWTYPE;
  parent_row public.tournament_matches%ROWTYPE;
  replay jsonb;
  result jsonb;
  winner_is_entrant boolean := false;
  winner_is_entry boolean := false;
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
  -- Bộ trạng thái phải khớp CHECK tournament_matches_status_phase4_ck (migration 046).
  IF p_status NOT IN ('pending', 'warmup', 'live', 'paused', 'finalized') THEN
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

  IF p_winner_entrant_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tournament_entrants
      WHERE id = p_winner_entrant_id AND group_id = p_group_id
    ) INTO winner_is_entrant;
    SELECT EXISTS (
      SELECT 1 FROM public.tournament_entries
      WHERE id = p_winner_entrant_id AND group_id = p_group_id
    ) INTO winner_is_entry;
    IF NOT winner_is_entrant AND NOT winner_is_entry THEN
      RAISE EXCEPTION 'winner does not belong to group' USING ERRCODE = '23503';
    END IF;
    -- Trận theo division thì id người thắng là entry, kể cả khi trùng số với entrant.
    IF match_row.entry_a_id IS NOT NULL OR match_row.entry_b_id IS NOT NULL THEN
      winner_is_entrant := false;
      winner_is_entry := true;
    ELSE
      winner_is_entry := false;
    END IF;
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
      winner_entrant_id = CASE WHEN winner_is_entrant THEN p_winner_entrant_id ELSE NULL END,
      winner_entry_id = CASE WHEN winner_is_entry THEN p_winner_entrant_id ELSE NULL END,
      version = version + 1
  WHERE id = p_match_id AND group_id = p_group_id;

  IF p_parent_field IS NOT NULL AND p_winner_entrant_id IS NOT NULL THEN
    -- Nhánh entry ghi sang cột entry tương ứng của trận cha.
    EXECUTE format(
      'UPDATE public.tournament_matches SET %I = $1, version = version + 1 WHERE id = $2 AND group_id = $3',
      CASE
        WHEN winner_is_entry AND p_parent_field = 'entrant_a_id' THEN 'entry_a_id'
        WHEN winner_is_entry AND p_parent_field = 'entrant_b_id' THEN 'entry_b_id'
        ELSE p_parent_field
      END
    ) USING p_winner_entrant_id, parent_row.id, p_group_id;
  END IF;

  result := jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'complete', p_status = 'finalized',
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
$function$;
