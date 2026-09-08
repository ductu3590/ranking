const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const branding = read('app/api/club/branding/route.js');
const settings = read('app/api/club/settings/route.js');
const ui = read('app/admin/ClubSettings.js');

assert(/shame_badges_enabled/.test(branding), 'Branding phải đọc công tắc huy hiệu');
assert(/shameBadgesEnabled/.test(branding), 'Branding phải trả shameBadgesEnabled');
assert(/shame_badges_enabled/.test(settings), 'Settings phải select và cập nhật công tắc');
assert(/shameBadgesEnabled/.test(settings), 'Settings phải nhận payload shameBadgesEnabled');
assert(/shameBadgesEnabled/.test(ui), 'UI cài đặt phải hiển thị và gửi công tắc');

console.log('bxh-settings: PASS');