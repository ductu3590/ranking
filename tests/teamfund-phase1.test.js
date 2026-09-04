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
    rootPage.includes('<h1>Pickhub</h1>') &&
    rootPage.includes('Cùng xây dựng cộng đồng Pickleball phát triển.') &&
    rootPage.includes('Tạo nhóm mới') &&
    rootPage.includes('Tham gia nhóm') &&
    rootPage.includes('Tiếp tục') &&
    rootPage.includes('Vào nhóm của bạn') &&
    rootPage.includes('currentGroup.name'),
    'Root page should include Pickhub branding, returning-user continuation, and the two start actions.'
);

assert(
    rootPage.includes("const GROUP_STORAGE_KEY = 'teamfund-current-group'") &&
    rootPage.includes('window.localStorage.getItem(GROUP_STORAGE_KEY)') &&
    rootPage.includes('currentGroup &&') &&
    rootPage.includes("href={currentGroup.role === 'admin' ? '/admin' : '/quy'}") &&
    rootPage.includes('currentGroup.name'),
    'Returning users should get a cached-group shortcut that opens the correct area without another password prompt.'
);

const layout = read('app/layout.js');
assert(
    layout.includes("title: 'Pickhub'") &&
    layout.includes('Cùng xây dựng cộng đồng Pickleball phát triển.'),
    'Root metadata should use the Pickhub name and approved slogan.'
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
const joinService = read('lib/application/identity/joinClubWithCode.js');

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
    joinService.includes("role = 'admin'") &&
    joinService.includes("role = 'member'") &&
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

// NOTE: group-scoping cho giải đấu đã chuyển sang module v2 (app/api/tournament-v2/*,
// RLS migration 016). Các route giải đấu cũ đã bị xóa (clean-slate) — kiểm tra ở tests/tournament/*.

console.log('teamfund phase 1 contract ok');
