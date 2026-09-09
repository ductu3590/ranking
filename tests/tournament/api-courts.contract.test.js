const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const assert = (condition, message) => { if (!condition) { console.error(`FAIL: ${message}`); process.exit(1); } };

for (const file of ['app/api/tournament-v2/venues/route.js', 'app/api/tournament-v2/courts/route.js']) {
  assert(exists(file), `${file} tồn tại`);
  const source = read(file);
  assert(/requireTournamentAccess|requireValidatedGroupAdmin/.test(source), `${file} có guard`);
  assert(/\.eq\('group_id'/.test(source), `${file} scope group_id`);
  assert(!/DROP|TRUNCATE/i.test(source), `${file} không phá dữ liệu`);
}
const courts = read('app/api/tournament-v2/courts/route.js');
assert(/COURT_IN_USE/.test(courts), 'chặn xoá sân đang vướng trận');
assert(/COURT_HAS_ACTIVE_MATCH/.test(courts), 'chặn tắt sân đang có trận');
assert(/export async function DELETE/.test(courts), 'có DELETE');
assert(/\.eq\('active',\s*!active\)/.test(courts), 'ghi có điều kiện active');
assert(!/availability/.test(courts), 'không dùng availability');
for (const file of ['app/api/tournament-v2/assignments/route.js', 'app/api/tournament-v2/operation-logs/route.js']) {
  assert(exists(file), `${file} tồn tại`);
  const source = read(file);
  assert(/requireTournamentAccess/.test(source), `${file} có guard`);
  assert(/\.eq\('group_id'/.test(source), `${file} scope group_id`);
}
const logs = read('app/api/tournament-v2/operation-logs/route.js');
assert(!/export async function (POST|PATCH|DELETE)/.test(logs), 'nhật ký chỉ đọc');
const assignments = read('app/api/tournament-v2/assignments/route.js');
assert(/projectSchedule/.test(assignments), 'trả giờ dự kiến suy ra');
assert(!/scheduled_start:\s*proj|update.*scheduled_start/.test(assignments), 'không lưu giờ dự kiến');
const client = read('lib/tournamentV2Client.js');
for (const fn of ['listVenues', 'saveVenue', 'listCourts', 'saveCourt', 'setCourtActive', 'deleteCourt']) assert(new RegExp(fn).test(client), `client có ${fn}`);
console.log('api-courts contract ok');