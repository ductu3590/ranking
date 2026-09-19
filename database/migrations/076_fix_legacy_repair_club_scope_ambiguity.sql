-- Fix for 075: the club-scope guard used `unnest(v_entry_club_ids) club_id`, but
-- public.tournament_clubs has its own column named club_id, so the unqualified
-- reference inside the inner subquery bound to c.club_id. The predicate became
-- `c.id = c.club_id` and every in-scope club was reported out of scope
-- (SETUP_SCOPE_MISMATCH, 23503). Same ambiguity class as migration 073.
--
-- 075's checked-in body already carries the corrected predicate, so on a fresh
-- database this migration is a verified no-op re-create. Against the database
-- where 075 was applied before the fix, it rewrites the deployed body in place.
-- Redefines the function only: no schema change, no data change.
BEGIN;

DO $fix$
DECLARE
  def text;
  fixed text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'repair_legacy_division_pair_identity';
  IF def IS NULL THEN
    RAISE EXCEPTION 'repair_legacy_division_pair_identity not found';
  END IF;

  fixed := replace(
    def,
    'SELECT 1 FROM unnest(v_entry_club_ids) club_id',
    'SELECT 1 FROM unnest(v_entry_club_ids) AS ec(entry_club_id)'
  );
  fixed := replace(
    fixed,
    'WHERE c.id = club_id AND c.group_id = p_group_id AND c.tournament_id = p_tournament_id',
    'WHERE c.id = ec.entry_club_id AND c.group_id = p_group_id AND c.tournament_id = p_tournament_id'
  );

  -- Never silently no-op: the corrected form must be present and the buggy form gone.
  IF position('unnest(v_entry_club_ids) AS ec(entry_club_id)' in fixed) = 0
     OR position('c.id = ec.entry_club_id' in fixed) = 0
     OR position('unnest(v_entry_club_ids) club_id' in fixed) > 0 THEN
    RAISE EXCEPTION 'club scope ambiguity rewrite did not apply cleanly';
  END IF;

  EXECUTE fixed;
END
$fix$;

REVOKE ALL ON FUNCTION public.repair_legacy_division_pair_identity(bigint,bigint,bigint,boolean,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_legacy_division_pair_identity(bigint,bigint,bigint,boolean,bigint,text)
  TO service_role;

COMMIT;
