-- 113: Đăng ký giải cộng đồng — cột liên kết tài khoản VĐV, cờ thu phí, link rủ ghép cặp, lời mời theo tài khoản, và
-- 5 RPC nguyên tử (spec Epic 4 C2 §2; ADR-007 D56–D60).
-- Additive, forward-only, một transaction. Không đổi/xoá dữ liệu có sẵn. Không sửa CHECK của origin/status: đơn cộng đồng
-- dùng origin='public_self' (đã hợp lệ với tournament_registrations_origin_chk và _public_club_chk) và phân biệt bằng
-- player_account_id IS NOT NULL.
--   1. Cột mới trên tournament_registrations / _members / tournament_pair_invites (+ nới NOT NULL của to_registration_id:
--      lời mời theo SĐT tới tài khoản chưa có đơn).
--   2. Hàm nội bộ (không quyền thực thi cho ai): community_lock_division, community_account_seat,
--      community_active_registration, community_insert_registration, community_cancel_pending_invites,
--      community_merge_registrations.
--   3. RPC cho server (SECURITY DEFINER, chỉ service_role): community_register, community_player_action,
--      community_join_by_link, community_invite_action, community_admin_action.
-- Mọi RPC ghi lấy advisory lock theo division (community_lock_division) → đếm hạn mức, chống trùng tài khoản/nội dung và
-- ghép cặp không bị chạy đua. Xung đột nghiệp vụ = RAISE EXCEPTION '<MÃ>' USING ERRCODE = 'PH409' (như 078/111); server
-- phân biệt theo message. Không DROP/TRUNCATE/DELETE.
BEGIN;

-- ===== 1. Cột =====
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS player_account_id bigint REFERENCES public.player_accounts(id),
  ADD COLUMN IF NOT EXISTS fee_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_confirmed_by_platform_account_id bigint REFERENCES public.platform_accounts(id),
  ADD COLUMN IF NOT EXISTS partner_link_hash text,
  ADD COLUMN IF NOT EXISTS partner_link_expires_at timestamptz;

ALTER TABLE public.tournament_registration_members
  ADD COLUMN IF NOT EXISTS player_account_id bigint REFERENCES public.player_accounts(id);

ALTER TABLE public.tournament_pair_invites
  ADD COLUMN IF NOT EXISTS invited_player_account_id bigint REFERENCES public.player_accounts(id);

