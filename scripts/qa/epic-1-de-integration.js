'use strict';
// Sinh SQL kiểm thử tích hợp Epic 1 — loại kép (MỘT transaction, ROLLBACK ở cuối). Nạp luôn
// migration 108 (CHECK + thân hàm) trong transaction, nên kiểm được TRƯỚC khi apply thật (DDL của
// Postgres có transaction: ROLLBACK trả lại hàm và CHECK cũ). Plan dựng bằng chính buildSetupPlan.
// Dữ liệu tạm nằm trong CLB test 59 (roadmap §1.6), tạo và bỏ trong cùng transaction.
// Dùng: node scripts/qa/epic-1-de-integration.js [--applied] > database/tests/epic_1_de_integration.sql
// --applied: 108 đã apply, bỏ phần DDL/thân hàm khỏi SQL (gọn để gửi qua Supabase MCP).
// --only=D7,KO: chỉ sinh các kịch bản nêu tên (chia nhỏ khi gửi qua MCP). Mặc định: tất cả.
const fs = require('node:fs');
const path = require('node:path');
const { buildSetupPlan } = require('../../lib/tournament/setupPlans');

const GROUP_ID = 59;
const migration = fs.readFileSync(path.join(__dirname, '../../database/migrations/108_finalize_v4_double_elim.sql'), 'utf8')
  .replace(/\r\n/g, '\n');
const ddl = process.argv.includes('--applied') ? '-- 108 đã apply: dùng CHECK và hàm đang chạy.'
  : migration.slice(migration.indexOf('BEGIN;') + 'BEGIN;'.length, migration.lastIndexOf('COMMIT;'));

// Chỉ giữ các trường RPC đọc (tên/nhãn hiển thị bỏ đi) để SQL đủ gọn gửi qua Supabase MCP.
// Fingerprint giữ nguyên giá trị của plan đầy đủ: RPC chỉ so nó với bản nháp, không tính lại.
const MATCH_FIELDS = ['matchKey', 'stagePlanKey', 'stageKind', 'round', 'bracketSlot', 'groupLabel', 'order', 'entryAId', 'entryBId'];
function compact(plan) {
  const pick = (object, fields) => Object.fromEntries(fields.filter((field) => object[field] !== undefined).map((field) => [field, object[field]]));
  return {
    ...pick(plan, ['planVersion', 'formatKey', 'seed', 'fingerprint', 'stages', 'groups', 'progressions']),
    matches: plan.matches.map((match) => pick(match, MATCH_FIELDS)),
    counts: { total: plan.counts.total },
  };
}

function scenario({ pairCount, config, seed, guest, formatKey = 'double_elimination' }) {
  const pairIds = Array.from({ length: pairCount }, (_, i) => `it_pair_${String(i + 1).padStart(2, '0')}`);
  const plan = compact(buildSetupPlan({ formatKey, config, pairIds, seed, divisionId: null }));
  return { pairIds, plan, config, guest, formatKey };
}

