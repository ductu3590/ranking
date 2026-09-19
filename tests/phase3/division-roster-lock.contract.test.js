'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/063_division_roster_lock_and_draw_readiness.sql');
const setupRoute = read('app/api/tournament-v2/setup/route.js');
const drawRoute = read('app/api/tournament-v2/draw/route.js');
const client = read('lib/tournamentV2Client.js');

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.tournament_division_roster_members/);
assert.match(migration, /UNIQUE \(group_id, division_id, tournament_athlete_id\)/);
assert.match(migration, /assert_tournament_division_roster_member_scope/);
assert.match(migration, /replace_tournament_division_roster_revisioned/);
assert.match(migration, /set_tournament_division_roster_lock_revisioned/);
assert.match(migration, /SETUP_REVISION_CONFLICT/);
assert.match(migration, /IDEMPOTENCY_KEY_REUSED/);
assert.match(migration, /ROSTER_UNLOCK_BLOCKED/);
assert.match(migration, /PAIR_MEMBER_NOT_IN_ROSTER/);
assert.match(migration, /ROSTER_ATHLETE_UNPAIRED/);
assert.match(migration, /roster_source/);
assert.match(migration, /SECURITY DEFINER SET search_path = public/g);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.replace_tournament_division_roster_revisioned/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.replace_tournament_division_roster_revisioned[\s\S]*TO service_role/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.finalize_tournament_draw/);
assert.match(migration, /readiness:=public\.get_tournament_division_readiness/);
assert.match(migration, /SETUP_NOT_READY/);
assert.match(migration, /e\.status='approved'/);

assert.match(setupRoute, /action === 'replace_roster'/);
assert.match(setupRoute, /action === 'lock_roster'/);
assert.match(setupRoute, /action === 'unlock_roster'/);
assert.match(setupRoute, /expected_setup_revision/);
assert.match(setupRoute, /requireValidatedGroupAdmin/);
assert.match(drawRoute, /loadSetupReadiness/);
assert.match(drawRoute, /SETUP_NOT_READY/);
assert.match(drawRoute, /\.eq\('status', 'approved'\)/);
assert.match(client, /export function saveDivisionRoster/);
assert.match(client, /export function lockDivisionRoster/);
assert.match(client, /export function unlockDivisionRoster/);

console.log('division roster lock contract ok');
