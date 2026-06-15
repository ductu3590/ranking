-- 014: tournaments.id was created as a bare INTEGER PRIMARY KEY with no default
-- (migration 006 inserted the first row with a hardcoded id=1). Creating any
-- further tournament fails with a NOT NULL violation on id. Give it an
-- auto-increment default via an owned sequence, seeded past the current max.

CREATE SEQUENCE IF NOT EXISTS tournaments_id_seq OWNED BY tournaments.id;

-- Next nextval() returns MAX(id)+1 (false = do not advance past the given value).
SELECT setval('tournaments_id_seq', COALESCE((SELECT MAX(id) FROM tournaments), 0) + 1, false);

ALTER TABLE tournaments ALTER COLUMN id SET DEFAULT nextval('tournaments_id_seq');
