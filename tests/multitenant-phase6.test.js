const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const tx = read('app/api/club/transactions/route.js');
assert(
    tx.includes('export async function POST') &&
    tx.includes('export async function PATCH') &&
    tx.includes('requireGroupAdmin') &&
    tx.includes('MANUAL_THU') &&
    tx.includes('MANUAL_CHI'),
    'Club transactions route should support admin-guarded manual create (Thu/Chi) and update/bulk.'
);

const mem = read('app/api/club/members/route.js');
assert(
    mem.includes('export async function POST') &&
    mem.includes('export async function PATCH') &&
    mem.includes('export async function DELETE') &&
    mem.includes('requireGroupAdmin'),
    'Club members route should support admin-guarded create/update/delete.'
);

// NOTE: Tournament admin (overview/reset) chuyển sang module v2 (app/api/tournament-v2/*) — test ở tests/tournament/*.

const fundAdmin = read('app/quy/admin/page.js');
assert(
    !fundAdmin.includes('@/lib/supabaseClient') && !fundAdmin.includes('.from('),
    'Fund admin page should not query Supabase directly.'
);
assert(
    fundAdmin.includes('/api/club/transactions') && fundAdmin.includes('/api/club/members'),
    'Fund admin page should use the club server APIs.'
);

const navSrc = read('components/MobileBottomNav.js');
assert(
    navSrc.includes('getCurrentGroupClient') && !navSrc.includes('supabase.auth'),
    'MobileBottomNav should derive role from the group session, not Supabase Auth.'
);

const settingsRoute = read('app/api/club/settings/route.js');
assert(
    settingsRoute.includes('adminPassword') && settingsRoute.includes('admin_password_hash'),
    'Settings PATCH should let an admin change the group admin password (hashed).'
);
const settingsUi = read('app/admin/ClubSettings.js');
assert(
    !settingsUi.includes('supabase.auth') && settingsUi.includes('adminPassword'),
    'ClubSettings should change the admin password via the server route, not Supabase Auth.'
);

console.log('multitenant phase 6 contract ok');
