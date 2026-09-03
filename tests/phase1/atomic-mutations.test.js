const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/019_tournament_atomic_mutations.sql');
const games = read('app/api/tournament-v2/games/route.js');
const generate = read('app/api/tournament-v2/generate/route.js');
const client = read('lib/tournamentV2Client.js');

assert.match(migration, /pickhub_mutation_idempotency/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1/);
assert.match(migration, /CREATE OR REPLACE FUNCTION (?:public\.)?replace_tournament_games/);
assert.match(migration, /CREATE OR REPLACE FUNCTION (?:public\.)?replace_tournament_schedule/);
assert.match(migration, /FOR UPDATE/);
assert.match(migration, /idempotency_key/);
assert.match(migration, /RAISE EXCEPTION.*40001/s);
assert.match(migration, /REVOKE ALL ON FUNCTION/);
assert(games.includes("rpc('replace_tournament_games'"), 'games route delegate atomic RPC');
assert(generate.includes("rpc('replace_tournament_schedule'"), 'generate route delegate atomic RPC');
assert(!games.includes('.from(\'tournament_games\').delete()'), 'games route không xoá trực tiếp');
assert(!generate.includes('.from(\'tournament_matches\').delete()'), 'generate route không xoá trực tiếp');
assert(client.includes('idempotency_key') && client.includes('expected_version'), 'client gửi mutation metadata');
console.log('phase 1 atomic mutation contract ok');
