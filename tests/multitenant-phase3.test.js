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

// Endpoint tao lai ma CLB da bi xoa trong dot dieu huong 2026-09-09.
// Ma CLB gio la dinh danh co dinh; chi superadmin doi truc tiep trong Supabase.
// Ly do bo: ham cu nang access_version -> dang xuat toan bo thanh vien dang truy cap.
assert(
    !fs.existsSync(path.join(root, 'app/api/club/settings/regenerate-code/route.js')),
    'Regenerate-code route must stay deleted, not merely hidden from the UI.'
);

const comp = read('app/admin/ClubSettings.js');
assert(
    comp.includes("'use client'") &&
    comp.includes('/api/club/settings'),
    'ClubSettings should load settings and support rename and member-password change.'
);
// Ma CLB la co dinh: khong con endpoint tao lai, cung khong con nut.
// Ly do bo: ham cu nang access_version, dang xuat toan bo thanh vien dang truy cap.
assert(
    !comp.includes('regenerate-code') && !comp.includes('Tạo lại mã'),
    'ClubSettings must not offer club-code regeneration any more.'
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
