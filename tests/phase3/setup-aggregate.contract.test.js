'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const setupRoute = read('app/api/tournament-v2/setup/route.js');
const pairingsRoute = read('app/api/tournament-v2/pairings/route.js');
const client = read('lib/tournamentV2Client.js');

assert.match(setupRoute, /tournament_division_roster_members/);
assert.match(setupRoute, /tournament_athletes/);
assert.match(setupRoute, /tournament_pairs/);
assert.match(setupRoute, /tournament_entries/);
assert.match(setupRoute, /tournament_stages/);
assert.match(setupRoute, /roster: \{ athlete_ids:/);
assert.match(setupRoute, /setup_revision/);
assert.match(pairingsRoute, /loadDivisionRosterIds/);
assert.match(pairingsRoute, /PAIR_MEMBER_NOT_IN_ROSTER/);
assert.match(pairingsRoute, /persistedRosterIds\.length \? persistedRosterIds : requestedIds/);
assert.match(client, /export function getDivisionSetup/);

console.log('setup aggregate contract ok');
