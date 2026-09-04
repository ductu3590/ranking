'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredFiles = [
  'components/pickhub/ClubSwitcher.js',
  'components/pickhub/ClubSwitcher.css',
  'components/pickhub/MemberInfoPanel.js',
  'components/pickhub/MemberInfoPanel.css',
  'components/pickhub/RoleActionBar.js',
  'components/pickhub/RoleActionBar.css',
  'app/thong-tin/page.js',
  'app/thong-tin/page.css',
  'lib/clubSessionView.js',
];

for (const file of requiredFiles) {
  assert.equal(exists(file), true, `${file} must exist for the Phase 2 UI`);
}

const navigation = require('../lib/globalNavigation');
assert.deepEqual(
  navigation.getGlobalNavLinksForRole('member').map(({ href, label }) => ({ href, label })),
  [
    { href: '/quy', label: 'Quỹ' },
    { href: '/quy/members', label: 'Thành viên' },
    { href: '/quy/bxh', label: 'BXH' },
    { href: '/giai-dau', label: 'Giải' },
    { href: '/thong-tin', label: 'Thông tin' },
  ],
  'member navigation keeps five tabs with BXH centered and Thông tin last'
);
assert.deepEqual(
  navigation.getGlobalNavLinksForRole('admin').map(({ href, label }) => ({ href, label })),
  [
    { href: '/quy', label: 'Quỹ' },
    { href: '/quy/members', label: 'Thành viên' },
    { href: '/quy/bxh', label: 'BXH' },
    { href: '/giai-dau', label: 'Giải' },
    { href: '/admin', label: 'Cấu hình' },
  ],
  'leader navigation keeps Cấu hình as the fifth tab'
);

const { buildClubSessionView } = require('../lib/clubSessionView');
assert.deepEqual(buildClubSessionView(null), {
  session: null,
  permissions: {
    canViewClub: false,
    canManageFund: false,
    canManageRoster: false,
    canManagePhr: false,
    canManageSettings: false,
  },
}, 'missing session fails closed');
assert.equal(buildClubSessionView({ signed: true, group_id: 7, role: 'member' }).permissions.canViewClub, true);
assert.equal(buildClubSessionView({ signed: true, group_id: 7, role: 'member' }).permissions.canManageRoster, false);
assert.equal(buildClubSessionView({ signed: true, group_id: 7, role: 'admin' }).permissions.canManageRoster, true);
assert.equal(buildClubSessionView({ signed: false, group_id: 7, role: 'admin' }).permissions.canManageSettings, false);

const sessionRoute = read('app/api/groups/session/route.js');
assert.match(sessionRoute, /buildClubSessionView/, 'session API must provide authoritative UI permissions');

for (const file of [
  'components/HomeHeader.js',
  'components/MobileBottomNav.js',
  'components/UserStatusBadge.js',
  'app/quy/page.js',
  'app/quy/admin/page.js',
]) {
  assert.doesNotMatch(read(file), /getCurrentGroupClient/, `${file} must not infer role from localStorage`);
}

const rosterPage = read('app/quy/members/page.js');
assert.match(rosterPage, /\/api\/identity\/roster/, 'roster UI consumes the athlete/membership projection');
for (const field of ['displayName', 'alias', 'status', 'athleteId']) {
  assert.match(rosterPage, new RegExp(field), `roster UI renders ${field}`);
}
assert.match(rosterPage, /RoleActionBar/, 'admin roster actions use server-provided permissions');

const infoPage = read('app/thong-tin/page.js');
assert.match(infoPage, /MemberInfoPanel/);
assert.match(infoPage, /\/api\/identity\/assessments/);
assert.match(infoPage, /shared|dùng chung/i, 'member info must explain shared-session privacy');

const assessmentRoute = read('app/api/identity/assessments/route.js');
assert.match(assessmentRoute, /export async function GET/, 'members can read scoped PHR history');

for (const cssFile of [
  'components/pickhub/ClubSwitcher.css',
  'components/pickhub/MemberInfoPanel.css',
  'components/pickhub/RoleActionBar.css',
  'app/thong-tin/page.css',
]) {
  const css = read(cssFile);
  assert.match(css, /44px/, `${cssFile} keeps 44px touch targets`);
  assert.match(css, /focus-visible/, `${cssFile} exposes keyboard focus`);
}

const combinedUi = requiredFiles.filter((file) => file.endsWith('.js')).map(read).join('\n');
assert.doesNotMatch(combinedUi, /otp|magic link|supabase\.auth|tạo tài khoản|claim account/i,
  'Phase 2 UI must not introduce account, claim, or OTP flows');

console.log('PickHub Phase 2 UI static contracts ok');
