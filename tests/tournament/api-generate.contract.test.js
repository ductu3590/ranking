const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/generate/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('requireValidatedGroupAdmin'), 'database-backed admin guard');
assert(s.includes('stageId'), 'route nhận stage scope');

// Logic sinh lịch đã tách sang lib/tournament/generateSchedule.js để route này
// và route `draw` (lúc chốt bốc thăm) dùng chung một bản. Route chỉ còn nạp
// dữ liệu rồi gọi module chung; các khẳng định dưới đây theo code sang đó.
assert(s.includes('generateAndPersistSchedule'), 'route gọi module sinh lịch dùng chung');
assert(!s.includes('scheduleToInsertRows'), 'route không giữ bản logic sinh lịch thứ hai');

const shared = 'lib/tournament/generateSchedule.js';
assert(exists(shared), 'module sinh lịch dùng chung tồn tại');
const g = read(shared);
assert(g.includes('getScheduleEngine') && g.includes('generateSchedule'), 'gọi schedule engine');
assert(g.includes('scheduleToInsertRows'), 'dùng persistence helper để chuẩn hóa payload');
assert(g.includes('_parent_key') && g.includes('parent_slot'), 'gửi liên kết parent theo khóa schedule');
assert(g.includes('p_group_id: groupId') && g.includes('p_stage_id'), 'RPC nhận đúng tenant + stage scope');
assert(g.includes("'replace_tournament_schedule'"), 'regenerate schedule qua database transaction RPC');
assert(g.includes("'replace_tournament_entry_schedule'"), 'giữ nhánh entry-based');
console.log('api-generate contract ok');
