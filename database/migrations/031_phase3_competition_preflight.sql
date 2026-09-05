-- PickHub Phase 3 Task 1: compatibility inventory and preflight.
-- Read-only by design. This migration does not backfill or mutate tournament data.
--
-- Temporary tenant policy:
-- `group_id` remains a technical tenant during convergence. Community tournaments
-- will use a dedicated PickHub system group, not a participating club. The group
-- must be provisioned explicitly before a community tournament is created.
--
-- Legacy status mapping documented here and verified by the contract test:
-- tournament: draft -> draft, active -> registration_open/live after inventory,
-- completed -> completed.
-- match: pending -> pending, live -> live, done -> submitted/finalized after
-- result inventory. No ambiguous status is silently remapped.

BEGIN;

DO $$
DECLARE
  orphan_count bigint;
  mismatch_count bigint;
  community_without_tenant bigint;
BEGIN
  -- Parent integrity checks.
  SELECT count(*) INTO orphan_count
  FROM public.tournament_stages s
  LEFT JOIN public.tournaments t ON t.id = s.tournament_id
  WHERE t.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Phase 3 preflight blocked: orphan tournament_stages=%', orphan_count;
  END IF;

  SELECT count(*) INTO orphan_count
  FROM public.tournament_entrants e
  LEFT JOIN public.tournaments t ON t.id = e.tournament_id
  WHERE t.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Phase 3 preflight blocked: orphan tournament_entrants=%', orphan_count;
  END IF;

  SELECT count(*) INTO orphan_count
  FROM public.tournament_matches m
  LEFT JOIN public.tournament_stages s ON s.id = m.stage_id
  WHERE s.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Phase 3 preflight blocked: orphan tournament_matches.stage_id=%', orphan_count;
  END IF;

  SELECT count(*) INTO orphan_count
  FROM public.tournament_matches m
  LEFT JOIN public.tournament_entrants e ON e.id = m.entrant_a_id
  WHERE m.entrant_a_id IS NOT NULL AND e.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Phase 3 preflight blocked: orphan match entrant_a_id=%', orphan_count;
  END IF;

  SELECT count(*) INTO orphan_count
  FROM public.tournament_matches m
  LEFT JOIN public.tournament_entrants e ON e.id = m.entrant_b_id
  WHERE m.entrant_b_id IS NOT NULL AND e.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Phase 3 preflight blocked: orphan match entrant_b_id=%', orphan_count;
  END IF;

  SELECT count(*) INTO orphan_count
  FROM public.tournament_matches m
  LEFT JOIN public.tournament_entrants e ON e.id = m.winner_entrant_id
  WHERE m.winner_entrant_id IS NOT NULL AND e.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Phase 3 preflight blocked: orphan match winner_entrant_id=%', orphan_count;
  END IF;

  -- Tenant consistency checks needed before adding division_id to the legacy graph.
  SELECT count(*) INTO mismatch_count
  FROM public.tournament_stages s
  JOIN public.tournaments t ON t.id = s.tournament_id
  WHERE s.group_id IS DISTINCT FROM t.group_id;
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Phase 3 preflight blocked: stage/tournament group mismatch=%', mismatch_count;
  END IF;

  SELECT count(*) INTO mismatch_count
  FROM public.tournament_entrants e
  JOIN public.tournaments t ON t.id = e.tournament_id
  WHERE e.group_id IS DISTINCT FROM t.group_id;
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Phase 3 preflight blocked: entrant/tournament group mismatch=%', mismatch_count;
  END IF;

  SELECT count(*) INTO mismatch_count
  FROM public.tournament_matches m
  JOIN public.tournament_stages s ON s.id = m.stage_id
  WHERE m.group_id IS DISTINCT FROM s.group_id;
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Phase 3 preflight blocked: match/stage group mismatch=%', mismatch_count;
  END IF;

  -- Community is global. Do not invent an organizer_community_id or silently
  -- use a participating club as tenant. A later schema migration must provide
  -- the explicit system group before any community row is materialized.
  IF to_regclass('public.tournaments') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.tournaments
       WHERE organizer_type = 'community'
     )
  THEN
    SELECT count(*) INTO community_without_tenant
    FROM public.tournaments t
    LEFT JOIN public.groups g ON g.id = t.group_id
    WHERE t.organizer_type = 'community'
      AND (g.id IS NULL OR NOT (
        lower(coalesce(g.name, '')) LIKE '%pickhub%'
        OR lower(coalesce(g.name, '')) LIKE '%system%'
        OR lower(coalesce(g.code, '')) LIKE '%system%'
      ));
    IF community_without_tenant > 0 THEN
      RAISE EXCEPTION 'Phase 3 preflight blocked: community tournaments without PickHub system group=%', community_without_tenant;
    END IF;
  END IF;

  RAISE NOTICE 'Phase 3 preflight passed: legacy parent/orphan/tenant checks are clean';
END $$;

-- This task is intentionally read-only; do not record a schema/data mutation.
ROLLBACK;
