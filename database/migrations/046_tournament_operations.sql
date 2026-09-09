-- 046_tournament_operations.sql
-- Moc thoi gian tran va mo rong trang thai dieu hanh giai.
-- Idempotent; chi them cot, rang buoc va index.

ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz;
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS ended_at timestamptz;

ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_phase3_ck;
ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_phase4_ck;
ALTER TABLE public.tournament_matches ADD CONSTRAINT tournament_matches_status_phase4_ck
  CHECK (status IN ('pending','warmup','live','paused','finalized'));

ALTER TABLE public.tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_result_type_ck;
ALTER TABLE public.tournament_matches ADD CONSTRAINT tournament_matches_result_type_ck
  CHECK (result_type IN ('simple','mlp','team','walkover','retired'));

CREATE INDEX IF NOT EXISTS idx_tournament_matches_stage_status
  ON public.tournament_matches(group_id, stage_id, status);

COMMENT ON COLUMN public.tournament_matches.warmup_started_at IS 'Luc goi vao san, bat dau dem nguoc thu san';
COMMENT ON COLUMN public.tournament_matches.started_at IS 'Luc bat dau dau that su';
COMMENT ON COLUMN public.tournament_matches.ended_at IS 'Luc chot tran';
COMMENT ON COLUMN public.tournament_matches.court IS 'DI SAN - nguon su that la tournament_match_assignments.court_id';