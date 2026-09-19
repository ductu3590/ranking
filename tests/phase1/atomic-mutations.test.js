const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/019_tournament_atomic_mutations.sql');
const games = read('app/api/tournament-v2/games/route.js');
const generate = read('app/api/tournament-v2/generate/route.js');
// Logic sinh lịch đã tách sang module dùng chung cho cả route `generate` và
// route `draw` (lúc chốt bốc thăm). Lời gọi RPC nguyên tử nằm ở đó.
const generateLib = read('lib/tournament/generateSchedule.js');
const client = read('lib/tournamentV2Client.js');

assert.match(migration, /pickhub_mutation_idempotency/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1/);
assert.match(migration, /CREATE OR REPLACE FUNCTION (?:public\.)?replace_tournament_games/);
assert.match(migration, /CREATE OR REPLACE FUNCTION (?:public\.)?replace_tournament_schedule/);
assert.match(migration, /FOR UPDATE/);
assert.match(migration, /idempotency_key/);
assert.match(migration, /RAISE EXCEPTION.*40001/s);
assert.match(migration, /REVOKE ALL ON FUNCTION/);
// Route `games` nay goi `replace_tournament_games_with_transitions` (migration
// 068): van la MOT RPC nguyen tu, nhung lam them viec dinh tuyen ket qua sang
// tran vong sau trong cung transaction. Khang dinh can bao ve khong doi — "route
// uy quyen cho mot RPC nguyen tu, khong tu ghi bang" — nen o day chap nhan ca hai
// ten va SIET them: bat buoc co CAS `p_expected_version` va idempotency key.
assert(
  /rpc\('replace_tournament_games(_with_transitions)?'/.test(games),
  'games route delegate atomic RPC',
);
assert(games.includes('p_expected_version'), 'games route gui CAS version');
assert(games.includes('p_idempotency_key'), 'games route gui idempotency key');
assert(generateLib.includes("'replace_tournament_schedule'"), 'sinh lịch delegate atomic RPC');
assert(generateLib.includes('p_idempotency_key'), 'sinh lịch gửi idempotency key');
assert(generate.includes('generateAndPersistSchedule'), 'generate route đi qua module dùng chung');
assert(!games.includes('.from(\'tournament_games\').delete()'), 'games route không xoá trực tiếp');
assert(!generate.includes('.from(\'tournament_matches\').delete()'), 'generate route không xoá trực tiếp');
assert(client.includes('idempotency_key') && client.includes('expected_version'), 'client gửi mutation metadata');
console.log('phase 1 atomic mutation contract ok');
