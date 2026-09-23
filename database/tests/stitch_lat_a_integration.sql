-- Kiểm thử tích hợp Lát A: 099–103. Toàn bộ trong một transaction, ROLLBACK ở cuối.
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
  END LOOP;

  -- ===== Kịch bản A =====
  pairs := '[]'::jsonb;
  FOR i IN 0..6 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05","it_pair_06","it_pair_07"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN true AND i = 6 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"group_knockout","divisionId":null,"seed":"it-seed-a","layout":"2x2","stages":[{"planKey":"group-stage","name":"Vòng bảng","scheduleFormat":"round_robin","order":1,"config":{"groupCount":2,"advancePerGroup":2,"poolCount":0,"qualifiersTarget":4,"setupPlanVersion":4}},{"planKey":"knockout-stage","name":"Vòng loại trực tiếp","scheduleFormat":"knockout","order":2,"config":{"thirdPlaceEnabled":true,"setupPlanVersion":4,"match_scoring":{"F":{"best_of":3}}}}],"groups":[{"label":"A","entryIds":["it_pair_03","it_pair_02","it_pair_06","it_pair_01"]},{"label":"B","entryIds":["it_pair_07","it_pair_04","it_pair_05"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"it_pair_03","entryBId":"it_pair_01","order":1},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"it_pair_02","entryBId":"it_pair_06","order":2},{"matchKey":"GROUP-B-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":1,"entryAId":"it_pair_04","entryBId":"it_pair_05","order":3},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"it_pair_03","entryBId":"it_pair_06","order":4},{"matchKey":"GROUP-A-4","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"it_pair_01","entryBId":"it_pair_02","order":5},{"matchKey":"GROUP-B-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":2,"entryAId":"it_pair_07","entryBId":"it_pair_05","order":6},{"matchKey":"GROUP-A-5","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"it_pair_03","entryBId":"it_pair_02","order":7},{"matchKey":"GROUP-A-6","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"it_pair_06","entryBId":"it_pair_01","order":8},{"matchKey":"GROUP-B-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":3,"entryAId":"it_pair_07","entryBId":"it_pair_04","order":9},{"matchKey":"SF1","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":0,"slotA":{"kind":"progression","label":"Nhất A"},"slotB":{"kind":"progression","label":"Nhì B"},"order":10},{"matchKey":"SF2","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":1,"slotA":{"kind":"progression","label":"Nhất B"},"slotB":{"kind":"progression","label":"Nhì A"},"order":11},{"matchKey":"BRONZE","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":1,"slotA":{"kind":"progression","label":"Thua bán kết 1"},"slotB":{"kind":"progression","label":"Thua bán kết 2"},"order":12},{"matchKey":"F","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":0,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":13}],"progressions":[{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"A","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"B","rank":2}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"B","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"SF2","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"A","rank":2}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"BRONZE","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"loser"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"BRONZE","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"loser"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"counts":{"groupMatches":9,"knockoutMatches":4,"total":13},"finalBestOf":3,"warnings":["GROUP_SIZE_IMBALANCE"],"inputSignature":"{\"config\":{\"finalBestOf\":3,\"groupCount\":2,\"qualifiersPerGroup\":2,\"thirdPlaceEnabled\":true},\"formatKey\":\"group_knockout\",\"pairIds\":[\"it_pair_01\",\"it_pair_02\",\"it_pair_03\",\"it_pair_04\",\"it_pair_05\",\"it_pair_06\",\"it_pair_07\"]}","fingerprint":"c823bcb041061a2932bcc037764c11ed675f39a5ade2eb6251db9e1e817b38b6"}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT A', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT A', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 13) k),
      'guests', jsonb_build_array(jsonb_build_object('clientRef', 'g_it_guest_0001', 'displayName', 'Khách IT'))),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'group_knockout', 'config', '{"groupCount":2,"qualifiersPerGroup":2,"thirdPlaceEnabled":true,"finalBestOf":3}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-key-A', draft, 1, 'it-save-A-1');
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  INSERT INTO it_result VALUES ('A.save.revision', rev::text);
  INSERT INTO it_result VALUES ('A.save.tournament_meta', (SELECT concat_ws('|', name, event_date, location, settings->>'start_time', settings->>'court_count') FROM public.tournaments WHERE id = t_id));
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


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
  END;

  -- ===== Kịch bản B =====
  pairs := '[]'::jsonb;
  FOR i IN 0..8 LOOP
    pairs := pairs || jsonb_build_array(jsonb_build_object(
      'pairId', ('["it_pair_01","it_pair_02","it_pair_03","it_pair_04","it_pair_05","it_pair_06","it_pair_07","it_pair_08","it_pair_09"]'::jsonb)->>i,
      'participantRefs', jsonb_build_array(
        'member:' || members[2 * i + 1],
        CASE WHEN false AND i = 8 THEN 'guest:g_it_guest_0001' ELSE 'member:' || members[2 * i + 2] END),
      'locked', false));
  END LOOP;
  plan := '{"planVersion":4,"formatKey":"group_knockout","divisionId":null,"seed":"it-seed-b","layout":"3x2","stages":[{"planKey":"group-stage","name":"Vòng bảng","scheduleFormat":"round_robin","order":1,"config":{"groupCount":3,"advancePerGroup":2,"poolCount":2,"qualifiersTarget":8,"setupPlanVersion":4}},{"planKey":"knockout-stage","name":"Vòng loại trực tiếp","scheduleFormat":"knockout","order":2,"config":{"thirdPlaceEnabled":false,"setupPlanVersion":4}}],"groups":[{"label":"A","entryIds":["it_pair_02","it_pair_04","it_pair_08"]},{"label":"B","entryIds":["it_pair_03","it_pair_05","it_pair_06"]},{"label":"C","entryIds":["it_pair_07","it_pair_09","it_pair_01"]}],"matches":[{"matchKey":"GROUP-A-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":1,"entryAId":"it_pair_04","entryBId":"it_pair_08","order":1},{"matchKey":"GROUP-B-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":1,"entryAId":"it_pair_05","entryBId":"it_pair_06","order":2},{"matchKey":"GROUP-C-1","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"C","round":1,"entryAId":"it_pair_09","entryBId":"it_pair_01","order":3},{"matchKey":"GROUP-A-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":2,"entryAId":"it_pair_02","entryBId":"it_pair_08","order":4},{"matchKey":"GROUP-B-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":2,"entryAId":"it_pair_03","entryBId":"it_pair_06","order":5},{"matchKey":"GROUP-C-2","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"C","round":2,"entryAId":"it_pair_07","entryBId":"it_pair_01","order":6},{"matchKey":"GROUP-A-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"A","round":3,"entryAId":"it_pair_02","entryBId":"it_pair_04","order":7},{"matchKey":"GROUP-B-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"B","round":3,"entryAId":"it_pair_03","entryBId":"it_pair_05","order":8},{"matchKey":"GROUP-C-3","stagePlanKey":"group-stage","stageKind":"group","groupLabel":"C","round":3,"entryAId":"it_pair_07","entryBId":"it_pair_09","order":9},{"matchKey":"QF1","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":0,"slotA":{"kind":"progression","label":"Nhất A"},"slotB":{"kind":"progression","label":"Ba tốt nhất #1"},"order":10},{"matchKey":"QF2","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":1,"slotA":{"kind":"progression","label":"Nhất C"},"slotB":{"kind":"progression","label":"Nhì B"},"order":11},{"matchKey":"QF3","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":2,"slotA":{"kind":"progression","label":"Nhất B"},"slotB":{"kind":"progression","label":"Ba tốt nhất #2"},"order":12},{"matchKey":"QF4","stagePlanKey":"knockout-stage","stageKind":"knockout","round":1,"bracketSlot":3,"slotA":{"kind":"progression","label":"Nhì A"},"slotB":{"kind":"progression","label":"Nhì C"},"order":13},{"matchKey":"SF1","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":0,"slotA":{"kind":"progression","label":"Thắng tứ kết 1"},"slotB":{"kind":"progression","label":"Thắng tứ kết 2"},"order":14},{"matchKey":"SF2","stagePlanKey":"knockout-stage","stageKind":"knockout","round":2,"bracketSlot":1,"slotA":{"kind":"progression","label":"Thắng tứ kết 3"},"slotB":{"kind":"progression","label":"Thắng tứ kết 4"},"order":15},{"matchKey":"F","stagePlanKey":"knockout-stage","stageKind":"knockout","round":3,"bracketSlot":0,"slotA":{"kind":"progression","label":"Thắng bán kết 1"},"slotB":{"kind":"progression","label":"Thắng bán kết 2"},"order":16}],"progressions":[{"sourceStagePlanKey":"group-stage","targetMatchKey":"QF1","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"A","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"QF1","targetSlot":"b","source":{"kind":"group_rank_pool","rank":3,"poolPosition":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"QF2","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"C","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"QF2","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"B","rank":2}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"QF3","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"B","rank":1}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"QF3","targetSlot":"b","source":{"kind":"group_rank_pool","rank":3,"poolPosition":2}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"QF4","targetSlot":"a","source":{"kind":"group_rank","groupLabel":"A","rank":2}},{"sourceStagePlanKey":"group-stage","targetMatchKey":"QF4","targetSlot":"b","source":{"kind":"group_rank","groupLabel":"C","rank":2}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"SF1","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"QF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"SF1","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"QF2","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"SF2","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"QF3","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"SF2","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"QF4","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"a","source":{"kind":"match_outcome","matchKey":"SF1","outcome":"winner"}},{"sourceStagePlanKey":"knockout-stage","targetMatchKey":"F","targetSlot":"b","source":{"kind":"match_outcome","matchKey":"SF2","outcome":"winner"}}],"counts":{"groupMatches":9,"knockoutMatches":7,"total":16},"finalBestOf":1,"warnings":[],"inputSignature":"{\"config\":{\"groupCount\":3,\"qualifiersPerGroup\":2},\"formatKey\":\"group_knockout\",\"pairIds\":[\"it_pair_01\",\"it_pair_02\",\"it_pair_03\",\"it_pair_04\",\"it_pair_05\",\"it_pair_06\",\"it_pair_07\",\"it_pair_08\",\"it_pair_09\"]}","fingerprint":"9c8d95baa4334734aed683828e8bd06e6a453b0b26297555ad04ae6a3677f44f"}'::jsonb;
  draft := jsonb_build_object(
    'draftVersion', 3, 'currentStep', 4, 'progress', jsonb_build_object('completedThrough', 3),
    'tournament', jsonb_build_object('name', 'IT B', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT B', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, 18) k),
      'guests', '[]'::jsonb),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', 'group_knockout', 'config', '{"groupCount":3,"qualifiersPerGroup":2}'::jsonb),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-key-B', draft, 1, 'it-save-B-1');
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  INSERT INTO it_result VALUES ('B.save.revision', rev::text);
  INSERT INTO it_result VALUES ('B.save.tournament_meta', (SELECT concat_ws('|', name, event_date, location, settings->>'start_time', settings->>'court_count') FROM public.tournaments WHERE id = t_id));
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));


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
ROLLBACK;
