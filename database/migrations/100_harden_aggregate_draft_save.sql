-- Va ham boc save_unified_setup_aggregate_draft (097) cho draft v3.
-- 1. Replay: khi idempotency_key da duoc dung, _v1 tra response cu nhung 097 van ghi de
--    setup_draft bang payload cu -> mot request cu retry muon se de len ban moi hon.
--    Ban nay nhan biet replay TRUOC khi goi _v1 va tra trang thai hien tai, khong ghi.
-- 2. Fingerprint: _v1 chi bam ban normalized (khong co guests/ngay/gio/dia diem/progress).
--    Dua md5 cua toan bo p_draft vao draw.payloadHash cua ban chieu de fingerprint phu het.
-- 3. Metadata: 097 da ghi de ham boc cua 094 nen tournaments.name/event_date/location/
--    description/settings khong con duoc cap nhat. Ghi lai khi giai con o trang thai draft.
-- 4. revision trong draft la so, khong phai chuoi.
-- Chap nhan ca draft v2 cua client hien tai (memberIds/guests) va draft v3.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_unified_setup_aggregate_draft(
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
  compat_draft jsonb;
  restored_draft jsonb;
  result jsonb;
  v_division_id bigint;
  v_tournament_id bigint;
  v_revision bigint;
  v_current jsonb;
  v_replay boolean;
  v_meta jsonb;
  v_event_date text;
  v_court_count text;
BEGIN
  IF jsonb_typeof(p_draft) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_draft->'participants'->'memberIds') IS DISTINCT FROM 'array'
    OR jsonb_typeof(coalesce(p_draft->'participants'->'guests', '[]'::jsonb)) <> 'array'
    OR p_client_draft_key IS NULL OR length(btrim(p_client_draft_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_draft->'participants'->'guests', '[]'::jsonb)) g
             WHERE jsonb_typeof(g) <> 'object'
                OR jsonb_typeof(g->'clientRef') IS DISTINCT FROM 'string'
                OR jsonb_typeof(g->'displayName') IS DISTINCT FROM 'string'
                OR btrim(g->>'clientRef') !~ '^[A-Za-z0-9_-]{8,64}$'
                OR length(btrim(g->>'displayName')) NOT BETWEEN 1 AND 120) THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  v_meta := coalesce(p_draft->'tournament', '{}'::jsonb);
  v_event_date := NULLIF(btrim(coalesce(v_meta->>'eventDate', '')), '');
  IF v_event_date IS NOT NULL AND v_event_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_court_count := coalesce(v_meta->>'courtCount', p_draft->'format'->'config'->>'courtCount');
  IF v_court_count IS NOT NULL AND v_court_count !~ '^[0-9]{1,2}$' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Cung khoa voi _v1 (khoa advisory tai nhap trong cung transaction), roi moi xet replay.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':aggregate-draft:' || btrim(p_client_draft_key), 0));
  v_replay := EXISTS (
    SELECT 1 FROM public.tournament_setup_mutations
    WHERE group_id = p_group_id AND operation = 'save_unified_setup_aggregate_draft'
      AND idempotency_key = p_idempotency_key
  );

  compat_draft := jsonb_set(p_draft, '{participants,selectedMemberIds}', p_draft->'participants'->'memberIds', true);
  compat_draft := jsonb_set(compat_draft, '{draw}',
    coalesce(p_draft->'draw', '{}'::jsonb) || jsonb_build_object('payloadHash', md5(p_draft::text)), true);

  -- _v1 van so huu CAS + idempotency (va bao IDEMPOTENCY_KEY_REUSED khi payload khac).
  result := public.save_unified_setup_aggregate_draft_v1(
    p_group_id, p_tournament_id, p_division_id, p_client_draft_key,
    compat_draft, p_expected_setup_revision, p_idempotency_key
  );
  v_division_id := (result->>'division_id')::bigint;
  v_tournament_id := (result->>'tournament_id')::bigint;

  IF v_replay THEN
    SELECT setup_draft, setup_revision INTO v_current, v_revision
    FROM public.tournament_divisions WHERE id = v_division_id AND group_id = p_group_id;
    RETURN result || jsonb_build_object('replayed', true, 'setup_revision', v_revision, 'draft', v_current);
  END IF;

  v_revision := (result->>'setup_revision')::bigint;
  restored_draft := p_draft || jsonb_build_object(
    'tournamentId', v_tournament_id::text,
    'divisionId', v_division_id::text,
    'clientDraftKey', btrim(p_client_draft_key),
    'revision', v_revision,
    'state', 'server_draft'
  );
  UPDATE public.tournament_divisions
  SET setup_draft = restored_draft
  WHERE id = v_division_id AND group_id = p_group_id;

  UPDATE public.tournaments
  SET name = coalesce(NULLIF(btrim(v_meta->>'name'), ''), name),
      event_date = CASE WHEN v_meta ? 'eventDate' THEN v_event_date::date ELSE event_date END,
      location = CASE WHEN v_meta ? 'location' THEN NULLIF(btrim(v_meta->>'location'), '') ELSE location END,
      description = CASE WHEN v_meta ? 'description' THEN NULLIF(btrim(v_meta->>'description'), '') ELSE description END,
      settings = coalesce(settings, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'poster_url', CASE WHEN v_meta ? 'posterUrl' THEN to_jsonb(coalesce(NULLIF(btrim(v_meta->>'posterUrl'), ''), '')) END,
        'start_time', CASE WHEN v_meta ? 'startTime' THEN to_jsonb(coalesce(v_meta->>'startTime', '')) END,
        'court_count', CASE WHEN v_court_count IS NOT NULL THEN to_jsonb(v_court_count::integer) END
      )),
      updated_at = now()
  WHERE id = v_tournament_id AND group_id = p_group_id AND status = 'draft';

  RETURN result || jsonb_build_object('setup_revision', v_revision, 'draft', restored_draft);
END;
$$;

REVOKE ALL ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) TO service_role;
COMMENT ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) IS 'Aggregate save v3: replay-safe (khong ghi de khi idempotency replay), fingerprint phu toan bo payload, dong bo metadata giai dang draft.';
COMMIT;
