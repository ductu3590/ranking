-- Run only after 025_tournament_member_origin.sql succeeds on the target DB.
-- This records one already-applied migration; it does not run DDL.

BEGIN;

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournament_entrant_members'
      AND column_name = 'member_group_id'
  ) THEN
    RAISE EXCEPTION 'Migration 025 is not applied: member_group_id is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tournament_entrant_members'::regclass
      AND conname = 'tournament_entrant_members_group_member_fk'
  ) THEN
    RAISE EXCEPTION 'Migration 025 is not applied: composite member FK is missing';
  END IF;

  SELECT count(*)
  INTO mismatch_count
  FROM public.pickhub_schema_migrations
  WHERE filename = '025_tournament_member_origin.sql'
    AND (
      version IS DISTINCT FROM 25
      OR checksum IS DISTINCT FROM
        '1295471e85a685ce1852a2b179568b7f221d9c65f9cbf73cefee754180ea6714'
    );

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Migration 025 ledger checksum/version mismatch';
  END IF;

  INSERT INTO public.pickhub_schema_migrations
    (filename, version, checksum, applied_at, applied_by)
  VALUES (
    '025_tournament_member_origin.sql',
    25,
    '1295471e85a685ce1852a2b179568b7f221d9c65f9cbf73cefee754180ea6714',
    now(),
    current_user
  )
  ON CONFLICT (filename) DO NOTHING;
END $$;

SELECT filename, version, checksum, applied_at, applied_by
FROM public.pickhub_schema_migrations
WHERE filename = '025_tournament_member_origin.sql';

COMMIT;
