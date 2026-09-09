const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'app/api/tournament-v2/games/route.js';
assert(exists(f), 'route tồn tại');
const s = read(f);
assert(s.includes('requireValidatedGroupAdmin'), 'database-backed admin guard');
assert(s.includes('getMatchEngine') && s.includes('resolveMatch'), 'gọi match engine');
assert(s.includes('advanceWinner'), 'đẩy winner lên bracket cha');
assert(s.includes('tournament_games') && s.includes('tournament_matches'), 'thao tác games + matches');
assert(s.includes('winner_entrant_id'), 'set winner');
assert(s.includes("rpc('replace_tournament_games'"), 'replace games qua database transaction RPC');

const gamesSrc = read('app/api/tournament-v2/games/route.js');
assert(!/p_status:\s*resolved\.complete\s*\?\s*'done'/.test(gamesSrc),
  "không ghi 'done' — CHECK tournament_matches_status_phase3_ck chỉ nhận pending|live|finalized");
assert(/p_status:\s*resolved\.complete\s*\?\s*'finalized'/.test(gamesSrc), "ghi 'finalized' khi chốt trận");
assert(/resolveMatchScoring/.test(gamesSrc), 'dùng luật của vòng chứa trận');
assert(!/if\s*\(scoring\)\s*\{/.test(gamesSrc), 'không bọc kiểm tỉ số trong if(scoring)');
assert(/from\('tournaments'\)/.test(gamesSrc), 'nạp tournament để resolve luật đủ 4 tầng');
assert(/from\('tournament_divisions'\)/.test(gamesSrc), 'nạp division để resolve luật đủ 4 tầng');

console.log('api-games contract ok');
