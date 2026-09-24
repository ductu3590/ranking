-- Kiểm thử tích hợp Epic 1 (loại kép): migration 108 (nạp trong transaction) + chơi hết giải.
-- Sinh bởi scripts/qa/epic-1-de-integration.js. Toàn bộ trong một transaction, ROLLBACK ở cuối.
BEGIN;


ALTER TABLE public.tournament_stages DROP CONSTRAINT IF EXISTS tournament_stages_schedule_format_check;
ALTER TABLE public.tournament_stages ADD CONSTRAINT tournament_stages_schedule_format_check
  CHECK (schedule_format = ANY (ARRAY['round_robin'::text, 'knockout'::text, 'double_elim'::text]));

-- Lưu nháp: _v1 (định nghĩa 099, đang chạy trên production) có danh sách formatKey riêng; thêm
-- 'double_elimination' để bản nháp loại kép lưu được. Thân hàm chép nguyên 099, chỉ đổi dòng đó.
CREATE OR REPLACE FUNCTION public.save_unified_setup_aggregate_draft_v1(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint,
  p_client_draft_key text,
  p_draft jsonb,
  p_expected_setup_revision bigint,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.tournaments%ROWTYPE;
  d public.tournament_divisions%ROWTYPE;
  cached public.tournament_setup_mutations%ROWTYPE;
  fingerprint text;
  normalized jsonb;
  v_name text;
  v_organizer_mode text;
  v_play_type text;
  v_format_key text;
  v_current_step integer;
  result jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
    OR p_client_draft_key IS NULL OR length(btrim(p_client_draft_key)) NOT BETWEEN 1 AND 200
    OR p_expected_setup_revision IS NULL OR p_expected_setup_revision < 1
    OR jsonb_typeof(p_draft) IS DISTINCT FROM 'object'
    OR (p_tournament_id IS NULL) <> (p_division_id IS NULL) THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Accept only the normalized aggregate shape; do not pass arbitrary draft JSON through.
  v_name := NULLIF(btrim(p_draft->'tournament'->>'name'), '');
  v_organizer_mode := COALESCE(p_draft->'tournament'->>'organizerMode', 'internal');
  v_play_type := COALESCE(p_draft->'division'->>'playType', 'doubles');
  v_format_key := COALESCE(p_draft->'format'->>'formatKey', 'group_knockout');
  IF COALESCE(p_draft->>'currentStep', '1') !~ '^[1-4]$' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_current_step := COALESCE(NULLIF(p_draft->>'currentStep', '')::integer, 1);
  IF v_name IS NULL OR v_organizer_mode NOT IN ('internal', 'friendly')
    OR v_play_type NOT IN ('singles', 'doubles', 'team')
    OR v_format_key NOT IN ('round_robin', 'knockout', 'group_knockout', 'mlp', 'double_elimination')
    OR v_current_step NOT BETWEEN 1 AND 4
    OR jsonb_typeof(COALESCE(p_draft->'participants'->'selectedMemberIds', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(p_draft->'pairs', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(p_draft->'unpairedMemberIds', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(p_draft->'reserveMemberIds', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(p_draft->'invitedClubs', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(p_draft->'draw', '{}'::jsonb)) <> 'object'
    OR jsonb_typeof(COALESCE(p_draft->'format'->'config', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_draft->'participants'->'selectedMemberIds', '[]'::jsonb)) x
             WHERE jsonb_typeof(x) <> 'string' OR x #>> '{}' !~ '^[1-9][0-9]*$') THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  normalized := jsonb_build_object(
    'draftVersion', 2,
    'currentStep', v_current_step,
    'tournament', jsonb_build_object('name', v_name, 'organizerMode', v_organizer_mode),
    'division', jsonb_build_object('name', COALESCE(NULLIF(btrim(p_draft->'division'->>'name'), ''), v_name), 'playType', v_play_type),
    'format', jsonb_build_object('entrantType', CASE v_play_type WHEN 'singles' THEN 'singles' WHEN 'doubles' THEN 'doubles' ELSE 'team' END, 'formatKey', v_format_key, 'config', COALESCE(p_draft->'format'->'config', '{}'::jsonb)),
    'participants', jsonb_build_object('selectedMemberIds', p_draft->'participants'->'selectedMemberIds'),
    'pairs', COALESCE(p_draft->'pairs', '[]'::jsonb),
    'unpairedMemberIds', COALESCE(p_draft->'unpairedMemberIds', '[]'::jsonb),
    'reserveMemberIds', COALESCE(p_draft->'reserveMemberIds', '[]'::jsonb),
    'invitedClubs', COALESCE(p_draft->'invitedClubs', '[]'::jsonb),
    'draw', COALESCE(p_draft->'draw', '{}'::jsonb)
  );
  fingerprint := md5(jsonb_build_object(
    'client_draft_key', btrim(p_client_draft_key),
    'tournament_id', p_tournament_id,
    'division_id', p_division_id,
    'expected_setup_revision', p_expected_setup_revision,
    'draft', normalized
  )::text);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':aggregate-draft:' || btrim(p_client_draft_key), 0));
  SELECT * INTO cached FROM public.tournament_setup_mutations
  WHERE group_id = p_group_id AND operation = 'save_unified_setup_aggregate_draft'
    AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF cached.payload_fingerprint <> fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'PH409'; END IF;
    RETURN cached.response;
  END IF;

  IF p_tournament_id IS NULL THEN
    SELECT * INTO t FROM public.tournaments WHERE group_id = p_group_id AND client_draft_key = btrim(p_client_draft_key) FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.tournaments(group_id, name, status, entrant_type, settings, organizer_type, organizer_club_id, client_draft_key)
      VALUES (p_group_id, v_name, 'draft', CASE v_play_type WHEN 'team' THEN 'team' ELSE 'pair' END,
              jsonb_build_object('organizer_mode', v_organizer_mode), 'club', p_group_id, btrim(p_client_draft_key))
      RETURNING * INTO t;
      INSERT INTO public.tournament_divisions(group_id, tournament_id, name, entrant_type, play_type, scoring_scope, rating_policy, pairing_mode, competition_template)
      VALUES (p_group_id, t.id, normalized->'division'->>'name', CASE v_play_type WHEN 'singles' THEN 'individual' WHEN 'doubles' THEN 'pair' ELSE 'team' END,
              v_play_type, CASE WHEN v_play_type = 'team' THEN 'club' ELSE 'athlete' END, 'open', 'none', 'unified_setup_draft_v2')
      RETURNING * INTO d;
    ELSE
      SELECT * INTO d FROM public.tournament_divisions
      WHERE group_id = p_group_id AND tournament_id = t.id AND competition_template = 'unified_setup_draft_v2'
      ORDER BY id LIMIT 2 FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'SETUP_DRAFT_TARGET_REQUIRED' USING ERRCODE = '22023';
      END IF;
      IF (SELECT count(*) FROM public.tournament_divisions WHERE group_id = p_group_id AND tournament_id = t.id AND competition_template = 'unified_setup_draft_v2') <> 1 THEN
        RAISE EXCEPTION 'SETUP_DRAFT_TARGET_AMBIGUOUS' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSE
    SELECT * INTO d FROM public.tournament_divisions WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DIVISION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    SELECT * INTO t FROM public.tournaments WHERE id = d.tournament_id AND group_id = p_group_id FOR UPDATE;
  END IF;

  IF d.setup_revision <> p_expected_setup_revision THEN RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = 'PH409'; END IF;
  normalized := normalized || jsonb_build_object('tournamentId', t.id, 'divisionId', d.id, 'revision', d.setup_revision + 1, 'state', 'server_draft', 'clientDraftKey', btrim(p_client_draft_key));
  UPDATE public.tournament_divisions SET setup_draft = normalized, setup_revision = setup_revision + 1, setup_updated_at = now()
  WHERE id = d.id AND group_id = p_group_id RETURNING setup_revision INTO d.setup_revision;
  result := jsonb_build_object('success', true, 'tournament_id', t.id, 'division_id', d.id, 'setup_revision', d.setup_revision, 'draft', normalized);
  INSERT INTO public.tournament_setup_mutations(group_id, operation, division_id, idempotency_key, payload_fingerprint, response)
  VALUES (p_group_id, 'save_unified_setup_aggregate_draft', d.id, p_idempotency_key, fingerprint, result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_unified_setup_aggregate_draft_v1(bigint,bigint,bigint,text,jsonb,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_unified_setup_aggregate_draft_v1(bigint,bigint,bigint,text,jsonb,bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_internal_setup_v4(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint,
  p_expected_setup_revision bigint,
  p_idempotency_key text,
  p_preview_fingerprint text,
  p_plan jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c_allowed_formats constant text[] := ARRAY['group_knockout', 'round_robin', 'knockout', 'double_elimination'];
  d public.tournament_divisions%ROWTYPE;
  t public.tournaments%ROWTYPE;
  cached public.tournament_setup_mutations%ROWTYPE;
  v_draft jsonb;
  v_request_fingerprint text;
  v_fingerprint text;
  v_host_club_id bigint;
  v_pair jsonb;
  v_ref text;
  v_member_id bigint;
  v_client_ref text;
  v_guest jsonb;
  v_ta_id bigint;
  v_athlete_id bigint;
  v_name text;
  v_part text;
  v_pair_id bigint;
  v_entry_id bigint;
  v_stage jsonb;
  v_stage_id bigint;
  v_group jsonb;
  v_index integer;
  v_match jsonb;
  v_match_id bigint;
  v_prog jsonb;
  v_source jsonb;
  v_target_match jsonb;
  v_ref_athletes jsonb := '{}'::jsonb;
  v_ref_names jsonb := '{}'::jsonb;
  v_pair_entries jsonb := '{}'::jsonb;
  v_stage_ids jsonb := '{}'::jsonb;
  v_match_ids jsonb := '{}'::jsonb;
  v_pair_count integer;
  v_participant_count integer;
  v_result jsonb;
BEGIN
  IF p_group_id IS NULL OR p_tournament_id IS NULL OR p_division_id IS NULL
    OR p_expected_setup_revision IS NULL OR p_expected_setup_revision < 1
    OR p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200
    OR p_preview_fingerprint IS NULL OR lower(p_preview_fingerprint) !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  v_request_fingerprint := md5(jsonb_build_object(
    'tournament_id', p_tournament_id, 'division_id', p_division_id,
    'expected_setup_revision', p_expected_setup_revision,
    'preview_fingerprint', lower(p_preview_fingerprint), 'plan', md5(p_plan::text)
  )::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':setup-finalize-v4:' || btrim(p_idempotency_key), 0));
  SELECT * INTO cached FROM public.tournament_setup_mutations
  WHERE group_id = p_group_id AND operation = 'finalize_internal_setup_v4' AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF cached.division_id <> p_division_id OR cached.payload_fingerprint <> v_request_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'PH409';
    END IF;
    RETURN cached.response;
  END IF;

  SELECT * INTO d FROM public.tournament_divisions
  WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DIVISION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO t FROM public.tournaments WHERE id = p_tournament_id AND group_id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF d.setup_revision <> p_expected_setup_revision THEN RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = 'PH409'; END IF;
  IF d.roster_lock_status <> 'open' THEN RAISE EXCEPTION 'ROSTER_LOCKED' USING ERRCODE = 'PH409'; END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_stages s WHERE s.group_id = p_group_id AND s.division_id = p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_entries e WHERE e.group_id = p_group_id AND e.division_id = p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_pairs p WHERE p.group_id = p_group_id AND p.division_id = p_division_id)
    OR EXISTS (SELECT 1 FROM public.tournament_stage_transitions x WHERE x.group_id = p_group_id AND x.division_id = p_division_id) THEN
    RAISE EXCEPTION 'FINALIZE_STRUCTURE_ALREADY_EXISTS' USING ERRCODE = 'PH409';
  END IF;

  -- Bản nháp đã lưu là nguồn sự thật; plan phải khớp nó.
  v_draft := d.setup_draft;
  v_fingerprint := lower(p_preview_fingerprint);
  IF jsonb_typeof(v_draft) IS DISTINCT FROM 'object'
    OR COALESCE(v_draft->>'draftVersion', '') <> '3'
    OR COALESCE(v_draft->'tournament'->>'organizerMode', '') <> 'internal'
    OR d.play_type <> 'doubles'
    OR jsonb_typeof(v_draft->'pairs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_draft->'participants'->'memberIds') IS DISTINCT FROM 'array'
    OR jsonb_typeof(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'FINALIZE_DRAFT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT (COALESCE(v_draft->'format'->>'formatKey', '') = ANY (c_allowed_formats))
    OR p_plan->>'formatKey' IS DISTINCT FROM v_draft->'format'->>'formatKey' THEN
    RAISE EXCEPTION 'FORMAT_NOT_AVAILABLE' USING ERRCODE = '22023';
  END IF;
  IF lower(COALESCE(v_draft->'draw'->>'previewFingerprint', '')) <> v_fingerprint
    OR lower(COALESCE(p_plan->>'fingerprint', '')) <> v_fingerprint THEN
    RAISE EXCEPTION 'DRAW_FINGERPRINT_MISMATCH' USING ERRCODE = 'PH409';
  END IF;
  IF jsonb_typeof(p_plan->'pairs') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'stages') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_plan->'groups') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'matches') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_plan->'progressions') IS DISTINCT FROM 'array'
    OR jsonb_typeof(COALESCE(p_plan->'guests', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'FINALIZE_PLAN_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Cặp: đúng tập cặp của bản nháp, mỗi cặp hai ref khác nhau, mỗi người đúng một cặp,
  -- mọi người tham gia đều có cặp (không dự bị, không cặp một người).
  v_pair_count := jsonb_array_length(v_draft->'pairs');
  v_participant_count := jsonb_array_length(v_draft->'participants'->'memberIds') + jsonb_array_length(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb));
  IF v_pair_count < 2 OR jsonb_array_length(p_plan->'pairs') <> v_pair_count OR v_participant_count <> v_pair_count * 2
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_draft->'pairs') x
               WHERE jsonb_typeof(x->'participantRefs') IS DISTINCT FROM 'array' OR jsonb_array_length(x->'participantRefs') <> 2
                  OR x->'participantRefs'->>0 = x->'participantRefs'->>1
                  OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'pairs') y
                                 WHERE y->>'pairId' = x->>'pairId'
                                   AND (SELECT array_agg(r ORDER BY r) FROM jsonb_array_elements_text(y->'refs') r)
                                     = (SELECT array_agg(r ORDER BY r) FROM jsonb_array_elements_text(x->'participantRefs') r)))
    OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(v_draft->'pairs') x, jsonb_array_elements_text(x->'participantRefs') r) <> v_pair_count * 2
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_draft->'pairs') x, jsonb_array_elements_text(x->'participantRefs') r
               WHERE NOT (
                 (r ~ '^member:[1-9][0-9]*$' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_draft->'participants'->'memberIds') m WHERE m = substr(r, 8)))
                 OR (r ~ '^guest:[A-Za-z0-9_-]{8,64}$' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) g WHERE g->>'clientRef' = substr(r, 7)))
               )) THEN
    RAISE EXCEPTION 'PAIRING_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Thành viên: đang hoạt động trong đúng CLB và có danh tính thi đấu.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_draft->'participants'->'memberIds') m
             WHERE m !~ '^[1-9][0-9]*$' OR NOT EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = m::bigint AND cm.group_id = p_group_id AND cm.is_active IS DISTINCT FROM false)) THEN
    RAISE EXCEPTION 'MEMBER_NOT_ACTIVE_IN_GROUP' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_draft->'participants'->'memberIds') m
             WHERE NOT EXISTS (SELECT 1 FROM public.athletes a WHERE a.legacy_club_member_id = m::bigint)) THEN
    RAISE EXCEPTION 'ATHLETE_IDENTITY_MISSING' USING ERRCODE = '23503';
  END IF;
  -- Khách: tên lấy từ bản nháp đã lưu (không tin tên trong p_plan).
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) g
             WHERE COALESCE(g->>'clientRef', '') !~ '^[A-Za-z0-9_-]{8,64}$' OR length(btrim(COALESCE(g->>'displayName', ''))) NOT BETWEEN 2 AND 60) THEN
    RAISE EXCEPTION 'GUEST_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Cấu trúc plan: 2 stage có planKey, mỗi cặp đúng một bảng, matchKey duy nhất,
  -- trận bảng dùng cặp của bảng đó, trận loại trực tiếp để trống và có đúng hai nguồn.
  IF (p_plan->>'formatKey' = 'group_knockout' AND jsonb_array_length(p_plan->'stages') <> 2)
    OR (p_plan->>'formatKey' = 'round_robin' AND (
      jsonb_array_length(p_plan->'stages') <> 1
      OR jsonb_array_length(p_plan->'progressions') <> 0
      OR jsonb_array_length(p_plan->'matches') <> v_pair_count * (v_pair_count - 1) / 2
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_draft->'pairs') x
                 WHERE (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m
                        WHERE m->>'entryAId' = x->>'pairId' OR m->>'entryBId' = x->>'pairId') <> v_pair_count - 1)
      OR (SELECT count(DISTINCT LEAST(m->>'entryAId', m->>'entryBId') || '~' || GREATEST(m->>'entryAId', m->>'entryBId'))
          FROM jsonb_array_elements(p_plan->'matches') m) <> jsonb_array_length(p_plan->'matches')))
    OR (p_plan->>'formatKey' = 'knockout' AND (
      jsonb_array_length(p_plan->'stages') <> 1
      OR p_plan->'stages'->0->>'scheduleFormat' IS DISTINCT FROM 'knockout'
      OR jsonb_array_length(p_plan->'groups') <> 1
      OR p_plan->'groups'->0->>'stagePlanKey' IS DISTINCT FROM p_plan->'stages'->0->>'planKey'
      OR jsonb_array_length(p_plan->'matches') <> v_pair_count - 1
           + (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' = 'BRONZE')::integer
      OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' = 'F') <> 1
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'stageKind' IS DISTINCT FROM 'knockout' OR m->>'entryAId' = m->>'entryBId')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->'source'->>'kind' IS DISTINCT FROM 'match_outcome')
      -- Mỗi ô của mỗi trận: hoặc có cặp (vòng 1 / bye), hoặc đúng một tuyến đi tới.
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m, (VALUES ('a', 'entryAId'), ('b', 'entryBId')) side(slot, field)
                 WHERE (CASE WHEN m->>side.field IS NULL THEN 0 ELSE 1 END)
                   + (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->>'targetMatchKey' = m->>'matchKey' AND pr->>'targetSlot' = side.slot) <> 1)
      -- Mỗi cặp vào nhánh đúng một lần.
      OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id) WHERE e.id IS NOT NULL) <> v_pair_count
      OR (SELECT count(DISTINCT e.id) FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id) WHERE e.id IS NOT NULL) <> v_pair_count
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id)
                 WHERE e.id IS NOT NULL AND NOT (p_plan->'groups'->0->'entryIds' ? e.id))
      -- Tuyến chỉ đi tới vòng sau; trận thua chỉ vào tranh hạng ba, từ hai bán kết.
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr
                 JOIN jsonb_array_elements(p_plan->'matches') src ON src->>'matchKey' = pr->'source'->>'matchKey'
                 JOIN jsonb_array_elements(p_plan->'matches') dst ON dst->>'matchKey' = pr->>'targetMatchKey'
                 WHERE (src->>'round')::integer >= (dst->>'round')::integer
                    OR pr->'source'->>'outcome' NOT IN ('winner', 'loser')
                    OR (pr->'source'->>'outcome' = 'loser' AND (pr->>'targetMatchKey' <> 'BRONZE' OR pr->'source'->>'matchKey' NOT IN ('SF1', 'SF2'))))
      -- F là trận duy nhất không có cạnh thắng đi ra (không tính BRONZE, cũng không có cạnh ra).
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
                 WHERE (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr
                        WHERE pr->'source'->>'matchKey' = m->>'matchKey' AND pr->'source'->>'outcome' = 'winner')
                       <> CASE WHEN m->>'matchKey' IN ('F', 'BRONZE') THEN 0 ELSE 1 END)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->'source'->>'matchKey' IN ('F', 'BRONZE'))))
    OR (p_plan->>'formatKey' = 'double_elimination' AND (
      jsonb_array_length(p_plan->'stages') <> 1
      OR p_plan->'stages'->0->>'scheduleFormat' IS DISTINCT FROM 'double_elim'
      OR p_plan->'stages'->0->'config'->'grandFinalReset' IS DISTINCT FROM 'false'::jsonb
      OR jsonb_array_length(p_plan->'groups') <> 1
      OR p_plan->'groups'->0->>'stagePlanKey' IS DISTINCT FROM p_plan->'stages'->0->>'planKey'
      -- 2n − 2 trận: nhánh thắng n − 1, nhánh thua n − 2, đúng một WF / LF / GF.
      OR jsonb_array_length(p_plan->'matches') <> 2 * v_pair_count - 2
      OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' ~ '^W([0-9]+-[0-9]+|F)$') <> v_pair_count - 1
      OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' ~ '^L([0-9]+-[0-9]+|F)$') <> v_pair_count - 2
      OR (SELECT count(DISTINCT m->>'matchKey') FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' IN ('WF', 'LF', 'GF')) <> 3
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
                 WHERE COALESCE(m->>'matchKey', '') !~ '^(W[0-9]+-[0-9]+|WF|L[0-9]+-[0-9]+|LF|GF)$'
                    OR m->>'stageKind' IS DISTINCT FROM 'knockout' OR m->>'entryAId' = m->>'entryBId')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr
                 WHERE pr->'source'->>'kind' IS DISTINCT FROM 'match_outcome' OR COALESCE(pr->'source'->>'outcome', '') NOT IN ('winner', 'loser'))
      -- Mỗi ô của mỗi trận: hoặc có cặp (nhánh thắng / bye), hoặc đúng một tuyến đi tới → không trận một bên.
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m, (VALUES ('a', 'entryAId'), ('b', 'entryBId')) side(slot, field)
                 WHERE (CASE WHEN m->>side.field IS NULL THEN 0 ELSE 1 END)
                   + (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->>'targetMatchKey' = m->>'matchKey' AND pr->>'targetSlot' = side.slot) <> 1)
      -- Cặp chỉ vào nhánh thắng, mỗi cặp đúng một lần, đều là cặp của bản nháp.
      OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id) WHERE e.id IS NOT NULL) <> v_pair_count
      OR (SELECT count(DISTINCT e.id) FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id) WHERE e.id IS NOT NULL) <> v_pair_count
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m, LATERAL (VALUES (m->>'entryAId'), (m->>'entryBId')) e(id)
                 WHERE e.id IS NOT NULL AND (NOT (p_plan->'groups'->0->'entryIds' ? e.id) OR m->>'matchKey' !~ '^W'))
      -- Tuyến: nguồn/đích có thật, chỉ tới lượt sau; thua chỉ từ nhánh thắng xuống nhánh thua;
      -- thắng ở lại nhánh, riêng WF và LF vào GF.
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr
                 LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(p_plan->'matches') WHERE value->>'matchKey' = pr->'source'->>'matchKey') src(m) ON true
                 LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(p_plan->'matches') WHERE value->>'matchKey' = pr->>'targetMatchKey') dst(m) ON true
                 WHERE src.m IS NULL OR dst.m IS NULL
                    OR (src.m->>'round')::integer >= (dst.m->>'round')::integer
                    OR (pr->'source'->>'outcome' = 'loser' AND NOT (src.m->>'matchKey' ~ '^W' AND dst.m->>'matchKey' ~ '^L'))
                    OR (pr->'source'->>'outcome' = 'winner' AND src.m->>'matchKey' IN ('WF', 'LF') AND dst.m->>'matchKey' <> 'GF')
                    OR (pr->'source'->>'outcome' = 'winner' AND src.m->>'matchKey' NOT IN ('WF', 'LF') AND left(src.m->>'matchKey', 1) <> left(dst.m->>'matchKey', 1)))
      -- Mọi trận trừ GF đúng một cạnh thắng ra; mọi trận nhánh thắng đúng một cạnh thua ra; GF không có cạnh ra.
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
                 WHERE (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr
                        WHERE pr->'source'->>'matchKey' = m->>'matchKey' AND pr->'source'->>'outcome' = 'winner')
                       <> CASE WHEN m->>'matchKey' = 'GF' THEN 0 ELSE 1 END
                    OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr
                        WHERE pr->'source'->>'matchKey' = m->>'matchKey' AND pr->'source'->>'outcome' = 'loser')
                       <> CASE WHEN m->>'matchKey' ~ '^W' THEN 1 ELSE 0 END)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->'source'->>'matchKey' = 'GF')))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'stages') s WHERE s->>'scheduleFormat' NOT IN ('round_robin', 'knockout', 'double_elim') OR nullif(s->>'planKey', '') IS NULL)
    OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'groups') gr, jsonb_array_elements_text(gr->'entryIds') e) <> v_pair_count
    OR (SELECT count(DISTINCT e) FROM jsonb_array_elements(p_plan->'groups') gr, jsonb_array_elements_text(gr->'entryIds') e) <> v_pair_count
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'groups') gr, jsonb_array_elements_text(gr->'entryIds') e
               WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_draft->'pairs') x WHERE x->>'pairId' = e))
    OR (SELECT count(DISTINCT m->>'matchKey') FROM jsonb_array_elements(p_plan->'matches') m) <> jsonb_array_length(p_plan->'matches')
    OR jsonb_array_length(p_plan->'matches') <> COALESCE((p_plan->'counts'->>'total')::integer, -1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
               WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'stages') s WHERE s->>'planKey' = m->>'stagePlanKey'))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
               WHERE m->>'stageKind' = 'group' AND (
                 m->>'entryAId' IS NULL OR m->>'entryBId' IS NULL OR m->>'entryAId' = m->>'entryBId'
                 OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'groups') gr
                                WHERE gr->>'label' = m->>'groupLabel' AND gr->'entryIds' ? (m->>'entryAId') AND gr->'entryIds' ? (m->>'entryBId'))))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m
               WHERE p_plan->>'formatKey' = 'group_knockout' AND m->>'stageKind' = 'knockout' AND (m->>'entryAId' IS NOT NULL OR m->>'entryBId' IS NOT NULL
                 OR (SELECT count(*) FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->>'targetMatchKey' = m->>'matchKey') <> 2
                 OR (SELECT count(DISTINCT pr->>'targetSlot') FROM jsonb_array_elements(p_plan->'progressions') pr WHERE pr->>'targetMatchKey' = m->>'matchKey' AND pr->>'targetSlot' IN ('a', 'b')) <> 2))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'progressions') pr
               WHERE pr->'source'->>'kind' NOT IN ('group_rank', 'group_rank_pool', 'match_outcome')
                  OR (pr->'source'->>'kind' = 'match_outcome' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'matches') m WHERE m->>'matchKey' = pr->'source'->>'matchKey' AND m->>'stageKind' = 'knockout'))
                  OR (pr->'source'->>'kind' = 'group_rank' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'groups') gr WHERE gr->>'label' = pr->'source'->>'groupLabel'))) THEN
    RAISE EXCEPTION 'FINALIZE_PLAN_INVALID' USING ERRCODE = '22023';
  END IF;

  -- CLB chủ nhà.
  INSERT INTO public.tournament_clubs(group_id, tournament_id, club_id, invitation_status) VALUES (p_group_id, p_tournament_id, p_group_id, 'approved')
  ON CONFLICT (tournament_id, club_id) WHERE club_id IS NOT NULL DO UPDATE SET version = public.tournament_clubs.version RETURNING id INTO v_host_club_id;
  IF v_host_club_id IS NULL THEN
    SELECT id INTO v_host_club_id FROM public.tournament_clubs WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND club_id = p_group_id;
  END IF;

  -- VĐV của giải: thành viên (theo athlete) và khách (athlete_id rỗng, theo client_ref).
  FOR v_ref IN SELECT 'member:' || m FROM jsonb_array_elements_text(v_draft->'participants'->'memberIds') m LOOP
    v_member_id := substr(v_ref, 8)::bigint;
    SELECT a.id INTO v_athlete_id FROM public.athletes a WHERE a.legacy_club_member_id = v_member_id;
    SELECT full_name INTO v_name FROM public.club_members WHERE id = v_member_id AND group_id = p_group_id;
    v_ta_id := NULL;
    SELECT id INTO v_ta_id FROM public.tournament_athletes
    WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND athlete_id = v_athlete_id AND tournament_club_id = v_host_club_id FOR UPDATE;
    IF v_ta_id IS NULL AND EXISTS (SELECT 1 FROM public.tournament_athletes WHERE group_id = p_group_id AND tournament_id = p_tournament_id AND athlete_id = v_athlete_id) THEN
      RAISE EXCEPTION 'TOURNAMENT_ATHLETE_CLUB_SCOPE_MISMATCH' USING ERRCODE = '23503';
    END IF;
    IF v_ta_id IS NULL THEN
      INSERT INTO public.tournament_athletes(group_id, tournament_id, tournament_club_id, athlete_id, display_name_snapshot, source)
      VALUES (p_group_id, p_tournament_id, v_host_club_id, v_athlete_id, v_name, 'club_member') RETURNING id INTO v_ta_id;
    END IF;
    v_ref_athletes := v_ref_athletes || jsonb_build_object(v_ref, jsonb_build_object('ta', v_ta_id, 'athlete', v_athlete_id));
    v_ref_names := v_ref_names || jsonb_build_object(v_ref, v_name);
  END LOOP;
  FOR v_guest IN SELECT value FROM jsonb_array_elements(COALESCE(v_draft->'participants'->'guests', '[]'::jsonb)) LOOP
    v_client_ref := v_guest->>'clientRef';
    v_name := btrim(v_guest->>'displayName');
    INSERT INTO public.tournament_athletes(group_id, tournament_id, tournament_club_id, athlete_id, display_name_snapshot, source, client_ref)
    VALUES (p_group_id, p_tournament_id, v_host_club_id, NULL, v_name, 'guest', v_client_ref)
    ON CONFLICT (group_id, tournament_id, client_ref) WHERE client_ref IS NOT NULL
    DO UPDATE SET display_name_snapshot = EXCLUDED.display_name_snapshot
    RETURNING id INTO v_ta_id;
    v_ref_athletes := v_ref_athletes || jsonb_build_object('guest:' || v_client_ref, jsonb_build_object('ta', v_ta_id, 'athlete', NULL));
    v_ref_names := v_ref_names || jsonb_build_object('guest:' || v_client_ref, v_name);
  END LOOP;
  INSERT INTO public.tournament_division_roster_members(group_id, division_id, tournament_athlete_id)
  SELECT p_group_id, p_division_id, (value->>'ta')::bigint FROM jsonb_each(v_ref_athletes) ON CONFLICT DO NOTHING;

  -- Cặp → entry.
  FOR v_pair IN SELECT value FROM jsonb_array_elements(v_draft->'pairs') LOOP
    SELECT string_agg(v_ref_names->>r, ' / ' ORDER BY ord) INTO v_name
    FROM jsonb_array_elements_text(v_pair->'participantRefs') WITH ORDINALITY AS x(r, ord);
    INSERT INTO public.tournament_pairs(group_id, division_id, name_snapshot, pairing_mode, status)
    VALUES (p_group_id, p_division_id, v_name, 'manual', 'locked') RETURNING id INTO v_pair_id;
    INSERT INTO public.tournament_entries(group_id, division_id, tournament_club_id, pair_id, name_snapshot, status)
    VALUES (p_group_id, p_division_id, v_host_club_id, v_pair_id, v_name, 'approved') RETURNING id INTO v_entry_id;
    FOR v_part IN SELECT r FROM jsonb_array_elements_text(v_pair->'participantRefs') r LOOP
      INSERT INTO public.tournament_pair_members(group_id, pair_id, tournament_athlete_id)
      VALUES (p_group_id, v_pair_id, (v_ref_athletes->v_part->>'ta')::bigint);
      INSERT INTO public.tournament_entry_members(group_id, entry_id, athlete_id, display_name_snapshot, roster_role)
      VALUES (p_group_id, v_entry_id, NULLIF(v_ref_athletes->v_part->>'athlete', '')::bigint, v_ref_names->>v_part, 'player');
    END LOOP;
    v_pair_entries := v_pair_entries || jsonb_build_object(v_pair->>'pairId', v_entry_id);
  END LOOP;

  -- Stage theo plan; stage đầu mang khóa bốc thăm.
  FOR v_stage IN SELECT value FROM jsonb_array_elements(p_plan->'stages') ORDER BY (value->>'order')::integer LOOP
    INSERT INTO public.tournament_stages(group_id, tournament_id, division_id, stage_order, name, schedule_format, match_format, status, config)
    VALUES (p_group_id, p_tournament_id, p_division_id, (v_stage->>'order')::integer, v_stage->>'name', v_stage->>'scheduleFormat', 'simple', 'pending',
            COALESCE(v_stage->'config', '{}'::jsonb) || jsonb_build_object('draw', jsonb_build_object('status', 'locked', 'fingerprint', v_fingerprint)))
    RETURNING id INTO v_stage_id;
    v_stage_ids := v_stage_ids || jsonb_build_object(v_stage->>'planKey', v_stage_id);
  END LOOP;

  -- Cặp vào bảng (vòng bảng/vòng tròn) hoặc thứ tự bốc thăm của nhánh (loại trực tiếp, không nhãn).
  FOR v_group IN SELECT value FROM jsonb_array_elements(p_plan->'groups') LOOP
    v_index := 0;
    FOR v_part IN SELECT e FROM jsonb_array_elements_text(v_group->'entryIds') e LOOP
      v_index := v_index + 1;
      INSERT INTO public.tournament_stage_entrants(group_id, stage_id, division_id, entry_id, group_label, seed_in_stage)
      VALUES (p_group_id, (v_stage_ids->>COALESCE(v_group->>'stagePlanKey', 'group-stage'))::bigint, p_division_id, (v_pair_entries->>v_part)::bigint, v_group->>'label', v_index);
    END LOOP;
  END LOOP;

  -- Trận: bảng có cặp; loại trực tiếp để trống chờ tiến cấp.
  FOR v_match IN SELECT value FROM jsonb_array_elements(p_plan->'matches') ORDER BY (value->>'order')::integer LOOP
    INSERT INTO public.tournament_matches(group_id, division_id, stage_id, round, bracket_slot, group_label, match_order, match_key, entry_a_id, entry_b_id, status, result_type)
    VALUES (p_group_id, p_division_id, (v_stage_ids->>(v_match->>'stagePlanKey'))::bigint,
            COALESCE((v_match->>'round')::integer, 1),
            COALESCE((v_match->>'bracketSlot')::integer, (v_match->>'order')::integer),
            v_match->>'groupLabel', (v_match->>'order')::integer, v_match->>'matchKey',
            (v_pair_entries->>(v_match->>'entryAId'))::bigint, (v_pair_entries->>(v_match->>'entryBId'))::bigint, 'pending', 'simple')
    RETURNING id INTO v_match_id;
    v_match_ids := v_match_ids || jsonb_build_object(v_match->>'matchKey', v_match_id);
  END LOOP;

  -- Tuyến đi tiếp tường minh (không suy ra bằng stage_order + 1).
  FOR v_prog IN SELECT value FROM jsonb_array_elements(p_plan->'progressions') LOOP
    v_source := v_prog->'source';
    SELECT value INTO v_target_match FROM jsonb_array_elements(p_plan->'matches') WHERE value->>'matchKey' = v_prog->>'targetMatchKey';
    INSERT INTO public.tournament_stage_transitions(
      group_id, tournament_id, division_id, source_stage_id, source_kind,
      source_group_label, source_rank, source_pool_position, source_match_id, source_outcome,
      target_stage_id, target_match_id, target_slot)
    VALUES (
      p_group_id, p_tournament_id, p_division_id, (v_stage_ids->>(v_prog->>'sourceStagePlanKey'))::bigint, v_source->>'kind',
      CASE WHEN v_source->>'kind' = 'group_rank' THEN v_source->>'groupLabel' END,
      CASE WHEN v_source->>'kind' IN ('group_rank', 'group_rank_pool') THEN (v_source->>'rank')::integer END,
      CASE WHEN v_source->>'kind' = 'group_rank_pool' THEN (v_source->>'poolPosition')::integer END,
      CASE WHEN v_source->>'kind' = 'match_outcome' THEN (v_match_ids->>(v_source->>'matchKey'))::bigint END,
      CASE WHEN v_source->>'kind' = 'match_outcome' THEN v_source->>'outcome' END,
      (v_stage_ids->>(v_target_match->>'stagePlanKey'))::bigint, (v_match_ids->>(v_prog->>'targetMatchKey'))::bigint, v_prog->>'targetSlot');
  END LOOP;

  UPDATE public.tournament_divisions
  SET roster_lock_status = 'locked', roster_locked_at = now(), setup_revision = setup_revision + 1, setup_updated_at = now(),
      setup_draft = jsonb_set(jsonb_set(jsonb_set(setup_draft, '{state}', '"finalized"'::jsonb, true), '{draw,status}', '"locked"'::jsonb, true), '{finalizedAt}', to_jsonb(now()), true)
  WHERE id = d.id AND group_id = p_group_id RETURNING setup_revision INTO d.setup_revision;

  v_result := jsonb_build_object(
    'success', true, 'setup_revision', d.setup_revision, 'stages', v_stage_ids,
    'match_count', jsonb_array_length(p_plan->'matches'), 'entry_count', v_pair_count,
    'draw_fingerprint', v_fingerprint
  );
  INSERT INTO public.tournament_setup_mutations(group_id, operation, division_id, idempotency_key, payload_fingerprint, response)
  VALUES (p_group_id, 'finalize_internal_setup_v4', p_division_id, p_idempotency_key, v_request_fingerprint, v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) TO service_role;
