-- 079 da tuan tu hoa dung (do duoc: correction bi chan 9.7s khi advance giu khoa
-- dong stage), nhung ket cuc la 57014 "statement timeout" -> HTTP 500 mo ho.
-- Doi sang FOR UPDATE NOWAIT: neu dang co seed chay do dang thi TU CHOI NGAY bang
-- mot ma xung dot ro rang, khong ghi gi, thay vi cho den khi het statement_timeout.
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

  IF EXISTS (
    SELECT 1 FROM public.tournament_stage_transitions t
    WHERE t.group_id = v_group_id AND t.source_kind = 'group_rank' AND t.source_stage_id = v_stage_id
  ) THEN
    -- Lay DUNG khoa ma advance lay, nhung KHONG CHO. Dang seed do dang thi tu choi
    -- ngay: neu cho, ta se doc trang thai cu roi ghi de len ket qua cua seed.
    BEGIN
      PERFORM 1 FROM public.tournament_stages
      WHERE id = v_stage_id AND group_id = v_group_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'GROUP_SEEDING_IN_PROGRESS' USING ERRCODE = 'PH409',
        HINT = 'Dang tien cap vong bang len play-off. Doi thao tac do xong roi thu lai.';
    END;

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

COMMENT ON FUNCTION public.guard_group_result_change_after_seed() IS
  'Chan sua ket qua vong bang khi da seed; dung FOR UPDATE NOWAIT de tu choi ngay khi seed dang chay.';
