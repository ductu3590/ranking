-- 047_tournament_draw_and_results.sql
-- Định tuyến kẻ thua cho double elimination, hạng chung cuộc ghim khi chốt giải,
-- và siết trạng thái correction. Idempotent; chỉ thêm cột và constraint.

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS loser_match_id bigint
  REFERENCES public.tournament_matches(id) ON DELETE SET NULL;

ALTER TABLE public.tournament_divisions
  ADD COLUMN IF NOT EXISTS final_standings jsonb;

ALTER TABLE public.tournament_result_corrections
  DROP CONSTRAINT IF EXISTS tournament_result_corrections_status_ck;
ALTER TABLE public.tournament_result_corrections
  ADD CONSTRAINT tournament_result_corrections_status_ck
  CHECK (status IN ('requested','approved','applied','rejected'));

COMMENT ON COLUMN public.tournament_matches.loser_match_id IS 'Double elim: trận mà kẻ thua đi vào; parent_match_id là chỗ kẻ thắng';
COMMENT ON COLUMN public.tournament_divisions.final_standings IS 'Hạng chung cuộc ghim lúc chốt giải; dữ kiện lịch sử, không tính lại';
