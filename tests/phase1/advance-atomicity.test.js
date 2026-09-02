const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'database/migrations/024_atomic_stage_advance.sql');
assert.ok(fs.existsSync(migrationPath), 'migration atomic stage advance phải tồn tại');
const sql = fs.readFileSync(migrationPath, 'utf8');
const route = fs.readFileSync(path.join(root, 'app/api/tournament-v2/advance/route.js'), 'utf8');

assert.match(sql, /CREATE OR REPLACE FUNCTION public\.advance_tournament_stage/i);
assert.match(sql, /pickhub_mutation_idempotency/i);
assert.match(sql, /FOR UPDATE/i);
assert.match(sql, /RAISE EXCEPTION/i);
assert.match(route, /rpc\(['"]advance_tournament_stage['"]/);
assert.doesNotMatch(route, /\.from\(['"]tournament_stage_entrants['"]\)[\s\S]*\.delete\(\)/,
  'advance route không được xoá seed trực tiếp');
assert.doesNotMatch(route, /\.from\(['"]tournament_stage_entrants['"]\)[\s\S]*\.insert\(/,
  'advance route không được insert seed trực tiếp');
assert.doesNotMatch(route, /\.from\(['"]tournament_stages['"]\)[\s\S]*\.update\(/,
  'advance route không được update stage trực tiếp');

console.log('phase 1 atomic stage advance contract ok');
