-- PickHub Phase 1: make fund-event participants explicitly tenant-scoped.
-- Migration 005 left this join table parent-scoped only, which allowed a
-- service-role write to combine an event from one club with a member from
-- another. Apply after 020 has made both parent tables non-null scoped.

ALTER TABLE public.fund_event_participants
  ADD COLUMN IF NOT EXISTS group_id bigint REFERENCES public.groups(id);

UPDATE public.fund_event_participants participant
SET group_id = event.group_id
FROM public.fund_events event
WHERE event.id = participant.event_id
  AND participant.group_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.fund_event_participants participant
    LEFT JOIN public.fund_events event ON event.id = participant.event_id
    WHERE event.id IS NULL
       OR participant.group_id IS DISTINCT FROM event.group_id
  ) THEN
    RAISE EXCEPTION 'Cannot harden fund_event_participants: orphan or cross-tenant event exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fund_event_participants participant
    JOIN public.fund_events event ON event.id = participant.event_id
    LEFT JOIN public.club_members member ON member.id = participant.member_id
    WHERE participant.member_id IS NOT NULL
      AND (member.id IS NULL OR member.group_id IS DISTINCT FROM event.group_id)
  ) THEN
    RAISE EXCEPTION 'Cannot harden fund_event_participants: orphan or cross-tenant member exists';
  END IF;

  IF EXISTS (SELECT 1 FROM public.fund_event_participants WHERE group_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot harden fund_event_participants: null group_id remains';
  END IF;
END $$;

ALTER TABLE public.fund_event_participants
  ALTER COLUMN event_id SET NOT NULL,
  ALTER COLUMN group_id SET NOT NULL;

-- PostgreSQL requires a matching unique parent key for composite references.
CREATE UNIQUE INDEX IF NOT EXISTS fund_events_id_group_key
  ON public.fund_events(id, group_id);
CREATE UNIQUE INDEX IF NOT EXISTS club_members_id_group_key
  ON public.club_members(id, group_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fund_event_participants'::regclass
      AND conname = 'fund_event_participants_group_event_fk'
  ) THEN
    ALTER TABLE public.fund_event_participants
      ADD CONSTRAINT fund_event_participants_group_event_fk
      FOREIGN KEY (event_id, group_id)
      REFERENCES public.fund_events(id, group_id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fund_event_participants'::regclass
      AND conname = 'fund_event_participants_group_member_fk'
  ) THEN
    ALTER TABLE public.fund_event_participants
      ADD CONSTRAINT fund_event_participants_group_member_fk
      FOREIGN KEY (member_id, group_id)
      REFERENCES public.club_members(id, group_id)
      ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN public.fund_event_participants.group_id IS
  'Tenant copied from fund_events; composite FKs prevent cross-club joins';
