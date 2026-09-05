const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const assert = (condition, message) => { if (!condition) { console.error(`FAIL: ${message}`); process.exit(1); } };

assert(exists('app/api/tournament-v2/clubs/route.js'), 'có API tournament clubs');
assert(read('lib/tournamentV2Client.js').includes('listTournamentClubs'), 'client có listTournamentClubs');
assert(read('lib/tournamentV2Client.js').includes('inviteTournamentClub'), 'client có inviteTournamentClub');
const wizard = read('app/giai-dau/v2/TournamentWizard.js');
assert(wizard.includes('interclub'), 'wizard có mode interclub');
assert(wizard.includes('Giải liên CLB'), 'wizard có lựa chọn giải liên CLB');
assert(wizard.includes('listTournamentClubs'), 'wizard tải danh sách CLB tham gia');
assert(wizard.includes('inviteTournamentClub'), 'wizard mời CLB khác');
assert(wizard.includes('/api/club/members'), 'wizard tích hợp roster thành viên');
console.log('phase3 interclub ui contract ok');
