-- PickHub Phase 1 tenant constraints.
-- Manual rollout only: run the read-only schema preflight first. Every
-- validation below aborts the migration instead of silently choosing a row.

-- Legacy club rows belong to the seeded default group until an explicit
-- ownership migration exists. This is the same backfill contract as 007.
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS group_id bigint REFERENCES public.groups(id);
ALTER TABLE public.quy_pickleball ADD COLUMN IF NOT EXISTS group_id bigint REFERENCES public.groups(id);
ALTER TABLE public.fund_events ADD COLUMN IF NOT EXISTS group_id bigint REFERENCES public.groups(id);
UPDATE public.club_members SET group_id = 1 WHERE group_id IS NULL;
UPDATE public.quy_pickleball SET group_id = 1 WHERE group_id IS NULL;
UPDATE public.fund_events SET group_id = 1 WHERE group_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.club_members
    WHERE btrim(full_name) = ''
       OR group_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot harden club_members: blank name or null group_id exists';
  END IF;
  IF EXISTS (
    SELECT group_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
    FROM public.club_members
    GROUP BY group_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot harden club_members: duplicate normalized names within a group';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quy_pickleball WHERE group_id IS NULL)
     OR EXISTS (SELECT 1 FROM public.fund_events WHERE group_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot harden club data: null group_id exists';
  END IF;
END $$;

ALTER TABLE public.club_members ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE public.quy_pickleball ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE public.fund_events ALTER COLUMN group_id SET NOT NULL;

-- Remove only the historical single-column UNIQUE(full_name) constraint.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.club_members'::regclass
      AND con.contype = 'u'
      AND con.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
         WHERE attrelid = con.conrelid AND attname = 'full_name' AND NOT attisdropped)
      ]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.club_members DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_club_members_group_full_name
  ON public.club_members(group_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')));

ALTER TABLE public.ranking_snapshots
  ADD COLUMN IF NOT EXISTS group_id bigint REFERENCES public.groups(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT snapshot.id
    FROM public.ranking_snapshots snapshot
    LEFT JOIN public.club_members member
      ON lower(regexp_replace(btrim(member.full_name), '\s+', ' ', 'g'))
       = lower(regexp_replace(btrim(snapshot.nguoi_nop), '\s+', ' ', 'g'))
    GROUP BY snapshot.id
    HAVING count(member.id) <> 1
  ) THEN
    RAISE EXCEPTION 'Cannot backfill ranking_snapshots: name is unmatched or ambiguous';
  END IF;
END $$;

UPDATE public.ranking_snapshots snapshot
SET group_id = member.group_id
FROM public.club_members member
WHERE lower(regexp_replace(btrim(member.full_name), '\s+', ' ', 'g'))
    = lower(regexp_replace(btrim(snapshot.nguoi_nop), '\s+', ' ', 'g'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ranking_snapshots WHERE group_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot harden ranking_snapshots: null group_id remains';
  END IF;
END $$;

ALTER TABLE public.ranking_snapshots ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE public.ranking_snapshots DROP CONSTRAINT IF EXISTS ranking_snapshots_unique_member_date;
CREATE UNIQUE INDEX IF NOT EXISTS ranking_snapshots_group_member_date
  ON public.ranking_snapshots(group_id, nguoi_nop, snapshot_date);

-- Refuse all existing orphan/cross-tenant relationships before adding FKs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tournament_stages child
    LEFT JOIN public.tournaments parent ON parent.id = child.tournament_id
    WHERE parent.id IS NULL OR parent.group_id IS DISTINCT FROM child.group_id
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_entrants child
    LEFT JOIN public.tournaments parent ON parent.id = child.tournament_id
    WHERE parent.id IS NULL OR parent.group_id IS DISTINCT FROM child.group_id
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_entrant_members child
    LEFT JOIN public.tournament_entrants parent ON parent.id = child.entrant_id
    WHERE parent.id IS NULL OR parent.group_id IS DISTINCT FROM child.group_id
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_entrant_members child
    LEFT JOIN public.club_members parent ON parent.id = child.member_id
    WHERE child.member_id IS NOT NULL
      AND (parent.id IS NULL OR parent.group_id IS DISTINCT FROM child.group_id)
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_stage_entrants child
    LEFT JOIN public.tournament_stages parent ON parent.id = child.stage_id
    WHERE parent.id IS NULL OR parent.group_id IS DISTINCT FROM child.group_id
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_stage_entrants child
    LEFT JOIN public.tournament_entrants parent ON parent.id = child.entrant_id
    WHERE parent.id IS NULL OR parent.group_id IS DISTINCT FROM child.group_id
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_matches child
    LEFT JOIN public.tournament_stages parent ON parent.id = child.stage_id
    WHERE parent.id IS NULL OR parent.group_id IS DISTINCT FROM child.group_id
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_games child
    LEFT JOIN public.tournament_matches parent ON parent.id = child.match_id
    WHERE parent.id IS NULL OR parent.group_id IS DISTINCT FROM child.group_id
  ) THEN
    RAISE EXCEPTION 'Cannot harden tournament tenancy: orphan or cross-tenant row exists';
  END IF;
END $$;

-- Composite references need a matching parent key; id remains the primary key.
CREATE UNIQUE INDEX IF NOT EXISTS tournaments_id_group_key
  ON public.tournaments(id, group_id);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_stages_id_group_key
  ON public.tournament_stages(id, group_id);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_entrants_id_group_key
  ON public.tournament_entrants(id, group_id);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_matches_id_group_key
  ON public.tournament_matches(id, group_id);

DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('tournament_stages', 'tournament_stages_group_tournament_fk', 'tournament_id', 'tournaments'),
      ('tournament_entrants', 'tournament_entrants_group_tournament_fk', 'tournament_id', 'tournaments'),
      ('tournament_entrant_members', 'tournament_entrant_members_group_entrant_fk', 'entrant_id', 'tournament_entrants'),
      ('tournament_stage_entrants', 'tournament_stage_entrants_group_stage_fk', 'stage_id', 'tournament_stages'),
      ('tournament_stage_entrants', 'tournament_stage_entrants_group_entrant_fk', 'entrant_id', 'tournament_entrants'),
      ('tournament_matches', 'tournament_matches_group_stage_fk', 'stage_id', 'tournament_stages'),
      ('tournament_matches', 'tournament_matches_group_entrant_a_fk', 'entrant_a_id', 'tournament_entrants'),
      ('tournament_matches', 'tournament_matches_group_entrant_b_fk', 'entrant_b_id', 'tournament_entrants'),
      ('tournament_matches', 'tournament_matches_group_winner_fk', 'winner_entrant_id', 'tournament_entrants'),
      ('tournament_matches', 'tournament_matches_group_parent_fk', 'parent_match_id', 'tournament_matches'),
      ('tournament_games', 'tournament_games_group_match_fk', 'match_id', 'tournament_matches'),
      ('tournament_games', 'tournament_games_group_winner_fk', 'winner_entrant_id', 'tournament_entrants')
    ) AS rows(table_name, constraint_name, child_id, parent_table)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = format('public.%s', spec.table_name)::regclass
        AND conname = spec.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I, group_id) REFERENCES public.%I (id, group_id)',
        spec.table_name, spec.constraint_name, spec.child_id, spec.parent_table
      );
    END IF;
  END LOOP;
END $$;

-- A non-null member_id is a real club member; NULL is the explicit guest form.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tournament_entrant_members'::regclass
      AND conname = 'tournament_entrant_members_member_fk'
  ) THEN
    ALTER TABLE public.tournament_entrant_members
      ADD CONSTRAINT tournament_entrant_members_member_fk
      FOREIGN KEY (member_id) REFERENCES public.club_members(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON INDEX public.idx_club_members_group_full_name IS 'Tên chỉ duy nhất trong phạm vi một CLB';
COMMENT ON COLUMN public.tournament_entrant_members.member_id IS 'NULL = guest; non-null = club_members identity';
