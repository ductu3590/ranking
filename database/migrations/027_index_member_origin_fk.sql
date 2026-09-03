-- PickHub Phase 1: support the composite member-origin FK with a matching
-- child index. This avoids table scans when a club member is deleted or its
-- source group is updated.

CREATE INDEX IF NOT EXISTS idx_tournament_entrant_members_member_origin_fk
  ON public.tournament_entrant_members(member_id, member_group_id);
