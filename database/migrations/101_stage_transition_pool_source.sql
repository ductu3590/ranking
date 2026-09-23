-- Nguồn tiến cấp "cặp xếp kế tiếp tốt nhất giữa các bảng" (spec Lát A §9, ADR-005 D6).
-- Additive: thêm cột source_pool_position và mở rộng hai CHECK cho source_kind='group_rank_pool'.
-- Không xóa/sửa dòng nào. CHECK cũ và mới cùng đổi trong một transaction nên không có
-- khoảng trống không ràng buộc. Định nghĩa CHECK cũ lưu ở _workspace/stitch-setup/P0-preflight.md.
BEGIN;

ALTER TABLE public.tournament_stage_transitions
  ADD COLUMN IF NOT EXISTS source_pool_position integer;

ALTER TABLE public.tournament_stage_transitions
  DROP CONSTRAINT IF EXISTS tournament_stage_transitions_source_kind_check;
ALTER TABLE public.tournament_stage_transitions
  ADD CONSTRAINT tournament_stage_transitions_source_kind_check
  CHECK (source_kind = ANY (ARRAY['group_rank'::text, 'match_outcome'::text, 'group_rank_pool'::text])) NOT VALID;

ALTER TABLE public.tournament_stage_transitions
  DROP CONSTRAINT IF EXISTS tournament_stage_transitions_check;
ALTER TABLE public.tournament_stage_transitions
  ADD CONSTRAINT tournament_stage_transitions_check CHECK (
    (source_kind = 'group_rank' AND source_group_label IS NOT NULL AND source_rank IS NOT NULL AND source_rank > 0
      AND source_match_id IS NULL AND source_outcome IS NULL AND source_pool_position IS NULL)
    OR (source_kind = 'match_outcome' AND source_group_label IS NULL AND source_rank IS NULL
      AND source_match_id IS NOT NULL AND source_outcome IS NOT NULL AND source_pool_position IS NULL)
    OR (source_kind = 'group_rank_pool' AND source_group_label IS NULL AND source_rank IS NOT NULL AND source_rank > 0
      AND source_pool_position IS NOT NULL AND source_pool_position > 0
      AND source_match_id IS NULL AND source_outcome IS NULL)
  ) NOT VALID;

ALTER TABLE public.tournament_stage_transitions VALIDATE CONSTRAINT tournament_stage_transitions_source_kind_check;
ALTER TABLE public.tournament_stage_transitions VALIDATE CONSTRAINT tournament_stage_transitions_check;

CREATE INDEX IF NOT EXISTS idx_tournament_stage_transitions_pool_source
  ON public.tournament_stage_transitions (group_id, source_stage_id, source_rank, source_pool_position)
  WHERE source_kind = 'group_rank_pool';

COMMIT;
