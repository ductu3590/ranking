'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/068_route_match_outcome_transitions.sql');
const route = read('app/api/tournament-v2/games/route.js');

assert.match(migration, /replace_tournament_games_with_transitions/);
assert.match(migration, /base_result := public\.replace_tournament_games/);
assert.match(migration, /source_kind = 'match_outcome'/);
assert.match(migration, /source_match_id = source_match\.id/);
assert.match(migration, /division_id IS NOT DISTINCT FROM source_match\.division_id/);
assert.match(migration, /edge\.source_outcome = 'winner'/);
assert.match(migration, /loser_id := CASE WHEN winner_id = source_match\.entry_a_id/);
assert.match(migration, /entry_a_id = CASE WHEN edge\.target_slot = 'a'/);
assert.match(migration, /entry_b_id = CASE WHEN edge\.target_slot = 'b'/);
assert.match(migration, /PLAYOFF_TARGET_CONFLICT/);
assert.match(migration, /p_parent_field/);
assert.match(migration, /FOR UPDATE/);
assert.match(migration, /SECURITY DEFINER SET search_path = public/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.replace_tournament_games_with_transitions[\s\S]*TO service_role/);
assert.match(route, /rpc\('replace_tournament_games_with_transitions'/);
assert.match(route, /p_parent_field: advancement\?\.field \|\| null/);
assert.match(route, /advanceWinner/);

console.log('match outcome transition finalization contract ok');
