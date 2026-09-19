-- Compatibility repair: give EXISTING legacy doubles entries a pair identity.
--
-- Hard guarantees of this migration:
--   * It never creates a row in the entries table. Entry ids, entry member
--     snapshot rows, seeds, statuses and club links are left byte-for-byte as-is;
--     the only column touched on an entry is pair_id (NULL -> the new pair).
--   * Identity is keyed on tournament_entry_members.id, never on a display name.
--     A NULL em.athlete_id stays NULL (tournament-local identity, source 'guest');
--     a non-null em.athlete_id stays linked (source 'club_member'). No row is ever
--     invented in the global public.athletes table.
--   * p_dry_run = true performs pure reads only: no INSERT, no UPDATE, no revision
--     bump, no mutation-cache row and no row lock.
--   * Write order respects the deployed triggers of migrations 059 and 064:
--     tournament_athletes -> tournament_division_roster_members -> tournament_pairs
--     -> tournament_pair_members -> UPDATE tournament_entries.pair_id.
-- Forward-only and additive: no destructive statement is used anywhere.
BEGIN;

CREATE OR REPLACE FUNCTION public.repair_legacy_division_pair_identity(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint,
  p_dry_run boolean,
  p_expected_setup_revision bigint,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.tournament_divisions%ROWTYPE;
  cached public.tournament_setup_mutations%ROWTYPE;
  fingerprint text;
  e record;
  m record;
  v_client_ref text;
  v_athlete_id bigint;
  v_existing_name text;
  v_pair_id bigint;
  v_role text;
  v_target boolean;
  resolved_ids bigint[] := ARRAY[]::bigint[];
  entry_athlete_ids bigint[] := ARRAY[]::bigint[];
  entry_roles text[] := ARRAY[]::text[];
  idx integer;
  v_rowcount integer := 0;
  members_report jsonb;
  entries_report jsonb := '[]'::jsonb;
  ambiguities jsonb := '[]'::jsonb;
  blockers jsonb := '[]'::jsonb;
  planned_athletes integer := 0;
  planned_roster integer := 0;
  planned_pairs integer := 0;
  planned_pair_members integer := 0;
  planned_entries integer := 0;
  applied_athletes integer := 0;
  applied_roster integer := 0;
  applied_pairs integer := 0;
  applied_pair_members integer := 0;
  applied_entries integer := 0;
  v_entries_total integer := 0;
  v_entries_target integer := 0;
  v_member_rows integer := 0;
  v_members_with_global integer := 0;
  v_guest_identities integer := 0;
  v_empty_names integer := 0;
  v_member_count_violations integer := 0;
  v_blocking_matches integer := 0;
  v_blocking_transitions integer := 0;
  v_entry_club_ids bigint[];
  summary jsonb;
  result jsonb;
BEGIN
  -- An omitted dry_run must never apply: default to the dry run.
  IF p_dry_run IS NULL THEN
    p_dry_run := true;
  END IF;
  IF p_expected_setup_revision IS NULL OR p_expected_setup_revision < 1 THEN
    RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'SETUP_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  -- 1. Replay cache. A dry run only READS it (so it can still detect a reused key)
  --    and never takes a row lock or writes a row.
  fingerprint := md5(jsonb_build_object('division_id', p_division_id, 'dry_run', p_dry_run)::text);
  IF p_dry_run THEN
    SELECT * INTO cached FROM public.tournament_setup_mutations
    WHERE group_id = p_group_id
      AND operation = 'repair_legacy_division_pair_identity'
      AND idempotency_key = p_idempotency_key;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(p_group_id::text || ':division-pair-repair:' || p_idempotency_key, 0));
    SELECT * INTO cached FROM public.tournament_setup_mutations
    WHERE group_id = p_group_id
      AND operation = 'repair_legacy_division_pair_identity'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;
  END IF;
  IF FOUND THEN
    IF cached.division_id <> p_division_id OR cached.payload_fingerprint <> fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = '22023';
    END IF;
    RETURN cached.response;
  END IF;

  -- 2. CAS + roster lock guard. The explicit check runs before any write so the
  --    caller gets ROSTER_LOCKED instead of the 064 trigger firing mid-write.
  IF p_dry_run THEN
    SELECT * INTO d FROM public.tournament_divisions
    WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id;
  ELSE
    SELECT * INTO d FROM public.tournament_divisions
    WHERE id = p_division_id AND group_id = p_group_id AND tournament_id = p_tournament_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'division not found in tournament scope' USING ERRCODE = 'P0002';
  END IF;
  IF d.setup_revision <> p_expected_setup_revision THEN
    RAISE EXCEPTION 'SETUP_REVISION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF d.roster_lock_status <> 'open' THEN
    RAISE EXCEPTION 'ROSTER_LOCKED' USING ERRCODE = '40001';
  END IF;

  -- 3. Read-only census of the division. Every number below is reported back so a
  --    dry run is directly checkable against the expected live state.
  SELECT count(*)::integer INTO v_entries_total
  FROM public.tournament_entries en
  WHERE en.group_id = p_group_id AND en.division_id = p_division_id AND en.status = 'approved';

  SELECT count(*)::integer INTO v_entries_target
  FROM public.tournament_entries en
  WHERE en.group_id = p_group_id AND en.division_id = p_division_id
    AND en.status = 'approved' AND en.pair_id IS NULL;

  SELECT count(*)::integer INTO v_member_count_violations
  FROM public.tournament_entries en
  WHERE en.group_id = p_group_id AND en.division_id = p_division_id
    AND en.status = 'approved' AND en.pair_id IS NULL
    AND (SELECT count(*) FROM public.tournament_entry_members em
         WHERE em.group_id = p_group_id AND em.entry_id = en.id) <> 2;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE em.athlete_id IS NOT NULL)::integer,
    count(*) FILTER (WHERE em.athlete_id IS NULL)::integer,
    count(*) FILTER (WHERE btrim(COALESCE(em.display_name_snapshot, '')) = '')::integer
  INTO v_member_rows, v_members_with_global, v_guest_identities, v_empty_names
  FROM public.tournament_entries en
  JOIN public.tournament_entry_members em ON em.entry_id = en.id AND em.group_id = p_group_id
  WHERE en.group_id = p_group_id AND en.division_id = p_division_id
    AND en.status = 'approved' AND en.pair_id IS NULL;

  SELECT count(*)::integer INTO v_blocking_matches
  FROM public.tournament_matches mm
  WHERE mm.group_id = p_group_id AND mm.division_id = p_division_id;

  SELECT count(*)::integer INTO v_blocking_transitions
  FROM public.tournament_stage_transitions tt
  WHERE tt.group_id = p_group_id AND tt.division_id = p_division_id;

  SELECT COALESCE(array_agg(DISTINCT en.tournament_club_id ORDER BY en.tournament_club_id), ARRAY[]::bigint[])
  INTO v_entry_club_ids
  FROM public.tournament_entries en
  WHERE en.group_id = p_group_id AND en.division_id = p_division_id
    AND en.status = 'approved' AND en.pair_id IS NULL;

  summary := jsonb_build_object(
    'entries_total', v_entries_total,
    'entries_to_repair', v_entries_target,
    'entry_member_rows', v_member_rows,
    'members_with_global_athlete_id', v_members_with_global,
    'guest_identities', v_guest_identities,
    'club_member_identities', v_members_with_global,
    'empty_display_names', v_empty_names,
    'entry_member_count_violations', v_member_count_violations,
    'blocking_matches', v_blocking_matches,
    'blocking_transitions', v_blocking_transitions,
    'entry_club_ids', COALESCE(to_jsonb(v_entry_club_ids), '[]'::jsonb)
  );

  -- 4. Refusals. Each one raises (never silently skips) and happens before any
  --    write, in both dry-run and apply mode.
  -- Mot dry run phai LIET KE duoc vuong mac (05 muc C yeu cau ke ra fixture phu
  -- thuoc), nen o che do chay thu ta gom vao `blockers` thay vi nem. Che do ap
  -- dung van nem nhu cu: khong bao gio am tham bo qua.
  IF v_blocking_matches > 0 OR v_blocking_transitions > 0 THEN
    IF p_dry_run THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'REPAIR_BLOCKED_FIXTURES_EXIST',
        'matches', v_blocking_matches,
        'transitions', v_blocking_transitions,
        'message', 'Noi dung da co lich thi dau hoac do thi tien cap; khong sua tuong thich.'
      ));
    ELSE
      RAISE EXCEPTION 'REPAIR_BLOCKED_FIXTURES_EXIST' USING ERRCODE = '40001';
    END IF;
  END IF;
  IF v_member_count_violations > 0 THEN
    IF p_dry_run THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'REPAIR_ENTRY_MEMBER_COUNT_INVALID',
        'entries', v_member_count_violations,
        'message', 'Co suat thi dau khong co dung 2 thanh vien.'
      ));
    ELSE
      RAISE EXCEPTION 'REPAIR_ENTRY_MEMBER_COUNT_INVALID' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_empty_names > 0 THEN
    IF p_dry_run THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'REPAIR_ENTRY_MEMBER_NAME_MISSING',
        'members', v_empty_names,
        'message', 'Co thanh vien khong co ten snapshot.'
      ));
    ELSE
      RAISE EXCEPTION 'REPAIR_ENTRY_MEMBER_NAME_MISSING' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_entry_club_ids) AS ec(entry_club_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tournament_clubs c
      WHERE c.id = ec.entry_club_id AND c.group_id = p_group_id AND c.tournament_id = p_tournament_id
    )
  ) THEN
    RAISE EXCEPTION 'SETUP_SCOPE_MISMATCH' USING ERRCODE = '23503';
  END IF;
  -- The same global athlete cannot back two entries of one division.
  IF EXISTS (
    SELECT 1
    FROM public.tournament_entries en
    JOIN public.tournament_entry_members em ON em.entry_id = en.id AND em.group_id = p_group_id
    WHERE en.group_id = p_group_id AND en.division_id = p_division_id
      AND en.status = 'approved' AND en.pair_id IS NULL AND em.athlete_id IS NOT NULL
    GROUP BY em.athlete_id HAVING count(*) > 1
  ) THEN
    IF p_dry_run THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'REPAIR_BLOCKED_ATHLETE_REUSE',
        'message', 'Mot VDV toan cuc dang dung cho nhieu suat thi dau trong cung noi dung.'
      ));
    ELSE
      RAISE EXCEPTION 'REPAIR_BLOCKED_ATHLETE_REUSE' USING ERRCODE = '40001';
    END IF;
  END IF;
  -- An identity that already sits in an active pair of this division cannot be
  -- reused by a repaired entry.
  IF EXISTS (
    SELECT 1
    FROM public.tournament_entries en
    JOIN public.tournament_entry_members em ON em.entry_id = en.id AND em.group_id = p_group_id
    JOIN public.tournament_athletes a
      ON a.group_id = p_group_id AND a.tournament_id = p_tournament_id
     AND (a.client_ref = 'legacy:entry_member:' || em.id
          OR (em.athlete_id IS NOT NULL AND a.athlete_id = em.athlete_id))
    JOIN public.tournament_pair_members pm
      ON pm.group_id = p_group_id AND pm.tournament_athlete_id = a.id
    JOIN public.tournament_pairs p
      ON p.id = pm.pair_id AND p.group_id = p_group_id AND p.division_id = p_division_id
     AND p.status IN ('confirmed', 'locked')
    WHERE en.group_id = p_group_id AND en.division_id = p_division_id
      AND en.status = 'approved' AND en.pair_id IS NULL
  ) THEN
    IF p_dry_run THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object(
        'code', 'REPAIR_BLOCKED_ATHLETE_REUSE',
        'message', 'Danh tinh da nam trong mot cap dang hoat dong cua noi dung.'
      ));
    ELSE
      RAISE EXCEPTION 'REPAIR_BLOCKED_ATHLETE_REUSE' USING ERRCODE = '40001';
    END IF;
  END IF;

  -- Co vuong mac thi khong lap ke hoach tiep: tra ve dung danh sach vuong mac.
  IF p_dry_run AND jsonb_array_length(blockers) > 0 THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'entries', '[]'::jsonb,
      'planned', jsonb_build_object('athletes', 0, 'roster', 0, 'pairs', 0, 'pair_members', 0, 'entries_updated', 0),
      'ambiguities', ambiguities,
      'blockers', blockers,
      'summary', summary
    );
  END IF;

  -- 5. Plan / apply, entry by entry. Reads the same rows in both modes.
  FOR e IN
    SELECT en.id AS entry_id, en.name_snapshot, en.tournament_club_id, en.pair_id
    FROM public.tournament_entries en
    WHERE en.group_id = p_group_id AND en.division_id = p_division_id AND en.status = 'approved'
    ORDER BY en.id
  LOOP
    v_target := e.pair_id IS NULL;
    v_pair_id := e.pair_id;
    members_report := '[]'::jsonb;
    IF v_target THEN
      planned_pairs := planned_pairs + 1;
      planned_entries := planned_entries + 1;
    END IF;

    entry_athlete_ids := ARRAY[]::bigint[];
    entry_roles := ARRAY[]::text[];

    -- 5a. Identities first (trigger 064 requires roster membership before any
    --     pair member insert, so athletes and roster rows are written up front).
    FOR m IN
      SELECT em.id, em.athlete_id, em.display_name_snapshot, em.club_name_snapshot,
             em.skill_snapshot, em.roster_role
      FROM public.tournament_entry_members em
      WHERE em.group_id = p_group_id AND em.entry_id = e.entry_id
      ORDER BY em.id
    LOOP
      v_client_ref := 'legacy:entry_member:' || m.id;
      v_athlete_id := NULL;
      v_existing_name := NULL;
      SELECT a.id, a.display_name_snapshot INTO v_athlete_id, v_existing_name
      FROM public.tournament_athletes a
      WHERE a.group_id = p_group_id AND a.tournament_id = p_tournament_id
        AND a.client_ref = v_client_ref;
      IF v_athlete_id IS NULL AND m.athlete_id IS NOT NULL THEN
        SELECT a.id, a.display_name_snapshot INTO v_athlete_id, v_existing_name
        FROM public.tournament_athletes a
        WHERE a.group_id = p_group_id AND a.tournament_id = p_tournament_id
          AND a.athlete_id = m.athlete_id;
      END IF;

      IF v_target THEN
        IF v_athlete_id IS NULL THEN
          planned_athletes := planned_athletes + 1;
          IF NOT p_dry_run THEN
            INSERT INTO public.tournament_athletes(
              group_id, tournament_id, tournament_club_id, athlete_id,
              display_name_snapshot, club_name_snapshot, phr_rating, source, client_ref
            ) VALUES (
              p_group_id, p_tournament_id, e.tournament_club_id, m.athlete_id,
              m.display_name_snapshot, m.club_name_snapshot, m.skill_snapshot,
              CASE WHEN m.athlete_id IS NULL THEN 'guest' ELSE 'club_member' END,
              v_client_ref
            ) RETURNING id INTO v_athlete_id;
            applied_athletes := applied_athletes + 1;
          END IF;
        ELSE
          -- Reused identity. The entry member snapshot is never rewritten; a name
          -- difference is reported instead of being merged away.
          IF v_existing_name IS DISTINCT FROM m.display_name_snapshot THEN
            ambiguities := ambiguities || jsonb_build_array(jsonb_build_object(
              'entry_id', e.entry_id,
              'entry_member_id', m.id,
              'client_ref', v_client_ref,
              'tournament_athlete_id', v_athlete_id,
              'reason', 'REUSED_ATHLETE_DISPLAY_NAME_DIFFERS'
            ));
          END IF;
          IF NOT p_dry_run THEN
            UPDATE public.tournament_athletes
            SET client_ref = COALESCE(client_ref, v_client_ref)
            WHERE id = v_athlete_id AND group_id = p_group_id;
          END IF;
        END IF;

        IF v_athlete_id IS NOT NULL THEN
          IF v_athlete_id = ANY(resolved_ids) THEN
            RAISE EXCEPTION 'REPAIR_BLOCKED_ATHLETE_REUSE' USING ERRCODE = '40001';
          END IF;
          resolved_ids := array_append(resolved_ids, v_athlete_id);
          IF NOT EXISTS (
            SELECT 1 FROM public.tournament_division_roster_members r
            WHERE r.group_id = p_group_id AND r.division_id = p_division_id
              AND r.tournament_athlete_id = v_athlete_id
          ) THEN
            planned_roster := planned_roster + 1;
            IF NOT p_dry_run THEN
              INSERT INTO public.tournament_division_roster_members(group_id, division_id, tournament_athlete_id)
              VALUES (p_group_id, p_division_id, v_athlete_id)
              ON CONFLICT (group_id, division_id, tournament_athlete_id) DO NOTHING;
              -- Chi dem dong that su duoc ghi: DO NOTHING khong duoc bao cao la da ghi.
              GET DIAGNOSTICS v_rowcount = ROW_COUNT;
              applied_roster := applied_roster + v_rowcount;
            END IF;
          END IF;
        ELSE
          planned_roster := planned_roster + 1;
        END IF;

        planned_pair_members := planned_pair_members + 1;
        entry_athlete_ids := array_append(entry_athlete_ids, v_athlete_id);
        entry_roles := array_append(entry_roles,
          CASE WHEN m.roster_role = 'captain' THEN 'captain' ELSE 'player' END);
      END IF;

      members_report := members_report || jsonb_build_array(jsonb_build_object(
        'entry_member_id', m.id,
        'client_ref', v_client_ref,
        'has_global_athlete_id', m.athlete_id IS NOT NULL,
        'source', CASE WHEN m.athlete_id IS NULL THEN 'guest' ELSE 'club_member' END,
        'display_name_present', btrim(COALESCE(m.display_name_snapshot, '')) <> '',
        'tournament_athlete_id', v_athlete_id
      ));
    END LOOP;

    -- 5b. Pair, pair members, then the entry link. The entry row is UPDATEd,
    --     never re-inserted, and only its pair_id column changes.
    IF v_target AND NOT p_dry_run THEN
      INSERT INTO public.tournament_pairs(group_id, division_id, name_snapshot, pairing_mode, status)
      VALUES (p_group_id, p_division_id, e.name_snapshot, 'manual', 'confirmed')
      RETURNING id INTO v_pair_id;
      applied_pairs := applied_pairs + 1;

      FOR idx IN 1 .. COALESCE(array_length(entry_athlete_ids, 1), 0) LOOP
        BEGIN
          INSERT INTO public.tournament_pair_members(group_id, pair_id, tournament_athlete_id, role)
          VALUES (p_group_id, v_pair_id, entry_athlete_ids[idx], entry_roles[idx]);
        EXCEPTION WHEN unique_violation THEN
          -- trigger 059 raises ATHLETE_ALREADY_PAIRED_IN_DIVISION with 23505
          RAISE EXCEPTION 'REPAIR_BLOCKED_ATHLETE_REUSE' USING ERRCODE = '40001';
        END;
        applied_pair_members := applied_pair_members + 1;
      END LOOP;

      UPDATE public.tournament_entries SET pair_id = v_pair_id
      WHERE id = e.entry_id AND group_id = p_group_id
        AND division_id = p_division_id AND pair_id IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'REPAIR_ENTRY_UPDATE_CONFLICT' USING ERRCODE = '40001';
      END IF;
      applied_entries := applied_entries + 1;
    END IF;

    entries_report := entries_report || jsonb_build_array(jsonb_build_object(
      'entry_id', e.entry_id,
      'name_snapshot_present', btrim(COALESCE(e.name_snapshot, '')) <> '',
      'members', members_report,
      'planned', CASE WHEN v_target THEN 'create_pair' ELSE 'already_paired' END,
      'pair_id', v_pair_id
    ));
  END LOOP;

  -- 6. Exactly one revision bump, and only when something actually changed, so a
  --    re-run after a successful apply stays a true no-op.
  IF NOT p_dry_run AND applied_entries > 0 THEN
    UPDATE public.tournament_divisions
    SET setup_revision = setup_revision + 1, setup_updated_at = now()
    WHERE id = d.id AND group_id = p_group_id
    RETURNING setup_revision INTO d.setup_revision;
  END IF;

  result := jsonb_build_object(
    'dry_run', p_dry_run,
    'entries', entries_report,
    'planned', jsonb_build_object(
      'athletes', planned_athletes,
      'roster', planned_roster,
      'pairs', planned_pairs,
      'pair_members', planned_pair_members,
      'entries_updated', planned_entries
    ),
    'ambiguities', ambiguities,
    'blockers', blockers,
    'summary', summary
  );

  IF NOT p_dry_run THEN
    result := result || jsonb_build_object(
      'applied', jsonb_build_object(
        'athletes', applied_athletes,
        'roster', applied_roster,
        'pairs', applied_pairs,
        'pair_members', applied_pair_members,
        'entries_updated', applied_entries
      ),
      'setup_revision', d.setup_revision
    );
    INSERT INTO public.tournament_setup_mutations(
      group_id, operation, division_id, idempotency_key, payload_fingerprint, response
    ) VALUES (
      p_group_id, 'repair_legacy_division_pair_identity', p_division_id,
      p_idempotency_key, fingerprint, result
    );
  END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_legacy_division_pair_identity(bigint,bigint,bigint,boolean,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_legacy_division_pair_identity(bigint,bigint,bigint,boolean,bigint,text)
  TO service_role;

COMMENT ON FUNCTION public.repair_legacy_division_pair_identity(bigint,bigint,bigint,boolean,bigint,text)
  IS 'Sua tuong thich entry doi cu: tao pair tu chinh entry dang co, khong bao gio chen entry moi, danh tinh khoa theo tournament_entry_members.id.';

COMMIT;