// D7: 7 cặp (1 bye), có khách, GF BO3. D5: 5 cặp (3 bye, mất trọn vòng L1 engine). D12: 12 cặp.
const D7 = scenario({ pairCount: 7, config: { finalBestOf: 3 }, seed: 'it-seed-d7', guest: true });
const D5 = scenario({ pairCount: 5, config: { finalBestOf: 1 }, seed: 'it-seed-d5', guest: false });
const D12 = scenario({ pairCount: 12, config: { finalBestOf: 1 }, seed: 'it-seed-d12', guest: false });
// Hồi quy: ba thể thức đã chạy vẫn chốt được qua hàm mới.
const KO = scenario({ formatKey: 'knockout', pairCount: 6, config: { thirdPlaceEnabled: true, finalBestOf: 3 }, seed: 'it-seed-ko', guest: false });
const GK = scenario({ formatKey: 'group_knockout', pairCount: 7, config: { groupCount: 2, qualifiersPerGroup: 2, thirdPlaceEnabled: true, finalBestOf: 3 }, seed: 'it-seed-gk', guest: false });
const RR = scenario({ formatKey: 'round_robin', pairCount: 5, config: {}, seed: 'it-seed-rr', guest: true });
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;
const wanted = (label) => !only || only.has(label);
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
    'tournament', jsonb_build_object('name', 'IT DE ${label}', 'eventDate', '2026-10-12', 'startTime', '07:30', 'courtCount', 3, 'location', 'Sân IT', 'organizerMode', 'internal'),
    'division', jsonb_build_object('name', 'IT DE ${label}', 'playType', 'doubles'),
    'participants', jsonb_build_object(
      'memberIds', (SELECT jsonb_agg(members[k]::text ORDER BY k) FROM generate_series(1, ${memberCount}) k),
      'guests', ${s.guest ? `jsonb_build_array(jsonb_build_object('clientRef', 'g_it_guest_0001', 'displayName', 'Khách IT'))` : `'[]'::jsonb`}),
    'format', jsonb_build_object('entrantType', 'doubles', 'formatKey', '${s.formatKey}', 'config', ${q(s.config)}),
    'pairs', pairs, 'unpairedRefs', '[]'::jsonb,
    'draw', jsonb_build_object('status', 'draft', 'seed', plan->>'seed', 'previewFingerprint', plan->>'fingerprint', 'plan', plan));
  r := public.save_unified_setup_aggregate_draft(g, NULL, NULL, 'it-de-key-${label}-' || salt, draft, 1, 'it-de-save-${label}-' || salt);
  t_id := (r->>'tournament_id')::bigint; d_id := (r->>'division_id')::bigint; rev := (r->>'setup_revision')::bigint;
  plan := plan || jsonb_build_object('pairs', (SELECT jsonb_agg(jsonb_build_object('pairId', p->>'pairId', 'refs', p->'participantRefs')) FROM jsonb_array_elements(pairs) p));
