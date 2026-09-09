const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/giai-dau/v2/console/RoundScoringPanel.js';
assert(exists(f), 'panel tồn tại');
const s = read(f);
assert(/'use client'|"use client"/.test(s), 'client component');
assert(/getRoundRules/.test(s) && /updateRoundRule/.test(s), 'gọi qua client wrapper');
assert(!/supabase/i.test(s), 'không truy vấn Supabase trực tiếp từ UI');
assert(/Số ván theo vòng/.test(s), 'tiêu đề tiếng Việt');
assert(/BO1|BO3|BO5/.test(s), 'ba chip số ván');
assert(/locked/.test(s), 'xử lý vòng bị khoá');
assert(/Trả về mặc định/.test(s), 'nút trả về mặc định');
assert(/sinh lịch/.test(s), 'nhắc phải sinh lịch trước khi cấu hình');
assert(!/#[0-9a-fA-F]{6}/.test(s), 'không hardcode màu, style qua CSS variable');

const settings = read('app/giai-dau/v2/console/tabs/SettingsTab.js');
assert(/RoundScoringPanel/.test(settings), 'SettingsTab mount panel');

console.log('ui-round-scoring contract ok');
