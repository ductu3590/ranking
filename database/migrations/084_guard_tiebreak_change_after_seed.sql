-- 084 — E5 mo rong: chan DOI CHINH SACH TIE-BREAK sau khi suat vong sau da seed.
--
-- Bo canh: 077/079/080 chan SUA KET QUA vong bang khi play-off da seed tu
-- group_rank, vi khi do bang xep hang doi ma qualifier van giu suat cu.
-- Doi tie-break gay ra DUNG hau qua do ma khong dong toi mot ket qua nao:
-- cung mot bo ket qua, doi thu tu tieu chi la doi hang, va suat A1/A2 da seed
-- tro thanh sai.
--
-- Vi sao chan chu khong tinh lai: giong 077 — tinh lai hang bang roi rewire
-- downstream mot cach atomic la thay doi lon tren RPC da deploy, va van phai tu
-- choi khi tran vong sau da bat dau. Chan cho ket qua dung tuyet doi, va lan nay
-- BTC DA CO duong phuc hoi that: action `unseed_playoff` (migration 082) +
-- nut "Go seed play-off" tren console.
--
-- Vi sao la trigger chu khong phai precheck o route: trigger nam trong CUNG
-- transaction voi lenh ghi nen khong the bi race, va co hieu luc voi MOI duong
-- ghi (route rules, SQL truc tiep, bat ky route nao khac).
--
-- ERRCODE 'PH409' (migration 078), KHONG dung '40001': tang PostgREST/pooler coi
-- 40001 la serialization_failure va tu dong retry, lam request treo thay vi tra loi.
--
-- Migration nay chi THEM function + 2 trigger. Khong doi schema, khong doi du
-- lieu, khong DROP/TRUNCATE. Viet idempotent, chay lai duoc.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_tiebreak_change_after_seed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_group_id bigint;
  v_tournament_id bigint;
  v_division_id bigint := NULL;
  v_seeded integer := 0;
BEGIN
  IF TG_TABLE_NAME = 'tournaments' THEN
    -- Chi quan tam khi CHINH SACH doi. Doi ten giai, trang thai... khong chan.
    IF NEW.tiebreak_policy IS NOT DISTINCT FROM OLD.tiebreak_policy THEN
      RETURN NEW;
    END IF;
    v_group_id := NEW.group_id;
    v_tournament_id := NEW.id;
  ELSE
    IF NEW.tiebreak_override IS NOT DISTINCT FROM OLD.tiebreak_override THEN
      RETURN NEW;
    END IF;
    v_group_id := NEW.group_id;
    v_tournament_id := NEW.tournament_id;
    v_division_id := NEW.id;
  END IF;

  -- Da co suat hang-bang nao duoc seed vao mot tran vong sau chua?
  -- Dieu kien "da seed" giong het 077/080 de hai guard khong noi hai chuyen khac nhau.
  SELECT count(*)::integer INTO v_seeded
  FROM public.tournament_stage_transitions t
  JOIN public.tournament_stages s
    ON s.id = t.source_stage_id AND s.group_id = t.group_id
  JOIN public.tournament_matches tm
    ON tm.id = t.target_match_id AND tm.group_id = t.group_id
  WHERE t.group_id = v_group_id
    AND t.source_kind = 'group_rank'
    AND s.tournament_id = v_tournament_id
    AND (v_division_id IS NULL OR s.division_id = v_division_id)
    AND (
      tm.entrant_a_id IS NOT NULL OR tm.entrant_b_id IS NOT NULL
      OR tm.entry_a_id IS NOT NULL OR tm.entry_b_id IS NOT NULL
      OR tm.status <> 'pending'
    );

  IF v_seeded > 0 THEN
    RAISE EXCEPTION 'TIEBREAK_CHANGE_BLOCKED_QUALIFICATION_SEEDED'
      USING ERRCODE = 'PH409',
            HINT = 'Suat vong sau da duoc seed tu hang bang. Go seed play-off roi moi doi luat tie-break.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournaments_tiebreak_seed_guard ON public.tournaments;
CREATE TRIGGER trg_tournaments_tiebreak_seed_guard
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.guard_tiebreak_change_after_seed();

DROP TRIGGER IF EXISTS trg_tournament_divisions_tiebreak_seed_guard ON public.tournament_divisions;
CREATE TRIGGER trg_tournament_divisions_tiebreak_seed_guard
  BEFORE UPDATE ON public.tournament_divisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_tiebreak_change_after_seed();

COMMENT ON FUNCTION public.guard_tiebreak_change_after_seed()
  IS 'Chan doi tiebreak_policy/tiebreak_override khi suat vong sau da seed tu group_rank (E5). Go seed truoc bang unseed_division_group_playoff.';

COMMIT;
