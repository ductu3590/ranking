-- Tiến cấp vòng bảng cho stage do finalize v4 tạo (spec Lát A §11).
-- Route tính standings trên server (như v1), xếp hạng chéo bảng cho suất bù và hoán đổi
-- tránh cùng bảng, rồi gửi phân công theo từng transition. RPC giữ mọi bảo vệ của v1
-- (idempotency, CAS kết quả vòng bảng, stage xong, scope entry, trùng entry, xung đột ô,
-- chỉ tăng version khi thực sự đổi) và thêm: phân công phủ ĐÚNG mọi transition
-- group_rank + group_rank_pool của stage, mỗi transition một lần. v1 giữ nguyên.
BEGIN;

CREATE OR REPLACE FUNCTION public.advance_division_group_rank_transitions_v2(
  p_group_id bigint,
  p_stage_id bigint,
  p_resolved jsonb,
  p_idempotency_key text,
  p_expected_results_fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET lock_timeout = '2s' AS $$
DECLARE
  s public.tournament_stages%ROWTYPE;
  cached public.tournament_stage_advance_mutations%ROWTYPE;
  fingerprint text;
  live_fingerprint text;
  edge public.tournament_stage_transitions%ROWTYPE;
  target public.tournament_matches%ROWTYPE;
  v_item jsonb;
  v_entry_id bigint;
  v_changed boolean;
  assigned_ids bigint[] := ARRAY[]::bigint[];
  assignments integer := 0;
  changed integer := 0;
  swapped integer := 0;
  result jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023'; END IF;
  IF p_expected_results_fingerprint IS NULL THEN
    RAISE EXCEPTION 'GROUP_RESULTS_FINGERPRINT_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_resolved) IS DISTINCT FROM 'array' OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_resolved) x
      WHERE COALESCE(x->>'transition_id', '') !~ '^\d+$' OR COALESCE(x->>'entry_id', '') !~ '^\d+$') THEN
    RAISE EXCEPTION 'INVALID_GROUP_RANKINGS' USING ERRCODE = '22023'; END IF;

  fingerprint := md5(jsonb_build_object('stage_id', p_stage_id, 'resolved', p_resolved)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':group-rank-advance:' || p_idempotency_key, 0));
  SELECT * INTO cached FROM public.tournament_stage_advance_mutations
  WHERE group_id = p_group_id AND operation = 'advance_division_group_rank_transitions_v2' AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF cached.stage_id <> p_stage_id OR cached.payload_fingerprint <> fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '22023'; END IF;
    RETURN cached.response; END IF;

  SELECT * INTO s FROM public.tournament_stages WHERE id = p_stage_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND OR s.division_id IS NULL THEN RAISE EXCEPTION 'DIVISION_GROUP_STAGE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF COALESCE(s.config->>'setupPlanVersion', '') <> '4' THEN RAISE EXCEPTION 'ADVANCE_V2_STAGE_UNSUPPORTED' USING ERRCODE = '22023'; END IF;

  live_fingerprint := public.group_stage_results_fingerprint(p_group_id, p_stage_id);
  IF live_fingerprint IS DISTINCT FROM p_expected_results_fingerprint THEN
    RAISE EXCEPTION 'GROUP_RESULTS_CHANGED' USING ERRCODE = 'PH409',
      HINT = 'Ket qua vong bang vua thay doi. Tai lai bang xep hang roi tien cap lai.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_matches m WHERE m.group_id = p_group_id AND m.stage_id = p_stage_id AND m.status NOT IN ('finalized', 'done')) THEN
    RAISE EXCEPTION 'STAGE_NOT_COMPLETE' USING ERRCODE = 'PH409'; END IF;

  -- Phân công phải phủ đúng tập transition bảng của stage, không thừa không thiếu.
  IF (SELECT count(*) FROM public.tournament_stage_transitions t
      WHERE t.group_id = p_group_id AND t.source_stage_id = p_stage_id AND t.source_kind IN ('group_rank', 'group_rank_pool')) = 0 THEN
    RAISE EXCEPTION 'GROUP_TRANSITION_PLAN_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF jsonb_array_length(p_resolved) <> (SELECT count(*) FROM public.tournament_stage_transitions t
        WHERE t.group_id = p_group_id AND t.source_stage_id = p_stage_id AND t.source_kind IN ('group_rank', 'group_rank_pool'))
    OR (SELECT count(DISTINCT x->>'transition_id') FROM jsonb_array_elements(p_resolved) x) <> jsonb_array_length(p_resolved)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_resolved) x WHERE NOT EXISTS (
        SELECT 1 FROM public.tournament_stage_transitions t
        WHERE t.id = (x->>'transition_id')::bigint AND t.group_id = p_group_id AND t.source_stage_id = p_stage_id
          AND t.source_kind IN ('group_rank', 'group_rank_pool'))) THEN
    RAISE EXCEPTION 'GROUP_ADVANCE_ASSIGNMENT_INVALID' USING ERRCODE = '22023'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_resolved) ORDER BY (value->>'transition_id')::bigint LOOP
    SELECT * INTO edge FROM public.tournament_stage_transitions WHERE id = (v_item->>'transition_id')::bigint FOR UPDATE;
    v_entry_id := (v_item->>'entry_id')::bigint;
    IF NOT EXISTS (SELECT 1 FROM public.tournament_stage_entrants se
                   WHERE se.group_id = p_group_id AND se.stage_id = p_stage_id AND se.entry_id = v_entry_id)
      OR NOT EXISTS (SELECT 1 FROM public.tournament_entries e
                     WHERE e.id = v_entry_id AND e.group_id = p_group_id AND e.division_id = s.division_id AND e.status = 'approved') THEN
      RAISE EXCEPTION 'GROUP_RANK_ENTRY_SCOPE_MISMATCH' USING ERRCODE = '23503'; END IF;
    IF v_entry_id = ANY(assigned_ids) THEN
      RAISE EXCEPTION 'GROUP_RANK_ENTRY_DUPLICATE' USING ERRCODE = '22023'; END IF;
    assigned_ids := array_append(assigned_ids, v_entry_id);
    IF (v_item->>'swapped') = 'true' THEN swapped := swapped + 1; END IF;

    SELECT * INTO target FROM public.tournament_matches WHERE id = edge.target_match_id FOR UPDATE;
    IF (edge.target_slot = 'a' AND target.entry_a_id IS NOT NULL AND target.entry_a_id <> v_entry_id)
       OR (edge.target_slot = 'b' AND target.entry_b_id IS NOT NULL AND target.entry_b_id <> v_entry_id) THEN
      RAISE EXCEPTION 'PLAYOFF_TARGET_CONFLICT' USING ERRCODE = 'PH409'; END IF;
    v_changed := (edge.target_slot = 'a' AND target.entry_a_id IS DISTINCT FROM v_entry_id)
              OR (edge.target_slot = 'b' AND target.entry_b_id IS DISTINCT FROM v_entry_id);
    IF v_changed THEN
      UPDATE public.tournament_matches
      SET entry_a_id = CASE WHEN edge.target_slot = 'a' THEN v_entry_id ELSE entry_a_id END,
          entry_b_id = CASE WHEN edge.target_slot = 'b' THEN v_entry_id ELSE entry_b_id END,
          version = version + 1
      WHERE id = target.id AND group_id = p_group_id;
      changed := changed + 1;
    END IF;
    INSERT INTO public.tournament_stage_entrants(group_id, stage_id, division_id, entry_id, seed_in_stage)
    VALUES (p_group_id, edge.target_stage_id, s.division_id, v_entry_id, CASE WHEN edge.target_slot = 'a' THEN 1 ELSE 2 END)
    ON CONFLICT (group_id, stage_id, entry_id) WHERE entry_id IS NOT NULL DO NOTHING;
    assignments := assignments + 1;
  END LOOP;

  UPDATE public.tournament_stages SET status = 'completed' WHERE id = s.id AND group_id = p_group_id;
  UPDATE public.tournament_stages p SET status = 'pending'
  WHERE p.group_id = p_group_id AND EXISTS (
    SELECT 1 FROM public.tournament_stage_transitions t WHERE t.target_stage_id = p.id AND t.source_stage_id = s.id);

  result := jsonb_build_object('success', true, 'advanced', assignments, 'changed', changed, 'swapped', swapped, 'transitioned', true);
  INSERT INTO public.tournament_stage_advance_mutations(group_id, operation, stage_id, next_stage_id, idempotency_key, payload_fingerprint, response)
  VALUES (p_group_id, 'advance_division_group_rank_transitions_v2', p_stage_id, NULL, p_idempotency_key, fingerprint, result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_division_group_rank_transitions_v2(bigint,bigint,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_division_group_rank_transitions_v2(bigint,bigint,jsonb,text,text) TO service_role;
COMMIT;
