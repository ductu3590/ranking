const assert = require('assert');
const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '../../database/migrations/033_phase3_division_entry_convergence.sql');
assert(fs.existsSync(migrationPath), 'Task 3 convergence migration must exist');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /division_id/i, 'migration must add division_id');
assert.match(sql, /entry_a_id/i, 'migration must add entry_a_id');
assert.match(sql, /entry_b_id/i, 'migration must add entry_b_id');
assert.match(sql, /winner_entry_id/i, 'migration must add winner_entry_id');
assert.match(sql, /active\s*(?:→|->)\s*registration_open/i, 'migration must record active mapping decision');
assert.match(sql, /done\s*(?:→|->)\s*finalized/i, 'migration must record done mapping decision');
assert.match(sql, /tournament_entries/i, 'new graph must reference tournament_entries');
assert.match(sql, /DROP\s+CONSTRAINT/i, 'migration must replace legacy status checks safely');
assert.doesNotMatch(sql, /DROP\s+TABLE|TRUNCATE\s+|DELETE\s+FROM\s+\w+\s*;/i, 'migration must not destroy data');

console.log('Phase 3 Task 3 migration contract: PASS');
