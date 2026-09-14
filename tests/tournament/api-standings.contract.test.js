const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/standings/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
// getClubReadScope = getClubScope + nhánh vé VĐV (chỉ đọc). Điều phải giữ là
// group_id đến từ cookie đã ký phía server, không phải từ tham số client.
assert(
    s.includes('getClubScope') || s.includes('await getClubReadScope()'),
    'đọc nội bộ yêu cầu club scope từ signed session'
);
const service = read('lib/tournament/standingsService.js');
assert(s.includes('computeStageStandings'), 'gọi standings service dùng chung');
assert(service.includes('getScheduleEngine') && service.includes('computeStandings'), 'service gọi computeStandings');
assert(service.includes('buildResolvedMatches') && service.includes('getMatchEngine'), 'gom resolved matches từ games');
assert(service.includes('tournament_games') && service.includes(".eq('group_id'") && service.includes('stage_id'), 'đọc games + scope');
console.log('api-standings contract ok');
