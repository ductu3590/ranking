-- Close legacy entry/pair-member mutation bypasses after roster lock.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_locked_division_setup_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_group_id bigint;
  v_division_id bigint;
  v_athlete_id bigint;
BEGIN
  IF TG_TABLE_NAME = 'tournament_entries' THEN
    v_group_id := COALESCE(NEW.group_id, OLD.group_id);
    v_division_id := COALESCE(NEW.division_id, OLD.division_id);
  ELSIF TG_TABLE_NAME = 'tournament_pair_members' THEN
    v_group_id := COALESCE(NEW.group_id, OLD.group_id);
    v_athlete_id := COALESCE(NEW.tournament_athlete_id, OLD.tournament_athlete_id);
    SELECT p.division_id INTO v_division_id
    FROM public.tournament_pairs p
    WHERE p.id = COALESCE(NEW.pair_id, OLD.pair_id) AND p.group_id = v_group_id;
    IF TG_OP = 'INSERT'
      AND EXISTS (SELECT 1 FROM public.tournament_division_roster_members r WHERE r.group_id = v_group_id AND r.division_id = v_division_id)
      AND NOT EXISTS (SELECT 1 FROM public.tournament_division_roster_members r WHERE r.group_id = v_group_id AND r.division_id = v_division_id AND r.tournament_athlete_id = v_athlete_id) THEN
      RAISE EXCEPTION 'PAIR_MEMBER_NOT_IN_DIVISION_ROSTER' USING ERRCODE = '23503';
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_divisions d
    WHERE d.id = v_division_id AND d.group_id = v_group_id AND d.roster_lock_status = 'locked'
  ) THEN
    RAISE EXCEPTION 'ROSTER_LOCKED' USING ERRCODE = '40001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournament_entries_roster_lock ON public.tournament_entries;
CREATE TRIGGER trg_tournament_entries_roster_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_division_setup_write();
DROP TRIGGER IF EXISTS trg_tournament_pair_members_roster_lock ON public.tournament_pair_members;
CREATE TRIGGER trg_tournament_pair_members_roster_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_pair_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_division_setup_write();

COMMENT ON FUNCTION public.guard_locked_division_setup_write()
  IS 'Chặn thay đổi entry hoặc thành viên pair sau khi roster nội dung đã khoá.';
COMMIT;
