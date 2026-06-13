const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const m008 = read('database/migrations/008_group_members.sql');
assert(
    m008.includes('CREATE TABLE IF NOT EXISTS group_members') &&
    m008.includes('user_id uuid') &&
    m008.includes('REFERENCES auth.users') &&
    m008.includes('group_id') &&
    m008.includes("role") &&
    m008.includes('UNIQUE (group_id, user_id)'),
    'Migration 008 should create group_members linking auth.users to groups with a role and a unique membership.'
);

const membership = read('lib/membership.js');
assert(
    membership.includes('export async function getAdminGroupIds') &&
    membership.includes('export async function isGroupAdmin') &&
    membership.includes("from('group_members')"),
    'lib/membership.js should resolve a user\'s admin group ids and check admin membership.'
);

const createGroupRoute = read('app/api/groups/route.js');
assert(
    createGroupRoute.includes('auth.admin.createUser') &&
    createGroupRoute.includes('addGroupMember') &&
    createGroupRoute.includes('adminEmail'),
    'Group creation should create a Supabase admin user and an owner membership.'
);
const homePage = read('app/page.js');
assert(
    homePage.includes('adminEmail'),
    'Create-group form should collect the admin email.'
);

const adminSessionRoute = read('app/api/groups/session/admin/route.js');
assert(
    adminSessionRoute.includes('getAdminGroupIds') &&
    adminSessionRoute.includes('signGroupSession') &&
    adminSessionRoute.includes('setGroupSessionCookie'),
    'Admin session route should mint a group_session cookie from the user\'s membership.'
);

for (const route of [
    'app/api/club/transactions/route.js',
    'app/api/club/members/route.js',
    'app/api/club/events/route.js',
]) {
    const src = read(route);
    assert(
        src.includes('getGroupIdForDatabase') && src.includes(".eq('group_id', groupId)"),
        `${route} should scope reads to the current group via the signed cookie.`
    );
}

const clubEvents = read('app/api/club/events/route.js');
assert(
    clubEvents.includes('export async function POST') &&
    clubEvents.includes('export async function DELETE') &&
    clubEvents.includes('requireGroupAdmin') &&
    clubEvents.includes('fund_event_participants'),
    'Club events route should support admin-guarded create/delete and return nested participants.'
);
const clubParticipants = read('app/api/club/participants/route.js');
assert(
    clubParticipants.includes('export async function PATCH') &&
    clubParticipants.includes('requireGroupAdmin'),
    'Club participants route should support an admin-guarded paid toggle.'
);

const quyPage = read('app/quy/page.js');
assert(
    !quyPage.includes('@/lib/supabaseClient') && !quyPage.includes('.from('),
    'app/quy/page.js should not query Supabase directly from the browser.'
);
assert(
    quyPage.includes('/api/club/transactions') &&
    quyPage.includes('/api/club/events') &&
    quyPage.includes('/api/club/members') &&
    quyPage.includes('/api/club/participants'),
    'app/quy/page.js should read and write club data through the server APIs.'
);

const membersPage = read('app/quy/members/page.js');
assert(
    !membersPage.includes('@/lib/supabaseClient') && !membersPage.includes('.from('),
    'app/quy/members/page.js should not query Supabase directly.'
);
assert(
    membersPage.includes('/api/club/members'),
    'app/quy/members/page.js should read members through the server API.'
);

const rls = read('database/migrations/009_enable_rls.sql');
for (const table of [
    'groups', 'group_members', 'club_members', 'quy_pickleball', 'fund_events',
    'fund_event_participants', 'tournaments', 'tournament_teams', 'tournament_players',
    'tournament_pairings', 'tournament_matches', 'tournament_settings',
]) {
    assert(
        rls.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
        `Migration 009 should enable RLS on ${table}.`
    );
}
assert(
    rls.includes('group_members gm') && rls.includes('gm.user_id = auth.uid()'),
    'RLS policies should scope access by the caller\'s group_members rows.'
);

console.log('multitenant phase 2 contract ok');
