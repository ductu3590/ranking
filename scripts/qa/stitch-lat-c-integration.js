'use strict';
// Sinh SQL kiểm thử tích hợp Lát C (MỘT transaction, ROLLBACK ở cuối). Nạp luôn thân hàm của
// migration 107 trong transaction, nên kiểm được TRƯỚC khi apply thật (DDL của Postgres có
// transaction: ROLLBACK trả lại hàm cũ). Plan dựng bằng chính buildSetupPlan.
// Dùng: node scripts/qa/stitch-lat-c-integration.js [--applied] > database/tests/stitch_lat_c_integration.sql
// --applied: 107 đã apply, bỏ thân hàm khỏi SQL (gọn để gửi qua Supabase MCP).
const fs = require('node:fs');
const path = require('node:path');
const { buildSetupPlan } = require('../../lib/tournament/setupPlans');

const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/107_finalize_v4_knockout.sql'), 'utf8')
  .replace(/\r\n/g, '\n');
const fnBody = process.argv.includes('--applied') ? '-- 107 đã apply: dùng hàm đang chạy.'
  : migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'), migration.lastIndexOf('COMMIT;'));

function scenario({ pairCount, config, seed, guest, formatKey = 'knockout' }) {
  const pairIds = Array.from({ length: pairCount }, (_, i) => `it_pair_${String(i + 1).padStart(2, '0')}`);
  const plan = buildSetupPlan({ formatKey, config, pairIds, seed, divisionId: null });
  return { pairIds, plan, config, guest, formatKey };
}

// K6: 6 cặp (2 bye), có khách, tranh hạng ba, chung kết BO3. K8: 8 cặp, không hạng ba.
const K6 = scenario({ pairCount: 6, config: { thirdPlaceEnabled: true, finalBestOf: 3 }, seed: 'it-seed-k6', guest: true });
const K8 = scenario({ pairCount: 8, config: { thirdPlaceEnabled: false, finalBestOf: 1 }, seed: 'it-seed-k8', guest: false });
// Hồi quy: hai thể thức đã chạy vẫn chốt được qua hàm mới.
const GK = scenario({ formatKey: 'group_knockout', pairCount: 7, config: { groupCount: 2, qualifiersPerGroup: 2, thirdPlaceEnabled: true, finalBestOf: 3 }, seed: 'it-seed-gk', guest: false });
const RR = scenario({ formatKey: 'round_robin', pairCount: 5, config: {}, seed: 'it-seed-rr', guest: true });
const q = (value) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

