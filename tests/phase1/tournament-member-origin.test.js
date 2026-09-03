const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(
  root,
  'database/migrations/025_tournament_member_origin.sql',
);
const routePath = path.join(root, 'app/api/tournament-v2/entrants/route.js');
const preflightPath = path.join(root, 'database/audits/phase-1-schema-preflight.sql');

assert.ok(fs.existsSync(migrationPath), 'migration 025 phải tồn tại');
const migration = fs.readFileSync(migrationPath, 'utf8');
const route = fs.readFileSync(routePath, 'utf8');
const preflight = fs.readFileSync(preflightPath, 'utf8');

assert.match(migration, /ADD COLUMN IF NOT EXISTS member_group_id/i);
assert.match(migration, /tournament_entrant_members_group_member_fk/i);
assert.match(migration, /FOREIGN KEY\s*\(member_id,\s*member_group_id\)/i);
assert.match(migration, /REFERENCES\s+public\.club_members\s*\(id,\s*group_id\)/i);
assert.match(migration, /ON DELETE SET NULL\s*\(member_id,\s*member_group_id\)/i);
assert.match(migration, /member_id\s+IS NULL.*member_group_id\s+IS NULL/i);
assert.match(migration, /set_tournament_entrant_member_origin/i);
assert.match(migration, /BEFORE INSERT OR UPDATE OF member_id, member_group_id/i);
assert.ok(
  !/FOREIGN KEY\s*\(member_id,\s*group_id\).*club_members/i.test(migration),
  'không được dùng group_id của tournament làm group của member',
);

assert.match(route, /member_group_id/);
assert.match(route, /\.from\(['"]club_members['"]\)/);
assert.match(route, /select\(['"]id,\s*group_id['"]\)/);
assert.match(preflight, /member_group_id/);
assert.match(preflight, /tournament_entrant_members\.member_id/);

console.log('phase 1 tournament member origin contract ok');
