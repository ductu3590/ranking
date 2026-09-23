'use strict';

const { assert, read } = require('../_harness');

const migration = read('database/migrations/092_internal_doubles_group_knockout_finalize.sql');

assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.finalize_internal_doubles_group_knockout_v2'), 'migration provides the dedicated internal doubles finalizer');
assert.ok(migration.includes('SECURITY DEFINER SET search_path = public'), 'RPC pins its security-definer search path');
assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.finalize_internal_doubles_group_knockout_v2') && migration.includes('TO service_role'), 'RPC is service-role only');
assert.ok(migration.includes('setup_draft') && !migration.includes('p_stage_plan jsonb'), 'finalizer reads the persisted aggregate rather than a client stage plan');
assert.ok(migration.includes("'organizerMode','') <> 'internal'") && migration.includes("'group_knockout'") && migration.includes('jsonb_array_length(v_pairs) <> 7') && migration.includes('jsonb_array_length(v_selected) <> 14'), 'finalizer narrowly accepts the 14-member internal doubles group-knockout case');
assert.ok(migration.includes('jsonb_array_length(v_reserves) <> 0') && migration.includes('jsonb_array_length(v_unpaired) <> 0'), 'reserves and unpaired members block finalization');
assert.ok(migration.includes("a.legacy_club_member_id") && migration.includes("public.club_members cm"), 'member identities are resolved through club_members and the legacy athlete relation');
assert.ok(migration.includes("v_draw->>'previewFingerprint'") && migration.includes('DRAW_FINGERPRINT_MISSING') && migration.includes('DRAW_FINGERPRINT_MISMATCH'), 'finalizer validates the canonical plan fingerprint persisted with the saved draw');
assert.ok(!migration.includes('DO UPDATE SET updated_at=now()') && migration.includes('TOURNAMENT_ATHLETE_CLUB_SCOPE_MISMATCH'), 'finalizer avoids invalid host-club updates and scopes reused tournament athletes');
assert.ok(migration.includes('FINALIZE_STRUCTURE_ALREADY_EXISTS') && migration.includes('tournament_stage_transitions') && migration.includes('tournament_games'), 'existing graph, fixtures, and results block partial or repeated materialization');
assert.ok(migration.includes("'Vòng bảng','round_robin'") && migration.includes("'Chung kết','knockout'"), 'two persisted stages are created in the division');
assert.ok(migration.includes("'GROUP-'||v_group_label||'-'||v_match_order") && migration.includes("'SF1'") && migration.includes("'SF2'") && migration.includes("'F'") && migration.includes("'BRONZE'"), 'materialization creates nine group fixtures and pending playoff frames');
assert.ok(migration.includes("'group_rank','A',1") && migration.includes("'group_rank','B',2") && migration.includes("'match_outcome',v_sf1,'winner'") && migration.includes("'match_outcome',v_sf2,'winner'"), 'the explicit rank and match-outcome transition graph is persisted');
assert.ok(migration.includes("roster_lock_status='locked'") && migration.includes("'{state}','\"finalized\"'::jsonb") && migration.includes("'{draw,status}','\"locked\"'::jsonb") && migration.includes("'finalize_internal_doubles_group_knockout_v2'"), 'successful finalization locks roster, persists final state, bumps revision, and caches the response');
assert.ok(!/\bDROP\b|\bTRUNCATE\b/.test(migration), 'migration remains additive and non-destructive');

console.log('internal doubles group knockout finalize migration contract ok');
