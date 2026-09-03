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

// Auth is unified on group code + password. Group creation no longer provisions a
// Supabase Auth user or an owner membership, and the admin-email field is gone.
const createGroupRoute = read('app/api/groups/route.js');
assert(
    !createGroupRoute.includes('auth.admin.createUser') &&
    !createGroupRoute.includes('addGroupMember') &&
    !createGroupRoute.includes('adminEmail') &&
    createGroupRoute.includes('admin_password_hash') &&
    createGroupRoute.includes('member_password_hash') &&
    createGroupRoute.includes('setGroupSessionCookie'),
    'Group creation should use code + password hashes only and mint a group_session cookie.'
);
const homePage = read('app/page.js');
assert(
    !homePage.includes('adminEmail'),
    'Create-group form should not collect an admin email.'
);

// The Supabase-Auth admin session route has been removed.
assert(
    !fs.existsSync(path.join(root, 'app/api/groups/session/admin/route.js')),
    'The legacy Supabase admin session route should be removed.'
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
    membersPage.includes('/api/identity/roster'),
    'app/quy/members/page.js should read athlete/membership roster through the Phase 2 server API.'
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

const groupSessionSrc = read('lib/groupSession.js');
assert(
    !groupSessionSrc.includes('legacyFallback'),
    'requireGroupAdmin should not silently allow no-session writes.'
);
const serverSrc = read('lib/supabaseServer.js');
assert(
    serverSrc.includes('NODE_ENV') && serverSrc.includes('SUPABASE_SERVICE_ROLE_KEY'),
    'supabaseServer should hard-fail in production when the service key is missing.'
);

const homePageAuth = read('app/page.js');
assert(
    !homePageAuth.includes('signInWithPassword') &&
    !homePageAuth.includes("from '@/lib/supabaseClient'"),
    'Home page should not depend on Supabase Auth; identity comes from the group_session cookie.'
);

// Supabase Auth login + the captain feature are fully removed.
for (const gone of [
    'app/login/page.js',
    'app/api/groups/session/admin/route.js',
    'lib/membership.js',
    'app/giai-dau/captain/page.js',
    'app/giai-dau/[id]/captain/page.js',
    'app/api/tournament/captain/pairings/route.js',
    'app/api/tournament/captain/pairings/unlock/route.js',
]) {
    assert(!fs.existsSync(path.join(root, gone)), `${gone} should be removed.`);
}

console.log('multitenant phase 2 contract ok');
