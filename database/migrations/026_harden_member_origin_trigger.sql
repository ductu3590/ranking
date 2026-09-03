-- PickHub Phase 1: pin the trigger function search_path.
--
-- Migration 025 is already applied and recorded in production. Keep that
-- migration immutable; this forward-only patch addresses the Supabase advisor
-- warning without changing the member-origin data model.

ALTER FUNCTION public.set_tournament_entrant_member_origin()
  SET search_path = public;
