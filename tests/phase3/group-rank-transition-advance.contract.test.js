'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/067_advance_group_rank_transitions.sql');
const hardeningMigration = read('database/migrations/073_fix_group_rank_advance_variable_ambiguity.sql');
const route = read('app/api/tournament-v2/advance/route.js');

assert.match(migration, /advance_division_group_rank_transitions/);
assert.match(migration, /source_kind='group_rank'/);
assert.match(migration, /GROUP_RANKING_MISSING/);
assert.match(migration, /PLAYOFF_TARGET_CONFLICT/);
assert.match(migration, /entry_a_id=CASE WHEN edge\.target_slot='a'/);
assert.match(migration, /entry_b_id=CASE WHEN edge\.target_slot='b'/);
assert.match(migration, /tournament_stage_entrants/);
assert.match(migration, /SECURITY DEFINER SET search_path = public/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.advance_division_group_rank_transitions[\s\S]*TO service_role/);
assert.match(hardeningMigration, /v_entry_id bigint/);
assert.match(hardeningMigration, /e\.id=v_entry_id/);
assert.match(hardeningMigration, /VALUES\(p_group_id,edge\.target_stage_id,s\.division_id,v_entry_id/);
assert.doesNotMatch(hardeningMigration, /DECLARE[\s\S]*\bentry_id bigint/);
assert.match(route, /from\('tournament_stage_transitions'\)/);
assert.match(route, /source_kind', 'group_rank'/);
assert.match(route, /db\.rpc\('advance_division_group_rank_transitions'/);
assert.match(route, /p_ranked: ranked/);

console.log('group rank transition advance contract ok');
