-- R2 aggregate setup-draft persistence. This is additive and does not finalize draws,
-- create invitation rows, bootstrap tournament/division records, or turn client member ids into tournament-athlete ids.
BEGIN;

ALTER TABLE public.tournament_divisions
  ADD COLUMN IF NOT EXISTS setup_draft jsonb;

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
    OR p_tournament_id IS NULL OR p_division_id IS NULL
    OR jsonb_typeof(p_draft) IS DISTINCT FROM 'object' THEN
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
  IF v_organizer_mode NOT IN ('internal', 'friendly')
    OR v_play_type NOT IN ('singles', 'doubles', 'team')
    OR v_format_key NOT IN ('round_robin', 'knockout', 'group_knockout', 'mlp')
    OR v_current_step NOT BETWEEN 1 AND 4
    OR jsonb_typeof(p_draft->'tournament') <> 'object'
    OR jsonb_typeof(p_draft->'division') <> 'object'
    OR jsonb_typeof(p_draft->'format') <> 'object'
    OR jsonb_typeof(p_draft->'participants') <> 'object'
    OR jsonb_typeof(p_draft->'format'->'config') <> 'object'
    OR jsonb_typeof(p_draft->'draw') <> 'object'
    OR jsonb_typeof(p_draft->'participants'->'memberIds') <> 'array'
    OR jsonb_typeof(COALESCE(p_draft->'participants'->'guests', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(p_draft->'pairs', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(p_draft->'unpairedMemberIds', '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(p_draft->'invitedClubs', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_draft->'participants'->'memberIds', '[]'::jsonb)) x
             WHERE jsonb_typeof(x) <> 'string' OR x #>> '{}' !~ '^[1-9][0-9]*$') THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_draft->'unpairedMemberIds', '[]'::jsonb)) x
             WHERE jsonb_typeof(x) <> 'string' OR x #>> '{}' !~ '^[1-9][0-9]*$')
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_draft->'pairs', '[]'::jsonb)) x
               WHERE jsonb_typeof(x) <> 'object' OR jsonb_typeof(x->'memberIds') <> 'array'
                 OR EXISTS (SELECT 1 FROM jsonb_array_elements(x->'memberIds') m WHERE jsonb_typeof(m) <> 'string' OR m #>> '{}' !~ '^[1-9][0-9]*$')
                 OR (x ? 'pairId' AND jsonb_typeof(x->'pairId') <> 'string')
                 OR (x ? 'nameSnapshot' AND jsonb_typeof(x->'nameSnapshot') NOT IN ('string', 'null'))
                 OR (x ? 'locked' AND jsonb_typeof(x->'locked') <> 'boolean'))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_draft->'participants'->'guests', '[]'::jsonb)) x
               WHERE jsonb_typeof(x) <> 'object'
                 OR jsonb_typeof(x->'clientRef') <> 'string'
                 OR jsonb_typeof(x->'displayName') <> 'string'
                 OR length(btrim(x->>'clientRef')) NOT BETWEEN 1 AND 200
                 OR length(btrim(x->>'displayName')) NOT BETWEEN 1 AND 120)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_draft->'invitedClubs', '[]'::jsonb)) x
               WHERE jsonb_typeof(x) <> 'object'
                 OR (x ? 'clubId' AND jsonb_typeof(x->'clubId') NOT IN ('number', 'null'))
                 OR (x ? 'name' AND jsonb_typeof(x->'name') <> 'string')
                 OR (x ? 'source' AND jsonb_typeof(x->'source') <> 'string')
                 OR (x ? 'status' AND jsonb_typeof(x->'status') <> 'string')) THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  normalized := jsonb_build_object(
    'draftVersion', 2,
    'currentStep', v_current_step,
    'tournament', jsonb_build_object('name', COALESCE(v_name, ''), 'organizerMode', v_organizer_mode, 'startTime', COALESCE(p_draft->'tournament'->>'startTime', '')),
    'division', jsonb_build_object('name', COALESCE(NULLIF(btrim(p_draft->'division'->>'name'), ''), ''), 'playType', v_play_type),
    'format', jsonb_build_object('entrantType', CASE v_play_type WHEN 'singles' THEN 'singles' WHEN 'doubles' THEN 'doubles' ELSE 'team' END, 'formatKey', v_format_key, 'config', COALESCE(p_draft->'format'->'config', '{}'::jsonb)),
    'participants', jsonb_build_object('memberIds', p_draft->'participants'->'memberIds', 'guests', COALESCE(p_draft->'participants'->'guests', '[]'::jsonb)),
    'pairs', COALESCE(p_draft->'pairs', '[]'::jsonb),
    'unpairedMemberIds', COALESCE(p_draft->'unpairedMemberIds', '[]'::jsonb),
    'invitedClubs', COALESCE(p_draft->'invitedClubs', '[]'::jsonb),
    'draw', COALESCE(p_draft->'draw', '{}'::jsonb)
  );
  fingerprint := md5(jsonb_build_object('client_draft_key', btrim(p_client_draft_key), 'tournament_id', p_tournament_id, 'division_id', p_division_id, 'expected_setup_revision', p_expected_setup_revision, 'draft', normalized)::text);

  PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':aggregate-draft:' || btrim(p_client_draft_key), 0));
  SELECT * INTO cached FROM public.tournament_setup_mutations
  WHERE group_id = p_group_id AND operation = 'save_unified_setup_aggregate_draft'
    AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF cached.payload_fingerprint <> fingerprint THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'PH409'; END IF;
    RETURN cached.response;
  END IF;

  SELECT * INTO d FROM public.tournament_divisions WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DIVISION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO t FROM public.tournaments WHERE id = d.tournament_id AND group_id = p_group_id FOR UPDATE;

  IF d.setup_revision <> p_expected_setup_revision THEN RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = 'PH409'; END IF;
  normalized := normalized || jsonb_build_object('tournamentId', t.id, 'divisionId', d.id, 'clientDraftKey', btrim(p_client_draft_key), 'revision', d.setup_revision + 1, 'state', 'server_draft');
  UPDATE public.tournament_divisions SET setup_draft = normalized, setup_revision = setup_revision + 1, setup_updated_at = now()
  WHERE id = d.id AND group_id = p_group_id RETURNING setup_revision INTO d.setup_revision;
  result := jsonb_build_object('success', true, 'tournament_id', t.id, 'division_id', d.id, 'setup_revision', d.setup_revision, 'draft', normalized);
  INSERT INTO public.tournament_setup_mutations(group_id, operation, division_id, idempotency_key, payload_fingerprint, response)
  VALUES (p_group_id, 'save_unified_setup_aggregate_draft', d.id, p_idempotency_key, fingerprint, result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) TO service_role;
COMMENT ON COLUMN public.tournament_divisions.setup_draft IS 'Snapshot nhap lieu aggregate cua wizard; khong phai entrants, invitations hay lich da chot.';
COMMENT ON FUNCTION public.save_unified_setup_aggregate_draft(bigint,bigint,bigint,text,jsonb,bigint,text) IS 'Luu nhap aggregate co CAS/idempotency cho tournament/division da ton tai; khong bootstrap va khong tao du lieu chinh thuc.';
COMMIT;
