-- Hardening: (A) dong race giua SEED va CORRECTION theo CA HAI chieu,
-- (B) E4 khong bump version khi khong doi, (C) E7 kiem 4 suat phan biet,
-- (D) E3 tu choi som + thong bao ro.
--
-- Vi sao 077 chua du: guard chi lam SELECT count(*). Duoi READ COMMITTED no KHONG
-- thay cac dong seed ma advance vua ghi nhung chua commit, nen correction di qua
-- guard va ca hai cung commit -> qualifier cu. Da tai hien duoc bang hai ket noi:
-- advance giu transaction 8s, correction ban vao giua -> correction 200 trong 2.17s
-- va playoff giu seed cu trong khi bang A da doi hang nhat.
--
-- Cach dong: guard lay DUNG khoa ma advance da lay (FOR UPDATE tren dong
-- tournament_stages cua stage nguon). Hai ben khi do bi tuan tu hoa that su.
-- Chieu nguoc lai (correction commit truoc, advance seed bang standings da cu)
-- duoc dong bang CAS tren "van tay ket qua" cua stage nguon.

-- (A1) Guard: khoa dong stage nguon truoc khi dem target da seed.
CREATE OR REPLACE FUNCTION public.guard_group_result_change_after_seed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_group_id bigint;
  v_match_id bigint;
  v_stage_id bigint;
  v_seeded integer := 0;
BEGIN
  IF TG_TABLE_NAME = 'tournament_games' THEN
    v_group_id := COALESCE(NEW.group_id, OLD.group_id);
    v_match_id := COALESCE(NEW.match_id, OLD.match_id);
  ELSE
    v_group_id := COALESCE(NEW.group_id, OLD.group_id);
    v_match_id := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'UPDATE'
       AND NEW.winner_entrant_id IS NOT DISTINCT FROM OLD.winner_entrant_id
       AND NEW.winner_entry_id IS NOT DISTINCT FROM OLD.winner_entry_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT m.stage_id INTO v_stage_id
  FROM public.tournament_matches m
  WHERE m.id = v_match_id AND m.group_id = v_group_id;
  IF v_stage_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Chi tuan tu hoa khi stage nay THUC SU la nguon cua ke hoach hang-bang.
  IF EXISTS (
    SELECT 1 FROM public.tournament_stage_transitions t
    WHERE t.group_id = v_group_id AND t.source_kind = 'group_rank' AND t.source_stage_id = v_stage_id
  ) THEN
    -- Khoa GIONG HET advance: neu advance dang chay va chua commit, cho no xong
    -- roi moi doc. Nho vay khong con cua so doc ra "chua seed".
    PERFORM 1 FROM public.tournament_stages
    WHERE id = v_stage_id AND group_id = v_group_id FOR UPDATE;

    SELECT count(*)::integer INTO v_seeded
    FROM public.tournament_stage_transitions t
    JOIN public.tournament_matches tm
      ON tm.id = t.target_match_id AND tm.group_id = t.group_id
    WHERE t.group_id = v_group_id
      AND t.source_kind = 'group_rank'
      AND t.source_stage_id = v_stage_id
      AND (
        tm.entrant_a_id IS NOT NULL OR tm.entrant_b_id IS NOT NULL
        OR tm.entry_a_id IS NOT NULL OR tm.entry_b_id IS NOT NULL
        OR tm.status <> 'pending'
      );

    IF v_seeded > 0 THEN
      RAISE EXCEPTION 'GROUP_CORRECTION_BLOCKED_QUALIFICATION_SEEDED'
        USING ERRCODE = 'PH409',
              HINT = 'Suat vong sau da duoc seed tu hang bang. Go seed vong sau roi sua ket qua vong bang.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- (A2) Van tay ket qua cua mot stage vong bang: doi khi bat ky ket qua nao doi.
