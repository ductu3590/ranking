const fs = require('fs');
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const file = path.join(__dirname, '..', '..', 'database', 'migrations', '045_tournament_operation_logs.sql');

assert(fs.existsSync(file), 'migration 045 tồn tại');
const sql = fs.readFileSync(file, 'utf8');

assert(/CREATE TABLE IF NOT EXISTS public\.tournament_operation_logs/.test(sql), 'tạo bảng idempotent');
for (const col of ['group_id', 'tournament_id', 'division_id', 'actor', 'action', 'target_type', 'target_id', 'before', 'after', 'reason', 'created_at']) {
  assert(new RegExp(`\\b${col}\\b`).test(sql), `có cột ${col}`);
}
assert(/REFERENCES public\.groups\(id\) ON DELETE CASCADE/.test(sql), 'group_id khoá ngoại cascade');
assert(/REFERENCES public\.tournaments\(id\) ON DELETE CASCADE/.test(sql), 'tournament_id khoá ngoại cascade');
assert(/CREATE INDEX IF NOT EXISTS idx_tournament_operation_logs_tournament/.test(sql), 'có index đọc theo giải');
assert(!/DROP\s+TABLE/i.test(sql), 'không DROP TABLE');
assert(!/TRUNCATE/i.test(sql), 'không TRUNCATE');

console.log('migration-045 ok');
