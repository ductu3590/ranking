-- 088 — pre-deploy correctness + security hardening (forward-only).
BEGIN;

-- CAS advance must cover both match results and the effective tie-break policy.
CREATE OR REPLACE FUNCTION public.group_stage_results_fingerprint(p_group_id bigint, p_stage_id bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(jsonb_build_object(
    'matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'version', m.version, 'winner_entry_id', m.winner_entry_id,
        'winner_entrant_id', m.winner_entrant_id, 'status', m.status
      ) ORDER BY m.id)
      FROM public.tournament_matches m
      WHERE m.group_id = p_group_id AND m.stage_id = p_stage_id
    ), '[]'::jsonb),
    'tiebreak', COALESCE(
      s.config->'tiebreak', d.tiebreak_override, t.tiebreak_policy,
      '{"version":"legacy_v2"}'::jsonb
    )
  )::text)
  FROM public.tournament_stages s
  JOIN public.tournaments t ON t.id=s.tournament_id AND t.group_id=s.group_id
  LEFT JOIN public.tournament_divisions d ON d.id=s.division_id AND d.group_id=s.group_id
  WHERE s.id=p_stage_id AND s.group_id=p_group_id;
$$;
REVOKE ALL ON FUNCTION public.group_stage_results_fingerprint(bigint,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_stage_results_fingerprint(bigint,bigint) TO service_role;

-- Serialize policy changes with advance by locking every affected source stage.
CREATE OR REPLACE FUNCTION public.guard_tiebreak_change_after_seed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_group_id bigint; v_tournament_id bigint; v_division_id bigint := NULL;
  v_stage record; v_seeded integer;
BEGIN
  IF TG_TABLE_NAME='tournaments' THEN
    IF NEW.tiebreak_policy IS NOT DISTINCT FROM OLD.tiebreak_policy THEN RETURN NEW; END IF;
    v_group_id:=NEW.group_id; v_tournament_id:=NEW.id;
  ELSE
    IF NEW.tiebreak_override IS NOT DISTINCT FROM OLD.tiebreak_override THEN RETURN NEW; END IF;
    v_group_id:=NEW.group_id; v_tournament_id:=NEW.tournament_id; v_division_id:=NEW.id;
  END IF;

  FOR v_stage IN
    SELECT DISTINCT s.id
    FROM public.tournament_stages s
    JOIN public.tournament_stage_transitions tr
      ON tr.source_stage_id=s.id AND tr.group_id=s.group_id AND tr.source_kind='group_rank'
    WHERE s.group_id=v_group_id AND s.tournament_id=v_tournament_id
      AND (v_division_id IS NULL OR s.division_id=v_division_id)
    ORDER BY s.id
  LOOP
    PERFORM 1 FROM public.tournament_stages
      WHERE id=v_stage.id AND group_id=v_group_id FOR UPDATE;
  END LOOP;

  SELECT count(*)::integer INTO v_seeded
  FROM public.tournament_stage_transitions tr
  JOIN public.tournament_stages s ON s.id=tr.source_stage_id AND s.group_id=tr.group_id
  JOIN public.tournament_matches tm ON tm.id=tr.target_match_id AND tm.group_id=tr.group_id
  WHERE tr.group_id=v_group_id AND tr.source_kind='group_rank'
    AND s.tournament_id=v_tournament_id
    AND (v_division_id IS NULL OR s.division_id=v_division_id)
    AND (tm.entrant_a_id IS NOT NULL OR tm.entrant_b_id IS NOT NULL
      OR tm.entry_a_id IS NOT NULL OR tm.entry_b_id IS NOT NULL OR tm.status<>'pending');
  IF v_seeded>0 THEN
    RAISE EXCEPTION 'TIEBREAK_CHANGE_BLOCKED_QUALIFICATION_SEEDED'
      USING ERRCODE='PH409', HINT='Gỡ seed play-off trước khi đổi luật tie-break.';
  END IF;
  RETURN NEW;
END; $$;

-- Direct DELETE of games is a result mutation and remains guarded. Only FK-cascade
-- teardown (nested trigger depth) may pass without blocking tournament deletion.
CREATE OR REPLACE FUNCTION public.guard_group_result_change_after_seed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_group_id bigint; v_match_id bigint; v_stage_id bigint; v_seeded integer := 0;
BEGIN
  IF TG_OP='DELETE' AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME='tournament_games' THEN
    v_group_id:=COALESCE(NEW.group_id,OLD.group_id); v_match_id:=COALESCE(NEW.match_id,OLD.match_id);
  ELSE
    v_group_id:=COALESCE(NEW.group_id,OLD.group_id); v_match_id:=COALESCE(NEW.id,OLD.id);
    IF TG_OP='UPDATE' AND NEW.winner_entrant_id IS NOT DISTINCT FROM OLD.winner_entrant_id
      AND NEW.winner_entry_id IS NOT DISTINCT FROM OLD.winner_entry_id THEN RETURN NEW; END IF;
  END IF;
  SELECT stage_id INTO v_stage_id FROM public.tournament_matches WHERE id=v_match_id AND group_id=v_group_id;
  IF v_stage_id IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_stage_transitions WHERE group_id=v_group_id AND source_kind='group_rank' AND source_stage_id=v_stage_id) THEN
    BEGIN
      PERFORM 1 FROM public.tournament_stages WHERE id=v_stage_id AND group_id=v_group_id FOR UPDATE NOWAIT;
    EXCEPTION WHEN lock_not_available THEN
      RAISE EXCEPTION 'GROUP_SEEDING_IN_PROGRESS' USING ERRCODE='PH409';
    END;
    SELECT count(*)::integer INTO v_seeded FROM public.tournament_stage_transitions tr
    JOIN public.tournament_matches tm ON tm.id=tr.target_match_id AND tm.group_id=tr.group_id
    WHERE tr.group_id=v_group_id AND tr.source_kind='group_rank' AND tr.source_stage_id=v_stage_id
      AND (tm.entrant_a_id IS NOT NULL OR tm.entrant_b_id IS NOT NULL OR tm.entry_a_id IS NOT NULL
        OR tm.entry_b_id IS NOT NULL OR tm.status<>'pending');
    IF v_seeded>0 THEN RAISE EXCEPTION 'GROUP_CORRECTION_BLOCKED_QUALIFICATION_SEEDED' USING ERRCODE='PH409'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
DROP TRIGGER IF EXISTS trg_tournament_games_group_seed_guard ON public.tournament_games;
CREATE TRIGGER trg_tournament_games_group_seed_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_games
FOR EACH ROW EXECUTE FUNCTION public.guard_group_result_change_after_seed();

-- All product access is server-side/service-role. Browser anon/authenticated must
-- not access these operational and mutation-ledger tables directly.
ALTER TABLE public.tournament_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_match_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_score_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_result_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_qr_checkin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_finance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_setup_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_stage_advance_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_division_roster_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_stage_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_result_correction_mutations ENABLE ROW LEVEL SECURITY;

COMMIT;