ALTER TABLE public.tournament_pair_invites ALTER COLUMN to_registration_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tournament_pair_invites'::regclass AND conname = 'tournament_pair_invites_target_ck') THEN
    ALTER TABLE public.tournament_pair_invites ADD CONSTRAINT tournament_pair_invites_target_ck
      CHECK (to_registration_id IS NOT NULL OR invited_player_account_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tournament_registrations'::regclass AND conname = 'tournament_registrations_partner_link_hash_ck') THEN
    ALTER TABLE public.tournament_registrations ADD CONSTRAINT tournament_registrations_partner_link_hash_ck
      CHECK (partner_link_hash IS NULL OR partner_link_hash ~ '^[a-f0-9]{64}$');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tr_player_account ON public.tournament_registrations (player_account_id) WHERE player_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tournament_registrations_partner_link_uidx ON public.tournament_registrations (partner_link_hash) WHERE partner_link_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trm_player_account ON public.tournament_registration_members (player_account_id) WHERE player_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tpi_invited_account ON public.tournament_pair_invites (invited_player_account_id, status) WHERE invited_player_account_id IS NOT NULL;

COMMENT ON COLUMN public.tournament_registrations.player_account_id IS 'Tài khoản VĐV công khai (player_accounts) của người nộp đơn giải cộng đồng; NULL với đơn BTC nhập hộ.';
COMMENT ON COLUMN public.tournament_registrations.fee_confirmed_at IS 'Lúc admin hệ thống đánh dấu "Đã xác nhận thu" lệ phí (thu ngoài hệ thống, D56). Không có số tiền: mức phí lấy từ tournament_divisions.entry_fee.';
COMMENT ON COLUMN public.tournament_registrations.partner_link_hash IS 'sha256 hex của token link rủ ghép cặp (D59). Chỉ lưu băm; NULL = không có link còn hiệu lực. Tạo link mới ghi đè băm cũ.';
COMMENT ON COLUMN public.tournament_registrations.partner_link_expires_at IS 'Hạn của link rủ ghép cặp (7 ngày).';
COMMENT ON COLUMN public.tournament_registration_members.player_account_id IS 'Tài khoản VĐV của người ở ghế này (dùng cho luật "không nằm hai cặp").';
COMMENT ON COLUMN public.tournament_pair_invites.invited_player_account_id IS 'Lời mời theo SĐT tới một tài khoản VĐV (người nhận có thể chưa có đơn; to_registration_id NULL cho tới khi nhận lời).';

-- ===== 2. Hàm nội bộ =====

-- Khoá division, kiểm giải cộng đồng + đăng ký mở + hạn chót. Trả bối cảnh dạng jsonb.
CREATE OR REPLACE FUNCTION public.community_lock_division(p_division_id bigint, p_require_open boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  d public.tournament_divisions;
  t public.tournaments;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('community_division:' || p_division_id::text, 0));
  SELECT * INTO d FROM public.tournament_divisions WHERE id = p_division_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMUNITY_NOT_FOUND' USING ERRCODE = 'PH409'; END IF;
  SELECT * INTO t FROM public.tournaments WHERE id = d.tournament_id;
  IF NOT FOUND OR t.organizer_type IS DISTINCT FROM 'community' THEN
    RAISE EXCEPTION 'COMMUNITY_NOT_FOUND' USING ERRCODE = 'PH409';
  END IF;
  IF t.status IN ('scheduled', 'live', 'completed', 'archived') THEN
    RAISE EXCEPTION 'COMMUNITY_TOURNAMENT_LOCKED' USING ERRCODE = 'PH409';
  END IF;
  IF p_require_open THEN
    IF COALESCE(t.settings->>'open_registration', 'false') <> 'true' OR NOT d.registration_open THEN
      RAISE EXCEPTION 'COMMUNITY_NOT_OPEN' USING ERRCODE = 'PH409';
    END IF;
    IF d.registration_deadline IS NOT NULL AND NOT d.allow_late_registration AND now() > d.registration_deadline THEN
      RAISE EXCEPTION 'COMMUNITY_DEADLINE_PASSED' USING ERRCODE = 'PH409';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'tournament_id', t.id, 'group_id', t.group_id, 'division_id', d.id, 'entrant_type', d.entrant_type,
    'gender_mode', d.gender_mode, 'capacity', d.registration_capacity, 'entry_fee', d.entry_fee,
    'rating_cap', d.rating_cap, 'age_min', d.age_min, 'age_max', d.age_max
  );
END
$$;

-- Ghế 1 lấy từ hồ sơ tài khoản (server không tin dữ liệu client) + kiểm hồ sơ đủ trường theo nội dung.
CREATE OR REPLACE FUNCTION public.community_account_seat(p_account_id bigint, p_division jsonb)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  a public.player_accounts;
BEGIN
  SELECT * INTO a FROM public.player_accounts WHERE id = p_account_id;
  IF NOT FOUND OR a.status <> 'active' THEN RAISE EXCEPTION 'PLAYER_SESSION_REQUIRED' USING ERRCODE = 'PH409'; END IF;
  IF p_division->>'gender_mode' = 'mixed' AND a.gender IS NULL THEN RAISE EXCEPTION 'COMMUNITY_GENDER_REQUIRED' USING ERRCODE = 'PH409'; END IF;
  IF (p_division->>'age_min') IS NOT NULL OR (p_division->>'age_max') IS NOT NULL THEN
    IF a.dob IS NULL THEN RAISE EXCEPTION 'COMMUNITY_DOB_REQUIRED' USING ERRCODE = 'PH409'; END IF;
  END IF;
  IF (p_division->>'rating_cap') IS NOT NULL AND a.self_declared_phr IS NULL THEN
    RAISE EXCEPTION 'COMMUNITY_PHR_REQUIRED' USING ERRCODE = 'PH409';
  END IF;
  RETURN jsonb_build_object(
    'account_id', a.id, 'full_name', a.display_name, 'phone_norm', a.phone_norm,
    'gender', a.gender, 'dob', a.dob, 'phr', a.self_declared_phr
  );
END
$$;

