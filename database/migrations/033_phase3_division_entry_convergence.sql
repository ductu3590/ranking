-- PickHub Phase 3 Task 3: converge division -> entry -> stage -> match.
-- Forward-only. Migration 030/031/032 are already applied and are not edited.
--
-- Explicit legacy status decisions:
-- tournament active -> registration_open
-- match done -> finalized
-- A legacy active tournament is not promoted to live without an explicit
-- operations transition.

BEGIN;

DO $$
DECLARE
  orphan_count bigint;
  ambiguous_count bigint;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM public.tournament_stages s
  LEFT JOIN public.tournaments t ON t.id = s.tournament_id
  WHERE t.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Task 3 blocked: orphan stages=%', orphan_count;
  END IF;

  SELECT count(*) INTO orphan_count
  FROM public.tournament_matches m
  LEFT JOIN public.tournament_stages s ON s.id = m.stage_id
  WHERE s.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Task 3 blocked: orphan matches=%', orphan_count;
  END IF;

  SELECT count(*) INTO orphan_count
  FROM public.tournament_games g
  LEFT JOIN public.tournament_matches m ON m.id = g.match_id
  WHERE m.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Task 3 blocked: orphan games=%', orphan_count;
  END IF;

  SELECT count(*) INTO ambiguous_count
  FROM public.tournament_stages s
  JOIN public.tournaments t ON t.id = s.tournament_id
  WHERE s.group_id IS DISTINCT FROM t.group_id;
  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Task 3 blocked: stage/tournament tenant mismatch=%', ambiguous_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_divisions_tournament_name
  ON public.tournament_divisions(tournament_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_divisions_id_tournament
  ON public.tournament_divisions(id, tournament_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_entries_id_division
  ON public.tournament_entries(id, division_id);

-- Existing tournaments without a division receive one explicit legacy container;
-- no stage/entrant/match data is deleted or rewritten by identity.
INSERT INTO public.tournament_divisions (
  group_id, tournament_id, name, entrant_type, competition_template,
  ruleset_version, registration_status, scheduling_status, competition_status
)
SELECT t.group_id, t.id, 'Legacy import',
       CASE WHEN t.entrant_type = 'pair' THEN 'pair' ELSE 'team' END,
       'legacy_v2', '1', 'closed', 'pending', 'pending'
FROM public.tournaments t
WHERE NOT EXISTS (
  SELECT 1 FROM public.tournament_divisions d WHERE d.tournament_id = t.id
);

ALTER TABLE public.tournament_stages
  ADD COLUMN IF NOT EXISTS division_id bigint;
ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS division_id bigint,
  ADD COLUMN IF NOT EXISTS entry_a_id bigint,
  ADD COLUMN IF NOT EXISTS entry_b_id bigint,
  ADD COLUMN IF NOT EXISTS winner_entry_id bigint,
  ADD COLUMN IF NOT EXISTS result_type text NOT NULL DEFAULT 'simple';
ALTER TABLE public.tournament_stage_entrants
  ADD COLUMN IF NOT EXISTS division_id bigint,
  ADD COLUMN IF NOT EXISTS entry_id bigint;

DO $$
DECLARE
  ambiguous_count bigint;
BEGIN
  SELECT count(*) INTO ambiguous_count
  FROM public.tournament_stages s
  WHERE s.division_id IS NULL
    AND (SELECT count(*) FROM public.tournament_divisions d WHERE d.tournament_id = s.tournament_id) <> 1;
  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Task 3 blocked: stages have ambiguous division backfill=%', ambiguous_count;
  END IF;
END $$;

UPDATE public.tournament_stages s
SET division_id = d.id
FROM public.tournament_divisions d
WHERE s.division_id IS NULL AND d.tournament_id = s.tournament_id;

UPDATE public.tournament_matches m
SET division_id = s.division_id
FROM public.tournament_stages s
WHERE m.division_id IS NULL AND s.id = m.stage_id;

UPDATE public.tournament_stage_entrants se
SET division_id = s.division_id
FROM public.tournament_stages s
WHERE se.division_id IS NULL AND s.id = se.stage_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_stages_id_division
  ON public.tournament_stages(id, division_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tournament_stages WHERE division_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.tournament_matches WHERE division_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.tournament_stage_entrants WHERE division_id IS NULL)
  THEN
    RAISE EXCEPTION 'Task 3 blocked: division backfill left NULL rows';
  END IF;
END $$;

ALTER TABLE public.tournament_stages ALTER COLUMN division_id SET NOT NULL;
ALTER TABLE public.tournament_matches ALTER COLUMN division_id SET NOT NULL;
ALTER TABLE public.tournament_stage_entrants ALTER COLUMN division_id SET NOT NULL;

ALTER TABLE public.tournament_stages
  DROP CONSTRAINT IF EXISTS tournament_stages_division_fk,
  ADD CONSTRAINT tournament_stages_division_fk
    FOREIGN KEY (division_id, tournament_id)
    REFERENCES public.tournament_divisions(id, tournament_id)
    ON DELETE CASCADE;
ALTER TABLE public.tournament_matches
  DROP CONSTRAINT IF EXISTS tournament_matches_stage_division_fk,
  ADD CONSTRAINT tournament_matches_stage_division_fk
    FOREIGN KEY (stage_id, division_id)
    REFERENCES public.tournament_stages(id, division_id)
    ON DELETE CASCADE;
ALTER TABLE public.tournament_matches
  DROP CONSTRAINT IF EXISTS tournament_matches_entry_a_division_fk,
  ADD CONSTRAINT tournament_matches_entry_a_division_fk
    FOREIGN KEY (entry_a_id, division_id)
    REFERENCES public.tournament_entries(id, division_id)
    ON DELETE SET NULL,
  DROP CONSTRAINT IF EXISTS tournament_matches_entry_b_division_fk,
  ADD CONSTRAINT tournament_matches_entry_b_division_fk
    FOREIGN KEY (entry_b_id, division_id)
    REFERENCES public.tournament_entries(id, division_id)
    ON DELETE SET NULL,
  DROP CONSTRAINT IF EXISTS tournament_matches_winner_entry_division_fk,
  ADD CONSTRAINT tournament_matches_winner_entry_division_fk
    FOREIGN KEY (winner_entry_id, division_id)
    REFERENCES public.tournament_entries(id, division_id)
    ON DELETE SET NULL;
ALTER TABLE public.tournament_stage_entrants
  DROP CONSTRAINT IF EXISTS tournament_stage_entrants_entry_fk,
  ADD CONSTRAINT tournament_stage_entrants_entry_fk
    FOREIGN KEY (entry_id) REFERENCES public.tournament_entries(id) ON DELETE CASCADE;

-- Status mapping is explicit and performed before the new checks are installed.
UPDATE public.tournaments SET status = 'registration_open' WHERE status = 'active';
UPDATE public.tournament_matches SET status = 'finalized' WHERE status = 'done';

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.tournaments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.tournaments DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.tournament_matches'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.tournament_matches DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_status_phase3_ck
  CHECK (status IN ('draft', 'registration_open', 'registration_closed', 'scheduled', 'live', 'completed', 'archived'));
ALTER TABLE public.tournament_matches
  ADD CONSTRAINT tournament_matches_status_phase3_ck
  CHECK (status IN ('pending', 'live', 'finalized'));

DROP INDEX IF EXISTS public.idx_tournaments_group_slug;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_public_slug_lower
  ON public.tournaments (lower(public_slug))
  WHERE public_slug IS NOT NULL;

COMMENT ON COLUMN public.tournaments.status IS 'Phase 3 state: active legacy maps to registration_open; live is explicit operations state.';
COMMENT ON COLUMN public.tournament_matches.status IS 'Phase 3 state: done legacy maps to finalized; correction workflow is Phase 4.';
COMMENT ON COLUMN public.tournament_matches.result_type IS 'Versioned result/policy discriminator; Phase 3 defaults to simple.';

COMMIT;
