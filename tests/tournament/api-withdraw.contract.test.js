'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = require('node:assert/strict');
const route = read('app/api/tournament-v2/withdraw/route.js');
const migration = read('database/migrations/096_tournament_walkover_withdraw.sql');
const client = read('lib/tournamentV2Client.js');

assert.match(route, /requireTournamentAccess/, 'withdraw requires tournament write access');
assert.match(route, /withdraw_tournament_match_walkover/, 'route delegates atomic state change to RPC');
assert.match(route, /writeOperationLog/, 'withdraw records an operation log');
assert.match(migration, /DELETE FROM public\.tournament_games|replace_tournament_games_with_transitions/, 'withdraw removes in-progress games through atomic game replacement');
assert.match(migration, /result_type = 'walkover'/, 'withdraw stores W.O. result type');
assert.match(migration, /wins_needed := \(best_of \+ 1\) \/ 2/, 'withdraw stores the minimum BO game count');
assert.match(migration, /MATCH_ALREADY_FINALIZED/, 'completed matches cannot be converted to W.O. later');
assert.match(migration, /TO service_role/, 'RPC is server-only');
assert.match(client, /withdrawMatch/, 'browser calls the server route through client wrapper');

console.log('withdraw API contract ok');