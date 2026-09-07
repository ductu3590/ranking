const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/giai-dau/v2/TournamentWizard.js';
assert(exists(f), 'wizard tồn tại');
const s = read(f);
// Wizard tạo giải đã đổi sang luồng 3 bước (Thể thức · Thông tin giải · Đăng ký).
// "Tạo giải" tạo tournament → division → stage → entry theo nội dung thi đấu;
// đơn vị xếp lịch là entry, không còn entrant cấp giải cũ.
assert(
    s.includes('createTournament') && s.includes('saveDivision') && s.includes('saveStage') && s.includes('saveDivisionEntry'),
    'gọi các API tạo giải: createTournament, saveDivision, saveStage, saveDivisionEntry',
);
assert(!/saveEntrant\s*\(/.test(s), 'Wizard không ghi vào bảng entrant cấp giải cũ nữa');
for (const t of ['team', 'doubles', 'round_robin', 'knockout', 'simple', 'mlp']) assert(s.includes(t), `tùy chọn ${t}`);
for (const label of ['Thể thức', 'Thông tin giải', 'Đăng ký']) assert(s.includes(label), `bước "${label}"`);
console.log('ui-wizard contract ok');
