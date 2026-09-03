-- Public tournament identity and visibility hardening.
-- Forward-only: historical migrations remain immutable.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
ALTER TABLE tournaments ALTER COLUMN visibility SET DEFAULT 'private';
UPDATE tournaments SET visibility = 'private' WHERE visibility IS NULL;
ALTER TABLE tournaments ALTER COLUMN visibility SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tournaments'::regclass
      AND conname = 'tournaments_visibility_check'
  ) THEN
    ALTER TABLE tournaments
      ADD CONSTRAINT tournaments_visibility_check
      CHECK (visibility IN ('private', 'unlisted', 'public'));
  END IF;
END $$;

-- Existing generated links remain usable, but are not searchable/indexable.
UPDATE tournaments
SET visibility = 'private'
WHERE public_slug IS NULL AND visibility <> 'private';

UPDATE tournaments
SET visibility = 'unlisted'
WHERE public_slug IS NOT NULL AND btrim(public_slug) <> '' AND visibility = 'private';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tournaments
    WHERE public_slug IS NOT NULL AND btrim(public_slug) = ''
  ) THEN
    RAISE EXCEPTION 'Cannot harden tournament slugs: blank public_slug values exist';
  END IF;

  IF EXISTS (
    SELECT lower(btrim(public_slug))
    FROM tournaments
    WHERE public_slug IS NOT NULL
    GROUP BY lower(btrim(public_slug))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot harden tournament slugs: duplicate public_slug values exist';
  END IF;
END $$;

UPDATE tournaments
SET public_slug = lower(btrim(public_slug))
WHERE public_slug IS NOT NULL;

DROP INDEX IF EXISTS idx_tournaments_group_slug;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_public_slug_lower
  ON tournaments (lower(public_slug))
  WHERE public_slug IS NOT NULL;

-- Browser clients must consume the server projection, never raw match/game rows.
DROP POLICY IF EXISTS tournament_matches_public_read ON tournament_matches;
DROP POLICY IF EXISTS tournament_games_public_read ON tournament_games;
REVOKE SELECT ON TABLE tournament_matches, tournament_games FROM anon;

COMMENT ON COLUMN tournaments.visibility IS 'Public link policy: private, unlisted, or public';
