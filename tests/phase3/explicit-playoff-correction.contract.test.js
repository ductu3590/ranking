'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/069_atomic_graph_aware_result_correction.sql');
const route = read('app/api/tournament-v2/corrections/route.js');

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.tournament_result_correction_mutations/);
assert.match(migration, /UNIQUE \(group_id, idempotency_key\)/);
assert.match(migration, /apply_tournament_result_correction_graph_aware/);
assert.match(migration, /source_kind = 'match_outcome'/);
assert.match(migration, /target_match\.status <> 'pending'/);
assert.match(migration, /CORRECTION_BLOCKED_DOWNSTREAM/);
assert.match(migration, /PLAYOFF_TARGET_CONFLICT/);
assert.match(migration, /tournament_result_corrections/);
assert.match(migration, /GRANT EXECUTE .* TO service_role/);
assert.match(route, /tournament_stage_transitions/);
assert.match(route, /apply_tournament_result_correction_graph_aware/);
assert.match(route, /expected_version và idempotency_key/);
assert.doesNotMatch(route, /\.from\('tournament_games'\)\s*\.delete\(/);

console.log('explicit playoff correction contract ok');