`;
}

// Plan sửa tay phải bị từ chối, không ghi gì.
function tamperSql(label, name, expr) {
  return `
  BEGIN
    PERFORM public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-${label}-${name}-' || salt, plan->>'fingerprint', ${expr});
    INSERT INTO it_result VALUES ('${label}.tampered.${name}', 'NOT_REJECTED');
  EXCEPTION WHEN OTHERS THEN INSERT INTO it_result VALUES ('${label}.tampered.${name}', SQLERRM);
  END;`;
}

// Chơi hết giải theo match_order qua đúng RPC mà games route gọi. Bên thắng: A ở mọi trận, riêng
// GF cho B (cặp từ nhánh thua) thắng — kiểm "không đá lại" (D14). Sau mỗi trận so số cạnh được
// định tuyến với số cạnh đi ra của trận.
function playAllSql(label, gfBestOf) {
  return `
  anomalies := 0;
  FOR mrow IN SELECT id, match_key FROM public.tournament_matches WHERE division_id = d_id ORDER BY match_order LOOP
    SELECT entry_a_id, entry_b_id, version INTO ea, eb, ver FROM public.tournament_matches WHERE id = mrow.id;
    IF ea IS NULL OR eb IS NULL THEN
      anomalies := anomalies + 1;
      INSERT INTO it_result VALUES ('${label}.play.missing_side.' || mrow.match_key, concat_ws('/', ea, eb));
      CONTINUE;
    END IF;
    games := CASE WHEN mrow.match_key = 'GF'
      THEN (SELECT jsonb_agg(jsonb_build_object('game_no', k, 'kind', 'game', 'score_a', 5, 'score_b', 11, 'lineup', '{}'::jsonb)) FROM generate_series(1, ${Math.ceil(gfBestOf / 2)}) k)
      ELSE '[{"game_no":1,"kind":"game","score_a":11,"score_b":5,"lineup":{}}]'::jsonb END;
    r := public.replace_tournament_games_with_transitions(g, mrow.id, games, CASE WHEN mrow.match_key = 'GF' THEN eb ELSE ea END,
      'finalized', NULL, ver, 'it-de-game-' || mrow.id);
    IF (r->'transitions'->>'routed')::integer <> (SELECT count(*) FROM public.tournament_stage_transitions WHERE source_match_id = mrow.id) THEN
      anomalies := anomalies + 1;
      INSERT INTO it_result VALUES ('${label}.play.routed.' || mrow.match_key, r->'transitions'->>'routed');
    END IF;
  END LOOP;
  INSERT INTO it_result VALUES ('${label}.play.anomalies', anomalies::text);
  INSERT INTO it_result VALUES ('${label}.done.finalized', (SELECT count(*) FILTER (WHERE status = 'finalized') || '/' || count(*) FROM public.tournament_matches WHERE division_id = d_id));
  -- Luật "thua hai trận mới bị loại": đếm số trận thua của mỗi cặp.
  INSERT INTO it_result VALUES ('${label}.done.losses', (SELECT string_agg(losses || 'x' || c, ',' ORDER BY losses) FROM (
    SELECT losses, count(*) c FROM (
      SELECT e.id, (SELECT count(*) FROM public.tournament_matches m WHERE m.division_id = d_id AND m.status = 'finalized'
                    AND e.id IN (m.entry_a_id, m.entry_b_id) AND m.winner_entry_id <> e.id) losses
      FROM public.tournament_entries e WHERE e.division_id = d_id) x GROUP BY losses) y));
  INSERT INTO it_result VALUES ('${label}.done.gf_sources', (SELECT (gf.entry_a_id = wf.winner_entry_id AND gf.entry_b_id = lf.winner_entry_id)::text
    FROM public.tournament_matches gf, public.tournament_matches wf, public.tournament_matches lf
    WHERE gf.division_id = d_id AND gf.match_key = 'GF' AND wf.division_id = d_id AND wf.match_key = 'WF' AND lf.division_id = d_id AND lf.match_key = 'LF'));
  INSERT INTO it_result VALUES ('${label}.done.lf_has_wf_loser', (SELECT (CASE WHEN wf.winner_entry_id = wf.entry_a_id THEN wf.entry_b_id ELSE wf.entry_a_id END IN (lf.entry_a_id, lf.entry_b_id))::text
    FROM public.tournament_matches wf, public.tournament_matches lf
    WHERE wf.division_id = d_id AND wf.match_key = 'WF' AND lf.division_id = d_id AND lf.match_key = 'LF'));
  SELECT id INTO kstage FROM public.tournament_stages WHERE division_id = d_id;
  SELECT winner_entry_id INTO champ FROM public.tournament_matches WHERE division_id = d_id AND match_key = 'GF';
  r := public.advance_division_entry_stage(g, kstage, NULL, jsonb_build_array(jsonb_build_object('entry_id', champ)), 'it-de-adv-' || d_id);
  INSERT INTO it_result VALUES ('${label}.done.advance', concat_ws('|', r->>'final', (SELECT status FROM public.tournament_stages WHERE id = kstage)));`;
}

const out = [];
out.push(`-- Kiểm thử tích hợp Epic 1 (loại kép): migration 108 (nạp trong transaction) + chơi hết giải.
-- Sinh bởi scripts/qa/epic-1-de-integration.js. Toàn bộ trong một transaction, ROLLBACK ở cuối.
BEGIN;
${ddl}
CREATE TEMP TABLE it_result(k text, v text) ON COMMIT DROP;
DO $it$
DECLARE
  g bigint := ${GROUP_ID}; salt text := substr(md5(random()::text), 1, 8);
  mid bigint; ea bigint; eb bigint; ver integer; champ bigint; members bigint[] := ARRAY[]::bigint[];
  r jsonb; r2 jsonb; t_id bigint; d_id bigint; rev bigint; draft jsonb; pairs jsonb; plan jsonb; games jsonb;
  kstage bigint; anomalies integer; mrow record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = g) THEN RAISE EXCEPTION 'CLB test % không tồn tại', g; END IF;
  FOR i IN 1..24 LOOP
    INSERT INTO public.club_members(group_id, full_name, is_active) VALUES (g, 'IT DE VĐV ' || i || ' ' || salt, true) RETURNING id INTO mid;
    INSERT INTO public.athletes(display_name, normalized_name, legacy_club_member_id) VALUES ('IT DE VĐV ' || i, 'it de vdv ' || i, mid) ON CONFLICT (legacy_club_member_id) DO NOTHING;
    members := members || mid;
  END LOOP;`);

if (wanted('D7')) {
out.push(draftSql(D7, 'D7'));
out.push(tamperSql('D7', 'drop_match', `jsonb_set(plan, '{matches}', (plan->'matches') - 0, false) || jsonb_build_object('counts', (plan->'counts') || '{"total":11}'::jsonb)`));
out.push(tamperSql('D7', 'slot_two_sources', `jsonb_set(plan, '{progressions,0,targetSlot}', to_jsonb(CASE WHEN plan->'progressions'->0->>'targetSlot' = 'a' THEN 'b' ELSE 'a' END))`));
out.push(tamperSql('D7', 'loser_edge_as_winner', `jsonb_set(plan, '{progressions}', (SELECT jsonb_agg(CASE WHEN p->>'targetMatchKey' = 'LF' AND p->'source'->>'matchKey' = 'WF' THEN jsonb_set(p, '{source,outcome}', '"winner"') ELSE p END) FROM jsonb_array_elements(plan->'progressions') p))`));
out.push(tamperSql('D7', 'winner_edge_as_loser_from_L', `jsonb_set(plan, '{progressions}', (SELECT jsonb_agg(CASE WHEN p->>'targetMatchKey' = 'GF' AND p->'source'->>'matchKey' = 'LF' THEN jsonb_set(p, '{source,outcome}', '"loser"') ELSE p END) FROM jsonb_array_elements(plan->'progressions') p))`));
out.push(tamperSql('D7', 'grand_final_reset', `jsonb_set(plan, '{stages,0,config,grandFinalReset}', 'true')`));
out.push(tamperSql('D7', 'two_stages', `jsonb_set(plan, '{stages}', (plan->'stages') || (plan->'stages'))`));
out.push(tamperSql('D7', 'renamed_lf', `jsonb_set(plan, '{matches}', (SELECT jsonb_agg(CASE WHEN m->>'matchKey' = 'LF' THEN m || '{"matchKey":"W9-9"}'::jsonb ELSE m END) FROM jsonb_array_elements(plan->'matches') m))`));
out.push(`
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
  INSERT INTO it_result VALUES ('D7.replay.matches_after', (SELECT count(*) FROM public.tournament_matches WHERE division_id = d_id)::text);`);
out.push(playAllSql('D7', 3));
}

for (const [label, s] of [['D5', D5], ['D12', D12]].filter(([label]) => wanted(label))) {
  out.push(draftSql(s, label));
  out.push(`
  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-${label}-' || salt, plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('${label}.finalize.match_count', r->>'match_count');
  INSERT INTO it_result VALUES ('${label}.db.keys', (SELECT string_agg(match_key || '@r' || round, ',' ORDER BY match_order) FROM public.tournament_matches WHERE division_id = d_id));`);
  out.push(playAllSql(label, 1));
}

for (const [label, s] of [['KO', KO], ['GK', GK], ['RR', RR]].filter(([label]) => wanted(label))) {
  out.push(draftSql(s, label));
  out.push(`
  r := public.finalize_internal_setup_v4(g, t_id, d_id, rev, 'it-de-fin-${label}-' || salt, plan->>'fingerprint', plan);
  INSERT INTO it_result VALUES ('${label}.finalize', (r->>'match_count') || ' trận');
  INSERT INTO it_result VALUES ('${label}.db', (SELECT string_agg(s.schedule_format || ':entrants=' || (SELECT count(*) FROM public.tournament_stage_entrants se WHERE se.stage_id = s.id), ',' ORDER BY s.stage_order) FROM public.tournament_stages s WHERE s.division_id = d_id));`);
}
out.push(`
END
$it$;
SELECT k, v FROM it_result ORDER BY k;
ROLLBACK;`);
process.stdout.write(out.join('\n') + '\n');
