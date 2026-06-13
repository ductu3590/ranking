const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
}

const rootPage = read('app/page.js');
const nextConfig = read('next.config.js');
const rootCssExists = fs.existsSync(path.join(root, 'app/page.css'));
const rootCss = rootCssExists ? read('app/page.css') : '';

assert(
    !rootPage.includes("redirect('/quy')") && !rootPage.includes('redirect("/quy")'),
    'Root page should render the TeamFund landing page instead of redirecting to /quy.'
);

assert(
    !nextConfig.includes("source: '/'") || !nextConfig.includes("destination: '/quy'"),
    'Next config should not redirect / to /quy.'
);

assert(
    rootPage.includes('TeamFund') &&
    rootPage.includes('Tạo nhóm mới') &&
    rootPage.includes('Tham gia nhóm') &&
    rootPage.includes('Nhóm của tôi'),
    'Root page should include TeamFund landing content and the two phase-1 actions.'
);

assert(
    !rootPage.includes('iCloud') &&
    !rootPage.includes('Khôi phục') &&
    !rootCss.includes('iCloud') &&
    !rootCss.includes('Khôi phục'),
    'Phase 1 homepage must not expose backup, restore, or iCloud actions.'
);

assert(
    fs.existsSync(path.join(root, 'lib/groupSession.js')),
    'Group session helper should exist.'
);

const groupSession = read('lib/groupSession.js');

assert(
    groupSession.includes('GROUP_SESSION_SECRET') &&
    groupSession.includes('signGroupSession') &&
    groupSession.includes('verifyGroupSession') &&
    groupSession.includes('group_session'),
    'Group session helper should sign and verify HTTP-only group_session cookies.'
);

assert(
    groupSession.includes('requireGroupAdmin') &&
    groupSession.includes('getGroupIdForDatabase') &&
    groupSession.includes('NextResponse.json') &&
    groupSession.includes('Unauthorized'),
    'Group session helper should expose shared group scoping and admin guard helpers for API routes.'
);

assert(
    fs.existsSync(path.join(root, 'app/api/groups/route.js')) &&
    fs.existsSync(path.join(root, 'app/api/groups/join/route.js')),
    'Create and join group API routes should exist.'
);

const createRoute = read('app/api/groups/route.js');
const joinRoute = read('app/api/groups/join/route.js');

assert(
    createRoute.includes('admin_password_hash') &&
    createRoute.includes('member_password_hash') &&
    !createRoute.includes('adminPassword:') &&
    !createRoute.includes('memberPassword:'),
    'Create group API should hash passwords and never return raw passwords.'
);

assert(
    createRoute.includes('QRCode.toDataURL') &&
    createRoute.includes('joinUrl'),
    'Create group API should generate an internal QR data URL for the join URL.'
);

assert(
    rootPage.includes('Lưu ảnh') &&
    rootPage.includes('downloadGroupCardImage') &&
    rootPage.includes('teamfund-group-card-download'),
    'Create group success popup should let admin save an image containing the group code and QR.'
);

assert(
    joinRoute.includes("role = 'admin'") &&
    joinRoute.includes("role = 'member'") &&
    joinRoute.includes('verifyPassword'),
    'Join group API should distinguish admin and member passwords.'
);

const migrationPath = 'database/migrations/007_multigroup_phase1.sql';
assert(
    fs.existsSync(path.join(root, migrationPath)),
    'Multigroup phase 1 migration should exist.'
);

const migration = read(migrationPath);

for (const table of [
    'club_members',
    'quy_pickleball',
    'fund_events',
    'tournaments',
    'tournament_teams',
    'tournament_players',
    'tournament_pairings',
    'tournament_matches',
    'tournament_settings',
]) {
    assert(
        migration.includes(`ALTER TABLE ${table}`) && migration.includes('group_id'),
        `Migration should add group_id to ${table}.`
    );
}

assert(
    migration.includes('CREATE TABLE IF NOT EXISTS groups') &&
    migration.includes('P246CLUB') &&
    migration.includes('UPDATE club_members') &&
    migration.includes('UPDATE quy_pickleball'),
    'Migration should create groups, seed default group, and backfill existing club data.'
);

assert(
    migration.includes('idx_tournament_settings_group_tournament_key') &&
    migration.includes('group_id, tournament_id, setting_key') &&
    read('app/api/tournament/admin/toggle-round1/route.js').includes("onConflict: 'group_id,tournament_id,setting_key'") &&
    read('app/api/tournament/admin/toggle-pairings-lock/route.js').includes("onConflict: 'group_id,tournament_id,setting_key'"),
    'Tournament settings upserts should use a group-aware unique key.'
);

for (const route of [
    'app/api/tournament/admin/settings/route.js',
    'app/api/tournament/admin/toggle-round1/route.js',
    'app/api/tournament/admin/toggle-pairings-lock/route.js',
    'app/api/tournament/admin/reorder/route.js',
    'app/api/tournament/admin/pairings/route.js',
    'app/api/tournament/live/matches/route.js',
    'app/api/tournament/live/scoreboard/route.js',
    'app/api/tournament/live/pairings/route.js',
    'app/api/tournament/captain/pairings/route.js',
    'app/api/tournament/captain/pairings/unlock/route.js',
]) {
    const source = read(route);
    assert(
        source.includes('getGroupIdForDatabase') &&
        source.includes(".eq('group_id', groupId)"),
        `${route} should scope tournament data to the current group_id.`
    );
}

for (const route of [
    'app/api/tournament/admin/settings/route.js',
    'app/api/tournament/admin/toggle-round1/route.js',
    'app/api/tournament/admin/toggle-pairings-lock/route.js',
    'app/api/tournament/admin/reorder/route.js',
    'app/api/tournament/admin/pairings/route.js',
]) {
    const source = read(route);
    assert(
        source.includes('requireGroupAdmin') &&
        source.includes('adminCheck.response'),
        `${route} should reject write access unless the current group session is admin.`
    );
}

const tournamentAdminPage = read('app/giai-dau/admin/page.js');
assert(
    tournamentAdminPage.includes('getCurrentGroupIdClient') &&
    tournamentAdminPage.includes(".eq('group_id', groupId)"),
    'Tournament admin client page should scope direct Supabase reads and reset deletes to the current group_id.'
);

console.log('teamfund phase 1 contract ok');