COMMENT ON FUNCTION public.finalize_internal_setup_v4(bigint,bigint,bigint,bigint,text,text,jsonb) IS 'Chốt giải v3: kiểm plan khớp bản nháp đã lưu, ghi VĐV (kể cả khách), cặp, entry, stage, trận, tuyến đi tiếp nguyên tử.';

CREATE TEMP TABLE it_result(k text, v text) ON COMMIT DROP;
DO $it$
DECLARE
  g bigint := 59; salt text := substr(md5(random()::text), 1, 8);
  mid bigint; ea bigint; eb bigint; ver integer; champ bigint; members bigint[] := ARRAY[]::bigint[];
  r jsonb; r2 jsonb; t_id bigint; d_id bigint; rev bigint; draft jsonb; pairs jsonb; plan jsonb; games jsonb;
  kstage bigint; anomalies integer; mrow record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = g) THEN RAISE EXCEPTION 'CLB test % không tồn tại', g; END IF;
  FOR i IN 1..24 LOOP
    INSERT INTO public.club_members(group_id, full_name, is_active) VALUES (g, 'IT DE VĐV ' || i || ' ' || salt, true) RETURNING id INTO mid;
    INSERT INTO public.athletes(display_name, normalized_name, legacy_club_member_id) VALUES ('IT DE VĐV ' || i, 'it de vdv ' || i, mid) ON CONFLICT (legacy_club_member_id) DO NOTHING;
    members := members || mid;
  END LOOP;

  -- ===== Kịch bản D7 =====
  pairs := '[]'::jsonb;
  FOR i IN 0..6 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05","it_pair_06","it_pair_07"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN true AND i = 6 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"double_elimination","seed":"it-seed-d7","fingerprint":"ac85ce6ed469c96f4fd88ca0cae49b15d4ae0087a251d026cfd76a79cedd3850","stages":[{"planKey":"double-elim","name":"Loại kép","scheduleFormat":"double_elim","order":1,"config":{"setupPlanVersion":4,"grandFinalReset":false,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null},"match_scoring":{"GF":{"best_of":3}}}}],"groups":[{"label":null,"stagePlanKey":"double-elim","entryIds":["it_pair_06","it_pair_01","it_pair_05","it_pair_07","it_pair_04","it_pair_03","it_pair_02"]}],"progressions":[{"sourceStagePlanKey":"double-elim","targetMatchKey":"W2-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W1-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"W2-2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-3","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"W2-2","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W1-4","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-3","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-2","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W1-4","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"WF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W2-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"WF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L2-1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-2","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L2-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-2","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L2-2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L1-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L2-2","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-1","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L3-1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L2-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L3-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"L2-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"LF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L3-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"LF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"WF","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"GF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"WF","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"GF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"LF","outcome":"winner"}}],"matches":[{"matchKey":"W1-2","stagePlanKey":"double-elim","stageKind":"knockout","round":1,"bracketSlot":1,"order":1,"entryAId":"it_pair_04","entryBId":"it_pair_07"},{"matchKey":"W1-3","stagePlanKey":"double-elim","stageKind":"knockout","round":1,"bracketSlot":2,"order":2,"entryAId":"it_pair_05","entryBId":"it_pair_03"},{"matchKey":"W1-4","stagePlanKey":"double-elim","stageKind":"knockout","round":1,"bracketSlot":3,"order":3,"entryAId":"it_pair_02","entryBId":"it_pair_01"},{"matchKey":"W2-1","stagePlanKey":"double-elim","stageKind":"knockout","round":2,"bracketSlot":0,"order":4,"entryAId":"it_pair_06","entryBId":null},{"matchKey":"W2-2","stagePlanKey":"double-elim","stageKind":"knockout","round":2,"bracketSlot":1,"order":5,"entryAId":null,"entryBId":null},{"matchKey":"L1-2","stagePlanKey":"double-elim","stageKind":"knockout","round":2,"bracketSlot":1,"order":6,"entryAId":null,"entryBId":null},{"matchKey":"WF","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":0,"order":7,"entryAId":null,"entryBId":null},{"matchKey":"L2-1","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":0,"order":8,"entryAId":null,"entryBId":null},{"matchKey":"L2-2","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":1,"order":9,"entryAId":null,"entryBId":null},{"matchKey":"L3-1","stagePlanKey":"double-elim","stageKind":"knockout","round":4,"bracketSlot":0,"order":10,"entryAId":null,"entryBId":null},{"matchKey":"LF","stagePlanKey":"double-elim","stageKind":"knockout","round":5,"bracketSlot":0,"order":11,"entryAId":null,"entryBId":null},{"matchKey":"GF","stagePlanKey":"double-elim","stageKind":"knockout","round":6,"bracketSlot":0,"order":12,"entryAId":null,"entryBId":null}],"counts":{"total":12}}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT DE D7', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT DE D7', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 13) k),
      'guests', jsonb_build_array(jsonb_build_object('clientRef', 'g_it_guest_0001', 'displayName', 'Khách IT'))),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'double_elimination', 'config', '{"finalBestOf":3}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-de-key-D7-' || salt, draft, 1, 'it-de-save-D7-' || salt);
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D7-drop_match-' || salt, plan->>'fingerprint', jsonb_set(plan, '{matches}', (plan->'matches') - 0, false) || jsonb_build_object('counts', (plan->'counts') || '{"total":11}'::jsonb));
    INSERT INTO it_result VALUES ('D7.tampered.drop_match', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('D7.tampered.drop_match', SQLERRM);
  END;

  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D7-slot_two_sources-' || salt, plan->>'fingerprint', jsonb_set(plan, '{progressions,0,targetSlot}', to_jsonb(CASE WHEN plan->'progressions'->0->>'targetSlot' = 'a' THEN 'b' ELSE 'a' END)));
    INSERT INTO it_result VALUES ('D7.tampered.slot_two_sources', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('D7.tampered.slot_two_sources', SQLERRM);
  END;

  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D7-loser_edge_as_winner-' || salt, plan->>'fingerprint', jsonb_set(plan, '{progressions}', (SELECT jsonb_agg(CASE WHEN p->>'targetMatchKey' = 'LF' AND p->'source'->>'matchKey' = 'WF' THEN jsonb_set(p, '{source,outcome}', '"winner"') ELSE p END) FROM jsonb_array_elements(plan->'progressions') p)));
    INSERT INTO it_result VALUES ('D7.tampered.loser_edge_as_winner', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('D7.tampered.loser_edge_as_winner', SQLERRM);
  END;

  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D7-winner_edge_as_loser_from_L-' || salt, plan->>'fingerprint', jsonb_set(plan, '{progressions}', (SELECT jsonb_agg(CASE WHEN p->>'targetMatchKey' = 'GF' AND p->'source'->>'matchKey' = 'LF' THEN jsonb_set(p, '{source,outcome}', '"loser"') ELSE p END) FROM jsonb_array_elements(plan->'progressions') p)));
    INSERT INTO it_result VALUES ('D7.tampered.winner_edge_as_loser_from_L', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('D7.tampered.winner_edge_as_loser_from_L', SQLERRM);
  END;

  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D7-grand_final_reset-' || salt, plan->>'fingerprint', jsonb_set(plan, '{stages,0,config,grandFinalReset}', 'true'));
    INSERT INTO it_result VALUES ('D7.tampered.grand_final_reset', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('D7.tampered.grand_final_reset', SQLERRM);
  END;

  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D7-two_stages-' || salt, plan->>'fingerprint', jsonb_set(plan, '{stages}', (plan->'stages') || (plan->'stages')));
    INSERT INTO it_result VALUES ('D7.tampered.two_stages', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('D7.tampered.two_stages', SQLERRM);
  END;

  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D7-renamed_lf-' || salt, plan->>'fingerprint', jsonb_set(plan, '{matches}', (SELECT jsonb_agg(CASE WHEN m->>'matchKey' = 'LF' THEN m || '{"matchKey":"W9-9"}'::jsonb ELSE m END) FROM jsonb_array_elements(plan->'matches') m)));
    INSERT INTO it_result VALUES ('D7.tampered.renamed_lf', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('D7.tampered.renamed_lf', SQLERRM);
  END;

  INSERT INTO it_result VALUES ('D7.tampered.stages_after', (SELECT count(*) FROM public.tournament_stages WHERE division_id = d_id)::text);
  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D7-' || salt, plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('D7.finalize.match_count', r->>'match_count');
  SELECT id INTO kstage FROM public.tournament_stages WHERE division_id = d_id;
  INSERT INTO it_result VALUES ('D7.db.stage', (SELECT schedule_format || ':GF=' || COALESCE(config->'match_scoring'->'GF'->>'best_of', '-') || ':bo=' || (config->'scoring'->>'best_of') || ':reset=' || (config->>'grandFinalReset') FROM public.tournament_stages WHERE id = kstage));
  INSERT INTO it_result VALUES ('D7.db.entrants', (SELECT count(*) || ' label_null=' || count(*) FILTER (WHERE group_label IS NULL) FROM public.tournament_stage_entrants WHERE stage_id = kstage));
  INSERT INTO it_result VALUES ('D7.db.keys', (SELECT string_agg(match_key || '@r' || round || ':' || (CASE WHEN entry_a_id IS NULL THEN '_' ELSE 'A' END) || (CASE WHEN entry_b_id IS NULL THEN '_' ELSE 'B' END), ',' ORDER BY match_order) FROM public.tournament_matches WHERE division_id = d_id));
  INSERT INTO it_result VALUES ('D7.db.transitions', (SELECT string_agg(source_outcome || '=' || c, ',' ORDER BY source_outcome) FROM (SELECT source_outcome, count(*) c FROM public.tournament_stage_transitions WHERE division_id = d_id AND source_kind = 'match_outcome' GROUP BY 1) x));
  INSERT INTO it_result VALUES ('D7.db.guest_athlete', (SELECT concat_ws('|', source, COALESCE(athlete_id::text, 'NULL')) FROM public.tournament_athletes WHERE tournament_id = t_id AND source = 'guest'));
  r2 := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D7-' || salt, plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('D7.replay.same_response', (r2 = r)::text);
  INSERT INTO it_result VALUES ('D7.replay.matches_after', (SELECT count(*) FROM public.tournament_matches WHERE division_id = d_id)::text);

  anomalies := 0;
  FOR mrow IN SELECT id, match_key FROM public.tournament_matches WHERE division_id = d_id ORDER BY match_order LOOP
    SELECT entry_a_id, entry_b_id, version INTO ea, eb, ver FROM public.tournament_matches WHERE id = mrow.id;
    IF ea IS NULL OR eb IS NULL THEN
      anomalies := anomalies + 1;
      INSERT INTO it_result VALUES ('D7.play.missing_side.' || mrow.match_key, concat_ws('/', ea, eb));
      CONTINUE;
    END IF;
    games := CASE WHEN mrow.match_key = 'GF'
      THEN (SELECT jsonb_agg(jsonb_build_object('game_no', k, 'kind', 'game', 'score_a', 5, 'score_b', 11, 'lineup', '{}'::jsonb)) FROM generate_series(1, 2) k)
      ELSE '[{"game_no":1,"kind":"game","score_a":11,"score_b":5,"lineup":{}}]'::jsonb END;
    r := public.replace_tournament_games_with_transitions(g, mrow.id, games, CASE WHEN mrow.match_key = 'GF' THEN eb ELSE ea END,
      'finalized', NULL, ver, 'it-de-game-' || mrow.id);
    IF (r->'transitions'->>'routed')::integer <> (SELECT count(*) FROM public.tournament_stage_transitions WHERE source_match_id = mrow.id) THEN
      anomalies := anomalies + 1;
      INSERT INTO it_result VALUES ('D7.play.routed.' || mrow.match_key, r->'transitions'->>'routed');
    END IF;
  END LOOP;
  INSERT INTO it_result VALUES ('D7.play.anomalies', anomalies::text);
  INSERT INTO it_result VALUES ('D7.done.finalized', (SELECT count(*) FILTER (WHERE status = 'finalized') || '/' || count(*) FROM public.tournament_matches WHERE division_id = d_id));
  -- Luật "thua hai trận mới bị loại": đếm số trận thua của mỗi cặp.
  INSERT INTO it_result VALUES ('D7.done.losses', (SELECT string_agg(losses || 'x' || c, ',' ORDER BY losses) FROM (
    SELECT losses, count(*) c FROM (
      SELECT e.id, (SELECT count(*) FROM public.tournament_matches m WHERE m.division_id = d_id AND m.status = 'finalized'
                    AND e.id IN (m.entry_a_id, m.entry_b_id) AND m.winner_entry_id <> e.id) losses
      FROM public.tournament_entries e WHERE e.division_id = d_id) x GROUP BY losses) y));
  INSERT INTO it_result VALUES ('D7.done.gf_sources', (SELECT (gf.entry_a_id = wf.winner_entry_id AND gf.entry_b_id = lf.winner_entry_id)::text
    FROM public.tournament_matches gf, public.tournament_matches wf, public.tournament_matches lf
    WHERE gf.division_id = d_id AND gf.match_key = 'GF' AND wf.division_id = d_id AND wf.match_key = 'WF' AND lf.division_id = d_id AND lf.match_key = 'LF'));
  INSERT INTO it_result VALUES ('D7.done.lf_has_wf_loser', (SELECT (CASE WHEN wf.winner_entry_id = wf.entry_a_id THEN wf.entry_b_id ELSE wf.entry_a_id END IN (lf.entry_a_id, lf.entry_b_id))::text
    FROM public.tournament_matches wf, public.tournament_matches lf
    WHERE wf.division_id = d_id AND wf.match_key = 'WF' AND lf.division_id = d_id AND lf.match_key = 'LF'));
  SELECT id INTO kstage FROM public.tournament_stages WHERE division_id = d_id;
  SELECT winner_entry_id INTO champ FROM public.tournament_matches WHERE division_id = d_id AND match_key = 'GF';
  r := public.advance_division_entry_stage(g, kstage, NULL, jsonb_build_array(jsonb_build_object('entry_id', champ)), 'it-de-adv-' || d_id);
  INSERT INTO it_result VALUES ('D7.done.advance', concat_ws('|', r->>'final', (SELECT status FROM public.tournament_stages WHERE id = kstage)));

  -- ===== Kịch bản D5 =====
  pairs := '[]'::jsonb;
  FOR i IN 0..4 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN false AND i = 4 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"double_elimination","seed":"it-seed-d5","fingerprint":"1fee0a49e0bf9e9f5ae015c037cfae087a3e06a0f71f4c4039d716eaa89b53b6","stages":[{"planKey":"double-elim","name":"Loại kép","scheduleFormat":"double_elim","order":1,"config":{"setupPlanVersion":4,"grandFinalReset":false,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":null,"stagePlanKey":"double-elim","entryIds":["it_pair_02","it_pair_01","it_pair_04","it_pair_03","it_pair_05"]}],"progressions":[{"sourceStagePlanKey":"double-elim","targetMatchKey":"W2-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W1-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-2","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-2","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"WF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W2-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"WF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L2-1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L1-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L2-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-1","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"LF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L2-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"LF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"WF","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"GF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"WF","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"GF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"LF","outcome":"winner"}}],"matches":[{"matchKey":"W1-2","stagePlanKey":"double-elim","stageKind":"knockout","round":1,"bracketSlot":1,"order":1,"entryAId":"it_pair_05","entryBId":"it_pair_03"},{"matchKey":"W2-2","stagePlanKey":"double-elim","stageKind":"knockout","round":1,"bracketSlot":1,"order":2,"entryAId":"it_pair_04","entryBId":"it_pair_01"},{"matchKey":"W2-1","stagePlanKey":"double-elim","stageKind":"knockout","round":2,"bracketSlot":0,"order":3,"entryAId":"it_pair_02","entryBId":null},{"matchKey":"L1-1","stagePlanKey":"double-elim","stageKind":"knockout","round":2,"bracketSlot":0,"order":4,"entryAId":null,"entryBId":null},{"matchKey":"WF","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":0,"order":5,"entryAId":null,"entryBId":null},{"matchKey":"L2-1","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":0,"order":6,"entryAId":null,"entryBId":null},{"matchKey":"LF","stagePlanKey":"double-elim","stageKind":"knockout","round":4,"bracketSlot":0,"order":7,"entryAId":null,"entryBId":null},{"matchKey":"GF","stagePlanKey":"double-elim","stageKind":"knockout","round":5,"bracketSlot":0,"order":8,"entryAId":null,"entryBId":null}],"counts":{"total":8}}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT DE D5', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT DE D5', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 10) k),
      'guests', '[]'::jsonb),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'double_elimination', 'config', '{"finalBestOf":1}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-de-key-D5-' || salt, draft, 1, 'it-de-save-D5-' || salt);
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D5-' || salt, plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('D5.finalize.match_count', r->>'match_count');
  INSERT INTO it_result VALUES ('D5.db.keys', (SELECT string_agg(match_key || '@r' || round, ',' ORDER BY match_order) FROM public.tournament_matches WHERE division_id = d_id));

  anomalies := 0;
  FOR mrow IN SELECT id, match_key FROM public.tournament_matches WHERE division_id = d_id ORDER BY match_order LOOP
    SELECT entry_a_id, entry_b_id, version INTO ea, eb, ver FROM public.tournament_matches WHERE id = mrow.id;
    IF ea IS NULL OR eb IS NULL THEN
      anomalies := anomalies + 1;
      INSERT INTO it_result VALUES ('D5.play.missing_side.' || mrow.match_key, concat_ws('/', ea, eb));
      CONTINUE;
    END IF;
    games := CASE WHEN mrow.match_key = 'GF'
      THEN (SELECT jsonb_agg(jsonb_build_object('game_no', k, 'kind', 'game', 'score_a', 5, 'score_b', 11, 'lineup', '{}'::jsonb)) FROM generate_series(1, 1) k)
      ELSE '[{"game_no":1,"kind":"game","score_a":11,"score_b":5,"lineup":{}}]'::jsonb END;
    r := public.replace_tournament_games_with_transitions(g, mrow.id, games, CASE WHEN mrow.match_key = 'GF' THEN eb ELSE ea END,
      'finalized', NULL, ver, 'it-de-game-' || mrow.id);
    IF (r->'transitions'->>'routed')::integer <> (SELECT count(*) FROM public.tournament_stage_transitions WHERE source_match_id = mrow.id) THEN
      anomalies := anomalies + 1;
      INSERT INTO it_result VALUES ('D5.play.routed.' || mrow.match_key, r->'transitions'->>'routed');
    END IF;
  END LOOP;
  INSERT INTO it_result VALUES ('D5.play.anomalies', anomalies::text);
  INSERT INTO it_result VALUES ('D5.done.finalized', (SELECT count(*) FILTER (WHERE status = 'finalized') || '/' || count(*) FROM public.tournament_matches WHERE division_id = d_id));
  -- Luật "thua hai trận mới bị loại": đếm số trận thua của mỗi cặp.
  INSERT INTO it_result VALUES ('D5.done.losses', (SELECT string_agg(losses || 'x' || c, ',' ORDER BY losses) FROM (
    SELECT losses, count(*) c FROM (
      SELECT e.id, (SELECT count(*) FROM public.tournament_matches m WHERE m.division_id = d_id AND m.status = 'finalized'
                    AND e.id IN (m.entry_a_id, m.entry_b_id) AND m.winner_entry_id <> e.id) losses
      FROM public.tournament_entries e WHERE e.division_id = d_id) x GROUP BY losses) y));
  INSERT INTO it_result VALUES ('D5.done.gf_sources', (SELECT (gf.entry_a_id = wf.winner_entry_id AND gf.entry_b_id = lf.winner_entry_id)::text
    FROM public.tournament_matches gf, public.tournament_matches wf, public.tournament_matches lf
    WHERE gf.division_id = d_id AND gf.match_key = 'GF' AND wf.division_id = d_id AND wf.match_key = 'WF' AND lf.division_id = d_id AND lf.match_key = 'LF'));
  INSERT INTO it_result VALUES ('D5.done.lf_has_wf_loser', (SELECT (CASE WHEN wf.winner_entry_id = wf.entry_a_id THEN wf.entry_b_id ELSE wf.entry_a_id END IN (lf.entry_a_id, lf.entry_b_id))::text
    FROM public.tournament_matches wf, public.tournament_matches lf
    WHERE wf.division_id = d_id AND wf.match_key = 'WF' AND lf.division_id = d_id AND lf.match_key = 'LF'));
  SELECT id INTO kstage FROM public.tournament_stages WHERE division_id = d_id;
  SELECT winner_entry_id INTO champ FROM public.tournament_matches WHERE division_id = d_id AND match_key = 'GF';
  r := public.advance_division_entry_stage(g, kstage, NULL, jsonb_build_array(jsonb_build_object('entry_id', champ)), 'it-de-adv-' || d_id);
  INSERT INTO it_result VALUES ('D5.done.advance', concat_ws('|', r->>'final', (SELECT status FROM public.tournament_stages WHERE id = kstage)));

  -- ===== Kịch bản D12 =====
  pairs := '[]'::jsonb;
  FOR i IN 0..11 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05","it_pair_06","it_pair_07","it_pair_08","it_pair_09","it_pair_10","it_pair_11","it_pair_12"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN false AND i = 11 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"double_elimination","seed":"it-seed-d12","fingerprint":"e16e1ebfd1d91545684834ae586c56d745d8e3beb76063102c8f15d81860351a","stages":[{"planKey":"double-elim","name":"Loại kép","scheduleFormat":"double_elim","order":1,"config":{"setupPlanVersion":4,"grandFinalReset":false,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":null,"stagePlanKey":"double-elim","entryIds":["it_pair_01","it_pair_02","it_pair_04","it_pair_06","it_pair_07","it_pair_08","it_pair_03","it_pair_09","it_pair_11","it_pair_12","it_pair_05","it_pair_10"]}],"progressions":[{"sourceStagePlanKey":"double-elim","targetMatchKey":"W2-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W1-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"W2-2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-3","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"W2-3","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W1-6","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"W2-4","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-7","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"W3-1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W2-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"W3-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"W3-2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W2-3","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"W3-2","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-4","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-2","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-2","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-3","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-2","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-1","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-3","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-6","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-3","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-4","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-4","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W1-7","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L1-4","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W2-3","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"WF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"W3-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"WF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W3-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L2-1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L1-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L2-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"L1-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L2-2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L1-3","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L2-2","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"L1-4","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L3-1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L2-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L3-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W3-2","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L3-2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L2-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L3-2","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"W3-1","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L4-1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L3-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"L4-1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"L3-2","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"LF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"L4-1","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"LF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"WF","outcome":"loser"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"GF","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"WF","outcome":"winner"}},{"sourceStagePlanKey":"double-elim","targetMatchKey":"GF","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"LF","outcome":"winner"}}],"matches":[{"matchKey":"W1-2","stagePlanKey":"double-elim","stageKind":"knockout","round":1,"bracketSlot":1,"order":1,"entryAId":"it_pair_11","entryBId":"it_pair_09"},{"matchKey":"W1-3","stagePlanKey":"double-elim","stageKind":"knockout","round":1,"bracketSlot":2,"order":2,"entryAId":"it_pair_07","entryBId":"it_pair_10"},{"matchKey":"W1-6","stagePlanKey":"double-elim","stageKind":"knockout","round":1,"bracketSlot":5,"order":3,"entryAId":"it_pair_05","entryBId":"it_pair_08"},{"matchKey":"W1-7","stagePlanKey":"double-elim","stageKind":"knockout","round":1,"bracketSlot":6,"order":4,"entryAId":"it_pair_03","entryBId":"it_pair_12"},{"matchKey":"W2-1","stagePlanKey":"double-elim","stageKind":"knockout","round":2,"bracketSlot":0,"order":5,"entryAId":"it_pair_01","entryBId":null},{"matchKey":"W2-2","stagePlanKey":"double-elim","stageKind":"knockout","round":2,"bracketSlot":1,"order":6,"entryAId":null,"entryBId":"it_pair_06"},{"matchKey":"W2-3","stagePlanKey":"double-elim","stageKind":"knockout","round":2,"bracketSlot":2,"order":7,"entryAId":"it_pair_04","entryBId":null},{"matchKey":"W2-4","stagePlanKey":"double-elim","stageKind":"knockout","round":2,"bracketSlot":3,"order":8,"entryAId":null,"entryBId":"it_pair_02"},{"matchKey":"W3-1","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":0,"order":9,"entryAId":null,"entryBId":null},{"matchKey":"W3-2","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":1,"order":10,"entryAId":null,"entryBId":null},{"matchKey":"L1-1","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":0,"order":11,"entryAId":null,"entryBId":null},{"matchKey":"L1-2","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":1,"order":12,"entryAId":null,"entryBId":null},{"matchKey":"L1-3","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":2,"order":13,"entryAId":null,"entryBId":null},{"matchKey":"L1-4","stagePlanKey":"double-elim","stageKind":"knockout","round":3,"bracketSlot":3,"order":14,"entryAId":null,"entryBId":null},{"matchKey":"WF","stagePlanKey":"double-elim","stageKind":"knockout","round":4,"bracketSlot":0,"order":15,"entryAId":null,"entryBId":null},{"matchKey":"L2-1","stagePlanKey":"double-elim","stageKind":"knockout","round":4,"bracketSlot":0,"order":16,"entryAId":null,"entryBId":null},{"matchKey":"L2-2","stagePlanKey":"double-elim","stageKind":"knockout","round":4,"bracketSlot":1,"order":17,"entryAId":null,"entryBId":null},{"matchKey":"L3-1","stagePlanKey":"double-elim","stageKind":"knockout","round":5,"bracketSlot":0,"order":18,"entryAId":null,"entryBId":null},{"matchKey":"L3-2","stagePlanKey":"double-elim","stageKind":"knockout","round":5,"bracketSlot":1,"order":19,"entryAId":null,"entryBId":null},{"matchKey":"L4-1","stagePlanKey":"double-elim","stageKind":"knockout","round":6,"bracketSlot":0,"order":20,"entryAId":null,"entryBId":null},{"matchKey":"LF","stagePlanKey":"double-elim","stageKind":"knockout","round":7,"bracketSlot":0,"order":21,"entryAId":null,"entryBId":null},{"matchKey":"GF","stagePlanKey":"double-elim","stageKind":"knockout","round":8,"bracketSlot":0,"order":22,"entryAId":null,"entryBId":null}],"counts":{"total":22}}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT DE D12', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT DE D12', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 24) k),
      'guests', '[]'::jsonb),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'double_elimination', 'config', '{"finalBestOf":1}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-de-key-D12-' || salt, draft, 1, 'it-de-save-D12-' || salt);
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-D12-' || salt, plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('D12.finalize.match_count', r->>'match_count');
  INSERT INTO it_result VALUES ('D12.db.keys', (SELECT string_agg(match_key || '@r' || round, ',' ORDER BY match_order) FROM public.tournament_matches WHERE division_id = d_id));

  anomalies := 0;
  FOR mrow IN SELECT id, match_key FROM public.tournament_matches WHERE division_id = d_id ORDER BY match_order LOOP
    SELECT entry_a_id, entry_b_id, version INTO ea, eb, ver FROM public.tournament_matches WHERE id = mrow.id;
    IF ea IS NULL OR eb IS NULL THEN
      anomalies := anomalies + 1;
      INSERT INTO it_result VALUES ('D12.play.missing_side.' || mrow.match_key, concat_ws('/', ea, eb));
      CONTINUE;
    END IF;
    games := CASE WHEN mrow.match_key = 'GF'
      THEN (SELECT jsonb_agg(jsonb_build_object('game_no', k, 'kind', 'game', 'score_a', 5, 'score_b', 11, 'lineup', '{}'::jsonb)) FROM generate_series(1, 1) k)
      ELSE '[{"game_no":1,"kind":"game","score_a":11,"score_b":5,"lineup":{}}]'::jsonb END;
    r := public.replace_tournament_games_with_transitions(g, mrow.id, games, CASE WHEN mrow.match_key = 'GF' THEN eb ELSE ea END,
      'finalized', NULL, ver, 'it-de-game-' || mrow.id);
    IF (r->'transitions'->>'routed')::integer <> (SELECT count(*) FROM public.tournament_stage_transitions WHERE source_match_id = mrow.id) THEN
      anomalies := anomalies + 1;
      INSERT INTO it_result VALUES ('D12.play.routed.' || mrow.match_key, r->'transitions'->>'routed');
    END IF;
  END LOOP;
  INSERT INTO it_result VALUES ('D12.play.anomalies', anomalies::text);
  INSERT INTO it_result VALUES ('D12.done.finalized', (SELECT count(*) FILTER (WHERE status = 'finalized') || '/' || count(*) FROM public.tournament_matches WHERE division_id = d_id));
  -- Luật "thua hai trận mới bị loại": đếm số trận thua của mỗi cặp.
  INSERT INTO it_result VALUES ('D12.done.losses', (SELECT string_agg(losses || 'x' || c, ',' ORDER BY losses) FROM (
    SELECT losses, count(*) c FROM (
      SELECT e.id, (SELECT count(*) FROM public.tournament_matches m WHERE m.division_id = d_id AND m.status = 'finalized'
                    AND e.id IN (m.entry_a_id, m.entry_b_id) AND m.winner_entry_id <> e.id) losses
      FROM public.tournament_entries e WHERE e.division_id = d_id) x GROUP BY losses) y));
  INSERT INTO it_result VALUES ('D12.done.gf_sources', (SELECT (gf.entry_a_id = wf.winner_entry_id AND gf.entry_b_id = lf.winner_entry_id)::text
    FROM public.tournament_matches gf, public.tournament_matches wf, public.tournament_matches lf
    WHERE gf.division_id = d_id AND gf.match_key = 'GF' AND wf.division_id = d_id AND wf.match_key = 'WF' AND lf.division_id = d_id AND lf.match_key = 'LF'));
  INSERT INTO it_result VALUES ('D12.done.lf_has_wf_loser', (SELECT (CASE WHEN wf.winner_entry_id = wf.entry_a_id THEN wf.entry_b_id ELSE wf.entry_a_id END IN (lf.entry_a_id, lf.entry_b_id))::text
    FROM public.tournament_matches wf, public.tournament_matches lf
    WHERE wf.division_id = d_id AND wf.match_key = 'WF' AND lf.division_id = d_id AND lf.match_key = 'LF'));
  SELECT id INTO kstage FROM public.tournament_stages WHERE division_id = d_id;
  SELECT winner_entry_id INTO champ FROM public.tournament_matches WHERE division_id = d_id AND match_key = 'GF';
  r := public.advance_division_entry_stage(g, kstage, NULL, jsonb_build_array(jsonb_build_object('entry_id', champ)), 'it-de-adv-' || d_id);
  INSERT INTO it_result VALUES ('D12.done.advance', concat_ws('|', r->>'final', (SELECT status FROM public.tournament_stages WHERE id = kstage)));

  -- ===== Kịch bản KO =====
  pairs := '[]'::jsonb;
  FOR i IN 0..5 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05","it_pair_06"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN false AND i = 5 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"knockout","seed":"it-seed-ko","fingerprint":"14945b961d4e275073e2b9d6dc8dbd7e7f15cec7e709bc7b346c8079ecb92eaa","stages":[{"planKey":"knockout","name":"Loại trực tiếp","scheduleFormat":"knockout","order":1,"config":{"thirdPlaceEnabled":true,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null},"match_scoring":{"F":{"best_of":3}}}}],"groups":[{"label":null,"stagePlanKey":"knockout","entryIds":["it_pair_05","it_pair_04","it_pair_06","it_pair_02","it_pair_03","it_pair_01"]}],"progressions":[{"sourceStagePlanKey":"knockout","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"QF2","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"QF3","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"BRONZE","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"loser"}},{"sourceStagePlanKey":"knockout","targetMatchKey":"BRONZE","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"loser"}}],"matches":[{"matchKey":"QF2","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":1,"order":1,"entryAId":"it_pair_03","entryBId":"it_pair_02"},{"matchKey":"QF3","stagePlanKey":"knockout","stageKind":"knockout","round":1,"bracketSlot":2,"order":2,"entryAId":"it_pair_06","entryBId":"it_pair_01"},{"matchKey":"SF1","stagePlanKey":"knockout","stageKind":"knockout","round":2,"bracketSlot":0,"order":3,"entryAId":"it_pair_05","entryBId":null},{"matchKey":"SF2","stagePlanKey":"knockout","stageKind":"knockout","round":2,"bracketSlot":1,"order":4,"entryAId":null,"entryBId":"it_pair_04"},{"matchKey":"BRONZE","stagePlanKey":"knockout","stageKind":"knockout","round":3,"bracketSlot":1,"order":5,"entryAId":null,"entryBId":null},{"matchKey":"F","stagePlanKey":"knockout","stageKind":"knockout","round":3,"bracketSlot":0,"order":6,"entryAId":null,"entryBId":null}],"counts":{"total":6}}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT DE KO', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT DE KO', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 12) k),
      'guests', '[]'::jsonb),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'knockout', 'config', '{"thirdPlaceEnabled":true,"finalBestOf":3}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-de-key-KO-' || salt, draft, 1, 'it-de-save-KO-' || salt);
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-KO-' || salt, plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('KO.finalize', (r->>'match_count') || ' trận');
  INSERT INTO it_result VALUES ('KO.db', (SELECT string_agg(s.schedule_format || ':entrants=' || (SELECT count(*) FROM public.tournament_stage_entrants se WHERE se.stage_id = s.id), ',' ORDER BY s.stage_order) FROM public.tournament_stages s WHERE s.division_id = d_id));

  -- ===== Kịch bản GK =====
  pairs := '[]'::jsonb;
  FOR i IN 0..6 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05","it_pair_06","it_pair_07"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN false AND i = 6 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"group_knockout","seed":"it-seed-gk","fingerprint":"139d28849c4729f083ea70424ba52ab87eeabeae6577e7ca7bab2386a61ae95d","stages":[{"planKey":"group-stage","name":"Vòng bảng","scheduleFormat":"round_robin","order":1,"config":{"groupCount":2,"advancePerGroup":2,"poolCount":0,"qualifiersTarget":4,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}},{"planKey":"knockout-stage","name":"Vòng loại trực tiếp","scheduleFormat":"knockout","order":2,"config":{"thirdPlaceEnabled":true,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null},"match_scoring":{"F":{"best_of":3}}}}],"groups":[{"label":"A","entryIds":["it_pair_07","it_pair_02","it_pair_06","it_pair_03"]},{"label":"B","entryIds":["it_pair_01","it_pair_04","it_pair_05"]}],"progressions":[{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"A","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"B","rank":2}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"B","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"A","rank":2}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"BRONZE","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"loser"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"BRONZE","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"loser"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","round":1,"groupLabel":"A","order":1,"entryAId":"it_pair_07","entryBId":"it_pair_03"},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","round":1,"groupLabel":"A","order":2,"entryAId":"it_pair_02","entryBId":"it_pair_06"},{"matchKey":"GROUP-B-1","stagePlanKey":"group-stage","stageKind":"group","round":1,"groupLabel":"B","order":3,"entryAId":"it_pair_04","entryBId":"it_pair_05"},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","round":2,"groupLabel":"A","order":4,"entryAId":"it_pair_07","entryBId":"it_pair_06"},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","round":2,"groupLabel":"A","order":5,"entryAId":"it_pair_03","entryBId":"it_pair_02"},{"matchKey":"GROUP-B-2","stagePlanKey":"group-stage","stageKind":"group","round":2,"groupLabel":"B","order":6,"entryAId":"it_pair_01","entryBId":"it_pair_05"},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","round":3,"groupLabel":"A","order":7,"entryAId":"it_pair_07","entryBId":"it_pair_02"},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","round":3,"groupLabel":"A","order":8,"entryAId":"it_pair_06","entryBId":"it_pair_03"},{"matchKey":"GROUP-B-3","stagePlanKey":"group-stage","stageKind":"group","round":3,"groupLabel":"B","order":9,"entryAId":"it_pair_01","entryBId":"it_pair_04"},{"matchKey":"SF1","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":0,"order":10},{"matchKey":"SF2","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":1,"order":11},{"matchKey":"BRONZE","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":1,"order":12},{"matchKey":"F","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":0,"order":13}],"counts":{"total":13}}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT DE GK', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT DE GK', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 14) k),
      'guests', '[]'::jsonb),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'group_knockout', 'config', '{"groupCount":2,"qualifiersPerGroup":2,"thirdPlaceEnabled":true,"finalBestOf":3}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-de-key-GK-' || salt, draft, 1, 'it-de-save-GK-' || salt);
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-GK-' || salt, plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('GK.finalize', (r->>'match_count') || ' trận');
  INSERT INTO it_result VALUES ('GK.db', (SELECT string_agg(s.schedule_format || ':entrants=' || (SELECT count(*) FROM public.tournament_stage_entrants se WHERE se.stage_id = s.id), ',' ORDER BY s.stage_order) FROM public.tournament_stages s WHERE s.division_id = d_id));

  -- ===== Kịch bản RR =====
  pairs := '[]'::jsonb;
  FOR i IN 0..4 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN true AND i = 4 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"round_robin","seed":"it-seed-rr","fingerprint":"6511209efc4e4025aafeb7965ea2c1a4834a66198bb2048fa274198370038fb0","stages":[{"planKey":"group-stage","name":"Vòng tròn","scheduleFormat":"round_robin","order":1,"config":{"groupCount":1,"advancePerGroup":0,"setupPlanVersion":4,"scoring":{"version":"phong_trao_11","points_to":11,"win_by":2,"cap":15,"best_of":1,"win_points":2,"loss_points":0,"draw_points":0,"deciding_game":null,"mlp":null}}}],"groups":[{"label":"A","entryIds":["it_pair_03","it_pair_02","it_pair_05","it_pair_04","it_pair_01"]}],"progressions":[],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","round":1,"groupLabel":"A","order":1,"entryAId":"it_pair_02","entryBId":"it_pair_01"},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","round":1,"groupLabel":"A","order":2,"entryAId":"it_pair_05","entryBId":"it_pair_04"},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","round":2,"groupLabel":"A","order":3,"entryAId":"it_pair_03","entryBId":"it_pair_01"},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","round":2,"groupLabel":"A","order":4,"entryAId":"it_pair_02","entryBId":"it_pair_05"},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","round":3,"groupLabel":"A","order":5,"entryAId":"it_pair_03","entryBId":"it_pair_04"},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","round":3,"groupLabel":"A","order":6,"entryAId":"it_pair_01","entryBId":"it_pair_05"},{"matchKey":"GROUP-A-7","stagePlanKey":"group-stage","stageKind":"group","round":4,"groupLabel":"A","order":7,"entryAId":"it_pair_03","entryBId":"it_pair_05"},{"matchKey":"GROUP-A-8","stagePlanKey":"group-stage","stageKind":"group","round":4,"groupLabel":"A","order":8,"entryAId":"it_pair_04","entryBId":"it_pair_02"},{"matchKey":"GROUP-A-9","stagePlanKey":"group-stage","stageKind":"group","round":5,"groupLabel":"A","order":9,"entryAId":"it_pair_03","entryBId":"it_pair_02"},{"matchKey":"GROUP-A-10","stagePlanKey":"group-stage","stageKind":"group","round":5,"groupLabel":"A","order":10,"entryAId":"it_pair_04","entryBId":"it_pair_01"}],"counts":{"total":10}}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT DE RR', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT DE RR', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 9) k),
      'guests', jsonb_build_array(jsonb_build_object('clientRef', 'g_it_guest_0001', 'displayName', 'Khách IT'))),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'round_robin', 'config', '{}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-de-key-RR-' || salt, draft, 1, 'it-de-save-RR-' || salt);
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-RR-' || salt, plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('RR.finalize', (r->>'match_count') || ' trận');
  INSERT INTO it_result VALUES ('RR.db', (SELECT string_agg(s.schedule_format || ':entrants=' || (SELECT count(*) FROM public.tournament_stage_entrants se WHERE se.stage_id = s.id), ',' ORDER BY s.stage_order) FROM public.tournament_stages s WHERE s.division_id = d_id));

END
$it$;
SELECT k, v FROM it_result ORDER BY k;
ROLLBACK;