-- Đơn đang hoạt động của một tài khoản trong division (là chủ đơn hoặc ngồi ghế 2). NULL nếu không có.
CREATE OR REPLACE FUNCTION public.community_active_registration(p_division_id bigint, p_account_id bigint)
RETURNS bigint
LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT r.id
    FROM public.tournament_registrations r
   WHERE r.division_id = p_division_id
     AND r.status IN ('submitted', 'approved', 'awaiting_partner')
     AND (r.player_account_id = p_account_id
          OR EXISTS (SELECT 1 FROM public.tournament_registration_members m
                      WHERE m.registration_id = r.id AND m.player_account_id = p_account_id))
   ORDER BY r.id
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.community_insert_registration(p_lock jsonb, p_seat jsonb, p_status text)
RETURNS bigint
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tournament_registrations
    (group_id, division_id, tournament_club_id, entrant_type, status, origin, contact_phone_norm, needs_partner, player_account_id)
  VALUES
    ((p_lock->>'group_id')::bigint, (p_lock->>'division_id')::bigint, NULL, p_lock->>'entrant_type', p_status, 'public_self',
     p_seat->>'phone_norm', p_status = 'awaiting_partner', (p_seat->>'account_id')::bigint)
  RETURNING id INTO v_id;
  INSERT INTO public.tournament_registration_members
    (group_id, registration_id, seat, full_name, phone_norm, self_declared_phr, gender, dob, player_account_id)
  VALUES
    ((p_lock->>'group_id')::bigint, v_id, 1, p_seat->>'full_name', p_seat->>'phone_norm', (p_seat->>'phr')::numeric,
     p_seat->>'gender', (p_seat->>'dob')::date, (p_seat->>'account_id')::bigint);
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.community_cancel_pending_invites(p_division_id bigint, p_registration_ids bigint[], p_account_ids bigint[])
RETURNS void
LANGUAGE sql SET search_path = public AS $$
  UPDATE public.tournament_pair_invites
     SET status = 'cancelled'
   WHERE division_id = p_division_id
     AND status = 'pending'
     AND (from_registration_id = ANY (p_registration_ids)
          OR to_registration_id = ANY (p_registration_ids)
          OR invited_player_account_id = ANY (p_account_ids));
$$;

-- Ghép hai đơn lẻ thành một cặp: chủ đơn chính giữ đơn (status submitted), đơn phụ thành 'merged' và ghế của họ sang ghế 2.
CREATE OR REPLACE FUNCTION public.community_merge_registrations(p_primary_id bigint, p_secondary_id bigint)
RETURNS bigint
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  p public.tournament_registrations;
  s public.tournament_registrations;
  pm public.tournament_registration_members;
  sm public.tournament_registration_members;
  v_mode text;
