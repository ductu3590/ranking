const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/giai-dau/v2/TournamentWizard.js';
assert(exists(f), 'wizard tồn tại');
const s = read(f);
// Phase 3 đã hội tụ mô hình: đơn vị xếp lịch là entry theo nội dung thi đấu,
// không còn entrant cấp giải. Trước đây dòng này bắt chuỗi `saveEntrant`, và
// Wizard mới phải giữ chuỗi đó trong một comment chết chỉ để test xanh.
assert(s.includes('createTournament') && s.includes('saveStage') && s.includes('saveDivisionEntry') && s.includes('generateSchedule'), 'gọi 4 bước API');
assert(!/saveEntrant\s*\(/.test(s), 'Wizard không ghi vào bảng entrant cấp giải cũ nữa');
for (const t of ['pair', 'team', 'round_robin', 'knockout', 'simple', 'mlp']) assert(s.includes(t), `tùy chọn ${t}`);
for (const label of ['Thông tin', 'Giai đoạn', 'Đội', 'lịch']) assert(s.includes(label), `bước "${label}"`);
console.log('ui-wizard contract ok');
