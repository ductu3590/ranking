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

const overview = read('app/api/tournament/admin/overview/route.js');
assert(
    overview.includes('export async function GET') &&
    overview.includes('getGroupIdForDatabase') &&
    overview.includes('tournament_teams') &&
    overview.includes('tournament_matches') &&
    overview.includes('tournament_pairings'),
    'Tournament overview route should return teams/matches/pairings/stats scoped to the group.'
);
const reset = read('app/api/tournament/admin/reset/route.js');
assert(
    reset.includes('export async function POST') &&
    reset.includes('requireGroupAdmin') &&
    reset.includes('tournament_matches'),
    'Tournament reset route should be admin-guarded and delete tournament data for the group.'
);

const fundAdmin = read('app/quy/admin/page.js');
assert(
    !fundAdmin.includes('@/lib/supabaseClient') && !fundAdmin.includes('.from('),
    'Fund admin page should not query Supabase directly.'
);
assert(
    fundAdmin.includes('/api/club/transactions') && fundAdmin.includes('/api/club/members'),
    'Fund admin page should use the club server APIs.'
);

const tourAdmin = read('app/giai-dau/admin/page.js');
assert(
    !tourAdmin.includes('@/lib/supabaseClient') && !tourAdmin.includes('.from('),
    'Tournament admin page should not query Supabase directly.'
);
assert(
    tourAdmin.includes('/api/tournament/admin/overview') && tourAdmin.includes('/api/tournament/admin/reset'),
    'Tournament admin page should use the overview and reset APIs.'
);

const tournamentsRoute = read('app/api/tournaments/route.js');
assert(
    tournamentsRoute.includes('requireGroupAdmin') &&
    tournamentsRoute.includes('adminCheck.groupId') &&
    tournamentsRoute.includes('group_id'),
    'Creating a tournament should require the current club admin session and assign that club group_id.'
);

for (const f of ['components/MobileBottomNav.js', 'components/TournamentModuleNav.js']) {
    const src = read(f);
    assert(
        src.includes('getCurrentGroupClient') && !src.includes('supabase.auth'),
        `${f} should derive role from the group session, not Supabase Auth.`
    );
}

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
