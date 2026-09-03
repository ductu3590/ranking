-- PickHub Phase 1: preserve tournament ownership while recording member origin.
--
-- tournament_entrant_members.group_id is the organizer/tournament tenant. It
-- must not be compared with club_members.group_id because a tournament may
-- invite a member whose home club is different from the organizer.

ALTER TABLE public.tournament_entrant_members
  ADD COLUMN IF NOT EXISTS member_group_id bigint;

-- Migration 022 creates this parent key. Keep the migration idempotent for a
-- database that already has the key under the expected name.
CREATE UNIQUE INDEX IF NOT EXISTS club_members_id_group_key
  ON public.club_members(id, group_id);

-- Existing linked members inherit the source club from their club_members row.
UPDATE public.tournament_entrant_members AS entrant_member
SET member_group_id = member.group_id
FROM public.club_members AS member
WHERE entrant_member.member_id = member.id
  AND entrant_member.member_group_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tournament_entrant_members
    WHERE (member_id IS NULL) IS DISTINCT FROM (member_group_id IS NULL)
  ) THEN
    RAISE EXCEPTION
      'Cannot harden tournament member origin: member_id/member_group_id nullability mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tournament_entrant_members AS entrant_member
    LEFT JOIN public.club_members AS member
      ON member.id = entrant_member.member_id
     AND member.group_id = entrant_member.member_group_id
    WHERE entrant_member.member_id IS NOT NULL
      AND member.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot harden tournament member origin: member does not belong to member_group_id';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tournament_entrant_members'::regclass
      AND conname = 'tournament_entrant_members_member_origin_shape'
  ) THEN
    ALTER TABLE public.tournament_entrant_members
      ADD CONSTRAINT tournament_entrant_members_member_origin_shape
      CHECK (
        (member_id IS NULL AND member_group_id IS NULL)
        OR (member_id IS NOT NULL AND member_group_id IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tournament_entrant_members'::regclass
      AND conname = 'tournament_entrant_members_group_member_fk'
  ) THEN
    ALTER TABLE public.tournament_entrant_members
      ADD CONSTRAINT tournament_entrant_members_group_member_fk
      FOREIGN KEY (member_id, member_group_id)
      REFERENCES public.club_members(id, group_id)
      ON DELETE SET NULL (member_id, member_group_id);
  END IF;
END $$;

-- Compatibility window for the currently deployed PickHub build: older code
-- sends member_id but does not know member_group_id yet. The trigger derives
-- the source group from the authoritative member row and prevents a caller
-- from supplying a forged source group.
CREATE OR REPLACE FUNCTION public.set_tournament_entrant_member_origin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.member_id IS NULL THEN
    NEW.member_group_id := NULL;
  ELSE
    SELECT member.group_id
    INTO NEW.member_group_id
    FROM public.club_members AS member
    WHERE member.id = NEW.member_id;

    IF NEW.member_group_id IS NULL THEN
      RAISE EXCEPTION
        'Cannot set tournament member origin: member_id % does not exist',
        NEW.member_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournament_entrant_members_set_member_origin
  ON public.tournament_entrant_members;

CREATE TRIGGER tournament_entrant_members_set_member_origin
BEFORE INSERT OR UPDATE OF member_id, member_group_id
ON public.tournament_entrant_members
FOR EACH ROW
EXECUTE FUNCTION public.set_tournament_entrant_member_origin();

-- The composite FK supersedes the old weaker FK while preserving guest rows.
ALTER TABLE public.tournament_entrant_members
  DROP CONSTRAINT IF EXISTS tournament_entrant_members_member_fk;

CREATE INDEX IF NOT EXISTS idx_tournament_entrant_members_member_origin
  ON public.tournament_entrant_members(member_group_id, member_id)
  WHERE member_id IS NOT NULL;

COMMENT ON COLUMN public.tournament_entrant_members.group_id IS
  'Tenant of the tournament/organizer; independent from member origin';
COMMENT ON COLUMN public.tournament_entrant_members.member_group_id IS
  'Source club of member_id; NULL together with member_id means guest';
COMMENT ON FUNCTION public.set_tournament_entrant_member_origin() IS
  'Derive member_group_id from club_members for old and new entrant writers';
