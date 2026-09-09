const fs = require('fs');
const path = require('path');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const file = path.join(__dirname, '..', '..', 'database', 'migrations', '047_tournament_draw_and_results.sql');

assert(fs.existsSync(file), 'migration 047 tồn tại');
const sql = fs.readFileSync(file, 'utf8');

assert(/ADD COLUMN IF NOT EXISTS loser_match_id bigint/.test(sql), 'thêm loser_match_id');
assert(/ADD COLUMN IF NOT EXISTS final_standings jsonb/.test(sql), 'thêm final_standings');
assert(/tournament_result_corrections_status_ck/.test(sql), 'CHECK trạng thái correction');
for (const st of ['requested', 'approved', 'applied', 'rejected']) {
  assert(new RegExp(`'${st}'`).test(sql), `CHECK có ${st}`);
}
assert(!/DROP\s+TABLE/i.test(sql), 'không DROP TABLE');
assert(!/TRUNCATE/i.test(sql), 'không TRUNCATE');

console.log('migration-047 ok');
