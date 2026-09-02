const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/matches/route.js';
assert(exists(f), 'route matches tồn tại');
const s = read(f);
assert(s.includes('getClubScope'), 'đọc nội bộ yêu cầu club scope từ signed session');
assert(s.includes('tournament_matches'), 'truy vấn tournament_matches');
assert(s.includes('tournament_games'), 'load games cho matches');
assert(s.includes("stageId") && s.includes('stage_id'), 'nhận stageId + scope stage_id');
assert(s.includes(".eq('group_id'"), 'scope group_id');
assert(s.includes('gamesByMatchId'), 'trả gamesByMatchId');
// client wrapper
const c = read('lib/tournamentV2Client.js');
assert(c.includes('listMatches'), 'client có listMatches');
console.log('api-matches contract ok');
