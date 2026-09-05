const assert = require('assert');
const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../database/migrations/031_phase3_competition_preflight.sql');
assert(fs.existsSync(migrationPath), 'Task 1 migration preflight must exist');

const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /BEGIN\s*;/i, 'preflight must run in a transaction');
assert.match(sql, /ROLLBACK|COMMIT/i, 'preflight must close its transaction');
assert.match(sql, /tournament_stages/i, 'preflight must inspect legacy stages');
assert.match(sql, /tournament_matches/i, 'preflight must inspect legacy matches');
assert.match(sql, /tournament_entrants/i, 'preflight must inspect legacy entrants');
assert.match(sql, /orphan|ambiguous|ambigu/i, 'preflight must detect orphan or ambiguous ownership');
assert.match(sql, /draft.*active.*completed|active.*completed.*draft/is, 'preflight must document tournament status mapping');
assert.match(sql, /pending.*live.*done|live.*done.*pending/is, 'preflight must document match status mapping');
assert.match(sql, /system group|technical tenant|system_group/i, 'preflight must identify the community technical tenant');
assert.doesNotMatch(sql, /DROP\s+(TABLE|SCHEMA|DATABASE)|TRUNCATE\s+|DELETE\s+FROM\s+\w+\s*;/i, 'preflight must not contain destructive SQL');

console.log('Phase 3 Task 1 preflight contract: PASS');
