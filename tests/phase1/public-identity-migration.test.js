const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'database/migrations/018_tournament_public_identity.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'/);
assert.match(sql, /visibility IN \('private', 'unlisted', 'public'\)/);
assert.match(sql, /SET visibility = 'unlisted'/);
assert.match(sql, /SET visibility = 'private'\s+WHERE public_slug IS NULL/);
assert.match(sql, /duplicate public_slug values exist/);
assert.match(sql, /lower\(btrim\(public_slug\)\)/);
assert.match(sql, /idx_tournaments_public_slug_lower/);
assert.match(sql, /DROP POLICY IF EXISTS tournament_matches_public_read/);
assert.match(sql, /DROP POLICY IF EXISTS tournament_games_public_read/);
assert.match(sql, /REVOKE SELECT ON TABLE tournament_matches, tournament_games FROM anon/);
assert(!/DROP TABLE\s+/i.test(sql), 'migration không xoá bảng dữ liệu');
console.log('phase 1 public identity migration contract ok');
