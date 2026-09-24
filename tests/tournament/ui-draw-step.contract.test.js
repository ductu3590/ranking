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
// Trước đây bước chốt dùng window.confirm với chuỗi "Chốt luôn?". Nay là hộp thoại
// modal có aria-modal, liệt kê cảnh báo và vẫn cho BTC chốt — khẳng định theo hợp
// đồng hiện tại, không hạ yêu cầu: cảnh báo KHÔNG được chặn nút chốt.
assert(/role="dialog"/.test(s) && /aria-modal="true"/.test(s), 'bước chốt dùng hộp thoại xác nhận có aria-modal');
assert(/Chốt bốc thăm\?/.test(s), 'hộp thoại hỏi xác nhận trước khi sinh lịch');
assert(/data\.warnings\.map\(\(warning\) => <li key=\{warning\.code\}>/.test(s), 'hộp thoại liệt kê cảnh báo');
assert(/dialog === 'lock' \? 'Chốt lịch' : 'Huỷ chốt'/.test(s), 'hộp thoại có nút chốt lịch');
// Nút chốt chỉ bị vô hiệu khi đang bận hoặc thiếu lý do huỷ chốt — KHÔNG vì có cảnh báo.
assert(/disabled=\{busy \|\| \(dialog === 'unlock' && !unlockReason\.trim\(\)\)\}/.test(s),
  'cảnh báo không chặn nút chốt (chỉ busy hoặc thiếu lý do huỷ chốt mới chặn)');
// Huỷ chốt vẫn BẮT BUỘC có lý do, nhưng nay nhập trong hộp thoại (ô input +
// nút bị vô hiệu khi bỏ trống) thay vì window.prompt, và lý do được gửi lên server.
assert(/placeholder="Lý do huỷ chốt"/.test(s), 'huỷ chốt có ô nhập lý do');
assert(/unlockDraw\(\{ stage_id: stageId, reason \}\)/.test(s), 'lý do huỷ chốt được gửi lên server');
assert(!/#[0-9a-fA-F]{6}/.test(s), 'không hardcode màu, style qua CSS variable');

const css = read('app/giai-dau/v2/console/shell.css');
assert(/\.v2-console-draw-slot/.test(css), 'có style cho ô đội');
assert(/\.v2-console-draw-slot\.is-picked/.test(css), 'ô được chọn có trạng thái nhìn thấy được');

const con = read('app/giai-dau/v2/console/TournamentConsoleV2.js');
assert(/DrawStep/.test(con), 'bước 4 mount DrawStep');
// Epic 2 D29: bước draw gộp vào mục Cài đặt (link cũ ?step=draw → settings); chỉ admin thấy (huỷ chốt).
// Epic 2 E2: giải setup v4 dùng SettingsView (không huỷ chốt lịch); DrawStep chỉ còn ở Cài đặt của giải cũ (ADR-006).
assert(/step === 'settings' && !v4Schedule \?[\s\S]*\{isAdmin \? <DrawStep/.test(con), 'DrawStep nằm trong mục Cài đặt (giải cũ), chỉ admin');

console.log('ui-draw-step contract ok');
