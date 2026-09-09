const fs = require('fs');
const path = require('path');

const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};

const file = path.join(__dirname, '..', '..', 'database', 'migrations', '046_tournament_operations.sql');
assert(fs.existsSync(file), 'migration 046 tồn tại');
const sql = fs.readFileSync(file, 'utf8');

for (const column of ['warmup_started_at', 'started_at', 'ended_at']) {
  assert(new RegExp(`ADD COLUMN IF NOT EXISTS ${column} timestamptz`).test(sql), `thêm cột ${column}`);
}
assert(/DROP CONSTRAINT IF EXISTS tournament_matches_status_phase3_ck/.test(sql), 'gỡ CHECK cũ');
assert(/tournament_matches_status_phase4_ck/.test(sql), 'thêm CHECK mới');
for (const status of ['pending', 'warmup', 'live', 'paused', 'finalized']) {
  assert(new RegExp(`'${status}'`).test(sql), `CHECK có trạng thái ${status}`);
}
assert(!/'done'/.test(sql), "không đưa 'done' vào CHECK");
assert(/tournament_matches_result_type_ck/.test(sql), 'CHECK cho result_type');
for (const resultType of ['simple', 'mlp', 'team', 'walkover', 'retired']) {
  assert(new RegExp(`'${resultType}'`).test(sql), `result_type có ${resultType}`);
}
assert(!/DROP\s+TABLE/i.test(sql), 'không DROP TABLE');
assert(!/TRUNCATE/i.test(sql), 'không TRUNCATE');
assert(!/tournament_operation_logs/.test(sql), 'không lặp bảng nhật ký 045');

console.log('migration-046 ok');