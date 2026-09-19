'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/065_explicit_playoff_transition_graph.sql');
const setupRoute = read('app/api/tournament-v2/setup/route.js');
const client = read('lib/tournamentV2Client.js');

assert.match(migration, /ADD COLUMN IF NOT EXISTS match_key text/);
assert.match(migration, /idx_tournament_matches_stage_match_key/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.tournament_stage_transitions/);
assert.match(migration, /source_kind IN \('group_rank', 'match_outcome'\)/);
assert.match(migration, /target_slot IN \('a', 'b'\)/);
assert.match(migration, /UNIQUE \(group_id, target_match_id, target_slot\)/);
assert.match(migration, /IS DISTINCT FROM NEW\.division_id/);
assert.match(migration, /configure_top_two_group_playoff_revisioned/);
assert.match(migration, /'SF1'/);
assert.match(migration, /'SF2'/);
assert.match(migration, /'F'/);
assert.match(migration, /'BRONZE'/);
assert.match(migration, /'A',1/);
assert.match(migration, /'B',2/);
assert.match(migration, /'B',1/);
assert.match(migration, /'A',2/);
assert.match(migration, /sf1,'winner'/);
assert.match(migration, /sf2,'winner'/);
assert.match(migration, /sf1,'loser'/);
assert.match(migration, /sf2,'loser'/);
assert.match(migration, /SECURITY DEFINER SET search_path = public/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.configure_top_two_group_playoff_revisioned[\s\S]*TO service_role/);
assert.match(setupRoute, /action === 'configure_top_two_playoff'/);
assert.match(client, /export function configureTopTwoPlayoff/);

console.log('explicit playoff transition contract ok');
