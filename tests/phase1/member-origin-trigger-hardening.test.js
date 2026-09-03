const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(
  root,
  'database/migrations/026_harden_member_origin_trigger.sql',
);

assert.ok(fs.existsSync(migrationPath), 'migration 026 phải tồn tại');
const migration = fs.readFileSync(migrationPath, 'utf8');

assert.match(migration, /ALTER FUNCTION\s+public\.set_tournament_entrant_member_origin\(\)\s+SET\s+search_path\s*=\s*public/i);
assert.match(migration, /search_path\s*=\s*public/i);
assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);

console.log('phase 1 member-origin trigger hardening contract ok');
