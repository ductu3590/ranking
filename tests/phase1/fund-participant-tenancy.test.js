const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'database/migrations/022_fund_participant_tenancy.sql');
assert.ok(fs.existsSync(migrationPath), 'migration participant tenancy phải tồn tại');
const sql = fs.readFileSync(migrationPath, 'utf8');
const eventsRoute = fs.readFileSync(
  path.join(root, 'app/api/club/events/route.js'),
  'utf8',
);
const preflight = fs.readFileSync(
  path.join(root, 'database/audits/phase-1-schema-preflight.sql'),
  'utf8',
);

assert.match(sql, /fund_event_participants[\s\S]*ADD COLUMN IF NOT EXISTS group_id/i);
assert.match(sql, /fund_event_participants_group_event_fk/i);
assert.match(sql, /fund_event_participants_group_member_fk/i);
assert.match(sql, /fund_event_participants[\s\S]*event_id SET NOT NULL/i);
assert.match(sql, /orphan|cross-tenant|mismatch/i);
assert.match(sql, /RAISE EXCEPTION/i);
assert.match(eventsRoute, /\.from\(['"]club_members['"]\)/);
assert.match(eventsRoute, /\.eq\(['"]group_id['"],\s*groupId\)/);
assert.match(eventsRoute, /group_id:\s*groupId/);
assert.match(preflight, /'fund_event_participants',\s*'club',\s*true/);
assert.match(preflight, /fund_event_participants\.member_id/);
assert.match(preflight, /ranking_snapshots[\s\S]*null_group_id/);

console.log('phase 1 fund participant tenancy contract ok');
