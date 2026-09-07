const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exit(1); } };

assert(exists('app/api/tournament-v2/preview-schedule/route.js'), 'route preview tồn tại');
const rt = read('app/api/tournament-v2/preview-schedule/route.js');
assert(rt.includes('requireValidatedGroupAdmin'), 'preview có admin guard');
assert(rt.includes('buildSchedulePreview'), 'preview dùng schedulePreview');
assert(!/\.rpc\(|\.insert\(|\.update\(/.test(rt), 'preview không ghi database');

const cl = read('lib/tournamentV2Client.js');
assert(cl.includes('export function previewSchedule'), 'client export previewSchedule');

console.log('phase3 wizard redesign contract: preview ok');