function draftSql(s, label) {
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
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', '${s.formatKey}', 'config', ${q(s.config)}),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-key-${label}', draft, 1, 'it-save-${label}-1');
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));
`;
}

// Plan sửa tay phải bị từ chối, không ghi gì.
function tamperSql(label, name, expr) {
  return `
  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-${label}-${name}', plan->>'fingerprint', ${expr});
    INSERT INTO it_result VALUES ('${label}.tampered.${name}', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('${label}.tampered.${name}', SQLERRM);
  END;`;
}

// Chốt một trận: bên A thắng 11–5 (chung kết BO3: hai ván), đi qua đúng RPC mà games route gọi.
function winSql(matchKey, games = 1) {
  const list = Array.from({ length: games }, (_, i) => `{"game_no":${i + 1},"kind":"game","score_a":11,"score_b":5,"lineup":{}}`).join(',');
  return `
  SELECT id, entry_a_id, version INTO mid, eid, ver FROM public.tournament_matches WHERE division_id = d_id AND match_key = '${matchKey}';
  r := public.replace_tournament_games_with_transitions(g, mid, '[${list}]'::jsonb, eid, 'finalized', NULL, ver, 'it-game-${matchKey}-' || d_id);
  INSERT INTO it_result VALUES ('K6.route.${matchKey}', (r->'transitions'->>'routed'));`;
}

const out = [];
out.push(`-- Kiểm thử tích hợp Lát C: migration 107 (nạp trong transaction) + tiến cấp khi thi đấu.
-- Sinh bởi scripts/qa/stitch-lat-c-integration.js. Toàn bộ trong một transaction, ROLLBACK ở cuối.
BEGIN;
${fnBody}
CREATE TEMP TABLE it_result(k text, v text) ON COMMIT DROP;
DO $it$
DECLARE
  g bigint; mid bigint; eid bigint; ver integer; members bigint[] := ARRAY[]::bigint[];
  r jsonb; r2 jsonb; t_id bigint; d_id bigint; rev bigint; draft jsonb; pairs jsonb; plan jsonb; kstage bigint;
BEGIN
  INSERT INTO public.groups(code, name, admin_password_hash, member_password_hash)
  VALUES ('itlc-' || substr(md5(random()::text), 1, 8), 'IT Lát C (rollback)', 'x', 'x') RETURNING id INTO g;
  FOR i IN 1..16 LOOP
    INSERT INTO public.club_members(group_id, full_name, is_active) VALUES (g, 'IT VĐV ' || i, true) RETURNING id INTO mid;
    INSERT INTO public.athletes(display_name, normalized_name, legacy_club_member_id) VALUES ('IT VĐV ' || i, 'it vdv ' || i, mid) ON CONFLICT (legacy_club_member_id) DO NOTHING;
    members := members || mid;
  END LOOP;`);
out.push(draftSql(K6, 'K6'));
out.push(tamperSql('K6', 'drop_match', `jsonb_set(plan, '{matches}', (plan->'matches') - 0, false) || jsonb_build_object('counts', (plan->'counts') || '{"total":5}'::jsonb)`));
out.push(tamperSql('K6', 'bye_slot_also_edge', `jsonb_set(plan, '{progressions,0,targetSlot}', to_jsonb(CASE WHEN plan->'progressions'->0->>'targetSlot' = 'a' THEN 'b' ELSE 'a' END))`));
out.push(tamperSql('K6', 'loser_to_final', `jsonb_set(plan, '{progressions}', (SELECT jsonb_agg(CASE WHEN p->'source'->>'outcome' = 'winner' AND p->>'targetMatchKey' = 'F' AND p->>'targetSlot' = 'a' THEN jsonb_set(p, '{source,outcome}', '"loser"') ELSE p END) FROM jsonb_array_elements(plan->'progressions') p))`));
out.push(tamperSql('K6', 'foreign_entry', `jsonb_set(plan, '{matches,0,entryAId}', '"it_pair_99"')`));
out.push(tamperSql('K6', 'two_stages', `jsonb_set(plan, '{stages}', (plan->'stages') || (plan->'stages'))`));
out.push(`
  INSERT INTO it_result VALUES ('K6.tampered.stages_after', (SELECT count(*) FROM public.tournament_stages WHERE division_id = d_id)::text);
  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K6', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('K6.finalize.match_count', r->>'match_count');
  SELECT id INTO kstage FROM public.tournament_stages WHERE division_id = d_id;
  INSERT INTO it_result VALUES ('K6.db.stages', (SELECT string_agg(schedule_format || ':F=' || COALESCE(config->'match_scoring'->'F'->>'best_of', '-') || ':bo=' || (config->'scoring'->>'best_of'), ',') FROM public.tournament_stages WHERE division_id = d_id));
  INSERT INTO it_result VALUES ('K6.db.entrants', (SELECT count(*) || ' label_null=' || count(*) FILTER (WHERE group_label IS NULL) FROM public.tournament_stage_entrants WHERE stage_id = kstage));
  INSERT INTO it_result VALUES ('K6.db.keys', (SELECT string_agg(match_key || '@r' || round || ':' || (CASE WHEN entry_a_id IS NULL THEN '_' ELSE 'A' END) || (CASE WHEN entry_b_id IS NULL THEN '_' ELSE 'B' END), ',' ORDER BY match_order) FROM public.tournament_matches WHERE division_id = d_id));
  INSERT INTO it_result VALUES ('K6.db.transitions', (SELECT string_agg(source_outcome || '=' || c, ',' ORDER BY source_outcome) FROM (SELECT source_outcome, count(*) c FROM public.tournament_stage_transitions WHERE division_id = d_id AND source_kind = 'match_outcome' GROUP BY 1) x));
  INSERT INTO it_result VALUES ('K6.db.guest_athlete', (SELECT concat_ws('|', source, COALESCE(athlete_id::text, 'NULL')) FROM public.tournament_athletes WHERE tournament_id = t_id AND source = 'guest'));
  INSERT INTO it_result VALUES ('K6.db.tournament_status', (SELECT status FROM public.tournaments WHERE id = t_id));
  r2 := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K6', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('K6.replay.same_response', (r2 = r)::text);
  INSERT INTO it_result VALUES ('K6.replay.matches_after', (SELECT count(*) FROM public.tournament_matches WHERE division_id = d_id)::text);`);
// Tiến cấp khi thi đấu: tứ kết → bán kết (ô bye giữ nguyên), bán kết → chung kết + hạng ba.
for (const key of ['QF2', 'QF3', 'SF1', 'SF2']) out.push(winSql(key));
out.push(`
  INSERT INTO it_result VALUES ('K6.after.SF', (SELECT string_agg(match_key || ':' || (CASE WHEN entry_a_id IS NULL THEN '_' ELSE 'A' END) || (CASE WHEN entry_b_id IS NULL THEN '_' ELSE 'B' END), ',' ORDER BY match_key) FROM public.tournament_matches WHERE division_id = d_id AND match_key IN ('SF1', 'SF2', 'F', 'BRONZE')));
  INSERT INTO it_result VALUES ('K6.after.bronze_are_sf_losers', (SELECT (b.entry_a_id = CASE WHEN s1.winner_entry_id = s1.entry_a_id THEN s1.entry_b_id ELSE s1.entry_a_id END
      AND b.entry_b_id = CASE WHEN s2.winner_entry_id = s2.entry_a_id THEN s2.entry_b_id ELSE s2.entry_a_id END)::text
    FROM public.tournament_matches b, public.tournament_matches s1, public.tournament_matches s2
    WHERE b.division_id = d_id AND b.match_key = 'BRONZE' AND s1.division_id = d_id AND s1.match_key = 'SF1' AND s2.division_id = d_id AND s2.match_key = 'SF2'));
  INSERT INTO it_result VALUES ('K6.after.final_are_sf_winners', (SELECT (f.entry_a_id = s1.winner_entry_id AND f.entry_b_id = s2.winner_entry_id)::text
    FROM public.tournament_matches f, public.tournament_matches s1, public.tournament_matches s2
    WHERE f.division_id = d_id AND f.match_key = 'F' AND s1.division_id = d_id AND s1.match_key = 'SF1' AND s2.division_id = d_id AND s2.match_key = 'SF2'));`);
out.push(winSql('BRONZE'));
out.push(winSql('F', 2));
out.push(`
  INSERT INTO it_result VALUES ('K6.done.finalized', (SELECT count(*) FILTER (WHERE status = 'finalized') || '/' || count(*) FROM public.tournament_matches WHERE division_id = d_id));`);
out.push(draftSql(K8, 'K8'));
out.push(`
  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-K8', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('K8.finalize.match_count', r->>'match_count');
  INSERT INTO it_result VALUES ('K8.db.keys', (SELECT string_agg(match_key || '@r' || round, ',' ORDER BY match_order) FROM public.tournament_matches WHERE division_id = d_id));
  INSERT INTO it_result VALUES ('K8.db.transitions', (SELECT count(*) FROM public.tournament_stage_transitions WHERE division_id = d_id)::text);
  INSERT INTO it_result VALUES ('K8.db.no_match_scoring', (SELECT (config->'match_scoring' IS NULL)::text FROM public.tournament_stages WHERE division_id = d_id));`);
for (const [label, s] of [['GK', GK], ['RR', RR]]) {
  out.push(draftSql(s, label));
  out.push(`
  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-fin-${label}', plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('${label}.finalize', (r->>'match_count') || ' trận');
  INSERT INTO it_result VALUES ('${label}.db', (SELECT string_agg(s.schedule_format || ':entrants=' || (SELECT count(*) FROM public.tournament_stage_entrants se WHERE se.stage_id = s.id), ',' ORDER BY s.stage_order) FROM public.tournament_stages s WHERE s.division_id = d_id));`);
}
out.push(`
END
$it$;
SELECT k, v FROM it_result ORDER BY k;
ROLLBACK;`);
process.stdout.write(out.join('\n') + '\n');
