const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(
  root,
  'database/migrations/027_index_member_origin_fk.sql',
);

assert.ok(fs.existsSync(migrationPath), 'migration 027 phải tồn tại');
const migration = fs.readFileSync(migrationPath, 'utf8');

assert.match(
  migration,
  /CREATE INDEX IF NOT EXISTS[\s\S]*tournament_entrant_members[\s\S]*\(member_id,\s*member_group_id\)/i,
);
assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);

console.log('phase 1 member-origin FK index contract ok');
