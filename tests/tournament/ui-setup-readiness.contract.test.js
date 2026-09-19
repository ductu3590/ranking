'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const client = read('lib/tournamentV2Client.js');
const drawStep = read('app/giai-dau/v2/console/steps/DrawStep.js');

assert.match(client, /error\.code = data\.code/);
assert.match(client, /error\.details = data/);
assert.match(client, /export function getSetupReadiness\(tournamentId, divisionId\)/);
assert.match(client, /request\('\/setup', \{ query: \{ tournamentId, divisionId \}, cache: 'no-store' \}\)/);
assert.match(drawStep, /getSetupReadiness/);
assert.match(drawStep, /isAdmin && Number\(tournamentId\) > 0 && Number\(divisionId\) > 0/);
assert.match(drawStep, /Phiên bản thiết lập \{readiness\.revision\}/);
assert.match(drawStep, /readinessReasons\.map/);
assert.match(drawStep, /reason\.message \|\| reason\.code/, 'readiness reason objects render their message instead of an invalid React child');

console.log('ui setup readiness contract ok');