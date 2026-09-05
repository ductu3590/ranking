const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/advance/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('requireValidatedGroupAdmin'), 'database-backed admin guard');
assert(s.includes('isStageComplete') && s.includes('seedNextStage'), 'dùng orchestrator');
// Trước đây dòng này bắt hai chuỗi `tournament_stage_entrants` và `seed_in_stage`
// vốn nằm trong khối ĐỌC của route, trong khi việc GHI stage kế thật ra nằm trong
// RPC nguyên tử. Nay kiểm đúng thứ nó tuyên bố: route giao việc ghi cho RPC.
assert(s.includes('advance_tournament_stage') && s.includes('p_seeded'), 'ghi stage_entrants kế qua RPC nguyên tử');
assert(s.includes('p_idempotency_key'), 'advance có idempotency key');
// Nạp dữ liệu vòng phải dùng hàm chung đã hiểu entry theo nội dung thi đấu,
// không giữ bản sao chỉ đọc entrant cũ.
assert(s.includes("loadStageData") && s.includes('standingsService'), 'dùng loadStageData chung, hiểu mô hình entry');
assert(s.includes('computeStandings'), 'tính standings trước khi advance');
console.log('api-advance contract ok');
