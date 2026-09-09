const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const settings = read('app/api/club/settings/route.js');
assert(
    settings.includes('export async function GET') &&
    settings.includes('export async function PATCH') &&
    /require(?:Validated)?GroupAdmin/.test(settings) &&
    settings.includes('hashPassword') &&
    settings.includes('member_password_hash'),
    'Settings route should expose admin-guarded GET + PATCH and hash the member password.'
);

const regen = read('app/api/club/settings/regenerate-code/route.js');
assert(
    regen.includes('export async function POST') &&
    /require(?:Validated)?GroupAdmin/.test(regen) &&
    regen.includes('generateGroupCode') &&
    regen.includes('QRCode.toDataURL'),
    'Regenerate-code route should be admin-guarded and return a new unique code + QR.'
);

const comp = read('app/admin/ClubSettings.js');
assert(
    comp.includes("'use client'") &&
    comp.includes('/api/club/settings') &&
    comp.includes('/api/club/settings/regenerate-code') &&
    comp.includes('Tạo lại mã'),
    'ClubSettings should load settings and support rename, member-password change, and code regeneration.'
);

// /admin khong con la trung tam co tab. Hai section cu da duoc go:
// roster -> /thanh-vien, fund -> /quy. Trang gio render thang ClubSettings.
const adminCenter = read('app/admin/page.js');
assert(
    adminCenter.includes('ClubSettings') &&
    adminCenter.includes('Cấu hình CLB'),
    'Admin page should render ClubSettings directly under the Cau hinh CLB heading.'
);
assert(
    adminCenter.includes('LEGACY_SECTION_TARGET') &&
    adminCenter.includes("roster: '/thanh-vien'") &&
    adminCenter.includes("fund: '/quy'"),
    'Admin page must redirect the retired ?section=roster and ?section=fund links.'
);
assert(
    !adminCenter.includes('admin-center-tabs'),
    'Admin page must not keep the retired tab bar.'
);

console.log('multitenant phase 3 contract ok');
