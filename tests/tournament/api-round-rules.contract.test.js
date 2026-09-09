const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const f = 'app/api/tournament-v2/round-rules/route.js';
assert(exists(f), 'route round-rules tồn tại');
const s = read(f);

assert(/export async function GET/.test(s), 'có GET');
assert(/export async function PATCH/.test(s), 'có PATCH');
assert(/requireTournamentAccess/.test(s), 'dùng guard truy cập giải');
assert(/need:\s*'read'/.test(s), "GET dùng need 'read'");
assert(/need:\s*'write'/.test(s), "PATCH dùng need 'write'");
assert((s.match(/\.eq\('group_id'/g) || []).length >= 3, 'mọi truy vấn scope theo group_id');
assert(/roundScoring/.test(s), 'dùng module luật vòng');
assert(/ROUND_LOCKED/.test(s), 'trả 409 ROUND_LOCKED');
assert(/ROUND_NOT_FOUND/.test(s), 'trả 404 ROUND_NOT_FOUND');
assert(/STAGE_CONFIG_CONFLICT/.test(s), 'chống ghi đè đồng thời');
assert(/is\.\(|not\.is|IS NOT DISTINCT|\.eq\('id',/.test(s), 'ghi có điều kiện trên stage id');
assert(!/DROP|TRUNCATE/i.test(s), 'không có lệnh phá dữ liệu');

const client = read('lib/tournamentV2Client.js');
assert(/getRoundRules/.test(client), 'client có getRoundRules');
assert(/updateRoundRule/.test(client), 'client có updateRoundRule');

console.log('api-round-rules contract ok');
