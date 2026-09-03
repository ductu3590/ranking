const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const route = fs.readFileSync(
  path.join(root, 'app/api/save-snapshot/route.js'),
  'utf8',
);

assert.match(route, /getClubScope|requireGroupAdmin/,
  'save-snapshot phải lấy tenant scope từ signed session');
assert.match(route, /group_id\s*:/,
  'snapshot insert phải ghi group_id');
assert.match(route, /\.eq\(['"]group_id['"],\s*groupId\)/,
  'đọc/xoá snapshot phải scope theo group_id');
assert.doesNotMatch(route, /createClient\(/,
  'save-snapshot không dùng anon client vượt qua auth boundary');

console.log('phase 1 snapshot tenant scope contract ok');