CREATE OR REPLACE FUNCTION public.group_stage_results_fingerprint(p_group_id bigint, p_stage_id bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(COALESCE(string_agg(
    m.id::text || ':' || m.version::text || ':' || COALESCE(m.winner_entry_id::text, '-')
      || ':' || COALESCE(m.winner_entrant_id::text, '-') || ':' || m.status,
    '|' ORDER BY m.id), ''))
  FROM public.tournament_matches m
  WHERE m.group_id = p_group_id AND m.stage_id = p_stage_id;
$$;
REVOKE ALL ON FUNCTION public.group_stage_results_fingerprint(bigint,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_stage_results_fingerprint(bigint,bigint) TO service_role;

-- (B) advance: them CAS van tay + E4 + E7 + E3.
DROP FUNCTION IF EXISTS public.advance_division_group_rank_transitions(bigint,bigint,jsonb,text);
CREATE OR REPLACE FUNCTION public.advance_division_group_rank_transitions(
  p_group_id bigint, p_stage_id bigint, p_ranked jsonb, p_idempotency_key text,
  p_expected_results_fingerprint text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.tournament_stages%ROWTYPE;
  cached public.tournament_stage_advance_mutations%ROWTYPE;
  fingerprint text; live_fingerprint text;
  edge public.tournament_stage_transitions%ROWTYPE;
  ranked jsonb; target public.tournament_matches%ROWTYPE;
  v_entry_id bigint; result jsonb; assignments integer := 0; changed integer := 0;
  assigned_ids bigint[] := ARRAY[]::bigint[];
  v_changed boolean;
BEGIN
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_ranked) IS DISTINCT FROM 'array' OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_ranked) x
      WHERE coalesce(x->>'entry_id','') !~ '^\d+$' OR nullif(x->>'group_label','') IS NULL
         OR coalesce(x->>'rank','') !~ '^\d+$') THEN
    RAISE EXCEPTION 'INVALID_GROUP_RANKINGS' USING ERRCODE='22023'; END IF;

  fingerprint := md5(jsonb_build_object('stage_id',p_stage_id,'ranked',p_ranked)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text||':group-rank-advance:'||p_idempotency_key,0));
  SELECT * INTO cached FROM public.tournament_stage_advance_mutations
  WHERE group_id=p_group_id AND operation='advance_division_group_rank_transitions'
    AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF cached.stage_id<>p_stage_id OR cached.payload_fingerprint<>fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023'; END IF;
    RETURN cached.response; END IF;

  SELECT * INTO s FROM public.tournament_stages WHERE id=p_stage_id AND group_id=p_group_id FOR UPDATE;
  IF NOT FOUND OR s.division_id IS NULL THEN
    RAISE EXCEPTION 'DIVISION_GROUP_STAGE_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  -- CAS tren ket qua vong bang: neu co correction chen vao giua luc route tinh
  -- standings va luc RPC chay, van tay se khac -> tu choi thay vi seed bang hang cu.
  IF p_expected_results_fingerprint IS NOT NULL THEN
    live_fingerprint := public.group_stage_results_fingerprint(p_group_id, p_stage_id);
    IF live_fingerprint IS DISTINCT FROM p_expected_results_fingerprint THEN
      RAISE EXCEPTION 'GROUP_RESULTS_CHANGED' USING ERRCODE='PH409',
        HINT = 'Ket qua vong bang vua thay doi. Tai lai bang xep hang roi tien cap lai.';
    END IF;
  END IF;

  IF EXISTS(SELECT 1 FROM public.tournament_matches m
            WHERE m.group_id=p_group_id AND m.stage_id=p_stage_id AND m.status NOT IN ('finalized','done')) THEN
    RAISE EXCEPTION 'STAGE_NOT_COMPLETE' USING ERRCODE='PH409'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tournament_stage_transitions t
                WHERE t.group_id=p_group_id AND t.source_stage_id=p_stage_id AND t.source_kind='group_rank') THEN
    RAISE EXCEPTION 'GROUP_TRANSITION_PLAN_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  FOR edge IN SELECT * FROM public.tournament_stage_transitions
              WHERE group_id=p_group_id AND source_stage_id=p_stage_id AND source_kind='group_rank'
              ORDER BY target_match_id,target_slot FOR UPDATE LOOP
    SELECT value INTO ranked FROM jsonb_array_elements(p_ranked)
    WHERE value->>'group_label'=edge.source_group_label AND (value->>'rank')::integer=edge.source_rank;

    -- E3: thieu hang trong bang gan nhu luon la bang qua it doi. Noi ro thay vi
    -- bao GROUP_RANKING_MISSING chung chung.
    IF ranked IS NULL THEN
      IF (SELECT count(*) FROM jsonb_array_elements(p_ranked) x
          WHERE x->>'group_label'=edge.source_group_label) < edge.source_rank THEN
        RAISE EXCEPTION 'GROUP_TOO_SMALL_FOR_TOP_TWO' USING ERRCODE='22023',
          HINT = format('Bang %s khong du %s doi de lay hang %s. Chia lai bang hoac bo ke hoach play-off.',
                        edge.source_group_label, edge.source_rank, edge.source_rank);
      END IF;
      RAISE EXCEPTION 'GROUP_RANKING_MISSING' USING ERRCODE='22023';
    END IF;

    v_entry_id:=(ranked->>'entry_id')::bigint;
    IF NOT EXISTS(SELECT 1 FROM public.tournament_entries e
                  WHERE e.id=v_entry_id AND e.group_id=p_group_id AND e.division_id=s.division_id
                    AND e.status='approved') THEN
      RAISE EXCEPTION 'GROUP_RANK_ENTRY_SCOPE_MISMATCH' USING ERRCODE='23503'; END IF;

    -- E7: mot suat khong duoc dien vao hai cho.
    IF v_entry_id = ANY(assigned_ids) THEN
      RAISE EXCEPTION 'GROUP_RANK_ENTRY_DUPLICATE' USING ERRCODE='22023',
        HINT = 'Mot suat thi dau duoc gan vao nhieu nhanh play-off.'; END IF;
    assigned_ids := array_append(assigned_ids, v_entry_id);

    SELECT * INTO target FROM public.tournament_matches WHERE id=edge.target_match_id FOR UPDATE;
    IF (edge.target_slot='a' AND target.entry_a_id IS NOT NULL AND target.entry_a_id<>v_entry_id)
       OR (edge.target_slot='b' AND target.entry_b_id IS NOT NULL AND target.entry_b_id<>v_entry_id) THEN
      RAISE EXCEPTION 'PLAYOFF_TARGET_CONFLICT' USING ERRCODE='PH409'; END IF;

    -- E4: chi bump version khi thuc su doi. Bump vo co lam scorekeeper dang giu
    -- expected_version cu bi 409 gia.
    v_changed := (edge.target_slot='a' AND target.entry_a_id IS DISTINCT FROM v_entry_id)
              OR (edge.target_slot='b' AND target.entry_b_id IS DISTINCT FROM v_entry_id);
    IF v_changed THEN
      UPDATE public.tournament_matches
      SET entry_a_id=CASE WHEN edge.target_slot='a' THEN v_entry_id ELSE entry_a_id END,
          entry_b_id=CASE WHEN edge.target_slot='b' THEN v_entry_id ELSE entry_b_id END,
          version=version+1
      WHERE id=target.id AND group_id=p_group_id;
      changed := changed + 1;
    END IF;

    INSERT INTO public.tournament_stage_entrants(group_id,stage_id,division_id,entry_id,seed_in_stage)
    VALUES(p_group_id,edge.target_stage_id,s.division_id,v_entry_id,CASE WHEN edge.target_slot='a' THEN 1 ELSE 2 END)
    ON CONFLICT (group_id,stage_id,entry_id) WHERE entry_id IS NOT NULL DO NOTHING;
    assignments:=assignments+1;
  END LOOP;

  UPDATE public.tournament_stages SET status='completed' WHERE id=s.id AND group_id=p_group_id;
  UPDATE public.tournament_stages p SET status='pending'
  WHERE p.group_id=p_group_id AND EXISTS(
    SELECT 1 FROM public.tournament_stage_transitions t WHERE t.target_stage_id=p.id AND t.source_stage_id=s.id);

  result:=jsonb_build_object('success',true,'advanced',assignments,'changed',changed,'transitioned',true);
  INSERT INTO public.tournament_stage_advance_mutations(group_id,operation,stage_id,next_stage_id,idempotency_key,payload_fingerprint,response)
  VALUES(p_group_id,'advance_division_group_rank_transitions',p_stage_id,NULL,p_idempotency_key,fingerprint,result);
  RETURN result;
END;$$;

REVOKE ALL ON FUNCTION public.advance_division_group_rank_transitions(bigint,bigint,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_division_group_rank_transitions(bigint,bigint,jsonb,text,text) TO service_role;

COMMENT ON FUNCTION public.guard_group_result_change_after_seed() IS
  'Chan sua ket qua vong bang sau khi suat vong sau da seed; khoa dong stage nguon de tuan tu hoa voi advance.';
COMMENT ON FUNCTION public.advance_division_group_rank_transitions(bigint,bigint,jsonb,text,text) IS
  'Seed play-off tu hang bang: CAS van tay ket qua, chi bump version khi doi, cam suat trung, bao ro khi bang qua it doi.';
