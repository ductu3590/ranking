-- Run only after 027_index_member_origin_fk.sql succeeds on the target DB.
-- This records one already-applied migration; it does not run DDL.

BEGIN;

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'tournament_entrant_members'
      AND indexname = 'idx_tournament_entrant_members_member_origin_fk'
  ) THEN
    RAISE EXCEPTION 'Migration 027 is not applied: member-origin FK index is missing';
  END IF;

  SELECT count(*)
  INTO mismatch_count
  FROM public.pickhub_schema_migrations
  WHERE filename = '027_index_member_origin_fk.sql'
    AND (
      version IS DISTINCT FROM 27
      OR checksum IS DISTINCT FROM
        '4eb2303ed5c28199e0d9752fa9169b176ab2ad0932429458497d51d8d177c842'
    );

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Migration 027 ledger checksum/version mismatch';
  END IF;

  INSERT INTO public.pickhub_schema_migrations
    (filename, version, checksum, applied_at, applied_by)
  VALUES (
    '027_index_member_origin_fk.sql',
    27,
    '4eb2303ed5c28199e0d9752fa9169b176ab2ad0932429458497d51d8d177c842',
    now(),
    current_user
  )
  ON CONFLICT (filename) DO NOTHING;
END $$;

SELECT filename, version, checksum, applied_at, applied_by
FROM public.pickhub_schema_migrations
WHERE filename = '027_index_member_origin_fk.sql';

COMMIT;