BEGIN
  IF p_primary_id IS NULL OR p_secondary_id IS NULL OR p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'COMMUNITY_CONFLICT' USING ERRCODE = 'PH409';
  END IF;
  SELECT * INTO p FROM public.tournament_registrations WHERE id = p_primary_id FOR UPDATE;
  SELECT * INTO s FROM public.tournament_registrations WHERE id = p_secondary_id FOR UPDATE;
  IF p.id IS NULL OR s.id IS NULL OR p.division_id <> s.division_id THEN
    RAISE EXCEPTION 'COMMUNITY_CONFLICT' USING ERRCODE = 'PH409';
  END IF;
  IF p.status <> 'awaiting_partner' OR s.status <> 'awaiting_partner' THEN
    RAISE EXCEPTION 'COMMUNITY_ALREADY_PAIRED' USING ERRCODE = 'PH409';
  END IF;
  SELECT * INTO pm FROM public.tournament_registration_members WHERE registration_id = p.id AND seat = 1;
  SELECT * INTO sm FROM public.tournament_registration_members WHERE registration_id = s.id AND seat = 1;
  IF pm.id IS NULL OR sm.id IS NULL OR pm.player_account_id IS NULL OR sm.player_account_id IS NULL
     OR pm.player_account_id = sm.player_account_id THEN
    RAISE EXCEPTION 'COMMUNITY_CONFLICT' USING ERRCODE = 'PH409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_registration_members WHERE registration_id = p.id AND seat = 2) THEN
    RAISE EXCEPTION 'COMMUNITY_ALREADY_PAIRED' USING ERRCODE = 'PH409';
  END IF;
  SELECT gender_mode INTO v_mode FROM public.tournament_divisions WHERE id = p.division_id;
  IF v_mode = 'mixed' AND ARRAY(SELECT g FROM unnest(ARRAY[COALESCE(pm.gender, ''), COALESCE(sm.gender, '')]) g ORDER BY g) <> ARRAY['female', 'male'] THEN
    RAISE EXCEPTION 'COMMUNITY_MIXED_GENDER_REQUIRED' USING ERRCODE = 'PH409';
  END IF;

  INSERT INTO public.tournament_registration_members
    (group_id, registration_id, seat, full_name, phone_norm, self_declared_phr, gender, dob, player_account_id)
  VALUES
    (p.group_id, p.id, 2, sm.full_name, sm.phone_norm, sm.self_declared_phr, sm.gender, sm.dob, sm.player_account_id);
  UPDATE public.tournament_registrations
     SET status = 'merged', merged_into = p.id, needs_partner = false, partner_link_hash = NULL, partner_link_expires_at = NULL,
         version = version + 1, updated_at = now()
   WHERE id = s.id;
  UPDATE public.tournament_registrations
     SET status = 'submitted', needs_partner = false, partner_link_hash = NULL, partner_link_expires_at = NULL,
         version = version + 1, updated_at = now()
   WHERE id = p.id;
  PERFORM public.community_cancel_pending_invites(p.division_id, ARRAY[p.id, s.id], ARRAY[pm.player_account_id, sm.player_account_id]);
  RETURN p.id;
END
$$;

-- Tạo lời mời theo SĐT nếu tài khoản tồn tại và chưa có cặp. Cố ý IM LẶNG khi không tạo (phản hồi đồng nhất, chống dò SĐT).
CREATE OR REPLACE FUNCTION public.community_send_invite(p_lock jsonb, p_from_registration_id bigint, p_from_phone text, p_partner_phone text)
RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_division bigint := (p_lock->>'division_id')::bigint;
  v_partner bigint;
  v_active bigint;
  v_active_status text;
BEGIN
  IF p_partner_phone IS NULL THEN RETURN; END IF;
  IF p_partner_phone = p_from_phone THEN RAISE EXCEPTION 'COMMUNITY_INVITE_SELF' USING ERRCODE = 'PH409'; END IF;
  SELECT id INTO v_partner FROM public.player_accounts WHERE phone_norm = p_partner_phone AND status = 'active';
  IF v_partner IS NULL THEN RETURN; END IF;
  v_active := public.community_active_registration(v_division, v_partner);
  IF v_active IS NOT NULL THEN
    SELECT status INTO v_active_status FROM public.tournament_registrations WHERE id = v_active;
    IF v_active_status <> 'awaiting_partner' THEN RETURN; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_pair_invites
              WHERE division_id = v_division AND from_registration_id = p_from_registration_id
                AND invited_player_account_id = v_partner AND status = 'pending') THEN
    RETURN;
  END IF;
  INSERT INTO public.tournament_pair_invites (group_id, division_id, from_registration_id, to_registration_id, invited_player_account_id, status)
  VALUES ((p_lock->>'group_id')::bigint, v_division, p_from_registration_id, v_active, v_partner, 'pending');
END
$$;

-- Người nhận (lời mời hoặc link) vào cặp: dùng đơn lẻ sẵn có của họ, hoặc tạo đơn mới từ hồ sơ, rồi ghép.
CREATE OR REPLACE FUNCTION public.community_join_pair(p_lock jsonb, p_primary_id bigint, p_account_id bigint)
RETURNS bigint
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_division bigint := (p_lock->>'division_id')::bigint;
  v_existing bigint;
  v_existing_status text;
  v_joiner bigint;
BEGIN
  v_existing := public.community_active_registration(v_division, p_account_id);
  IF v_existing IS NOT NULL THEN
    SELECT status INTO v_existing_status FROM public.tournament_registrations WHERE id = v_existing;
    IF v_existing_status <> 'awaiting_partner' OR v_existing = p_primary_id THEN
      RAISE EXCEPTION 'COMMUNITY_ALREADY_PAIRED' USING ERRCODE = 'PH409';
    END IF;
    v_joiner := v_existing;
  ELSE
    v_joiner := public.community_insert_registration(p_lock, public.community_account_seat(p_account_id, p_lock), 'awaiting_partner');
  END IF;
  RETURN public.community_merge_registrations(p_primary_id, v_joiner);
