-- 110: Giải giao hữu liên CLB — lời mời CLB, hạn mức CLB khách, link mời, thông báo trong app,
-- đăng ký cặp của CLB khách (spec Epic 3 F1 §5, README §3.1, §4, §5; ADR-007 D38, D42, D46, D47).
-- Additive, forward-only, một transaction:
--   1. Cột mới trên tournament_clubs (roster_draft, roster_submitted, mốc thời gian, phiên bản duyệt, lý do yêu cầu
--      sửa, băm token link mời) + CHECK + COMMENT. Không đổi/không xoá cột có sẵn, không đụng dữ liệu cũ.
--   2. Index hộp lời mời (club_id, tournament_id) và unique băm token.
--   3. RPC cho server (SECURITY DEFINER, chỉ service_role): friendly_invite_club (mời + mời lại, kiểm hạn mức CLB
--      khách do route truyền vào), friendly_club_action (hành động của chủ nhà / CLB khách theo bảng chuyển trạng
--      thái), set_friendly_registration_window (hạn chót / khoá đăng ký, gộp vào settings).
--   4. Hàm nội bộ friendly_sync_notifications: mở/đóng club_notifications theo trạng thái, trong cùng transaction.
-- Thứ tự khoá thống nhất với finalize 108 và _v1: tournament_divisions → tournaments → tournament_clubs →
-- club_notifications. Hai khối `-- friendly:transitions` và `-- friendly:notifications` được chép từ
-- lib/tournament/friendlyClubs.js#renderFriendlyTransitionsSql và friendlyNotifications.js#renderFriendlyNotificationsSql;
-- tests/stitch-setup/epic-3/f1-api-contract.test.js khoá hai bên bằng nhau.
-- Không đụng finalize_internal_setup_v4 (F2, migration 111).
BEGIN;

ALTER TABLE public.tournament_clubs
  ADD COLUMN IF NOT EXISTS roster_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS roster_submitted jsonb,
  ADD COLUMN IF NOT EXISTS roster_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS roster_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS roster_approved_version bigint,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS invite_token_hash text,
  ADD COLUMN IF NOT EXISTS invite_token_issued_at timestamptz;

