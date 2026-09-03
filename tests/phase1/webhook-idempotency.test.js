const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'database/migrations/023_webhook_idempotency.sql');
assert.ok(fs.existsSync(migrationPath), 'migration webhook idempotency phải tồn tại');
const sql = fs.readFileSync(migrationPath, 'utf8');
const route = fs.readFileSync(path.join(root, 'app/api/webhook/route.js'), 'utf8');
const preflight = fs.readFileSync(
  path.join(root, 'database/audits/phase-1-schema-preflight.sql'),
  'utf8',
);

assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_quy_pickleball_group_transaction/i);
assert.match(sql, /group_id\s*,[\s\S]*ma_giao_dich/i);
assert.match(sql, /RAISE EXCEPTION/i);
assert.match(sql, /duplicate|trùng/i);
assert.match(route, /if\s*\(!reference\.trim\(\)\)/);
assert.match(route, /error\.code\s*===\s*['"]23505['"]/);
assert.match(preflight, /normalized_transaction_reference/);

console.log('phase 1 webhook idempotency contract ok');
