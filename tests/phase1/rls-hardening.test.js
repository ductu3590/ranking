const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'database/migrations/021_phase1_rls_hardening.sql');
assert.ok(fs.existsSync(migrationPath), 'migration RLS hardening phải tồn tại');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /ALTER TABLE public\.ranking_snapshots ENABLE ROW LEVEL SECURITY/i);
assert.match(sql, /REVOKE ALL ON TABLE public\.ranking_snapshots FROM PUBLIC, anon, authenticated/i);
assert.match(sql, /DROP POLICY IF EXISTS ["']Public read fund_events["']/i);
assert.match(sql, /DROP POLICY IF EXISTS ["']Public read fund_event_participants["']/i);
assert.match(sql, /DROP POLICY IF EXISTS ["']Authenticated manage fund_events["']/i);
assert.match(sql, /DROP POLICY IF EXISTS ["']Authenticated manage fund_event_participants["']/i);
assert.match(sql, /REVOKE ALL ON TABLE public\.fund_events, public\.fund_event_participants FROM anon/i);
assert.doesNotMatch(sql, /USING\s*\(\s*true\s*\)/i, 'migration không được tạo policy permissive');

console.log('phase 1 RLS hardening contract ok');
