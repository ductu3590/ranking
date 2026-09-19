-- E3 tu choi SOM tai buoc lap ke hoach top-two: moi bang phai du 2 doi.
-- Voi cach chia index % groupCount, kich thuoc cac bang lech nhau toi da 1, nen
-- dieu kien du la: so entry da duyet >= 2 * groupCount.
--
-- Ghi chu quy trinh: guard nay da duoc ap truoc do bang execute_sql nen KHONG vao
-- ledger. Migration nay ghi lai cho dung quy uoc va duoc viet IDEMPOTENT: neu guard
-- da co thi bo qua, chua co thi chen vao.
DO $fix$
DECLARE def text; fixed text; anchor text; ins text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='configure_top_two_group_playoff_revisioned';
  IF def IS NULL THEN RAISE EXCEPTION 'khong tim thay configure_top_two_group_playoff_revisioned'; END IF;

  IF position('GROUP_TOO_SMALL_FOR_TOP_TWO' in def) > 0 THEN
    RAISE NOTICE 'guard da co, bo qua';
    RETURN;
  END IF;

  anchor := 'IF EXISTS(SELECT 1 FROM public.tournament_matches m WHERE m.group_id=p_group_id AND m.stage_id=p_playoff_stage_id)';
  IF position(anchor in def) = 0 THEN RAISE EXCEPTION 'khong tim thay anchor trong ham'; END IF;

  ins := 'DECLARE v_groups integer; v_entries integer; BEGIN '
      || 'v_groups := GREATEST(COALESCE((g.config->>''groupCount'')::integer, 1), 1); '
      || 'SELECT count(*) INTO v_entries FROM public.tournament_entries e '
      || 'WHERE e.group_id=p_group_id AND e.division_id=p_division_id AND e.status=''approved''; '
      || 'IF v_entries < 2*v_groups THEN RAISE EXCEPTION ''GROUP_TOO_SMALL_FOR_TOP_TWO'' USING ERRCODE=''22023'', '
      || 'HINT=format(''Can it nhat %s suat cho %s bang (moi bang 2 doi vao ban ket); hien co %s.'', 2*v_groups, v_groups, v_entries); '
      || 'END IF; END; '
      || anchor;

  fixed := replace(def, anchor, ins);
  IF fixed = def THEN RAISE EXCEPTION 'khong chen duoc guard'; END IF;
  EXECUTE fixed;
END $fix$;
