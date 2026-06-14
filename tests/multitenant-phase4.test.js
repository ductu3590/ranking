const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const migration = read('database/migrations/011_group_branding.sql');
assert(
    migration.includes('logo_url') && migration.includes('ALTER TABLE groups'),
    'Migration 011 should add groups.logo_url.'
);

const branding = read('app/api/club/branding/route.js');
assert(
    branding.includes('export async function GET') &&
    branding.includes('getEffectiveGroupContext') &&
    branding.includes('supabaseAdmin') &&
    branding.includes('logoUrl') &&
    branding.includes('PickHub') &&
    branding.includes('context.is_default'),
    'Branding route should expose PickHub by default and active club name/logo for a real group session.'
);

const settings = read('app/api/club/settings/route.js');
assert(
    settings.includes('logoUrl') && settings.includes('logo_url'),
    'Settings PATCH should accept logoUrl and write logo_url.'
);

const header = read('components/HomeHeader.js');
assert(
    header.includes('/api/club/branding') &&
    header.includes('useState') &&
    header.includes('useEffect'),
    'HomeHeader should fetch /api/club/branding and render club name + logo.'
);
assert(
    header.includes("name: 'PickHub'") &&
    !header.includes('toUpperCase()') &&
    header.includes('branding-updated') &&
    header.includes('window.addEventListener'),
    'HomeHeader should default to PickHub, preserve brand casing, and refresh when club branding changes.'
);

const clubSettings = read('app/admin/ClubSettings.js');
assert(
    clubSettings.includes('adminPassword') &&
    clubSettings.includes('/api/club/settings') &&
    clubSettings.includes('toDataURL') &&
    clubSettings.includes('logoUrl'),
    'ClubSettings should support logo upload (canvas resize) and admin password change.'
);
assert(
    clubSettings.includes('branding-updated') &&
    clubSettings.includes('window.dispatchEvent'),
    'ClubSettings should notify the app shell after saving a club logo/name change.'
);

console.log('multitenant phase 4 contract ok');
