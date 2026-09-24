-- Sau khi chốt giải (finalize_internal_setup_v4): giải chuyển "Chờ diễn ra" và có sẵn sân để điều hành.
-- Yêu cầu người dùng 2026-09-24: "Nháp" chỉ là khi chưa làm xong 4 bước tạo giải; tự tạo Sân 01…N theo
-- số sân đã nhập lúc tạo giải.
--
-- prepare_tournament_after_finalize(group, tournament): idempotent, chỉ THÊM, không xoá gì.
--   1. Giải đã có stage (đã chốt) mà còn 'draft' → 'scheduled' (nhãn "Chờ diễn ra").
--   2. Giải chưa có sân nào và settings.court_count (hoặc bản nháp) là 1..20 → tạo một địa điểm
--      (dùng lại địa điểm đầu tiên nếu có) và Sân 01…N. Đã có sân thì không đụng.
-- Route finalize gọi hàm này ngay sau RPC chốt; lỗi ở đây không làm hỏng giải đã chốt.
BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_tournament_after_finalize(
  p_group_id bigint,
  p_tournament_id bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.tournaments%ROWTYPE;
  v_count_text text;
  v_count integer;
  v_venue_id bigint;
  v_created integer := 0;
  v_status_changed boolean := false;
BEGIN
  SELECT * INTO t FROM public.tournaments WHERE id = p_tournament_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournament_stages WHERE tournament_id = t.id AND group_id = p_group_id) THEN
    RETURN jsonb_build_object('status', t.status, 'status_changed', false, 'courts_created', 0);
  END IF;

  IF t.status = 'draft' THEN
    UPDATE public.tournaments SET status = 'scheduled', version = version + 1, updated_at = now()
    WHERE id = t.id AND group_id = p_group_id;
    v_status_changed := true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tournament_courts WHERE tournament_id = t.id AND group_id = p_group_id) THEN
    v_count_text := COALESCE(
      t.settings->>'court_count',
      (SELECT d.setup_draft->'tournament'->>'courtCount' FROM public.tournament_divisions d
        WHERE d.tournament_id = t.id AND d.group_id = p_group_id ORDER BY d.id LIMIT 1));
    IF v_count_text ~ '^[0-9]{1,2}$' THEN
      v_count := v_count_text::integer;
      IF v_count BETWEEN 1 AND 20 THEN
        SELECT id INTO v_venue_id FROM public.tournament_venues
        WHERE tournament_id = t.id AND group_id = p_group_id ORDER BY id LIMIT 1;
        IF v_venue_id IS NULL THEN
          INSERT INTO public.tournament_venues(group_id, tournament_id, name)
          VALUES (p_group_id, t.id, COALESCE(NULLIF(btrim(t.location), ''), 'Địa điểm thi đấu'))
          RETURNING id INTO v_venue_id;
        END IF;
        INSERT INTO public.tournament_courts(group_id, tournament_id, venue_id, label)
        SELECT p_group_id, t.id, v_venue_id, 'Sân ' || lpad(n::text, 2, '0') FROM generate_series(1, v_count) n;
        v_created := v_count;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_status_changed THEN 'scheduled' ELSE t.status END,
    'status_changed', v_status_changed,
    'courts_created', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_tournament_after_finalize(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_tournament_after_finalize(bigint, bigint) TO service_role;
COMMENT ON FUNCTION public.prepare_tournament_after_finalize(bigint, bigint) IS
  'Sau khi chốt giải: draft → scheduled ("Chờ diễn ra"), tạo Sân 01…N theo court_count nếu giải chưa có sân. Idempotent, chỉ thêm.';

-- Bù cho các giải đã chốt trước migration này. Giữ nguyên giải 204 (CLB thật, roadmap: không đụng).
-- Giải đã có trận bắt đầu thì lên 'live' thay vì 'scheduled'.
SELECT public.prepare_tournament_after_finalize(t.group_id, t.id)
FROM public.tournaments t
WHERE t.id <> 204
  AND EXISTS (SELECT 1 FROM public.tournament_stages s WHERE s.tournament_id = t.id AND s.group_id = t.group_id)
  AND (t.status = 'draft' OR NOT EXISTS (SELECT 1 FROM public.tournament_courts c WHERE c.tournament_id = t.id));

UPDATE public.tournaments t SET status = 'live', version = version + 1, updated_at = now()
WHERE t.id <> 204 AND t.status = 'scheduled'
  AND EXISTS (SELECT 1 FROM public.tournament_matches m JOIN public.tournament_stages s ON s.id = m.stage_id
              WHERE s.tournament_id = t.id AND m.group_id = t.group_id AND m.status <> 'pending');

COMMIT;
