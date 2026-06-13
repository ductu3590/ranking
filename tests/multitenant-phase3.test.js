const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

const settings = read('app/api/club/settings/route.js');
assert(
    settings.includes('export async function GET') &&
    settings.includes('export async function PATCH') &&
    settings.includes('requireGroupAdmin') &&
    settings.includes('hashPassword') &&
    settings.includes('member_password_hash'),
    'Settings route should expose admin-guarded GET + PATCH and hash the member password.'
);

const regen = read('app/api/club/settings/regenerate-code/route.js');
assert(
    regen.includes('export async function POST') &&
    regen.includes('requireGroupAdmin') &&
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

const adminCenter = read('app/admin/page.js');
assert(
    adminCenter.includes('ClubSettings') &&
    adminCenter.includes("section === 'settings'") &&
    adminCenter.includes('Cài đặt'),
    'Admin center should render a Cài đặt (settings) section using ClubSettings.'
);

console.log('multitenant phase 3 contract ok');
