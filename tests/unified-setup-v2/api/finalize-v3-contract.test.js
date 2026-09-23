'use strict';

const { assert, read } = require('../_harness');

const migration = read('database/migrations/095_unified_setup_finalize_v3.sql');
const route = read('app/api/tournament-v2/setup/finalize/route.js');

assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.finalize_internal_doubles_group_knockout_v3'), 'migration defines finalizer v3');
assert.ok(migration.includes('SECURITY DEFINER SET search_path = public') && migration.includes('TO service_role'), 'v3 is security-definer and service-role only');
assert.ok(migration.includes("'{participants,selectedMemberIds}'") && migration.includes("'memberIds'"), 'v3 adapts aggregate-v3 memberIds only inside its transaction');
assert.ok(migration.includes("'{reserveMemberIds}'") && migration.includes("'[]'::jsonb"), 'v3 supplies no reserves to the legacy materializer');
assert.ok(migration.includes("'{state}', '\"finalized\"'::jsonb") && migration.includes("'{draw,status}', '\"locked\"'::jsonb"), 'v3 restores the authoritative aggregate and records lifecycle state');
assert.ok(migration.includes("jsonb_build_object('round_scoring'") && migration.includes("'roundScoring'->'group'") && migration.includes("'roundScoring'->'knockout'"), 'v3 writes BO round_scoring into the two persisted stage configs');
assert.ok(migration.includes('DRAW_FINGERPRINT_MISMATCH') && migration.includes('SETUP_REVISION_CONFLICT'), 'v3 guards canonical fingerprint and revision');
assert.ok(migration.includes("'finalize_internal_doubles_group_knockout_v2'") && migration.includes('idempotent_replay'), 'v3 replays the v2 atomic writer response on a safe retry');
assert.ok(!/tournament_matches\.best_of|ADD COLUMN[^;]*best_of/i.test(migration), 'v3 does not add per-match BO storage');
// ADR-006 (Lát A): route chốt giải dùng finalize_internal_setup_v4; v3 giữ lại cho dữ liệu cũ.
assert.ok(!route.includes('finalize_internal_doubles_group_knockout_v3'), 'luồng mới không gọi v3');

console.log('unified setup finalize v3 contract ok');