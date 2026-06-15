const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const f = 'lib/tournamentV2Client.js';
assert(exists(f), 'client tồn tại');
const s = read(f);
assert(s.includes('/api/tournament-v2'), 'có prefix API v2');
for (const seg of ['/tournaments', '/stages', '/entrants', '/generate', '/games', '/standings', '/advance', '/public']) {
  assert(s.includes(`'${seg}'`), `gọi segment ${seg} (path thật trong code, không phải comment)`);
}
for (const fn of ['listTournaments', 'createTournament', 'saveStage', 'saveEntrant', 'generateSchedule', 'saveGames', 'getStandings', 'advanceStage', 'getPublic']) {
  assert(s.includes(fn), `export ${fn}`);
}
assert(s.includes("credentials") || s.includes('same-origin') || s.includes('include'), 'gửi cookie session');
console.log('ui-client contract ok');
