-- Kiểm thử tích hợp Epic 3 F1: migration 110 (nạp trong transaction) + mời / hạn mức / đăng ký cặp / cửa sổ /
-- thông báo / link. Sinh bởi scripts/qa/epic3-f1-integration.js. MỘT transaction, ROLLBACK ở cuối.
-- Kỳ vọng: bảng it_result liệt kê mọi ca (k, v), dòng cuối 'zz.ALL' = 'ok'. Ca sai → lỗi 'IT_FAIL <ca>: …' và không có bảng.
-- Không kiểm được trong một transaction: hai lần mời song song (khoá tournaments FOR UPDATE) — kiểm bằng đọc mã
-- (tests/stitch-setup/epic-3/f1-api-contract.test.js).
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

CREATE TEMP TABLE it_result(k text, v text) ON COMMIT DROP;
CREATE FUNCTION pg_temp.it_ok(p_key text, p_cond boolean, p_detail text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_cond IS NOT TRUE THEN
    RAISE EXCEPTION 'IT_FAIL %: điều kiện sai (%)', p_key, COALESCE(p_detail, 'null');
  END IF;
  INSERT INTO it_result VALUES (p_key, COALESCE(p_detail, 'ok'));
END
$f$;
CREATE FUNCTION pg_temp.it_err(p_key text, p_err text, p_code text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_err IS DISTINCT FROM p_code THEN
    RAISE EXCEPTION 'IT_FAIL %: mong lỗi % nhưng được %', p_key, p_code, COALESCE(p_err, 'không lỗi');
  END IF;
  INSERT INTO it_result VALUES (p_key, p_err);
END
$f$;

DO $it$
DECLARE
  host bigint := 59;
  ga bigint; gb bigint; mid bigint;
  ma bigint[] := ARRAY[]::bigint[];
  mb bigint[] := ARRAY[]::bigint[];
  r jsonb; x jsonb; e text; s text;
  t1 bigint; d1 bigint; t2 bigint; d2 bigint; t3 bigint; t4 bigint;
  ca bigint; cb bigint; ca2 bigint; cb2 bigint; c19 bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = host) THEN
    RAISE EXCEPTION 'IT_FAIL setup: không có group chủ nhà %', host;
  END IF;

  -- ===== Dữ liệu tạm (trong transaction) =====
  INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
  VALUES ('zze3a-' || substr(md5(random()::text), 1, 8), 'ZZE3A IT F1 khách A (rollback)', 'x', 'x') RETURNING id INTO ga;
  INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
  VALUES ('zze3b-' || substr(md5(random()::text), 1, 8), 'ZZE3B IT F1 khách B (rollback)', 'x', 'x') RETURNING id INTO gb;
  FOR i IN 1..6 LOOP
    INSERT INTO public.club_members(group_id, full_name, is_active) VALUES (ga, 'ZZE3A VĐV ' || i, true) RETURNING id INTO mid;
    INSERT INTO public.athletes(display_name, normalized_name, legacy_club_member_id) VALUES ('ZZE3A VĐV ' || i, 'zze3a vdv ' || i, mid)
    ON CONFLICT (legacy_club_member_id) DO NOTHING;
    ma := ma || mid;
  END LOOP;
  FOR i IN 1..9 LOOP
    INSERT INTO public.club_members(group_id, full_name, is_active) VALUES (gb, 'ZZE3B VĐV ' || i, true) RETURNING id INTO mid;
    INSERT INTO public.athletes(display_name, normalized_name, legacy_club_member_id) VALUES ('ZZE3B VĐV ' || i, 'zze3b vdv ' || i, mid)
    ON CONFLICT (legacy_club_member_id) DO NOTHING;
    mb := mb || mid;
  END LOOP;
  -- Thành viên B9 không có hồ sơ thi đấu (gỡ liên kết trong transaction).
  UPDATE public.athletes SET legacy_club_member_id = NULL WHERE legacy_club_member_id = mb[9];

  r := public.save_unified_setup_aggregate_draft_v1(host, NULL, NULL, 'zze3a-it-f1-t1-' || ga,
    jsonb_build_object('currentStep', 1, 'tournament', jsonb_build_object('name', 'ZZE3A IT F1 giao hữu 1', 'organizerMode', 'friendly')),
    1, 'zze3a-it-f1-save-t1-' || ga);
  t1 := (r->>'tournament_id')::bigint; d1 := (r->>'division_id')::bigint;

  r := public.save_unified_setup_aggregate_draft_v1(host, NULL, NULL, 'zze3a-it-f1-t2-' || ga,
    jsonb_build_object('currentStep', 1, 'tournament', jsonb_build_object('name', 'ZZE3A IT F1 giao hữu 2', 'organizerMode', 'friendly')),
    1, 'zze3a-it-f1-save-t2-' || ga);
  t2 := (r->>'tournament_id')::bigint; d2 := (r->>'division_id')::bigint;

  r := public.save_unified_setup_aggregate_draft_v1(host, NULL, NULL, 'zze3a-it-f1-t3-' || ga,
    jsonb_build_object('currentStep', 1, 'tournament', jsonb_build_object('name', 'ZZE3A IT F1 nội bộ', 'organizerMode', 'internal')),
    1, 'zze3a-it-f1-save-t3-' || ga);
  t3 := (r->>'tournament_id')::bigint;

  r := public.save_unified_setup_aggregate_draft_v1(host, NULL, NULL, 'zze3a-it-f1-t4-' || ga,
    jsonb_build_object('currentStep', 1, 'tournament', jsonb_build_object('name', 'ZZE3A IT F1 giao hữu CLB 19', 'organizerMode', 'friendly')),
    1, 'zze3a-it-f1-save-t4-' || ga);
  t4 := (r->>'tournament_id')::bigint;
  UPDATE public.tournaments SET event_date = '2026-10-12', settings = settings || '{"poster_url": "zze3a-poster"}'::jsonb WHERE id IN (t1, t2);

  PERFORM pg_temp.it_ok('setup.friendly_mode', (SELECT settings->>'organizer_mode' FROM public.tournaments WHERE id = t1) = 'friendly' AND (SELECT settings->>'organizer_mode' FROM public.tournaments WHERE id = t3) = 'internal', NULL);

  PERFORM pg_temp.it_ok('setup.division_open', (SELECT roster_lock_status FROM public.tournament_divisions WHERE id = d1) = 'open', NULL);

  -- ===== Giải 1, hạn mức mặc định 1 =====
  r := public.friendly_invite_club(host, t1, ga, 3, 'Mời giao lưu', 1, 'da28cd3a6e72feaac4808a622f78f607623d8561aad3e9220301f4ce3452a69c');
  ca := (r->>'id')::bigint;

  PERFORM pg_temp.it_ok('invite.a', r->>'invitation_status' = 'invited' AND (r->>'version')::int = 1 AND NOT (r ? 'invite_token_hash') AND (r->>'has_invite_link')::boolean AND (r->>'quota')::int = 3, r->>'invitation_status');

  PERFORM pg_temp.it_ok('invite.hash_stored', (SELECT tc.invite_token_hash = 'da28cd3a6e72feaac4808a622f78f607623d8561aad3e9220301f4ce3452a69c' AND tc.invite_token_issued_at IS NOT NULL FROM public.tournament_clubs tc WHERE tc.id = ca), NULL);

  PERFORM pg_temp.it_ok('notify.invite_open', EXISTS (SELECT 1 FROM public.club_notifications n WHERE n.group_id = ga AND n.kind = 'tournament_invitation' AND n.subject_type = 'tournament_club' AND n.subject_id = ca AND n.status = 'open' AND n.payload->>'reason' = 'invited' AND n.payload->>'tournamentName' = 'ZZE3A IT F1 giao hữu 1' AND n.payload->>'hostClubName' = (SELECT name FROM public.groups WHERE id = host) AND n.payload->>'eventDate' = '2026-10-12' AND NOT (n.payload ? 'tournamentId') AND NOT (n.payload ? 'group_id')), NULL);

  PERFORM pg_temp.it_ok('notify.no_host_review_yet', NOT EXISTS (SELECT 1 FROM public.club_notifications n WHERE n.group_id = host AND n.kind = 'tournament_roster_review' AND n.subject_id = ca), NULL);

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t1, gb, NULL, NULL, 1, '4469d2415fdcd6d6dc92c632dc840718bcac98f6dd77159815246edeaa0815a1');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('limit.second_club', e, 'FRIENDLY_CLUB_LIMIT_REACHED');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t1, ga, NULL, NULL, 5, 'dcd3f6b8d110d0ab95b3289f26cae27c78c828f75e8d0a7238ace46a7e64d2b1');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('invite.already', e, 'CLUB_ALREADY_INVITED');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t1, host, NULL, NULL, 5, '775c89a2603303e3310d512b0db56a6597e18a4ced2a2c516f792b9e021a4de9');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('invite.host', e, 'CLUB_IS_HOST');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t3, ga, NULL, NULL, 1, 'a75cab96c36f5fee49bf5c997b719d5f07613075680aeb01390faa28a2ea36fe');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('invite.internal', e, 'FRIENDLY_MODE_REQUIRED');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t1, gb, NULL, NULL, NULL, '9ce670cd7441e744401593f8a4afb7a0a8cf8d2d5b2e7cb5fd5e362a266c6224');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('invite.max_null', e, 'SETUP_PAYLOAD_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t1, gb, NULL, NULL, 0, '13b2d61429b48f75baef94b5361df0c73ee26deb57561b78f45ca1716d27d14c');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('invite.max_zero', e, 'SETUP_PAYLOAD_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t1, gb, NULL, NULL, 32, 'a4632f1f3f6ffe088e50a09795e6c8d677ff174d07ed48f28cea297e505dfb57');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('invite.max_over_core', e, 'SETUP_PAYLOAD_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t1, gb, NULL, NULL, 1, 'abc');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('invite.bad_hash', e, 'SETUP_PAYLOAD_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t1, gb, 33, NULL, 5, 'f444ba9f789706e19bba29b0774bd4935cebd10330758520c80bfd78b02c9689');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('invite.quota_invalid', e, 'FRIENDLY_QUOTA_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t1, (SELECT max(id) + 100000 FROM public.groups), NULL, NULL, 5, '4d6c08e2721a3fecaca3d81182d7c4dccaef8edf8426bf2d0ab8adf7cc4b767c');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('invite.club_missing', e, 'CLUB_NOT_FOUND');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(ga, t1, gb, NULL, NULL, 5, 'a21262ffb70721f91ffd3c2c4413f9f421ba707270e836bfb76d62312d1de42c');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('invite.not_owner', e, 'TOURNAMENT_NOT_FOUND');

  -- Sai phía / xung đột version

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', ca, 'accept', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('side.wrong_guest', e, 'FRIENDLY_CLUB_NOT_FOUND');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'guest', ca, 'accept', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('side.host_as_guest', e, 'FRIENDLY_CLUB_NOT_FOUND');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(ga, 'host', ca, 'remove', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('side.guest_as_host', e, 'FRIENDLY_CLUB_NOT_FOUND');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(ga, 'guest', ca, 'approve', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('side.guest_approve', e, 'FRIENDLY_TRANSITION_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(ga, 'guest', ca, 'rotate_link', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('side.guest_rotate', e, 'FRIENDLY_TRANSITION_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', ca, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('side.host_submit', e, 'FRIENDLY_TRANSITION_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(ga, 'guest', ca, 'accept', 99, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('version.conflict', e, 'FRIENDLY_CLUB_VERSION_CONFLICT');

  PERFORM pg_temp.it_ok('version.unchanged', (SELECT tc.invitation_status = 'invited' AND tc.version = 1 FROM public.tournament_clubs tc WHERE tc.id = ca), NULL);

  -- Suất được trả lại: A từ chối → mời B được (hạn mức 1)
  r := public.friendly_club_action(ga, 'guest', ca, 'decline', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);

  PERFORM pg_temp.it_ok('decline.a', r->>'invitation_status' = 'declined' AND r->>'responded_at' IS NOT NULL, NULL);

  PERFORM pg_temp.it_ok('notify.decline_resolved', (SELECT n.status FROM public.club_notifications n WHERE n.group_id = ga AND n.kind = 'tournament_invitation' AND n.subject_type = 'tournament_club' AND n.subject_id = ca) = 'resolved', NULL);
  r := public.friendly_invite_club(host, t1, gb, 2, NULL, 1, '4469d2415fdcd6d6dc92c632dc840718bcac98f6dd77159815246edeaa0815a1');
  cb := (r->>'id')::bigint;

  PERFORM pg_temp.it_ok('limit.slot_returned', r->>'invitation_status' = 'invited', NULL);
  r := public.friendly_club_action(host, 'host', cb, 'remove', (SELECT version FROM public.tournament_clubs WHERE id = cb), '{}'::jsonb);

  PERFORM pg_temp.it_ok('remove.revokes_link', r->>'invitation_status' = 'withdrawn' AND (r->>'has_invite_link')::boolean = false AND (SELECT tc.invite_token_hash IS NULL FROM public.tournament_clubs tc WHERE tc.id = cb), NULL);

  PERFORM pg_temp.it_ok('notify.remove_resolved', (SELECT n.status FROM public.club_notifications n WHERE n.group_id = gb AND n.kind = 'tournament_invitation' AND n.subject_type = 'tournament_club' AND n.subject_id = cb) = 'resolved', NULL);
  r := public.friendly_invite_club(host, t1, ga, 3, 'Mời lại', 1, '160fb6193eb408e7b6afc06b4bf9c1d5e41865464d8ef5486341e1e3f82ea69b');

  PERFORM pg_temp.it_ok('reinvite.a', (r->>'id')::bigint = ca AND r->>'invitation_status' = 'invited' AND (r->>'version')::int = 3 AND r->>'responded_at' IS NULL AND (SELECT tc.invite_token_hash = '160fb6193eb408e7b6afc06b4bf9c1d5e41865464d8ef5486341e1e3f82ea69b' FROM public.tournament_clubs tc WHERE tc.id = ca), r->>'version');

  PERFORM pg_temp.it_ok('notify.reinvite_open', (SELECT n.status FROM public.club_notifications n WHERE n.group_id = ga AND n.kind = 'tournament_invitation' AND n.subject_type = 'tournament_club' AND n.subject_id = ca) = 'open', NULL);

  -- Người dùng "Bỏ qua" thông báo rồi trạng thái rời → vẫn dismissed
  UPDATE public.club_notifications SET status = 'dismissed', resolved_at = now()
  WHERE group_id = ga AND kind = 'tournament_invitation' AND subject_type = 'tournament_club' AND subject_id = ca;
  r := public.friendly_club_action(ga, 'guest', ca, 'accept', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);

  PERFORM pg_temp.it_ok('accept.a', r->>'invitation_status' = 'accepted', NULL);

  PERFORM pg_temp.it_ok('notify.dismissed_kept', (SELECT n.status FROM public.club_notifications n WHERE n.group_id = ga AND n.kind = 'tournament_invitation' AND n.subject_type = 'tournament_club' AND n.subject_id = ca) = 'dismissed', NULL);

  -- Khách A: lưu 2 cặp → gửi
  r := public.friendly_club_action(ga, 'guest', ca, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = ca), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(ma[1]::text, ma[2]::text, ma[3]::text, ma[4]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'p1', 'participantRefs', jsonb_build_array('member:' || ma[1], 'member:' || ma[2]), 'locked', false), jsonb_build_object('pairId', 'p2', 'participantRefs', jsonb_build_array('member:' || ma[3], 'member:' || ma[4]), 'locked', false)), 'unpairedRefs', jsonb_build_array())));

  PERFORM pg_temp.it_ok('roster.saved', r->>'invitation_status' = 'accepted' AND jsonb_array_length(r->'roster_draft'->'pairs') = 2 AND r->'roster_draft'->'unpairedRefs' = '[]'::jsonb, NULL);
  r := public.friendly_club_action(ga, 'guest', ca, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);

  PERFORM pg_temp.it_ok('roster.submitted', r->>'invitation_status' = 'roster_submitted' AND (r->'roster_submitted'->>'pairCount')::int = 2 AND (SELECT count(*) FROM jsonb_object_keys(r->'roster_submitted'->'memberNames')) = 4 AND r->'roster_submitted'->'memberNames'->>(ma[1]::text) = 'ZZE3A VĐV 1' AND r->>'roster_submitted_at' IS NOT NULL, NULL);

  PERFORM pg_temp.it_ok('notify.review_open', EXISTS (SELECT 1 FROM public.club_notifications n WHERE n.group_id = host AND n.kind = 'tournament_roster_review' AND n.subject_id = ca AND n.status = 'open' AND n.payload->>'reason' = 'roster_submitted' AND n.payload->>'guestClubName' = 'ZZE3A IT F1 khách A (rollback)' AND (n.payload->>'pairCount')::int = 2 AND (n.payload->>'tournamentId')::bigint = t1 AND (n.payload->>'divisionId')::bigint = d1), NULL);

  -- Yêu cầu sửa: bắt buộc lý do 2–300 ký tự

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', ca, 'request_changes', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('review.note_missing', e, 'FRIENDLY_NOTE_REQUIRED');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', ca, 'request_changes', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{"note": "  x  "}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('review.note_short', e, 'FRIENDLY_NOTE_REQUIRED');
  r := public.friendly_club_action(host, 'host', ca, 'request_changes', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{"note": "Cặp 2 cần đổi người"}'::jsonb);

  PERFORM pg_temp.it_ok('review.changes_requested', r->>'invitation_status' = 'changes_requested' AND r->>'review_note' = 'Cặp 2 cần đổi người' AND r->>'roster_approved_version' IS NULL, NULL);

  PERFORM pg_temp.it_ok('notify.changes_reopen', EXISTS (SELECT 1 FROM public.club_notifications n WHERE n.group_id = ga AND n.kind = 'tournament_invitation' AND n.subject_id = ca AND n.status = 'open' AND n.payload->>'reason' = 'changes_requested'), NULL);

  PERFORM pg_temp.it_ok('notify.review_resolved_on_changes', (SELECT n.status FROM public.club_notifications n WHERE n.group_id = host AND n.kind = 'tournament_roster_review' AND n.subject_type = 'tournament_club' AND n.subject_id = ca) = 'resolved', NULL);
  r := public.friendly_club_action(ga, 'guest', ca, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = ca), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(ma[1]::text, ma[3]::text, ma[2]::text, ma[4]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'p1', 'participantRefs', jsonb_build_array('member:' || ma[1], 'member:' || ma[3]), 'locked', false), jsonb_build_object('pairId', 'p2', 'participantRefs', jsonb_build_array('member:' || ma[2], 'member:' || ma[4]), 'locked', false)), 'unpairedRefs', jsonb_build_array())));
  r := public.friendly_club_action(ga, 'guest', ca, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);

  PERFORM pg_temp.it_ok('resubmit.a', r->>'invitation_status' = 'roster_submitted' AND r->>'review_note' IS NULL AND (SELECT n.status FROM public.club_notifications n WHERE n.group_id = ga AND n.kind = 'tournament_invitation' AND n.subject_type = 'tournament_club' AND n.subject_id = ca) = 'resolved' AND (SELECT n.status FROM public.club_notifications n WHERE n.group_id = host AND n.kind = 'tournament_roster_review' AND n.subject_type = 'tournament_club' AND n.subject_id = ca) = 'open', NULL);
  r := public.friendly_club_action(host, 'host', ca, 'approve', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);

  PERFORM pg_temp.it_ok('approve.version', r->>'invitation_status' = 'approved' AND (r->>'roster_approved_version')::bigint = (r->>'version')::bigint AND r->>'roster_reviewed_at' IS NOT NULL, r->>'roster_approved_version');

  PERFORM pg_temp.it_ok('notify.approve_resolved', (SELECT n.status FROM public.club_notifications n WHERE n.group_id = host AND n.kind = 'tournament_roster_review' AND n.subject_type = 'tournament_club' AND n.subject_id = ca) = 'resolved', NULL);

  -- Hạn mức cặp

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', ca, 'set_quota', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{"quota": 1}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('quota.below_roster', e, 'FRIENDLY_QUOTA_BELOW_ROSTER');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', ca, 'set_quota', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{"quota": 40}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('quota.invalid', e, 'FRIENDLY_QUOTA_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', ca, 'set_quota', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{"quota": 2.5}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('quota.fraction', e, 'FRIENDLY_QUOTA_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', ca, 'set_quota', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('quota.missing', e, 'FRIENDLY_QUOTA_INVALID');
  r := public.friendly_club_action(host, 'host', ca, 'set_quota', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{"quota": 2}'::jsonb);

  PERFORM pg_temp.it_ok('quota.set', (r->>'quota')::int = 2 AND r->>'invitation_status' = 'approved', NULL);

  -- Link: đổi băm, unique, thu hồi khi rút
  r := public.friendly_club_action(host, 'host', ca, 'rotate_link', (SELECT version FROM public.tournament_clubs WHERE id = ca), jsonb_build_object('inviteTokenHash', '48eb1d073c137d9c895b1a5284e807e349b29cb6e07803cff0dfedaeca39ead1'));

  PERFORM pg_temp.it_ok('link.rotate', r->>'invitation_status' = 'approved' AND (SELECT tc.invite_token_hash = '48eb1d073c137d9c895b1a5284e807e349b29cb6e07803cff0dfedaeca39ead1' FROM public.tournament_clubs tc WHERE tc.id = ca), NULL);

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', ca, 'rotate_link', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{"inviteTokenHash": "ZZ"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('link.rotate_bad_hash', e, 'SETUP_PAYLOAD_INVALID');
  e := NULL;
  BEGIN
    UPDATE public.tournament_clubs SET invite_token_hash = '48eb1d073c137d9c895b1a5284e807e349b29cb6e07803cff0dfedaeca39ead1' WHERE id = cb;
  EXCEPTION WHEN unique_violation THEN e := 'UNIQUE_VIOLATION';
  END;
  PERFORM pg_temp.it_err('link.unique', e, 'UNIQUE_VIOLATION');
  r := public.friendly_club_action(host, 'host', ca, 'remove', (SELECT version FROM public.tournament_clubs WHERE id = ca), '{}'::jsonb);

  PERFORM pg_temp.it_ok('remove.approved', r->>'invitation_status' = 'withdrawn' AND r->>'roster_approved_version' IS NULL AND (SELECT tc.invite_token_hash IS NULL FROM public.tournament_clubs tc WHERE tc.id = ca), NULL);

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', ca, 'rotate_link', (SELECT version FROM public.tournament_clubs WHERE id = ca), jsonb_build_object('inviteTokenHash', '87fdea8ed342f7cb4e4a14a6f6195ab7951669e525c1a91b4e5918f695adabea'));
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('remove.rotate_withdrawn', e, 'FRIENDLY_TRANSITION_INVALID');
  r := public.friendly_invite_club(host, t1, ga, NULL, NULL, 1, '868cbe4c190dd5b476bd3cd9712d99bb14f8fb507ed5e06906fa207b108c505c');

  PERFORM pg_temp.it_ok('reinvite.keeps_draft', r->>'invitation_status' = 'invited' AND jsonb_array_length(r->'roster_draft'->'pairs') = 2 AND r->'roster_submitted' = 'null'::jsonb AND r->>'review_note' IS NULL AND r->>'roster_approved_version' IS NULL AND r->>'quota' IS NULL, NULL);

  -- ===== Giải 2, hạn mức truyền vào 2 (ca core ≥ 3 CLB: chủ nhà + A + B) =====
  r := public.friendly_invite_club(host, t2, ga, NULL, NULL, 2, 'b456c4a71b6c35d3b74a30ea6058511dcacaf1becc59ea2d221863e046fcab91');
  ca2 := (r->>'id')::bigint;
  r := public.friendly_invite_club(host, t2, gb, 3, NULL, 2, '3eee09a09cc80295cf656dea092d8e84b6dd88ec966f16f6043d8077a203a1df');
  cb2 := (r->>'id')::bigint;

  PERFORM pg_temp.it_ok('core3.two_guests', (SELECT count(*) FROM public.tournament_clubs WHERE tournament_id = t2 AND invitation_status = 'invited') = 2, NULL);

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t2, (SELECT id FROM public.groups WHERE id NOT IN (host, ga, gb) ORDER BY id LIMIT 1), NULL, NULL, 2, '05cffc43938e3af867e9833c03abc2747a73eca03d523595cd2856e1614e1dac');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('core3.limit_1_blocks_more', e, 'FRIENDLY_CLUB_LIMIT_REACHED');
  r := public.friendly_club_action(gb, 'guest', cb2, 'accept', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);

  PERFORM pg_temp.it_ok('notify.accept_resolved', (SELECT n.status FROM public.club_notifications n WHERE n.group_id = gb AND n.kind = 'tournament_invitation' AND n.subject_type = 'tournament_club' AND n.subject_id = cb2) = 'resolved', NULL);

  -- Roster sai của B

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'g1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'guest:g_zze3a_0001'))), 'unpairedRefs', jsonb_build_array())));
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.guest', e, 'FRIENDLY_GUEST_NOT_ALLOWED');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text, ma[1]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'o1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || ma[1]))), 'unpairedRefs', '[]'::jsonb)));
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.outside', e, 'FRIENDLY_MEMBER_OUTSIDE_CLUB');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text, mb[2]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'bad id!', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[2]))), 'unpairedRefs', jsonb_build_array())));
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.bad_pair_id', e, 'SETUP_PAYLOAD_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text, mb[2]::text, mb[3]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'd1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[2])), jsonb_build_object('pairId', 'd2', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[3]))), 'unpairedRefs', jsonb_build_array())));
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.person_in_two_pairs', e, 'SETUP_PAYLOAD_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text, mb[2]::text, mb[3]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'p1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[2]), 'locked', false)), 'unpairedRefs', jsonb_build_array())));
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.unpaired_mismatch', e, 'SETUP_PAYLOAD_INVALID');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{"roster": []}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.not_object', e, 'SETUP_PAYLOAD_INVALID');
  r := public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text, mb[2]::text, mb[3]::text, mb[4]::text, mb[5]::text, mb[6]::text, mb[7]::text, mb[8]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'p1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[2]), 'locked', false), jsonb_build_object('pairId', 'p2', 'participantRefs', jsonb_build_array('member:' || mb[3], 'member:' || mb[4]), 'locked', false), jsonb_build_object('pairId', 'p3', 'participantRefs', jsonb_build_array('member:' || mb[5], 'member:' || mb[6]), 'locked', false), jsonb_build_object('pairId', 'p4', 'participantRefs', jsonb_build_array('member:' || mb[7], 'member:' || mb[8]), 'locked', false)), 'unpairedRefs', jsonb_build_array())));

  PERFORM pg_temp.it_ok('roster.save_over_quota', jsonb_array_length(r->'roster_draft'->'pairs') = 4 AND r->>'invitation_status' = 'accepted', NULL);

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.quota_exceeded', e, 'FRIENDLY_QUOTA_EXCEEDED');
  r := public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text, mb[2]::text, mb[3]::text, mb[4]::text, mb[5]::text, mb[9]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'p1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[2]), 'locked', false), jsonb_build_object('pairId', 'p2', 'participantRefs', jsonb_build_array('member:' || mb[3], 'member:' || mb[4]), 'locked', false), jsonb_build_object('pairId', 'p3', 'participantRefs', jsonb_build_array('member:' || mb[5], 'member:' || mb[9]), 'locked', false)), 'unpairedRefs', jsonb_build_array())));

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.athlete_missing', e, 'FRIENDLY_ATHLETE_ID_MISSING');
  r := public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text, mb[2]::text, mb[3]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'p1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[2]), 'locked', false)), 'unpairedRefs', jsonb_build_array('member:' || mb[3]))));

  PERFORM pg_temp.it_ok('roster.save_odd', jsonb_array_length(r->'roster_draft'->'unpairedRefs') = 1, NULL);

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.unpaired', e, 'FRIENDLY_ROSTER_UNPAIRED');
  r := public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{"roster": {"memberIds": [], "pairs": [], "unpairedRefs": []}}'::jsonb);

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.empty', e, 'FRIENDLY_ROSTER_EMPTY');
  r := public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text, mb[2]::text, mb[7]::text, mb[8]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'p1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[2]), 'locked', false), jsonb_build_object('pairId', 'p2', 'participantRefs', jsonb_build_array('member:' || mb[7], 'member:' || mb[8]), 'locked', false)), 'unpairedRefs', jsonb_build_array())));
  UPDATE public.club_members SET is_active = false WHERE id = mb[8];

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('roster.inactive_member', e, 'FRIENDLY_MEMBER_OUTSIDE_CLUB');
  UPDATE public.club_members SET is_active = true WHERE id = mb[8];
  r := public.friendly_club_action(gb, 'guest', cb2, 'save_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('roster', jsonb_build_object('memberIds', jsonb_build_array(mb[1]::text, mb[2]::text, mb[3]::text, mb[4]::text), 'pairs', jsonb_build_array(jsonb_build_object('pairId', 'p1', 'participantRefs', jsonb_build_array('member:' || mb[1], 'member:' || mb[2]), 'locked', false), jsonb_build_object('pairId', 'p2', 'participantRefs', jsonb_build_array('member:' || mb[3], 'member:' || mb[4]), 'locked', false)), 'unpairedRefs', jsonb_build_array())));

  -- Cửa sổ đăng ký
  x := public.set_friendly_registration_window(host, t2, NULL, true);

  PERFORM pg_temp.it_ok('window.lock_value', x->>'registrationLockedAt' IS NOT NULL AND x->'registrationDeadline' = 'null'::jsonb, NULL);

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('window.locked', e, 'FRIENDLY_REGISTRATION_CLOSED');

  PERFORM pg_temp.it_ok('window.settings_kept', (SELECT settings->>'poster_url' = 'zze3a-poster' AND settings->>'organizer_mode' = 'friendly' AND settings->'friendly'->>'registrationLockedAt' IS NOT NULL FROM public.tournaments WHERE id = t2), NULL);
  s := x->>'registrationLockedAt';
  x := public.set_friendly_registration_window(host, t2, NULL, true);

  PERFORM pg_temp.it_ok('window.lock_keeps_time', x->>'registrationLockedAt' = s, NULL);
  x := public.set_friendly_registration_window(host, t2, now() - interval '1 hour', false);

  PERFORM pg_temp.it_ok('window.unlocked', x->'registrationLockedAt' = 'null'::jsonb, NULL);

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('window.deadline_passed', e, 'FRIENDLY_REGISTRATION_CLOSED');
  x := public.set_friendly_registration_window(host, t2, now(), false);

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('window.deadline_exact', e, 'FRIENDLY_REGISTRATION_CLOSED');
  x := public.set_friendly_registration_window(host, t2, NULL, false);
  r := public.friendly_club_action(gb, 'guest', cb2, 'submit_roster', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);

  PERFORM pg_temp.it_ok('window.open_submit', r->>'invitation_status' = 'roster_submitted', NULL);

  e := NULL;
  BEGIN
    PERFORM public.set_friendly_registration_window(host, t3, NULL, true);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('window.internal', e, 'FRIENDLY_MODE_REQUIRED');

  e := NULL;
  BEGIN
    PERFORM public.set_friendly_registration_window(ga, t2, NULL, true);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('window.not_owner', e, 'TOURNAMENT_NOT_FOUND');
  x := public.set_friendly_registration_window(host, t2, NULL, true);
  r := public.friendly_club_action(host, 'host', cb2, 'approve', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);

  PERFORM pg_temp.it_ok('window.approve_while_locked', r->>'invitation_status' = 'approved', NULL);

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', cb2, 'request_changes', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{"note": "Sửa lại"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('window.request_changes_locked', e, 'FRIENDLY_REGISTRATION_CLOSED');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(gb, 'guest', cb2, 'withdraw', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('window.guest_withdraw_locked', e, 'FRIENDLY_REGISTRATION_CLOSED');

  -- Đã chốt (division locked): mọi hành động và mời → FRIENDLY_REGISTRATION_CLOSED
  UPDATE public.tournament_divisions SET roster_lock_status = 'locked' WHERE id = d2;

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', cb2, 'remove', (SELECT version FROM public.tournament_clubs WHERE id = cb2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('finalized.action', e, 'FRIENDLY_REGISTRATION_CLOSED');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(ga, 'guest', ca2, 'accept', (SELECT version FROM public.tournament_clubs WHERE id = ca2), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('finalized.guest', e, 'FRIENDLY_REGISTRATION_CLOSED');

  e := NULL;
  BEGIN
    PERFORM public.friendly_club_action(host, 'host', cb2, 'rotate_link', (SELECT version FROM public.tournament_clubs WHERE id = cb2), jsonb_build_object('inviteTokenHash', 'c4c9cf831d1d71724282d94329dfa637a3e08815081a917c72de1df4a1e24855'));
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('finalized.rotate', e, 'FRIENDLY_REGISTRATION_CLOSED');

  e := NULL;
  BEGIN
    PERFORM public.friendly_invite_club(host, t2, ga, NULL, NULL, 5, '682656a798d7384d0c44030776a985f6c8d6d525e2a5d0a31061e196b177391e');
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('finalized.invite', e, 'FRIENDLY_REGISTRATION_CLOSED');

  e := NULL;
  BEGIN
    PERFORM public.set_friendly_registration_window(host, t2, NULL, false);
  EXCEPTION WHEN OTHERS THEN e := SQLERRM;
  END;
  PERFORM pg_temp.it_err('finalized.window', e, 'FRIENDLY_REGISTRATION_CLOSED');

  -- ===== CLB 19 thật (chỉ trong transaction) =====
  IF EXISTS (SELECT 1 FROM public.groups WHERE id = 19) THEN
    r := public.friendly_invite_club(host, t4, 19, NULL, NULL, 1, '5ef3be282fadb4db6aea35fae4b4b47de7ad379f51c464d8d8fec8916d25196e');
    c19 := (r->>'id')::bigint;
    PERFORM pg_temp.it_ok('g19.invited', r->>'invitation_status' = 'invited' AND (SELECT n.status FROM public.club_notifications n WHERE n.group_id = 19 AND n.kind = 'tournament_invitation' AND n.subject_type = 'tournament_club' AND n.subject_id = c19) = 'open', NULL);
  ELSE
    INSERT INTO it_result VALUES ('g19.invited', 'bỏ qua: không có group 19');
  END IF;

  -- Không có token thô nào trong DB; mọi băm đúng định dạng

  PERFORM pg_temp.it_ok('token.no_raw', NOT EXISTS (SELECT 1 FROM public.tournament_clubs tc WHERE tc.tournament_id IN (t1, t2, t4) AND to_jsonb(tc)::text LIKE ANY (ARRAY['%ZZE3AfriendlyA1____________________________%', '%ZZE3AfriendlyB1____________________________%', '%ZZE3AfriendlyX1____________________________%', '%ZZE3AfriendlyX2____________________________%', '%ZZE3AfriendlyX3____________________________%', '%ZZE3AfriendlyX4____________________________%', '%ZZE3AfriendlyX5____________________________%', '%ZZE3AfriendlyX6____________________________%', '%ZZE3AfriendlyX7____________________________%', '%ZZE3AfriendlyX8____________________________%', '%ZZE3AfriendlyX9____________________________%', '%ZZE3AfriendlyA2____________________________%', '%ZZE3AfriendlyA3____________________________%', '%ZZE3AfriendlyA9____________________________%', '%ZZE3AfriendlyA4____________________________%', '%ZZE3AfriendlyA5____________________________%', '%ZZE3AfriendlyB2____________________________%', '%ZZE3AfriendlyX10___________________________%', '%ZZE3AfriendlyB9____________________________%', '%ZZE3AfriendlyX11___________________________%', '%ZZE3AfriendlyG19___________________________%'])) AND NOT EXISTS (SELECT 1 FROM public.club_notifications n WHERE n.subject_type = 'tournament_club' AND n.subject_id IN (SELECT id FROM public.tournament_clubs WHERE tournament_id IN (t1, t2, t4)) AND n.payload::text LIKE '%ZZE3Afriendly%'), NULL);

  PERFORM pg_temp.it_ok('token.hash_shape', NOT EXISTS (SELECT 1 FROM public.tournament_clubs tc WHERE tc.tournament_id IN (t1, t2, t4) AND tc.invite_token_hash IS NOT NULL AND tc.invite_token_hash !~ '^[a-f0-9]{64}$'), NULL);

  INSERT INTO it_result VALUES ('zz.ALL', 'ok');
END
$it$;
SELECT k, v FROM it_result ORDER BY k;
ROLLBACK;
