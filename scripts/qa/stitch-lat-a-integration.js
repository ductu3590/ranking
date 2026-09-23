'use strict';
// Sinh SQL kiểm thử tích hợp Lát A (chạy trong MỘT transaction, ROLLBACK ở cuối).
// Plan dựng bằng chính buildSetupPlan để SQL nhận đúng shape route gửi.
// Dùng: node scripts/qa/stitch-lat-a-integration.js > database/tests/stitch_lat_a_integration.sql
const { buildSetupPlan } = require('../../lib/tournament/setupPlans');

function scenario({ pairCount, config, seed, guest }) {
  const pairIds = Array.from({ length: pairCount }, (_, i) => `it_pair_${String(i + 1).padStart(2, '0')}`);
  const plan = buildSetupPlan({ formatKey: 'group_knockout', config, pairIds, seed, divisionId: null });
  return { pairIds, plan, config, guest };
}

const A = scenario({ pairCount: 7, config: { groupCount: 2, qualifiersPerGroup: 2, thirdPlaceEnabled: true, finalBestOf: 3 }, seed: 'it-seed-a', guest: true });
const B = scenario({ pairCount: 9, config: { groupCount: 3, qualifiersPerGroup: 2 }, seed: 'it-seed-b', guest: false });
const q = (value) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

function draftSql(s, label) {
  // A: 13 thành viên + 1 khách = 7 cặp; B: 18 thành viên = 9 cặp.
  const memberCount = s.guest ? s.pairIds.length * 2 - 1 : s.pairIds.length * 2;
  const last = s.pairIds.length - 1;
  return `
  -- ===== Kịch bản ${label} =====
  pairs := '[]'::jsonb;
  FOR i IN 0..${last} LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', (${q(s.pairIds)})->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN ${s.guest ? 'true' : 'false'} AND i = ${last} THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := ${q(s.plan)};
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT ${label}', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT ${label}', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, ${memberCount}) k),
      'guests', ${s.guest ? `jsonb_build_array(jsonb_build_object('clientRef', 'g_it_guest_0001', 'displayName', 'Khách IT'))` : `'[]'::jsonb`}),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'group_knockout', 'config', ${q(s.config)}),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-key-${label}', draft, 1, 'it-save-${label}-1');
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  INSERT INTO it_result VALUES ('${label}.save.revision', rev::text);
  INSERT INTO it_result VALUES ('${label}.save.tournament_meta', (SELECT concat_ws('|', name, event_date, location, settings->>'start_time', settings->>'court_count') FROM public.tournaments WHERE id = t_id));
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));
`;
}

const out = [];
out.push(`-- Kiểm thử tích hợp Lát A: 099–103. Toàn bộ trong một transaction, ROLLBACK ở cuối.
BEGIN;
CREATE TEMP TABLE it_result(k text, v text) ON COMMIT DROP;
DO $it$
DECLARE
  g bigint; mid bigint; members bigint[] := ARRAY[]::bigint[];
  r jsonb; r2 jsonb; t_id bigint; d_id bigint; rev bigint; draft jsonb; pairs jsonb; plan jsonb;
  fp text; resolved jsonb; gstage bigint;
BEGIN
  INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
  VALUES ('itla-' || substr(md5(random()::text), 1, 8), 'IT Lát A (rollback)', 'x', 'x') RETURNING id INTO g;
  FOR i IN 1..18 LOOP
    INSERT INTO public.club_members(group_id, full_name, is_active) VALUES (g, 'IT VĐV ' || i, true) RETURNING id INTO mid;
    INSERT INTO public.athletes(display_name, normalized_name, legacy_club_member_id) VALUES ('IT VĐV ' || i, 'it vdv ' || i, mid) ON CONFLICT (legacy_club_member_id) DO NOTHING;
    members := members || mid;
  END LOOP;`);
out.push(draftSql(A, 'A'));
out.push(`
  -- Plan bị sửa tay (bỏ một trận) phải bị từ chối, không ghi gì.
  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-A-bad', plan->>'fingerprint', jsonb_set(plan, '{matches}', (plan->'matches') - 0));
    INSERT INTO it_result VALUES ('A.tampered', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('A.tampered', SQLERRM);
  END;
  INSERT INTO it_result VALUES ('A.tampered.stages_after', (SELECT count(*) FROM public.tournament_stages WHERE division_id = d_id)::text);

  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-A', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('A.finalize.match_count', r->>'match_count');
  INSERT INTO it_result VALUES ('A.db.stages', (SELECT string_agg(schedule_format || ':' || COALESCE(config->'match_scoring'->'F'->>'best_of', '-'), ',' ORDER BY stage_order) FROM public.tournament_stages WHERE division_id = d_id));
  INSERT INTO it_result VALUES ('A.db.matches', (SELECT count(*) FROM public.tournament_matches WHERE division_id = d_id)::text);
  INSERT INTO it_result VALUES ('A.db.ko_keys', (SELECT string_agg(match_key || '@r' || round, ',' ORDER BY match_order) FROM public.tournament_matches WHERE division_id = d_id AND group_label IS NULL));
  INSERT INTO it_result VALUES ('A.db.transitions', (SELECT string_agg(source_kind || '=' || c, ',' ORDER BY source_kind) FROM (SELECT source_kind, count(*) c FROM public.tournament_stage_transitions WHERE division_id = d_id GROUP BY 1) x));
  INSERT INTO it_result VALUES ('A.db.entries', (SELECT count(*) FROM public.tournament_entries WHERE division_id = d_id)::text);
  INSERT INTO it_result VALUES ('A.db.guest_athlete', (SELECT concat_ws('|', source, COALESCE(athlete_id::text, 'NULL'), display_name_snapshot, client_ref) FROM public.tournament_athletes WHERE tournament_id = t_id AND source = 'guest'));
  INSERT INTO it_result VALUES ('A.db.guest_entry_member', (SELECT concat_ws('|', COALESCE(em.athlete_id::text, 'NULL'), em.display_name_snapshot) FROM public.tournament_entry_members em JOIN public.tournament_entries e ON e.id = em.entry_id WHERE e.division_id = d_id AND em.display_name_snapshot = 'Khách IT'));
  INSERT INTO it_result VALUES ('A.db.group_entrants', (SELECT string_agg(group_label || '=' || c, ',' ORDER BY group_label) FROM (SELECT se.group_label, count(*) c FROM public.tournament_stage_entrants se JOIN public.tournament_stages s ON s.id = se.stage_id WHERE s.division_id = d_id AND s.stage_order = 1 GROUP BY 1) x));
  INSERT INTO it_result VALUES ('A.db.division', (SELECT roster_lock_status || '|' || (setup_draft->>'state') || '|' || (setup_draft->'draw'->>'status') FROM public.tournament_divisions WHERE id = d_id));
  INSERT INTO it_result VALUES ('A.db.tournament_status', (SELECT status FROM public.tournaments WHERE id = t_id));
  r2 := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-A', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('A.replay.same_response', (r2 = r)::text);
  INSERT INTO it_result VALUES ('A.replay.matches_after', (SELECT count(*) FROM public.tournament_matches WHERE division_id = d_id)::text);
  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-A-2', plan->>'fingerprint', plan);
    INSERT INTO it_result VALUES ('A.second_key', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('A.second_key', SQLERRM);
  END;`);