END
$$;

REVOKE ALL ON FUNCTION public.community_lock_division(bigint, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_account_seat(bigint, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_active_registration(bigint, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_insert_registration(jsonb, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_cancel_pending_invites(bigint, bigint[], bigint[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_merge_registrations(bigint, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_send_invite(jsonb, bigint, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_join_pair(jsonb, bigint, bigint) FROM PUBLIC, anon, authenticated, service_role;

-- ===== 3. RPC cho server =====

-- Đăng ký một nội dung. Đôi luôn vào 'awaiting_partner' cho tới khi ghép; đơn vào 'submitted'.
CREATE OR REPLACE FUNCTION public.community_register(p_division_id bigint, p_account_id bigint, p_partner_phone text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lock jsonb;
  v_seat jsonb;
  v_status text;
  v_id bigint;
BEGIN
  v_lock := public.community_lock_division(p_division_id, true);
  v_seat := public.community_account_seat(p_account_id, v_lock);
  IF public.community_active_registration(p_division_id, p_account_id) IS NOT NULL THEN
    RAISE EXCEPTION 'COMMUNITY_ALREADY_REGISTERED' USING ERRCODE = 'PH409';
  END IF;
  IF v_lock->>'entrant_type' <> 'pair' THEN p_partner_phone := NULL; END IF;
  IF p_partner_phone IS NOT NULL AND p_partner_phone = v_seat->>'phone_norm' THEN
    RAISE EXCEPTION 'COMMUNITY_INVITE_SELF' USING ERRCODE = 'PH409';
  END IF;
  v_status := CASE WHEN v_lock->>'entrant_type' = 'pair' THEN 'awaiting_partner' ELSE 'submitted' END;
  v_id := public.community_insert_registration(v_lock, v_seat, v_status);
  PERFORM public.community_send_invite(v_lock, v_id, v_seat->>'phone_norm', p_partner_phone);
  RETURN jsonb_build_object('registration_id', v_id, 'status', v_status);
END
$$;

-- Hành động của VĐV trên đơn của mình: withdraw | set_link | invite.
CREATE OR REPLACE FUNCTION public.community_player_action(p_registration_id bigint, p_account_id bigint, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.tournament_registrations;
  t public.tournament_registrations;
  v_lock jsonb;
  v_hash text;
  v_is_member boolean;
BEGIN
  SELECT * INTO r FROM public.tournament_registrations WHERE id = p_registration_id;
  IF NOT FOUND OR r.player_account_id IS NULL THEN RAISE EXCEPTION 'COMMUNITY_NOT_FOUND' USING ERRCODE = 'PH409'; END IF;
  v_lock := public.community_lock_division(r.division_id, false);
  SELECT * INTO r FROM public.tournament_registrations WHERE id = p_registration_id FOR UPDATE;
  SELECT EXISTS (SELECT 1 FROM public.tournament_registration_members m
                  WHERE m.registration_id = r.id AND m.player_account_id = p_account_id) INTO v_is_member;
  IF r.player_account_id <> p_account_id AND NOT v_is_member THEN
    RAISE EXCEPTION 'COMMUNITY_NOT_FOUND' USING ERRCODE = 'PH409';
  END IF;

  IF p_action = 'withdraw' THEN
    IF r.status NOT IN ('awaiting_partner', 'submitted', 'approved') THEN
      RAISE EXCEPTION 'COMMUNITY_INVALID_TRANSITION' USING ERRCODE = 'PH409';
    END IF;
    UPDATE public.tournament_registrations
       SET status = 'withdrawn', needs_partner = false, partner_link_hash = NULL, partner_link_expires_at = NULL,
           version = version + 1, updated_at = now()
     WHERE id = r.id RETURNING * INTO r;
    PERFORM public.community_cancel_pending_invites(r.division_id, ARRAY[r.id], ARRAY[]::bigint[]);
  ELSIF p_action = 'set_link' THEN
    IF r.player_account_id <> p_account_id OR r.status <> 'awaiting_partner' THEN
      RAISE EXCEPTION 'COMMUNITY_INVALID_TRANSITION' USING ERRCODE = 'PH409';
    END IF;
    v_hash := p_payload->>'token_hash';
    IF v_hash IS NULL OR v_hash !~ '^[a-f0-9]{64}$' OR (p_payload->>'expires_at') IS NULL THEN
      RAISE EXCEPTION 'COMMUNITY_LINK_INVALID' USING ERRCODE = 'PH409';
    END IF;
    UPDATE public.tournament_registrations
       SET partner_link_hash = v_hash, partner_link_expires_at = (p_payload->>'expires_at')::timestamptz,
           version = version + 1, updated_at = now()
     WHERE id = r.id RETURNING * INTO r;
  ELSIF p_action = 'invite' THEN
    IF r.player_account_id <> p_account_id OR r.status <> 'awaiting_partner' THEN
      RAISE EXCEPTION 'COMMUNITY_INVALID_TRANSITION' USING ERRCODE = 'PH409';
    END IF;
    PERFORM public.community_send_invite(v_lock, r.id, r.contact_phone_norm, p_payload->>'partner_phone');
  ELSIF p_action = 'invite_registration' THEN
    -- Mời người trong "Bảng tìm bạn ghép" theo mã đơn (không lộ SĐT). Đích phải là đơn lẻ đang tìm bạn cùng nội dung.
    IF r.player_account_id <> p_account_id OR r.status <> 'awaiting_partner' THEN
      RAISE EXCEPTION 'COMMUNITY_INVALID_TRANSITION' USING ERRCODE = 'PH409';
    END IF;
    SELECT * INTO t FROM public.tournament_registrations
     WHERE id = (p_payload->>'target_registration_id')::bigint AND division_id = r.division_id
       AND status = 'awaiting_partner' AND player_account_id IS NOT NULL;
    IF NOT FOUND OR t.id = r.id THEN RAISE EXCEPTION 'COMMUNITY_NOT_FOUND' USING ERRCODE = 'PH409'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tournament_pair_invites
                    WHERE division_id = r.division_id AND from_registration_id = r.id AND to_registration_id = t.id AND status = 'pending') THEN
      INSERT INTO public.tournament_pair_invites (group_id, division_id, from_registration_id, to_registration_id, invited_player_account_id, status)
      VALUES (r.group_id, r.division_id, r.id, t.id, t.player_account_id, 'pending');
    END IF;
  ELSE
    RAISE EXCEPTION 'COMMUNITY_INVALID_TRANSITION' USING ERRCODE = 'PH409';
  END IF;
  RETURN jsonb_build_object('registration_id', r.id, 'status', r.status, 'version', r.version);
END
$$;

-- Người có tài khoản mở link rủ và vào cặp (đơn mới nếu chưa có, hoặc dùng đơn lẻ sẵn có).
CREATE OR REPLACE FUNCTION public.community_join_by_link(p_token_hash text, p_account_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.tournament_registrations;
  v_lock jsonb;
  v_primary bigint;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'COMMUNITY_LINK_INVALID' USING ERRCODE = 'PH409'; END IF;
  SELECT * INTO r FROM public.tournament_registrations WHERE partner_link_hash = p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMUNITY_LINK_INVALID' USING ERRCODE = 'PH409'; END IF;
  v_lock := public.community_lock_division(r.division_id, true);
  SELECT * INTO r FROM public.tournament_registrations WHERE id = r.id FOR UPDATE;
  IF r.partner_link_hash IS DISTINCT FROM p_token_hash OR r.status <> 'awaiting_partner'
     OR r.partner_link_expires_at IS NULL OR r.partner_link_expires_at <= now() THEN
    RAISE EXCEPTION 'COMMUNITY_LINK_INVALID' USING ERRCODE = 'PH409';
  END IF;
  IF r.player_account_id = p_account_id OR EXISTS (SELECT 1 FROM public.tournament_registration_members m WHERE m.registration_id = r.id AND m.player_account_id = p_account_id) THEN
    RAISE EXCEPTION 'COMMUNITY_INVITE_SELF' USING ERRCODE = 'PH409';
  END IF;
  v_primary := public.community_join_pair(v_lock, r.id, p_account_id);
  RETURN jsonb_build_object('registration_id', v_primary, 'status', 'submitted');
END
$$;

-- Người nhận xử lý lời mời (accept | decline) hoặc người gửi huỷ (cancel).
CREATE OR REPLACE FUNCTION public.community_invite_action(p_invite_id bigint, p_account_id bigint, p_action text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.tournament_pair_invites;
  f public.tournament_registrations;
  v_lock jsonb;
  v_is_target boolean;
  v_primary bigint;
BEGIN
  SELECT * INTO i FROM public.tournament_pair_invites WHERE id = p_invite_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMUNITY_NOT_FOUND' USING ERRCODE = 'PH409'; END IF;
  v_lock := public.community_lock_division(i.division_id, p_action = 'accept');
  SELECT * INTO i FROM public.tournament_pair_invites WHERE id = p_invite_id FOR UPDATE;
  IF i.status <> 'pending' THEN RAISE EXCEPTION 'COMMUNITY_INVALID_TRANSITION' USING ERRCODE = 'PH409'; END IF;
  SELECT * INTO f FROM public.tournament_registrations WHERE id = i.from_registration_id FOR UPDATE;

  IF p_action = 'cancel' THEN
    IF f.player_account_id IS DISTINCT FROM p_account_id THEN RAISE EXCEPTION 'COMMUNITY_NOT_FOUND' USING ERRCODE = 'PH409'; END IF;
    UPDATE public.tournament_pair_invites SET status = 'cancelled' WHERE id = i.id;
    RETURN jsonb_build_object('invite_id', i.id, 'status', 'cancelled');
  END IF;

  -- COALESCE: invited_player_account_id có thể NULL; NULL OR false = NULL sẽ làm bỏ qua kiểm quyền người nhận.
  v_is_target := COALESCE(i.invited_player_account_id = p_account_id, false)
    OR EXISTS (SELECT 1 FROM public.tournament_registrations t WHERE t.id = i.to_registration_id AND t.player_account_id = p_account_id);
  IF NOT v_is_target THEN RAISE EXCEPTION 'COMMUNITY_NOT_FOUND' USING ERRCODE = 'PH409'; END IF;

  IF p_action = 'decline' THEN
    UPDATE public.tournament_pair_invites SET status = 'declined' WHERE id = i.id;
    RETURN jsonb_build_object('invite_id', i.id, 'status', 'declined');
  ELSIF p_action = 'accept' THEN
    IF f.status <> 'awaiting_partner' THEN RAISE EXCEPTION 'COMMUNITY_CONFLICT' USING ERRCODE = 'PH409'; END IF;
    v_primary := public.community_join_pair(v_lock, f.id, p_account_id);
    UPDATE public.tournament_pair_invites SET status = 'accepted' WHERE id = i.id;
    RETURN jsonb_build_object('invite_id', i.id, 'status', 'accepted', 'registration_id', v_primary);
  END IF;
  RAISE EXCEPTION 'COMMUNITY_INVALID_TRANSITION' USING ERRCODE = 'PH409';
END
$$;

-- Admin hệ thống: admit | reject | remove | restore | withdraw | fee_confirm | fee_unconfirm | merge.
CREATE OR REPLACE FUNCTION public.community_admin_action(
  p_registration_id bigint, p_platform_account_id bigint, p_action text,
  p_reason text DEFAULT NULL, p_version bigint DEFAULT NULL, p_partner_registration_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.tournament_registrations;
  v_lock jsonb;
  v_next text;
  v_capacity integer;
  v_approved integer;
  v_fee integer;
  v_primary bigint;
BEGIN
  IF p_platform_account_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_accounts WHERE id = p_platform_account_id AND status = 'active') THEN
    RAISE EXCEPTION 'COMMUNITY_NOT_FOUND' USING ERRCODE = 'PH409';
  END IF;
  SELECT * INTO r FROM public.tournament_registrations WHERE id = p_registration_id;
  IF NOT FOUND OR r.player_account_id IS NULL THEN RAISE EXCEPTION 'COMMUNITY_NOT_FOUND' USING ERRCODE = 'PH409'; END IF;
  v_lock := public.community_lock_division(r.division_id, false);
  SELECT * INTO r FROM public.tournament_registrations WHERE id = p_registration_id FOR UPDATE;
  IF p_version IS NOT NULL AND r.version <> p_version THEN RAISE EXCEPTION 'COMMUNITY_CONFLICT' USING ERRCODE = 'PH409'; END IF;

  IF p_action = 'merge' THEN
    v_primary := public.community_merge_registrations(r.id, p_partner_registration_id);
    SELECT * INTO r FROM public.tournament_registrations WHERE id = v_primary;
    RETURN jsonb_build_object('registration_id', r.id, 'status', r.status, 'version', r.version);
  END IF;

  IF p_action IN ('fee_confirm', 'fee_unconfirm') THEN
    v_fee := COALESCE((v_lock->>'entry_fee')::integer, 0);
    IF v_fee <= 0 THEN RAISE EXCEPTION 'COMMUNITY_FEE_NOT_APPLICABLE' USING ERRCODE = 'PH409'; END IF;
    IF r.status NOT IN ('submitted', 'approved') THEN RAISE EXCEPTION 'COMMUNITY_INVALID_TRANSITION' USING ERRCODE = 'PH409'; END IF;
    UPDATE public.tournament_registrations
       SET fee_confirmed_at = CASE WHEN p_action = 'fee_confirm' THEN now() ELSE NULL END,
           fee_confirmed_by_platform_account_id = CASE WHEN p_action = 'fee_confirm' THEN p_platform_account_id ELSE NULL END,
           version = version + 1, updated_at = now()
     WHERE id = r.id RETURNING * INTO r;
    RETURN jsonb_build_object('registration_id', r.id, 'status', r.status, 'version', r.version, 'fee_confirmed', r.fee_confirmed_at IS NOT NULL);
  END IF;

  v_next := CASE
    WHEN p_action = 'admit' AND r.status = 'submitted' THEN 'approved'
    WHEN p_action = 'reject' AND r.status = 'submitted' THEN 'rejected'
    WHEN p_action = 'remove' AND r.status = 'approved' THEN 'submitted'
    WHEN p_action = 'restore' AND r.status = 'rejected' THEN 'submitted'
    WHEN p_action = 'withdraw' AND r.status IN ('awaiting_partner', 'submitted', 'approved') THEN 'withdrawn'
    ELSE NULL
  END;
  IF v_next IS NULL THEN RAISE EXCEPTION 'COMMUNITY_INVALID_TRANSITION' USING ERRCODE = 'PH409'; END IF;

  IF v_next = 'approved' THEN
    v_capacity := (v_lock->>'capacity')::integer;
    SELECT count(*) INTO v_approved FROM public.tournament_registrations
     WHERE division_id = r.division_id AND status = 'approved';
    IF v_capacity IS NOT NULL AND v_approved >= v_capacity THEN
      RAISE EXCEPTION 'COMMUNITY_CAPACITY_FULL' USING ERRCODE = 'PH409';
    END IF;
  END IF;

  UPDATE public.tournament_registrations
     SET status = v_next,
         admitted_at = CASE WHEN v_next = 'approved' THEN now() WHEN p_action = 'remove' THEN NULL ELSE admitted_at END,
         needs_partner = CASE WHEN v_next = 'withdrawn' THEN false ELSE needs_partner END,
         private_note = CASE WHEN p_action = 'reject' AND p_reason IS NOT NULL THEN left(btrim(p_reason), 300) ELSE private_note END,
         partner_link_hash = CASE WHEN v_next = 'withdrawn' THEN NULL ELSE partner_link_hash END,
         version = version + 1, updated_at = now()
   WHERE id = r.id RETURNING * INTO r;
  IF v_next = 'withdrawn' THEN
    PERFORM public.community_cancel_pending_invites(r.division_id, ARRAY[r.id], ARRAY[]::bigint[]);
  END IF;
  RETURN jsonb_build_object('registration_id', r.id, 'status', r.status, 'version', r.version);
END
$$;

REVOKE ALL ON FUNCTION public.community_register(bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_register(bigint, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.community_player_action(bigint, bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_player_action(bigint, bigint, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.community_join_by_link(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_join_by_link(text, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.community_invite_action(bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_invite_action(bigint, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.community_admin_action(bigint, bigint, text, text, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_admin_action(bigint, bigint, text, text, bigint, bigint) TO service_role;

COMMIT;
