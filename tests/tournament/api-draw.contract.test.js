const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/api/tournament-v2/draw/route.js';
assert(exists(f), 'route draw tồn tại');
const s = read(f);

assert(/buildDrawSlots/.test(s), 'bốc thăm dùng module thuần');
assert(/validateDraw/.test(s), 'kiểm trước khi chốt');
assert(/swapDrawSlots/.test(s), 'đổi chỗ dùng module thuần');
assert(/DRAW_ALREADY_LOCKED/.test(s), 'chốt hai lần bị chặn');
assert(/DRAW_HAS_PLAYED_MATCHES/.test(s), 'huỷ chốt khi đã có trận đấu bị chặn');
assert(/DRAW_NOT_DRAFT/.test(s), 'sửa tay khi đã chốt bị chặn');
assert(/REASON_REQUIRED/.test(s), 'huỷ chốt bắt lý do');
assert(/writeOperationLog/.test(s), 'ghi nhật ký');
assert(/requireTournamentAccess/.test(s), 'có guard truy cập giải');
assert((s.match(/\.eq\('group_id'/g) || []).length >= 5, 'mọi truy vấn scope theo group_id');
assert(!/DROP|TRUNCATE/i.test(s), 'không có lệnh phá dữ liệu');

// Chốt là nơi DUY NHẤT tạo trận, và phải đi qua module sinh lịch dùng chung.
assert(/generateAndPersistSchedule/.test(s), 'chốt gọi module sinh lịch dùng chung');
assert(!/getScheduleEngine/.test(s), 'không tự gọi engine — đi qua module chung');

// Cột CLB ở tournament_entries tên là tournament_club_id.
assert(/tournament_club_id/.test(s), 'dùng đúng tên cột CLB');
assert(!/select\('id, seed, club_id'\)/.test(s), 'không dùng tên cột club_id không tồn tại');

// Huỷ chốt xoá trận của ĐÚNG giai đoạn, có scope group.
assert(/from\('tournament_matches'\)[\s\S]{0,120}\.delete\(\)/.test(s), 'huỷ chốt xoá trận');

const shared = 'lib/tournament/generateSchedule.js';
assert(exists(shared), 'module sinh lịch dùng chung tồn tại');
const sh = read(shared);
assert(/scheduleToInsertRows/.test(sh) && /_parent_key/.test(sh), 'giữ nguyên shape RPC cũ');
assert(/replace_tournament_entry_schedule/.test(sh) && /replace_tournament_schedule/.test(sh), 'giữ cả hai RPC');

// generate/route.js phải dùng chung module, không giữ bản chép thứ hai.
const gen = read('app/api/tournament-v2/generate/route.js');
assert(/generateAndPersistSchedule/.test(gen), 'generate route dùng module chung');
assert(!/scheduleToInsertRows/.test(gen), 'generate route không còn bản logic sinh lịch thứ hai');

const client = read('lib/tournamentV2Client.js');
for (const fn of ['getDraw', 'rollDraw', 'swapDrawEntries', 'lockDraw', 'unlockDraw']) {
  assert(new RegExp(`function ${fn}\\b`).test(client), `client có ${fn}`);
}

console.log('api-draw contract ok');
