-- Run only after 026_harden_member_origin_trigger.sql succeeds on the target DB.
-- This records one already-applied migration; it does not run DDL.

BEGIN;

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc function_record
    JOIN pg_namespace namespace_record
      ON namespace_record.oid = function_record.pronamespace
    WHERE namespace_record.nspname = 'public'
      AND function_record.proname = 'set_tournament_entrant_member_origin'
      AND function_record.proconfig @> ARRAY['search_path=public']
  ) THEN
    RAISE EXCEPTION 'Migration 026 is not applied: trigger function search_path is not pinned';
  END IF;

  SELECT count(*)
  INTO mismatch_count
  FROM public.pickhub_schema_migrations
  WHERE filename = '026_harden_member_origin_trigger.sql'
    AND (
      version IS DISTINCT FROM 26
      OR checksum IS DISTINCT FROM
        'ae3fe2986d3aac0cadb1d1dd063b6e1dc70764280e57f68554b3bc8c620b42e3'
    );

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Migration 026 ledger checksum/version mismatch';
  END IF;

  INSERT INTO public.pickhub_schema_migrations
    (filename, version, checksum, applied_at, applied_by)
  VALUES (
    '026_harden_member_origin_trigger.sql',
    26,
    'ae3fe2986d3aac0cadb1d1dd063b6e1dc70764280e57f68554b3bc8c620b42e3',
    now(),
    current_user
  )
  ON CONFLICT (filename) DO NOTHING;
END $$;

SELECT filename, version, checksum, applied_at, applied_by
FROM public.pickhub_schema_migrations
WHERE filename = '026_harden_member_origin_trigger.sql';

COMMIT;
