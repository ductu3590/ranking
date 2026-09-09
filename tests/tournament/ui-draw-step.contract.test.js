const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/giai-dau/v2/console/steps/DrawStep.js';
assert(exists(f), 'DrawStep tồn tại');
const s = read(f);

assert(/'use client'|"use client"/.test(s), 'client component');
assert(/rollDraw/.test(s) && /lockDraw/.test(s) && /unlockDraw/.test(s) && /swapDrawEntries/.test(s),
  'gọi đủ bốn hành động qua client wrapper');
assert(!/supabase/i.test(s), 'không truy vấn Supabase trực tiếp từ UI');
assert(/Bốc thăm/.test(s), 'nút bốc thăm');
assert(/Chốt/.test(s), 'nút chốt');
assert(/Đổi chỗ/.test(s), 'đổi chỗ bằng chọn hai ô rồi bấm');
assert(/Huỷ chốt/.test(s), 'nút huỷ chốt');

// Bàn điều hành chạy cả trên tablet; kéo thả trong danh sách cuộn rất dễ hỏng.
assert(!/draggable|onDragStart|onDrop/.test(s), 'không dùng kéo thả');

assert(/picked/.test(s) && /prev\.length >= 2/.test(s), 'chỉ chọn tối đa hai đội');
assert(/Cảnh báo/.test(s), 'hiện cảnh báo không chặn');
assert(/Chốt luôn/.test(s), 'hộp xác nhận có nút Chốt luôn khi có cảnh báo');
assert(/window\.prompt/.test(s), 'huỷ chốt bắt nhập lý do');
assert(!/#[0-9a-fA-F]{6}/.test(s), 'không hardcode màu, style qua CSS variable');

const css = read('app/giai-dau/v2/console/shell.css');
assert(/\.ops-draw-slot/.test(css), 'có style cho ô đội');
assert(/\.ops-draw-slot\.is-picked/.test(css), 'ô được chọn có trạng thái nhìn thấy được');

const con = read('app/giai-dau/v2/console/TournamentConsoleV2.js');
assert(/DrawStep/.test(con), 'bước 4 mount DrawStep');
assert(/step === 'draw' \? <DrawStep/.test(con), 'mount đúng vào bước draw');

console.log('ui-draw-step contract ok');
