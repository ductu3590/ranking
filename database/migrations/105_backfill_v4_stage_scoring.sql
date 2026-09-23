-- Bổ sung snapshot luật điểm cho stage v4 đã chốt trước bản sửa (ADR-005 D8).
-- Lỗi: plan v4 không ghi config.scoring; tournaments.default_scoring mặc định là '{}' nên
-- resolveStageScoring rơi về best_of 3 → trận vòng bảng/vòng tròn BO1 thắng 11–x vẫn "chưa xong".
-- Từ bản sửa, plan ghi config.scoring = preset phong_trao_11 (lib/tournament/setupPlans/common.js
-- STAGE_SCORING); migration này đưa stage cũ về cùng trạng thái. Chung kết vẫn theo match_scoring.F.
-- An toàn: chỉ THÊM khóa scoring (jsonb ||), chỉ stage v4 chưa có scoring và CHƯA có trận đã chốt;
-- không đụng game/kết quả nào. Chạy lại không đổi gì (điều kiện scoring IS NULL).
BEGIN;

UPDATE public.tournament_stages s
SET config = s.config || jsonb_build_object('scoring', jsonb_build_object(
      'version', 'phong_trao_11', 'points_to', 11, 'win_by', 2, 'cap', 15, 'best_of', 1,
      'win_points', 2, 'loss_points', 0, 'draw_points', 0, 'deciding_game', NULL, 'mlp', NULL))
WHERE s.config->>'setupPlanVersion' = '4'
  AND s.config->'scoring' IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tournament_matches m
    WHERE m.stage_id = s.id AND m.group_id = s.group_id AND m.status = 'finalized'
  );

COMMIT;