-- CHECK thêm có điều kiện (chạy lại không lỗi).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tournament_clubs'::regclass AND conname = 'tournament_clubs_roster_draft_object_ck') THEN
    ALTER TABLE public.tournament_clubs ADD CONSTRAINT tournament_clubs_roster_draft_object_ck
      CHECK (jsonb_typeof(roster_draft) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tournament_clubs'::regclass AND conname = 'tournament_clubs_roster_submitted_object_ck') THEN
    ALTER TABLE public.tournament_clubs ADD CONSTRAINT tournament_clubs_roster_submitted_object_ck
      CHECK (roster_submitted IS NULL OR jsonb_typeof(roster_submitted) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tournament_clubs'::regclass AND conname = 'tournament_clubs_review_note_length_ck') THEN
    ALTER TABLE public.tournament_clubs ADD CONSTRAINT tournament_clubs_review_note_length_ck
      CHECK (review_note IS NULL OR length(btrim(review_note)) BETWEEN 2 AND 300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tournament_clubs'::regclass AND conname = 'tournament_clubs_invite_token_hash_ck') THEN
    ALTER TABLE public.tournament_clubs ADD CONSTRAINT tournament_clubs_invite_token_hash_ck
      CHECK (invite_token_hash IS NULL OR invite_token_hash ~ '^[a-f0-9]{64}$');
  END IF;
END
$$;

COMMENT ON COLUMN public.tournament_clubs.roster_draft IS 'Bản đang soạn của CLB khách: {memberIds, pairs:[{pairId, participantRefs, locked}], unpairedRefs}. Chỉ CLB khách đọc/ghi; chủ nhà không đọc.';
COMMENT ON COLUMN public.tournament_clubs.roster_submitted IS 'Ảnh chụp lúc CLB khách gửi: roster_draft + memberNames {id: tên} (server lấy từ club_members) + pairCount. Chủ nhà duyệt đúng ảnh này.';
COMMENT ON COLUMN public.tournament_clubs.roster_submitted_at IS 'Lúc CLB khách gửi danh sách cặp gần nhất.';
COMMENT ON COLUMN public.tournament_clubs.roster_reviewed_at IS 'Lúc chủ nhà duyệt hoặc yêu cầu sửa gần nhất.';
COMMENT ON COLUMN public.tournament_clubs.responded_at IS 'Lúc CLB khách nhận lời, từ chối hoặc rút.';
COMMENT ON COLUMN public.tournament_clubs.roster_approved_version IS 'version của dòng ngay sau lúc duyệt; NULL khi chưa duyệt / đã yêu cầu sửa / rút. Khóa cặp hiệu lực c<id>.<phiên bản>.<pairId> (F2).';
COMMENT ON COLUMN public.tournament_clubs.review_note IS 'Lý do chủ nhà yêu cầu sửa (2–300 ký tự), hiện cho CLB khách.';
COMMENT ON COLUMN public.tournament_clubs.invite_token_hash IS 'sha256 hex của token link mời (D47). Chỉ lưu băm; NULL = không có link còn hiệu lực.';
COMMENT ON COLUMN public.tournament_clubs.invite_token_issued_at IS 'Lúc phát token link mời hiện hành.';

CREATE INDEX IF NOT EXISTS idx_tournament_clubs_club_tournament
  ON public.tournament_clubs(club_id, tournament_id) WHERE club_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_clubs_invite_token
  ON public.tournament_clubs(invite_token_hash) WHERE invite_token_hash IS NOT NULL;

-- Đồng bộ club_notifications theo trạng thái dòng tournament_clubs (README §5.2). Hàm nội bộ: không SECURITY DEFINER
-- (chạy trong ngữ cảnh hàm gọi), không cấp quyền thực thi cho ai.
CREATE OR REPLACE FUNCTION public.friendly_sync_notifications(p_tournament_club_id bigint)
RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r public.tournament_clubs%ROWTYPE;
  v_guest_state text;
  v_guest_reason text;
  v_host_state text;
  v_tournament_name text;
  v_event_date text;
  v_host_name text;
  v_guest_name text;
  v_division_id bigint;
BEGIN
  SELECT * INTO r FROM public.tournament_clubs WHERE id = p_tournament_club_id;
  -- Dòng chủ nhà (finalize tạo) và dòng CLB ngoài không có thông báo.
  IF NOT FOUND OR r.club_id IS NULL OR r.club_id = r.group_id THEN
    RETURN;
  END IF;

  SELECT s.guest_state, s.guest_reason, s.host_state
  INTO v_guest_state, v_guest_reason, v_host_state
  FROM (VALUES
    -- friendly:notifications
    ('invited', 'open', 'invited', 'resolved'),
    ('accepted', 'resolved', NULL, 'resolved'),
    ('declined', 'resolved', NULL, 'resolved'),
    ('roster_submitted', 'resolved', NULL, 'open'),
    ('changes_requested', 'open', 'changes_requested', 'resolved'),
    ('approved', 'resolved', NULL, 'resolved'),
    ('withdrawn', 'resolved', NULL, 'resolved')
    -- friendly:notifications:end
  ) AS s(invitation_status, guest_state, guest_reason, host_state)
  WHERE s.invitation_status = r.invitation_status;
  IF NOT FOUND THEN
    v_guest_state := 'resolved';
    v_guest_reason := NULL;
    v_host_state := 'resolved';
  END IF;

  SELECT t.name, t.event_date::text INTO v_tournament_name, v_event_date
  FROM public.tournaments t WHERE t.id = r.tournament_id AND t.group_id = r.group_id;
  SELECT g.name INTO v_host_name FROM public.groups g WHERE g.id = r.group_id;
  SELECT g.name INTO v_guest_name FROM public.groups g WHERE g.id = r.club_id;
  SELECT d.id INTO v_division_id FROM public.tournament_divisions d
  WHERE d.tournament_id = r.tournament_id AND d.group_id = r.group_id AND d.competition_template = 'unified_setup_draft_v2'
  ORDER BY d.id LIMIT 1;

  -- CLB khách: việc trả lời lời mời / sửa danh sách. Payload không có tournamentId / group_id chủ nhà.
  IF v_guest_state = 'open' THEN
    INSERT INTO public.club_notifications(group_id, kind, subject_type, subject_id, payload, status)
    VALUES (r.club_id, 'tournament_invitation', 'tournament_club', r.id,
            jsonb_build_object('reason', v_guest_reason, 'tournamentName', v_tournament_name,
                               'hostClubName', v_host_name, 'eventDate', v_event_date),
            'open')
    ON CONFLICT (group_id, kind, subject_type, subject_id) WHERE subject_id IS NOT NULL
    DO UPDATE SET status = 'open', resolved_at = NULL, payload = EXCLUDED.payload, created_at = now();
  ELSE
    UPDATE public.club_notifications
    SET status = 'resolved', resolved_at = now()
    WHERE group_id = r.club_id AND kind = 'tournament_invitation' AND subject_type = 'tournament_club'
      AND subject_id = r.id AND status = 'open';
  END IF;

  -- Chủ nhà: việc duyệt danh sách đã gửi. tournamentId/divisionId là giải của chính chủ nhà (dựng href Bước 2).
  IF v_host_state = 'open' THEN
    INSERT INTO public.club_notifications(group_id, kind, subject_type, subject_id, payload, status)
    VALUES (r.group_id, 'tournament_roster_review', 'tournament_club', r.id,
            jsonb_build_object('reason', 'roster_submitted', 'tournamentName', v_tournament_name,
                               'guestClubName', v_guest_name,
                               'pairCount', COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(r.roster_submitted->'pairs') = 'array' THEN r.roster_submitted->'pairs' END), 0),
                               'tournamentId', r.tournament_id, 'divisionId', v_division_id),
            'open')
    ON CONFLICT (group_id, kind, subject_type, subject_id) WHERE subject_id IS NOT NULL
    DO UPDATE SET status = 'open', resolved_at = NULL, payload = EXCLUDED.payload, created_at = now();
  ELSE
    UPDATE public.club_notifications
    SET status = 'resolved', resolved_at = now()
    WHERE group_id = r.group_id AND kind = 'tournament_roster_review' AND subject_type = 'tournament_club'
      AND subject_id = r.id AND status = 'open';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.friendly_sync_notifications(bigint) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.friendly_sync_notifications(bigint) IS 'Nội bộ (110): mở/đóng thông báo tournament_invitation / tournament_roster_review theo invitation_status. Chỉ gọi từ RPC friendly_*; không cấp quyền thực thi.';

-- Mời / mời lại một CLB PickHub vào giải giao hữu. Hạn mức CLB khách do route truyền vào (friendlyEntitlements.js là
-- điểm quyết định duy nhất, D46); SQL chỉ thực thi. Chỉ băm token được lưu.
CREATE OR REPLACE FUNCTION public.friendly_invite_club(
  p_group_id bigint,
  p_tournament_id bigint,
  p_club_id bigint,
  p_quota integer,
  p_note text,
  p_max_guest_clubs integer,
  p_invite_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.tournament_divisions%ROWTYPE;
  t public.tournaments%ROWTYPE;
  r public.tournament_clubs%ROWTYPE;
  v_division_count integer;
  v_used integer;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF p_group_id IS NULL OR p_tournament_id IS NULL OR p_club_id IS NULL
    OR p_max_guest_clubs IS NULL OR p_max_guest_clubs NOT BETWEEN 1 AND 31
    OR p_invite_token_hash IS NULL OR p_invite_token_hash !~ '^[a-f0-9]{64}$'
    OR length(COALESCE(p_note, '')) > 500 THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_quota IS NOT NULL AND p_quota NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'FRIENDLY_QUOTA_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Khoá division v3 (chia sẻ) rồi giải (độc quyền): tuần tự hoá các lần mời cùng giải (đếm hạn mức không lọt).
  SELECT * INTO d FROM public.tournament_divisions
  WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND competition_template = 'unified_setup_draft_v2'
  ORDER BY id LIMIT 1
  FOR SHARE;
  SELECT * INTO t FROM public.tournaments WHERE id = p_tournament_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(t.settings->>'organizer_mode', '') <> 'friendly' THEN
    RAISE EXCEPTION 'FRIENDLY_MODE_REQUIRED' USING ERRCODE = 'PH409';
  END IF;
  SELECT count(*) INTO v_division_count FROM public.tournament_divisions
  WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND competition_template = 'unified_setup_draft_v2';
  IF d.id IS NULL OR v_division_count <> 1 THEN
    RAISE EXCEPTION 'FRIENDLY_MODE_REQUIRED' USING ERRCODE = 'PH409';
  END IF;
  IF d.roster_lock_status <> 'open' THEN
    RAISE EXCEPTION 'FRIENDLY_REGISTRATION_CLOSED' USING ERRCODE = 'PH409';
  END IF;
  IF p_club_id = p_group_id THEN
    RAISE EXCEPTION 'CLUB_IS_HOST' USING ERRCODE = 'PH409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'CLUB_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO r FROM public.tournament_clubs
  WHERE tournament_id = p_tournament_id AND club_id = p_club_id FOR UPDATE;
  IF r.id IS NOT NULL AND (r.group_id <> p_group_id OR r.invitation_status NOT IN ('declined', 'withdrawn')) THEN
    RAISE EXCEPTION 'CLUB_ALREADY_INVITED' USING ERRCODE = 'PH409';
  END IF;

  -- Hạn mức: CLB khác chủ nhà (gồm cả dòng CLB ngoài cũ) còn hiệu lực, trừ chính dòng đang mời lại.
  SELECT count(*) INTO v_used FROM public.tournament_clubs
  WHERE tournament_id = p_tournament_id AND group_id = p_group_id
    AND club_id IS DISTINCT FROM p_group_id
    AND invitation_status NOT IN ('declined', 'withdrawn')
    AND id IS DISTINCT FROM r.id;
  IF v_used >= p_max_guest_clubs THEN
    RAISE EXCEPTION 'FRIENDLY_CLUB_LIMIT_REACHED' USING ERRCODE = 'PH409',
      DETAIL = jsonb_build_object('max', p_max_guest_clubs, 'used', v_used)::text;
  END IF;

  IF r.id IS NULL THEN
    INSERT INTO public.tournament_clubs(group_id, tournament_id, club_id, invitation_status, quota, invitation_note,
                                        invite_token_hash, invite_token_issued_at)
    VALUES (p_group_id, p_tournament_id, p_club_id, 'invited', p_quota, v_note, p_invite_token_hash, now())
    RETURNING * INTO r;
  ELSE
    -- Mời lại (declined / withdrawn): giữ bản đang soạn, xoá ảnh chụp đã gửi, duyệt, lý do, mốc trả lời.
    UPDATE public.tournament_clubs
    SET invitation_status = 'invited',
        version = version + 1,
        roster_submitted = NULL,
        roster_submitted_at = NULL,
        roster_reviewed_at = NULL,
        review_note = NULL,
        roster_approved_version = NULL,
        responded_at = NULL,
        quota = p_quota,
        invitation_note = v_note,
        invite_token_hash = p_invite_token_hash,
        invite_token_issued_at = now(),
        updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;
  END IF;

  PERFORM public.friendly_sync_notifications(r.id);
  RETURN (to_jsonb(r) - 'invite_token_hash') || jsonb_build_object('has_invite_link', r.invite_token_hash IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.friendly_invite_club(bigint, bigint, bigint, integer, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friendly_invite_club(bigint, bigint, bigint, integer, text, integer, text) TO service_role;
COMMENT ON FUNCTION public.friendly_invite_club(bigint, bigint, bigint, integer, text, integer, text) IS 'Mời / mời lại CLB vào giải giao hữu (110). Hạn mức CLB khách p_max_guest_clubs do route truyền (1–31). Trả dòng không kèm băm token.';

-- Hành động của chủ nhà (p_side = host) và admin CLB khách (p_side = guest) trên một dòng tournament_clubs.
-- Phía, actor, băm token do route suy từ phiên / crypto; không bao giờ lấy từ body.
CREATE OR REPLACE FUNCTION public.friendly_club_action(
  p_actor_group_id bigint,
  p_side text,
  p_tournament_club_id bigint,
  p_action text,
  p_expected_version bigint,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.tournament_divisions%ROWTYPE;
  t public.tournaments%ROWTYPE;
  r public.tournament_clubs%ROWTYPE;
  n public.tournament_clubs%ROWTYPE;
  v_tournament_id bigint;
  v_group_id bigint;
  v_prev_status text;
  v_to text;
  v_needs_window boolean;
  v_friendly jsonb;
  v_deadline timestamptz;
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_roster jsonb;
  v_pairs jsonb;
  v_unpaired jsonb;
  v_pair_count integer;
  v_count integer;
  v_member_ids bigint[];
  v_bad jsonb;
  v_missing_id bigint;
  v_missing_name text;
  v_names jsonb;
  v_note text;
  v_quota integer;
  v_hash text;
BEGIN
  IF p_actor_group_id IS NULL OR p_tournament_club_id IS NULL OR p_expected_version IS NULL
    OR p_side IS NULL OR p_side NOT IN ('host', 'guest') OR p_action IS NULL
    OR jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Đọc (không khoá) để biết giải; lọc theo phía ngay trong truy vấn.
  SELECT tournament_id, group_id INTO v_tournament_id, v_group_id
  FROM public.tournament_clubs
  WHERE id = p_tournament_club_id
    AND ((p_side = 'host' AND group_id = p_actor_group_id)
      OR (p_side = 'guest' AND club_id = p_actor_group_id AND group_id <> p_actor_group_id));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FRIENDLY_CLUB_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Thứ tự khoá: division → tournament → club (→ notifications trong friendly_sync_notifications).
  SELECT * INTO d FROM public.tournament_divisions
  WHERE group_id = v_group_id AND tournament_id = v_tournament_id AND competition_template = 'unified_setup_draft_v2'
  ORDER BY id LIMIT 1
  FOR SHARE;
  SELECT * INTO t FROM public.tournaments WHERE id = v_tournament_id AND group_id = v_group_id FOR SHARE;
  SELECT * INTO r FROM public.tournament_clubs WHERE id = p_tournament_club_id FOR UPDATE;
  IF r.id IS NULL OR t.id IS NULL OR r.tournament_id <> v_tournament_id OR r.group_id <> v_group_id
    OR NOT ((p_side = 'host' AND r.group_id = p_actor_group_id)
         OR (p_side = 'guest' AND r.club_id = p_actor_group_id AND r.group_id <> p_actor_group_id)) THEN
    RAISE EXCEPTION 'FRIENDLY_CLUB_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(t.settings->>'organizer_mode', '') <> 'friendly' THEN
    -- Phía khách không được biết giải tồn tại.
    IF p_side = 'guest' THEN
      RAISE EXCEPTION 'FRIENDLY_CLUB_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'FRIENDLY_MODE_REQUIRED' USING ERRCODE = 'PH409';
  END IF;
  -- Đã chốt giải (hoặc không có division v3) → mọi hành động bị từ chối.
  IF d.id IS NULL OR d.roster_lock_status <> 'open' THEN
    RAISE EXCEPTION 'FRIENDLY_REGISTRATION_CLOSED' USING ERRCODE = 'PH409';
  END IF;
  IF r.version <> p_expected_version THEN
    RAISE EXCEPTION 'FRIENDLY_CLUB_VERSION_CONFLICT' USING ERRCODE = 'PH409';
  END IF;

  -- (from_status, action, side, to_status | NULL = giữ nguyên, needs_open_window)
  SELECT tr.to_status, tr.needs_open_window INTO v_to, v_needs_window
  FROM (VALUES
    -- friendly:transitions
    ('invited', 'accept', 'guest', 'accepted', true),
    ('invited', 'decline', 'guest', 'declined', true),
    ('accepted', 'save_roster', 'guest', NULL, true),
    ('changes_requested', 'save_roster', 'guest', NULL, true),
    ('accepted', 'submit_roster', 'guest', 'roster_submitted', true),
    ('changes_requested', 'submit_roster', 'guest', 'roster_submitted', true),
    ('roster_submitted', 'unsubmit', 'guest', 'accepted', true),
    ('roster_submitted', 'approve', 'host', 'approved', false),
    ('roster_submitted', 'request_changes', 'host', 'changes_requested', true),
    ('approved', 'request_changes', 'host', 'changes_requested', true),
    ('invited', 'remove', 'host', 'withdrawn', false),
    ('accepted', 'remove', 'host', 'withdrawn', false),
    ('roster_submitted', 'remove', 'host', 'withdrawn', false),
    ('changes_requested', 'remove', 'host', 'withdrawn', false),
    ('approved', 'remove', 'host', 'withdrawn', false),
    ('accepted', 'withdraw', 'guest', 'withdrawn', true),
    ('roster_submitted', 'withdraw', 'guest', 'withdrawn', true),
    ('changes_requested', 'withdraw', 'guest', 'withdrawn', true),
    ('approved', 'withdraw', 'guest', 'withdrawn', true),
    ('invited', 'set_quota', 'host', NULL, false),
    ('accepted', 'set_quota', 'host', NULL, false),
    ('roster_submitted', 'set_quota', 'host', NULL, false),
    ('changes_requested', 'set_quota', 'host', NULL, false),
    ('approved', 'set_quota', 'host', NULL, false),
    ('invited', 'rotate_link', 'host', NULL, false),
    ('accepted', 'rotate_link', 'host', NULL, false),
    ('declined', 'rotate_link', 'host', NULL, false),
    ('roster_submitted', 'rotate_link', 'host', NULL, false),
    ('changes_requested', 'rotate_link', 'host', NULL, false),
    ('approved', 'rotate_link', 'host', NULL, false)
    -- friendly:transitions:end
  ) AS tr(from_status, action, side, to_status, needs_open_window)
  WHERE tr.from_status = r.invitation_status AND tr.action = p_action AND tr.side = p_side;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FRIENDLY_TRANSITION_INVALID' USING ERRCODE = 'PH409';
  END IF;

  -- Cửa sổ đăng ký (D42): chưa khoá và now() < hạn chót (nếu có). Hạn chót không đọc được → đóng.
  IF v_needs_window THEN
    v_friendly := CASE WHEN jsonb_typeof(t.settings->'friendly') = 'object' THEN t.settings->'friendly' ELSE '{}'::jsonb END;
    IF NULLIF(v_friendly->>'registrationLockedAt', '') IS NOT NULL THEN
      RAISE EXCEPTION 'FRIENDLY_REGISTRATION_CLOSED' USING ERRCODE = 'PH409';
    END IF;
    IF NULLIF(v_friendly->>'registrationDeadline', '') IS NOT NULL THEN
      BEGIN
        v_deadline := (v_friendly->>'registrationDeadline')::timestamptz;
      EXCEPTION WHEN others THEN
        v_deadline := '-infinity'::timestamptz;
      END;
      IF now() >= v_deadline THEN
        RAISE EXCEPTION 'FRIENDLY_REGISTRATION_CLOSED' USING ERRCODE = 'PH409';
      END IF;
    END IF;
  END IF;

  v_prev_status := r.invitation_status;
  n := r;
  n.invitation_status := COALESCE(v_to, r.invitation_status);

  IF p_action IN ('accept', 'decline') THEN
    n.responded_at := now();

  ELSIF p_action = 'save_roster' THEN
    v_roster := v_payload->'roster';
    IF jsonb_typeof(v_roster) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_roster->'memberIds') IS DISTINCT FROM 'array'
      OR jsonb_typeof(COALESCE(v_roster->'pairs', '[]'::jsonb)) <> 'array'
      OR jsonb_typeof(COALESCE(v_roster->'unpairedRefs', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
    END IF;
    v_pairs := COALESCE(v_roster->'pairs', '[]'::jsonb);
    v_unpaired := COALESCE(v_roster->'unpairedRefs', '[]'::jsonb);
    -- D38: đội CLB khách không có khách mời.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p
               CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p->'participantRefs') = 'array' THEN p->'participantRefs' ELSE '[]'::jsonb END) ref
               WHERE ref #>> '{}' LIKE 'guest:%')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_unpaired) ref WHERE ref #>> '{}' LIKE 'guest:%') THEN
      RAISE EXCEPTION 'FRIENDLY_GUEST_NOT_ALLOWED' USING ERRCODE = '22023';
    END IF;
    -- Shape (từng bước, mỗi bước chỉ chạy khi bước trước đúng để không lỗi ép kiểu).
    IF jsonb_array_length(v_roster->'memberIds') > 64 OR jsonb_array_length(v_pairs) > 32
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_roster->'memberIds') m
                 WHERE jsonb_typeof(m) <> 'string' OR m #>> '{}' !~ '^[1-9][0-9]{0,17}$')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p
                 WHERE jsonb_typeof(p) <> 'object'
                    OR jsonb_typeof(p->'pairId') IS DISTINCT FROM 'string'
                    OR jsonb_typeof(p->'participantRefs') IS DISTINCT FROM 'array'
                    OR (p ? 'locked' AND jsonb_typeof(p->'locked') <> 'boolean'))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_unpaired) u WHERE jsonb_typeof(u) <> 'string') THEN
      RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(DISTINCT m) FROM jsonb_array_elements_text(v_roster->'memberIds') m) <> jsonb_array_length(v_roster->'memberIds')
      OR (SELECT count(DISTINCT p->>'pairId') FROM jsonb_array_elements(v_pairs) p) <> jsonb_array_length(v_pairs)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p
                 WHERE p->>'pairId' !~ '^[A-Za-z0-9_-]{1,64}$'
                    OR jsonb_array_length(p->'participantRefs') <> 2
                    OR p->'participantRefs'->>0 = p->'participantRefs'->>1)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p
                 CROSS JOIN LATERAL jsonb_array_elements(p->'participantRefs') ref
                 WHERE jsonb_typeof(ref) <> 'string'
                    OR ref #>> '{}' !~ '^member:[1-9][0-9]{0,17}$'
                    OR NOT ((v_roster->'memberIds') ? substr(ref #>> '{}', 8)))
      OR (SELECT count(*) FROM jsonb_array_elements(v_pairs) p CROSS JOIN LATERAL jsonb_array_elements_text(p->'participantRefs') ref)
         <> (SELECT count(DISTINCT ref) FROM jsonb_array_elements(v_pairs) p CROSS JOIN LATERAL jsonb_array_elements_text(p->'participantRefs') ref) THEN
      RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
    END IF;
    -- unpairedRefs = đúng tập người đã chọn mà chưa ghép (thứ tự theo client).
    IF (SELECT count(DISTINCT u) FROM jsonb_array_elements_text(v_unpaired) u) <> jsonb_array_length(v_unpaired)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_unpaired) u
                 WHERE u !~ '^member:[1-9][0-9]{0,17}$'
                    OR NOT ((v_roster->'memberIds') ? substr(u, 8))
                    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p WHERE p->'participantRefs' ? u))
      OR jsonb_array_length(v_unpaired) <> jsonb_array_length(v_roster->'memberIds') - 2 * jsonb_array_length(v_pairs) THEN
      RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
    END IF;
    -- D17: mọi người thuộc chính CLB khách.
    SELECT jsonb_agg(m ORDER BY m) INTO v_bad
    FROM jsonb_array_elements_text(v_roster->'memberIds') m
    WHERE NOT EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = m::bigint AND cm.group_id = r.club_id);
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'FRIENDLY_MEMBER_OUTSIDE_CLUB' USING ERRCODE = '22023',
        DETAIL = jsonb_build_object('memberIds', v_bad)::text;
    END IF;
    n.roster_draft := jsonb_build_object(
      'memberIds', v_roster->'memberIds',
      'pairs', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'pairId', x.p->>'pairId',
                  'participantRefs', x.p->'participantRefs',
                  'locked', COALESCE((x.p->>'locked')::boolean, false)) ORDER BY x.ord), '[]'::jsonb)
                FROM jsonb_array_elements(v_pairs) WITH ORDINALITY AS x(p, ord)),
      'unpairedRefs', v_unpaired);

  ELSIF p_action IN ('submit_roster', 'approve') THEN
    -- Gửi: kiểm bản đang soạn. Duyệt: kiểm lại ảnh chụp đã gửi (thành viên có thể đã nghỉ, hạn mức có thể đã đổi).
    v_roster := CASE WHEN p_action = 'submit_roster' THEN r.roster_draft ELSE r.roster_submitted END;
    IF jsonb_typeof(v_roster) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_roster->'pairs') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_roster->'pairs') = 0 THEN
      RAISE EXCEPTION 'FRIENDLY_ROSTER_EMPTY' USING ERRCODE = '22023';
    END IF;
    v_pairs := v_roster->'pairs';
    v_pair_count := jsonb_array_length(v_pairs);
    IF jsonb_typeof(v_roster->'memberIds') IS DISTINCT FROM 'array'
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p
                 WHERE jsonb_typeof(p) <> 'object' OR jsonb_typeof(p->'participantRefs') IS DISTINCT FROM 'array') THEN
      RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p
               CROSS JOIN LATERAL jsonb_array_elements_text(p->'participantRefs') ref
               WHERE ref LIKE 'guest:%') THEN
      RAISE EXCEPTION 'FRIENDLY_GUEST_NOT_ALLOWED' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p
               CROSS JOIN LATERAL jsonb_array_elements_text(p->'participantRefs') ref
               WHERE ref !~ '^member:[1-9][0-9]{0,17}$') THEN
      RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_count
    FROM jsonb_array_elements_text(v_roster->'memberIds') m
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pairs) p WHERE p->'participantRefs' ? ('member:' || m));
    v_count := v_count + CASE WHEN jsonb_typeof(v_roster->'unpairedRefs') = 'array' THEN jsonb_array_length(v_roster->'unpairedRefs') ELSE 0 END;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'FRIENDLY_ROSTER_UNPAIRED' USING ERRCODE = '22023',
        DETAIL = jsonb_build_object('count', v_count)::text;
    END IF;
    IF r.quota IS NOT NULL AND v_pair_count > r.quota THEN
      RAISE EXCEPTION 'FRIENDLY_QUOTA_EXCEEDED' USING ERRCODE = '22023',
        DETAIL = jsonb_build_object('quota', r.quota, 'count', v_pair_count)::text;
    END IF;
    v_member_ids := ARRAY(
      SELECT substr(ref, 8)::bigint
      FROM jsonb_array_elements(v_pairs) p CROSS JOIN LATERAL jsonb_array_elements_text(p->'participantRefs') ref);
    SELECT jsonb_agg(mid::text ORDER BY mid) INTO v_bad
    FROM unnest(v_member_ids) mid
    WHERE NOT EXISTS (SELECT 1 FROM public.club_members cm
                      WHERE cm.id = mid AND cm.group_id = r.club_id AND COALESCE(cm.is_active, true));
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'FRIENDLY_MEMBER_OUTSIDE_CLUB' USING ERRCODE = '22023',
        DETAIL = jsonb_build_object('memberIds', v_bad)::text;
    END IF;
    SELECT cm.id, cm.full_name INTO v_missing_id, v_missing_name
    FROM unnest(v_member_ids) WITH ORDINALITY AS x(mid, ord)
    JOIN public.club_members cm ON cm.id = x.mid AND cm.group_id = r.club_id
    WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.legacy_club_member_id = x.mid)
    ORDER BY x.ord
    LIMIT 1;
    IF v_missing_id IS NOT NULL THEN
      RAISE EXCEPTION 'FRIENDLY_ATHLETE_ID_MISSING' USING ERRCODE = '22023',
        DETAIL = jsonb_build_object('name', v_missing_name, 'memberId', v_missing_id::text)::text;
    END IF;
    IF p_action = 'submit_roster' THEN
      SELECT jsonb_object_agg(cm.id::text, cm.full_name) INTO v_names
      FROM public.club_members cm WHERE cm.group_id = r.club_id AND cm.id = ANY(v_member_ids);
      n.roster_submitted := r.roster_draft || jsonb_build_object('memberNames', COALESCE(v_names, '{}'::jsonb), 'pairCount', v_pair_count);
      n.roster_submitted_at := now();
      n.review_note := NULL;
    ELSE
      n.roster_approved_version := p_expected_version + 1;
      n.roster_reviewed_at := now();
    END IF;

  ELSIF p_action = 'request_changes' THEN
    v_note := btrim(COALESCE(v_payload->>'note', ''));
    IF jsonb_typeof(v_payload->'note') IS DISTINCT FROM 'string' OR length(v_note) NOT BETWEEN 2 AND 300 THEN
      RAISE EXCEPTION 'FRIENDLY_NOTE_REQUIRED' USING ERRCODE = '22023';
    END IF;
    n.review_note := v_note;
    n.roster_approved_version := NULL;
    n.roster_reviewed_at := now();

  ELSIF p_action = 'remove' THEN
    n.roster_approved_version := NULL;
    n.invite_token_hash := NULL;

  ELSIF p_action = 'withdraw' THEN
    n.roster_approved_version := NULL;
    n.responded_at := now();

  ELSIF p_action = 'set_quota' THEN
    IF NOT (v_payload ? 'quota') THEN
      RAISE EXCEPTION 'FRIENDLY_QUOTA_INVALID' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_payload->'quota') = 'null' THEN
      v_quota := NULL;
    ELSIF jsonb_typeof(v_payload->'quota') = 'number' AND (v_payload->>'quota') ~ '^[0-9]{1,2}$' THEN
      v_quota := (v_payload->>'quota')::integer;
      IF v_quota NOT BETWEEN 1 AND 32 THEN
        RAISE EXCEPTION 'FRIENDLY_QUOTA_INVALID' USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'FRIENDLY_QUOTA_INVALID' USING ERRCODE = '22023';
    END IF;
    IF v_quota IS NOT NULL AND r.invitation_status IN ('roster_submitted', 'approved') THEN
      v_pair_count := CASE WHEN jsonb_typeof(r.roster_submitted->'pairs') = 'array' THEN jsonb_array_length(r.roster_submitted->'pairs') ELSE 0 END;
      IF v_pair_count > v_quota THEN
        RAISE EXCEPTION 'FRIENDLY_QUOTA_BELOW_ROSTER' USING ERRCODE = 'PH409',
          DETAIL = jsonb_build_object('count', v_pair_count, 'quota', v_quota)::text;
      END IF;
    END IF;
    n.quota := v_quota;

  ELSIF p_action = 'rotate_link' THEN
    v_hash := v_payload->>'inviteTokenHash';
    IF v_hash IS NULL OR v_hash !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
    END IF;
    n.invite_token_hash := v_hash;
    n.invite_token_issued_at := now();
  END IF;
  -- unsubmit: không đổi dữ liệu roster.

  UPDATE public.tournament_clubs
  SET invitation_status = n.invitation_status,
      quota = n.quota,
      roster_draft = n.roster_draft,
      roster_submitted = n.roster_submitted,
      roster_submitted_at = n.roster_submitted_at,
      roster_reviewed_at = n.roster_reviewed_at,
      responded_at = n.responded_at,
      roster_approved_version = n.roster_approved_version,
      review_note = n.review_note,
      invite_token_hash = n.invite_token_hash,
      invite_token_issued_at = n.invite_token_issued_at,
      version = r.version + 1,
      updated_at = now()
  WHERE id = r.id AND version = p_expected_version
  RETURNING * INTO r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FRIENDLY_CLUB_VERSION_CONFLICT' USING ERRCODE = 'PH409';
  END IF;

  -- Thông báo chỉ đổi khi trạng thái đổi: sửa hạn mức / đổi link / lưu nháp không mở lại thông báo người dùng đã bỏ qua.
  IF r.invitation_status IS DISTINCT FROM v_prev_status THEN
    PERFORM public.friendly_sync_notifications(r.id);
  END IF;
  RETURN (to_jsonb(r) - 'invite_token_hash') || jsonb_build_object('has_invite_link', r.invite_token_hash IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.friendly_club_action(bigint, text, bigint, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.friendly_club_action(bigint, text, bigint, text, bigint, jsonb) TO service_role;
COMMENT ON FUNCTION public.friendly_club_action(bigint, text, bigint, text, bigint, jsonb) IS 'Hành động trên lời mời giải giao hữu (110): chủ nhà approve/request_changes/remove/set_quota/rotate_link; CLB khách accept/decline/save_roster/submit_roster/unsubmit/withdraw. Khoá lạc quan version.';

-- Hạn chót / khoá đăng ký (D42). Gộp vào settings (không ghi đè khoá khác); lockedAt giữ mốc cũ khi khoá lại.
CREATE OR REPLACE FUNCTION public.set_friendly_registration_window(
  p_group_id bigint,
  p_tournament_id bigint,
  p_deadline timestamptz,
  p_locked boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.tournament_divisions%ROWTYPE;
  t public.tournaments%ROWTYPE;
  v_locked_at jsonb;
  v_friendly jsonb;
BEGIN
  IF p_group_id IS NULL OR p_tournament_id IS NULL OR p_locked IS NULL THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO d FROM public.tournament_divisions
  WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND competition_template = 'unified_setup_draft_v2'
  ORDER BY id LIMIT 1
  FOR SHARE;
  SELECT * INTO t FROM public.tournaments WHERE id = p_tournament_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(t.settings->>'organizer_mode', '') <> 'friendly' THEN
    RAISE EXCEPTION 'FRIENDLY_MODE_REQUIRED' USING ERRCODE = 'PH409';
  END IF;
  IF d.id IS NULL OR d.roster_lock_status <> 'open' THEN
    RAISE EXCEPTION 'FRIENDLY_REGISTRATION_CLOSED' USING ERRCODE = 'PH409';
  END IF;

  v_locked_at := CASE
    WHEN NOT p_locked THEN 'null'::jsonb
    WHEN jsonb_typeof(t.settings->'friendly'->'registrationLockedAt') = 'string' THEN t.settings->'friendly'->'registrationLockedAt'
    ELSE to_jsonb(now())
  END;
  v_friendly := jsonb_build_object('registrationDeadline', to_jsonb(p_deadline), 'registrationLockedAt', v_locked_at);

  UPDATE public.tournaments
  SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('friendly', v_friendly),
      updated_at = now()
  WHERE id = t.id AND group_id = p_group_id;

  RETURN v_friendly;
END;
$$;

REVOKE ALL ON FUNCTION public.set_friendly_registration_window(bigint, bigint, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_friendly_registration_window(bigint, bigint, timestamptz, boolean) TO service_role;
COMMENT ON FUNCTION public.set_friendly_registration_window(bigint, bigint, timestamptz, boolean) IS 'Đặt hạn chót / khoá đăng ký giải giao hữu (110): settings.friendly = {registrationDeadline, registrationLockedAt}, gộp không ghi đè khoá khác.';

COMMIT;
