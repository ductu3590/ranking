'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = require('node:assert/strict');

const results = read('app/giai-dau/v2/console/tabs/ResultsTab.js');
const publicRoute = read('app/api/tournament-v2/public/route.js');
assert.match(results, /result_type === 'walkover'/, 'results UI recognizes walkover result type');
assert.match(results, /W\.O\./, 'results UI renders W.O. label');
assert.match(publicRoute, /result_type/, 'public match projection includes W.O. result type');
console.log('walkover UI contract ok');