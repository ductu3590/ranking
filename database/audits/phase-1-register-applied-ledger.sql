-- PickHub Phase 1: register migrations already applied manually.
--
-- This is NOT a migration. It does not alter business tables or run any DDL;
-- it only records the already-applied Phase 1 migration files in the ledger.
-- Run only after reviewing the production preflight and confirming that
-- migrations 017 through 024 completed successfully on this database.

BEGIN;

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT count(*)
  INTO mismatch_count
  FROM (
    SELECT expected.filename
    FROM (VALUES
      ('017_phase1_migration_ledger.sql', 17, '4e0330023c044328cf4e5120cbe7e25c88cb609209486215aaaba2513128b4e9'),
      ('018_tournament_public_identity.sql', 18, 'd56076485e3cb1e897f05d62bd4ff11bd3a1fc16b657aa6bdf76126e684fa406'),
      ('019_tournament_atomic_mutations.sql', 19, '9484fe2fb0cd258e5aa0bc5fb5d2f7f24235cd5d5c54f479d1d02eb9fce296b9'),
      ('020_phase1_tenant_constraints.sql', 20, 'a7deb9852b614fb590c20ce7a6077662ebe1f5ddaa8c3bf4ad2a9b6e4b517420'),
      ('021_phase1_rls_hardening.sql', 21, '166eda7790d7cf0f295516054410fe04e52ccc3073cb6f72bc4fe9e9a349c7b5'),
      ('022_fund_participant_tenancy.sql', 22, '508887e12f436bd6e95fc6fb0ae0629c65b89bd6f14e81ea266556082e98e9a0'),
      ('023_webhook_idempotency.sql', 23, '793512fe0d9858950f1b10d0a3773afd5a0a985de12d98cf5e3a219596c52924'),
      ('024_atomic_stage_advance.sql', 24, 'db8b3a5da2498982a7313754fe4c6de52034b81999c5ba9e2fb1235baef578aa')
    ) AS expected(filename, version, checksum)
    JOIN public.pickhub_schema_migrations actual
      ON actual.filename = expected.filename
    WHERE actual.version IS DISTINCT FROM expected.version
       OR actual.checksum IS DISTINCT FROM expected.checksum
  ) AS mismatches;

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION
      'Phase 1 ledger checksum/version mismatch; no rows were registered';
  END IF;

  INSERT INTO public.pickhub_schema_migrations
    (filename, version, checksum, applied_at, applied_by)
  SELECT filename, version, checksum, now(), current_user
  FROM (VALUES
    ('017_phase1_migration_ledger.sql', 17, '4e0330023c044328cf4e5120cbe7e25c88cb609209486215aaaba2513128b4e9'),
    ('018_tournament_public_identity.sql', 18, 'd56076485e3cb1e897f05d62bd4ff11bd3a1fc16b657aa6bdf76126e684fa406'),
    ('019_tournament_atomic_mutations.sql', 19, '9484fe2fb0cd258e5aa0bc5fb5d2f7f24235cd5d5c54f479d1d02eb9fce296b9'),
    ('020_phase1_tenant_constraints.sql', 20, 'a7deb9852b614fb590c20ce7a6077662ebe1f5ddaa8c3bf4ad2a9b6e4b517420'),
    ('021_phase1_rls_hardening.sql', 21, '166eda7790d7cf0f295516054410fe04e52ccc3073cb6f72bc4fe9e9a349c7b5'),
    ('022_fund_participant_tenancy.sql', 22, '508887e12f436bd6e95fc6fb0ae0629c65b89bd6f14e81ea266556082e98e9a0'),
    ('023_webhook_idempotency.sql', 23, '793512fe0d9858950f1b10d0a3773afd5a0a985de12d98cf5e3a219596c52924'),
    ('024_atomic_stage_advance.sql', 24, 'db8b3a5da2498982a7313754fe4c6de52034b81999c5ba9e2fb1235baef578aa')
  ) AS expected(filename, version, checksum)
  ON CONFLICT (filename) DO NOTHING;
END $$;

SELECT filename, version, checksum, applied_at, applied_by
FROM public.pickhub_schema_migrations
WHERE version BETWEEN 17 AND 24
ORDER BY version;

COMMIT;
