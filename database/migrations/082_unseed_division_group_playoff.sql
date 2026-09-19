-- Duong phuc hoi cho guard E5: go seed play-off mot cach an toan.
-- Khong co ham nay thi BTC bi ket: guard chan sua ket qua vong bang, ma cach duy
-- nhat de go la huy chot lich (xoa toan bo fixture vong bang) - qua nang tay.
--
-- An toan: chi go khi MOI tran vong sau lien quan van con nguyen ven
-- (status='pending' va chua co ban ghi game nao). Da bat dau/da xong thi TU CHOI,
-- khong bao gio xoa nguoi ra khoi tran dang hoac da thi dau.
CREATE OR REPLACE FUNCTION public.unseed_division_group_playoff(
  p_group_id bigint, p_tournament_id bigint, p_division_id bigint,
  p_group_stage_id bigint, p_expected_setup_revision bigint, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.tournament_divisions%ROWTYPE;
  cached public.tournament_setup_mutations%ROWTYPE;
  fingerprint text;
  target_ids bigint[];
  blocked integer := 0;
  cleared integer := 0;
  entrants_removed integer := 0;
  result jsonb;
BEGIN
  IF p_expected_setup_revision IS NULL OR p_expected_setup_revision < 1 THEN
    RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE='PH409'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE='22023'; END IF;

  fingerprint := md5(jsonb_build_object('division_id',p_division_id,'group_stage_id',p_group_stage_id)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text||':unseed-playoff:'||p_idempotency_key,0));
  SELECT * INTO cached FROM public.tournament_setup_mutations
  WHERE group_id=p_group_id AND operation='unseed_division_group_playoff'
    AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF cached.division_id<>p_division_id OR cached.payload_fingerprint<>fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023'; END IF;
    RETURN cached.response; END IF;

  SELECT * INTO d FROM public.tournament_divisions
  WHERE id=p_division_id AND group_id=p_group_id AND tournament_id=p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'division not found in tournament scope' USING ERRCODE='P0002'; END IF;
  IF d.setup_revision <> p_expected_setup_revision THEN
    RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE='PH409'; END IF;

  -- Khoa dong stage nguon: tuan tu hoa voi advance va voi guard correction.
  PERFORM 1 FROM public.tournament_stages
  WHERE id=p_group_stage_id AND group_id=p_group_id FOR UPDATE;

  -- Tap tran vong sau bi anh huong: dich truc tiep cua group_rank, VA cac tran
  -- an theo ket qua cua chung (chung ket, tranh hang ba).
  SELECT COALESCE(array_agg(DISTINCT mid), ARRAY[]::bigint[]) INTO target_ids
  FROM (
    SELECT t.target_match_id AS mid
    FROM public.tournament_stage_transitions t
    WHERE t.group_id=p_group_id AND t.source_kind='group_rank' AND t.source_stage_id=p_group_stage_id
    UNION
    SELECT t2.target_match_id
    FROM public.tournament_stage_transitions t1
    JOIN public.tournament_stage_transitions t2
      ON t2.group_id=t1.group_id AND t2.source_kind='match_outcome'
     AND t2.source_match_id=t1.target_match_id
    WHERE t1.group_id=p_group_id AND t1.source_kind='group_rank' AND t1.source_stage_id=p_group_stage_id
  ) s;

  IF array_length(target_ids,1) IS NULL THEN
    RAISE EXCEPTION 'GROUP_TRANSITION_PLAN_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  -- Tu choi neu bat ky tran vong sau nao da bat dau hoac da co ti so.
  SELECT count(*)::integer INTO blocked
  FROM public.tournament_matches m
  WHERE m.group_id=p_group_id AND m.id = ANY(target_ids)
    AND (m.status <> 'pending' OR EXISTS (
      SELECT 1 FROM public.tournament_games g WHERE g.group_id=p_group_id AND g.match_id=m.id));
  IF blocked > 0 THEN
    RAISE EXCEPTION 'UNSEED_BLOCKED_MATCH_STARTED' USING ERRCODE='PH409',
      HINT = 'Co tran vong sau da bat dau hoac da co ti so. Khong go seed de tranh xoa nguoi khoi tran dang thi dau.';
  END IF;

  UPDATE public.tournament_matches m
  SET entry_a_id=NULL, entry_b_id=NULL, entrant_a_id=NULL, entrant_b_id=NULL,
      winner_entry_id=NULL, winner_entrant_id=NULL, version=version+1
  WHERE m.group_id=p_group_id AND m.id = ANY(target_ids)
    AND (m.entry_a_id IS NOT NULL OR m.entry_b_id IS NOT NULL
      OR m.entrant_a_id IS NOT NULL OR m.entrant_b_id IS NOT NULL);
  GET DIAGNOSTICS cleared = ROW_COUNT;

  DELETE FROM public.tournament_stage_entrants se
  WHERE se.group_id=p_group_id
    AND se.stage_id IN (SELECT DISTINCT t.target_stage_id FROM public.tournament_stage_transitions t
                        WHERE t.group_id=p_group_id AND t.source_kind='group_rank'
                          AND t.source_stage_id=p_group_stage_id);
  GET DIAGNOSTICS entrants_removed = ROW_COUNT;

  -- Tra giai doan vong bang ve trang thai chua tien cap de co the advance lai.
  UPDATE public.tournament_stages SET status='active'
  WHERE id=p_group_stage_id AND group_id=p_group_id AND status='completed';

  UPDATE public.tournament_divisions
  SET setup_revision=setup_revision+1, setup_updated_at=now()
  WHERE id=d.id AND group_id=p_group_id RETURNING setup_revision INTO d.setup_revision;

  result := jsonb_build_object('success',true,'setup_revision',d.setup_revision,
    'matches_cleared',cleared,'stage_entrants_removed',entrants_removed,
    'targets',to_jsonb(target_ids));
  INSERT INTO public.tournament_setup_mutations(group_id,operation,division_id,idempotency_key,payload_fingerprint,response)
  VALUES(p_group_id,'unseed_division_group_playoff',p_division_id,p_idempotency_key,fingerprint,result);
  RETURN result;
END;$$;

ALTER FUNCTION public.unseed_division_group_playoff(bigint,bigint,bigint,bigint,bigint,text) SET lock_timeout = '2s';
REVOKE ALL ON FUNCTION public.unseed_division_group_playoff(bigint,bigint,bigint,bigint,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unseed_division_group_playoff(bigint,bigint,bigint,bigint,bigint,text) TO service_role;
COMMENT ON FUNCTION public.unseed_division_group_playoff(bigint,bigint,bigint,bigint,bigint,text) IS
  'Go seed play-off sinh tu hang bang, chi khi moi tran vong sau con pending va chua co ti so.';
