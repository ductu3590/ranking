-- PickHub Phase 1: remove legacy permissive policies left by migration 005.
-- All club data is served through server routes in the signed-session boundary;
-- the authenticated group policies from migration 009 remain the backstop for
-- clients that still use a Supabase Auth session.

-- ranking_snapshots was created before the multitenant RLS migration and was
-- explicitly left open by migration 002. It has no browser read path now.
ALTER TABLE public.ranking_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ranking_snapshots FROM PUBLIC, anon, authenticated;

-- Drop policies by their exact historical names. Policies are permissive and
-- combine with the scoped policies from migration 009, so merely adding a new
-- restrictive policy would not close the old access path.
DROP POLICY IF EXISTS "Public read fund_events" ON public.fund_events;
DROP POLICY IF EXISTS "Public read fund_event_participants" ON public.fund_event_participants;
DROP POLICY IF EXISTS "Authenticated manage fund_events" ON public.fund_events;
DROP POLICY IF EXISTS "Authenticated manage fund_event_participants" ON public.fund_event_participants;

-- No anonymous direct reads/writes of club financial data. Authenticated access
-- is still governed by the group-scoped policies from migration 009.
REVOKE ALL ON TABLE public.fund_events, public.fund_event_participants FROM anon;

COMMENT ON TABLE public.ranking_snapshots IS
  'Tenant-scoped ranking history; access only through server-authorized routes';
