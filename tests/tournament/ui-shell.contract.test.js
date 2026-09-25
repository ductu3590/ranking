const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => { if (!condition) { console.error(`FAIL: ${message}`); process.exit(1); } };
// GAP-THEME: console shell bảo vệ theme sáng dùng chung, không khóa theme tối ops-* cũ.
const css = read('app/giai-dau/v2/console/shell.css');
assert(/var\(--font-family\)|var\(--ph-font\)/.test(css), 'dùng token font dùng chung');
assert(!/Outfit/.test(css), 'không dùng Outfit');
for (const token of ['--court-green', '--pickle-lime', '--surface-court', '--live-cyan', '--rally-coral']) assert(!css.includes(token), `không dùng ${token}`);
assert(!/--ops-/.test(css), 'không còn token ops-* (GAP-THEME)');
assert(/prefers-reduced-motion/.test(css), 'tôn trọng reduced motion');
const shell = read('app/giai-dau/v2/console/ConsoleShell.js');
assert(/'use client'|"use client"/.test(shell), 'client component');
// Epic 2 D29: sau khi chốt giải console còn 4 mục; mobile dùng thanh tab đáy thay drawer (ADR-006 mục Epic 2).
for (const label of ['Điều hành', 'Trận đấu', 'Sơ đồ & xếp hạng', 'Cài đặt']) assert(shell.includes(label), `sidebar có ${label}`);
for (const old of ['Trung tâm điều hành', 'Bốc thăm & chốt lịch', 'VĐV & cặp đấu']) assert(!shell.includes(`label: '${old}'`), `không còn mục ${old}`);
assert(/LEGACY_TAB_TO_STEP|tabParam/.test(shell) && /v2-console-tabbar/.test(shell), 'điều hướng link cũ và thanh tab đáy');
const logStep = read('app/giai-dau/v2/console/steps/LogStep.js');
assert(/listOperationLogs/.test(logStep), 'LogStep đọc nhật ký qua client wrapper');
assert(/Trước → Sau|Trước|Sau/.test(logStep), 'LogStep có cột trước/sau');
assert(/Lý do/.test(logStep), 'LogStep có cột lý do');
assert(!/xoá|Xoá|delete/i.test(logStep), 'LogStep chỉ đọc');
console.log('ui-shell contract ok');