out.push(draftSql(B, 'B'));
out.push(`
  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-B', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('B.finalize.match_count', r->>'match_count');
  INSERT INTO it_result VALUES ('B.db.transitions', (SELECT string_agg(source_kind || '=' || c, ',' ORDER BY source_kind) FROM (SELECT source_kind, count(*) c FROM public.tournament_stage_transitions WHERE division_id = d_id GROUP BY 1) x));
  INSERT INTO it_result VALUES ('B.db.pool_rows', (SELECT string_agg(source_rank || '#' || source_pool_position, ',' ORDER BY source_pool_position) FROM public.tournament_stage_transitions WHERE division_id = d_id AND source_kind = 'group_rank_pool'));

  -- Tiến cấp v2: kết thúc vòng bảng, phân công 8 suất cho 8 cặp khác nhau.
  SELECT id INTO gstage FROM public.tournament_stages WHERE division_id = d_id AND stage_order = 1;
  UPDATE public.tournament_matches SET status = 'finalized', winner_entry_id = entry_a_id WHERE stage_id = gstage;
  fp := public.group_stage_results_fingerprint(g, gstage);
  SELECT jsonb_agg(jsonb_build_object('transition_id', t.id, 'entry_id', e.entry_id, 'swapped', false)) INTO resolved
  FROM (SELECT id, row_number() OVER (ORDER BY id) rn FROM public.tournament_stage_transitions WHERE source_stage_id = gstage AND source_kind IN ('group_rank', 'group_rank_pool')) t
  JOIN (SELECT entry_id, row_number() OVER (ORDER BY entry_id) rn FROM public.tournament_stage_entrants WHERE stage_id = gstage) e ON e.rn = t.rn;
  BEGIN
    PERFORM public.advance_division_group_rank_transitions_v2(g, gstage, resolved - 0, 'it-adv-B-short', fp);
    INSERT INTO it_result VALUES ('B.advance.missing_edge', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('B.advance.missing_edge', SQLERRM);
  END;
  r := public.advance_division_group_rank_transitions_v2(g, gstage, resolved, 'it-adv-B', fp);
  INSERT INTO it_result VALUES ('B.advance', r::text);
  INSERT INTO it_result VALUES ('B.advance.qf_filled', (SELECT count(*) FROM public.tournament_matches WHERE division_id = d_id AND match_key LIKE 'QF%' AND entry_a_id IS NOT NULL AND entry_b_id IS NOT NULL)::text);

  -- Migration 100: replay một lần lưu cũ không được ghi đè bản mới hơn.
  draft := (draft - 'draw') || jsonb_build_object('tournament', (draft->'tournament') || jsonb_build_object('name', 'IT C v1'));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-key-C', draft, 1, 'it-save-C-1');
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint;
  r := public.save_unified_setup_aggregate_draft(g, t_id, d_id, 'it-key-C', draft || jsonb_build_object('tournament', (draft->'tournament') || jsonb_build_object('name', 'IT C v2')), 2, 'it-save-C-2');
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-key-C', draft, 1, 'it-save-C-1');
  INSERT INTO it_result VALUES ('C.replay.flag', COALESCE(r->>'replayed', 'false'));
  INSERT INTO it_result VALUES ('C.after_replay', (SELECT (setup_draft->'tournament'->>'name') || '|rev=' || setup_revision FROM public.tournament_divisions WHERE id = d_id));
  INSERT INTO it_result VALUES ('C.tournament_name', (SELECT name FROM public.tournaments WHERE id = t_id));
  BEGIN
    PERFORM public.save_unified_setup_aggregate_draft(g, t_id, d_id, 'it-key-C', draft || jsonb_build_object('tournament', (draft->'tournament') || jsonb_build_object('location', 'khác')), 3, 'it-save-C-2');
    INSERT INTO it_result VALUES ('C.key_reuse_other_payload', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('C.key_reuse_other_payload', SQLERRM);
  END;
END
$it$;
SELECT k, v FROM it_result ORDER BY k;
ROLLBACK;`);
process.stdout.write(out.join('\n') + '\n');
