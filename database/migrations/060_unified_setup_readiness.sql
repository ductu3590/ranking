-- Unified setup readiness foundation.
-- Forward-only: this migration only exposes revision/lock state and a read model;
-- it does not make existing roster or pair writes revision-aware.
BEGIN;

ALTER TABLE public.tournament_divisions
  ADD COLUMN IF NOT EXISTS setup_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS roster_lock_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS roster_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS roster_locked_by text,
  ADD COLUMN IF NOT EXISTS setup_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.tournament_divisions
  DROP CONSTRAINT IF EXISTS tournament_divisions_setup_revision_ck,
  ADD CONSTRAINT tournament_divisions_setup_revision_ck CHECK (setup_revision > 0),
  DROP CONSTRAINT IF EXISTS tournament_divisions_roster_lock_status_ck,
  ADD CONSTRAINT tournament_divisions_roster_lock_status_ck
    CHECK (roster_lock_status IN ('open', 'locked'));

CREATE INDEX IF NOT EXISTS idx_tournament_divisions_setup_scope
  ON public.tournament_divisions(group_id, tournament_id, id, setup_revision);

CREATE OR REPLACE FUNCTION public.get_tournament_division_readiness(
  p_group_id bigint,
  p_tournament_id bigint,
  p_division_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.tournament_divisions%ROWTYPE;
  entry_count integer := 0;
  pair_count integer := 0;
  roster_count integer := 0;
  paired_athlete_count integer := 0;
  reasons jsonb := '[]'::jsonb;
  result_status text := 'ready';
BEGIN
  SELECT * INTO d
  FROM public.tournament_divisions
  WHERE id = p_division_id
    AND group_id = p_group_id
    AND tournament_id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'division not found in tournament scope' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::integer INTO entry_count
  FROM public.tournament_entries e
  WHERE e.group_id = p_group_id
    AND e.division_id = p_division_id
    AND e.status = 'approved';

  -- The identity roster is tournament-wide until a revisioned division-roster
  -- mutation is introduced. Report it, but do not reject legacy divisions for it.
  SELECT count(*)::integer INTO roster_count
  FROM public.tournament_athletes a
  WHERE a.group_id = p_group_id
    AND a.tournament_id = p_tournament_id;

  IF entry_count < 2 THEN
    reasons := reasons || jsonb_build_array(jsonb_build_object(
      'code', 'ENTRY_COUNT_TOO_LOW',
      'entity_id', p_division_id,
      'message', 'Cần ít nhất 2 entry đã duyệt để bốc thăm.'
    ));
  END IF;

  IF d.play_type = 'doubles' THEN
    SELECT count(*)::integer INTO pair_count
    FROM public.tournament_pairs p
    WHERE p.group_id = p_group_id
      AND p.division_id = p_division_id
      AND p.status IN ('confirmed', 'locked');

    SELECT count(DISTINCT pm.tournament_athlete_id)::integer INTO paired_athlete_count
    FROM public.tournament_pair_members pm
    JOIN public.tournament_pairs p ON p.id = pm.pair_id
    WHERE pm.group_id = p_group_id
      AND p.group_id = p_group_id
      AND p.division_id = p_division_id
      AND p.status IN ('confirmed', 'locked');

    SELECT COALESCE(jsonb_agg(reason ORDER BY reason->>'code', (reason->>'entity_id')::bigint), '[]'::jsonb)
      INTO reasons
    FROM (
      SELECT jsonb_build_object(
        'code', 'PAIR_MEMBER_COUNT_INVALID',
        'entity_id', p.id,
        'message', 'Mỗi cặp đã xác nhận phải có đúng 2 vận động viên.'
      ) AS reason
      FROM public.tournament_pairs p
      LEFT JOIN public.tournament_pair_members pm
        ON pm.pair_id = p.id AND pm.group_id = p_group_id
      WHERE p.group_id = p_group_id
        AND p.division_id = p_division_id
        AND p.status IN ('confirmed', 'locked')
      GROUP BY p.id
      HAVING count(pm.id) <> 2

      UNION ALL

      SELECT jsonb_build_object(
        'code', 'ATHLETE_IN_MULTIPLE_PAIRS',
        'entity_id', pm.tournament_athlete_id,
        'message', 'Một vận động viên không được thuộc nhiều cặp trong cùng nội dung.'
      ) AS reason
      FROM public.tournament_pair_members pm
      JOIN public.tournament_pairs p ON p.id = pm.pair_id
      WHERE pm.group_id = p_group_id
        AND p.group_id = p_group_id
        AND p.division_id = p_division_id
        AND p.status IN ('confirmed', 'locked')
      GROUP BY pm.tournament_athlete_id
      HAVING count(DISTINCT pm.pair_id) > 1

      UNION ALL

      SELECT jsonb_build_object(
        'code', 'PAIR_ENTRY_LINK_MISSING',
        'entity_id', p.id,
        'message', 'Cặp đã xác nhận chưa có entry liên kết trực tiếp.'
      ) AS reason
      FROM public.tournament_pairs p
      WHERE p.group_id = p_group_id
        AND p.division_id = p_division_id
        AND p.status IN ('confirmed', 'locked')
        AND NOT EXISTS (
          SELECT 1 FROM public.tournament_entries e
          WHERE e.group_id = p_group_id
            AND e.division_id = p_division_id
            AND e.pair_id = p.id
            AND e.status = 'approved'
        )

      UNION ALL

      SELECT jsonb_build_object(
        'code', 'APPROVED_DOUBLES_ENTRY_PAIR_ID_MISSING',
        'entity_id', e.id,
        'message', 'Entry đôi đã duyệt phải liên kết trực tiếp với một cặp.'
      ) AS reason
      FROM public.tournament_entries e
      WHERE e.group_id = p_group_id
        AND e.division_id = p_division_id
        AND e.status = 'approved'
        AND e.pair_id IS NULL

      UNION ALL

      SELECT jsonb_build_object(
        'code', 'PAIR_ENTRY_COUNT_MISMATCH',
        'entity_id', p_division_id,
        'message', 'Số cặp đã xác nhận phải khớp chính xác số entry đôi đã duyệt.'
      ) AS reason
      WHERE pair_count <> entry_count

      UNION ALL

      SELECT jsonb_build_object(
        'code', 'ENTRY_MEMBER_SNAPSHOT_MISMATCH',
        'entity_id', e.id,
        'message', 'Thành viên snapshot của entry không khớp cặp liên kết.'
      ) AS reason
      FROM public.tournament_entries e
      JOIN public.tournament_pairs p ON p.id = e.pair_id
      WHERE e.group_id = p_group_id
        AND e.division_id = p_division_id
        AND e.status = 'approved'
        AND p.group_id = p_group_id
        AND p.division_id = p_division_id
        AND (
          (SELECT count(*) FROM public.tournament_entry_members em
            WHERE em.group_id = p_group_id AND em.entry_id = e.id) <> 2
          OR EXISTS (
            SELECT 1
            FROM public.tournament_pair_members pm
            JOIN public.tournament_athletes a ON a.id = pm.tournament_athlete_id
            WHERE pm.group_id = p_group_id
              AND pm.pair_id = p.id
              AND NOT EXISTS (
                SELECT 1 FROM public.tournament_entry_members em
                WHERE em.group_id = p_group_id
                  AND em.entry_id = e.id
                  AND em.athlete_id IS NOT DISTINCT FROM a.athlete_id
                  AND em.display_name_snapshot IS NOT DISTINCT FROM a.display_name_snapshot
              )
          )
        )
    ) computed_reasons;

    -- Retain generic entry blockers collected before doubles-specific checks.
    IF entry_count < 2 THEN
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code', 'ENTRY_COUNT_TOO_LOW',
        'entity_id', p_division_id,
        'message', 'Cần ít nhất 2 entry đã duyệt để bốc thăm.'
      ));
    END IF;
  END IF;

  IF jsonb_array_length(reasons) > 0 THEN
    result_status := 'blocked';
  END IF;

  RETURN jsonb_build_object(
    'division_id', d.id,
    'tournament_id', d.tournament_id,
    'revision', d.setup_revision,
    'roster_lock_status', d.roster_lock_status,
    'roster_locked_at', d.roster_locked_at,
    'roster_locked_by', d.roster_locked_by,
    'status', result_status,
    'reasons', reasons,
    'counts', jsonb_build_object(
      'roster', roster_count,
      'pairs', pair_count,
      'entries', entry_count,
      'paired_athletes', paired_athlete_count,
      'unpaired', GREATEST(roster_count - paired_athlete_count, 0)
    ),
    'legacy_compatible', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tournament_division_readiness(bigint, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tournament_division_readiness(bigint, bigint, bigint)
  TO service_role;

COMMENT ON COLUMN public.tournament_divisions.setup_revision IS 'Revision nền tảng cho setup; write RPC sẽ tăng revision ở migration tiếp theo.';
COMMENT ON COLUMN public.tournament_divisions.roster_lock_status IS 'Trạng thái khoá roster setup: open hoặc locked; chưa tự chặn các route legacy.';
COMMENT ON FUNCTION public.get_tournament_division_readiness(bigint, bigint, bigint)
  IS 'Read model readiness xác định cho một group/tournament/division; tương thích entry legacy không có pair_id.';

COMMIT;
