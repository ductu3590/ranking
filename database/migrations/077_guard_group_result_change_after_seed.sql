-- E5: bảo vệ suất vòng sau đã được seed từ HẠNG BẢNG.
--
-- Vấn đề: đường sửa kết quả (app/api/tournament-v2/corrections + RPC
-- apply_tournament_result_correction_graph_aware, migration 069/070) chỉ tìm
-- downstream qua `source_kind = 'match_outcome'` với `source_match_id` = trận vừa
-- sửa. Suất bán kết sinh từ vòng bảng lại dùng `source_kind = 'group_rank'`, khóa
-- theo `source_stage_id` chứ không theo trận. Vì vậy sửa một kết quả vòng bảng
-- SAU khi bán kết đã seed sẽ không tìm thấy downstream nào: correction báo thành
-- công trong khi vòng sau vẫn giữ qualifier cũ (sai).
--
-- Cách xử lý (mức "tối thiểu an toàn" theo 04/05): CHẶN tại mutation boundary.
-- Guard là trigger nên nằm trong CÙNG transaction với lệnh ghi, không thể bị race
-- như một precheck ở route, và có hiệu lực với MỌI đường ghi (RPC correction,
-- ghi trực tiếp, hay bất kỳ route nào khác).
--
-- Vì sao chặn thay vì tự tính lại: tính lại hạng bảng + tie-break rồi rewire
-- downstream một cách atomic là thay đổi lớn trên một RPC đã deploy, và vẫn phải
-- từ chối khi trận vòng sau đã bắt đầu/kết thúc. Chặn cho kết quả đúng đắn tuyệt
-- đối (không bao giờ để qualifier cũ), kèm thông báo hướng dẫn BTC gỡ seed rồi
-- sửa. Đây là quyết định có chủ đích, ghi rõ trong execution report.
--
-- Phạm vi chặn có chủ ý RỘNG hơn "đổi đội thắng": đổi riêng tỉ số vẫn có thể đổi
-- tie-break và do đó đổi hạng, nên mọi thay đổi kết quả của trận thuộc stage đã
-- seed đều bị chặn. Chấm điểm lần đầu KHÔNG bị ảnh hưởng vì lúc đó chưa seed.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_group_result_change_after_seed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_group_id bigint;
  v_match_id bigint;
  v_stage_id bigint;
  v_seeded integer := 0;
BEGIN
  IF TG_TABLE_NAME = 'tournament_games' THEN
    v_group_id := COALESCE(NEW.group_id, OLD.group_id);
    v_match_id := COALESCE(NEW.match_id, OLD.match_id);
  ELSE
    v_group_id := COALESCE(NEW.group_id, OLD.group_id);
    v_match_id := COALESCE(NEW.id, OLD.id);
    -- Chỉ quan tâm khi KẾT QUẢ đổi. Đổi sân, giờ, trạng thái điều hành... không chặn.
    IF TG_OP = 'UPDATE'
       AND NEW.winner_entrant_id IS NOT DISTINCT FROM OLD.winner_entrant_id
       AND NEW.winner_entry_id IS NOT DISTINCT FROM OLD.winner_entry_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT m.stage_id INTO v_stage_id
  FROM public.tournament_matches m
  WHERE m.id = v_match_id AND m.group_id = v_group_id;
  IF v_stage_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Stage này có phải NGUỒN của suất hạng-bảng đã được seed hay chưa?
  SELECT count(*)::integer INTO v_seeded
  FROM public.tournament_stage_transitions t
  JOIN public.tournament_matches tm
    ON tm.id = t.target_match_id AND tm.group_id = t.group_id
  WHERE t.group_id = v_group_id
    AND t.source_kind = 'group_rank'
    AND t.source_stage_id = v_stage_id
    AND (
      tm.entrant_a_id IS NOT NULL OR tm.entrant_b_id IS NOT NULL
      OR tm.entry_a_id IS NOT NULL OR tm.entry_b_id IS NOT NULL
      OR tm.status <> 'pending'
    );

  IF v_seeded > 0 THEN
    RAISE EXCEPTION 'GROUP_CORRECTION_BLOCKED_QUALIFICATION_SEEDED'
      USING ERRCODE = '40001',
            HINT = 'Suat vong sau da duoc seed tu hang bang. Huy seed (hoac huy chot lich vong sau) roi sua ket qua vong bang.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournament_games_group_seed_guard ON public.tournament_games;
CREATE TRIGGER trg_tournament_games_group_seed_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.tournament_games
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_result_change_after_seed();

DROP TRIGGER IF EXISTS trg_tournament_matches_group_seed_guard ON public.tournament_matches;
CREATE TRIGGER trg_tournament_matches_group_seed_guard
  BEFORE UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_result_change_after_seed();

COMMENT ON FUNCTION public.guard_group_result_change_after_seed()
  IS 'Chan sua ket qua vong bang sau khi suat vong sau da seed tu group_rank, de khong con qualifier cu.';

COMMIT;
