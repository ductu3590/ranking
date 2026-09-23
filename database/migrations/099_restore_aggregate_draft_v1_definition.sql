-- Ghi lai dung dinh nghia save_unified_setup_aggregate_draft_v1 dang chay tren production.
-- Ban 091 trong git da bi sua sau khi apply (memberIds/guests), trong khi production van
-- chay ban selectedMemberIds/reserve co bootstrap. Than ham duoi day chep nguyen prosrc
-- production (md5 prosrc = 31da06b49fd87ca52697fcf60b5a2984, doc ngay 2026-09-23).
-- Tren production day la no-op; muc dich la de replay tu git cho ra dung trang thai that.
BEGIN;

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
    OR v_format_key NOT IN ('round_robin', 'knockout', 'group_knockout', 'mlp')
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
COMMIT;
