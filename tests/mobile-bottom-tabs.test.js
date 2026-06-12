const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const homeHeaderJs = read('components/HomeHeader.js');
const homeHeaderCss = read('components/HomeHeader.css');
const tournamentNavJs = read('components/TournamentNavBar.js');
const tournamentNavCss = read('components/TournamentNavBar.css');
const quyLayoutJs = read('app/quy/layout.js');
const giaiDauLayoutJs = read('app/giai-dau/layout.js');
const globalsCss = read('app/globals.css');

assert(
    fs.existsSync(path.join(root, 'components/MobileBottomNav.js')),
    'A layout-level MobileBottomNav component should exist.'
);

const mobileBottomNavJs = fs.existsSync(path.join(root, 'components/MobileBottomNav.js'))
    ? read('components/MobileBottomNav.js')
    : '';
const mobileBottomNavCss = fs.existsSync(path.join(root, 'components/MobileBottomNav.css'))
    ? read('components/MobileBottomNav.css')
    : '';

assert(
    quyLayoutJs.includes('MobileBottomNav') && quyLayoutJs.includes('area="fund"'),
    'Fund layout should mount MobileBottomNav for every /quy page.'
);

assert(
    giaiDauLayoutJs.includes('MobileBottomNav') && giaiDauLayoutJs.includes('area="tournament"'),
    'Tournament layout should mount MobileBottomNav for every /giai-dau page.'
);

assert(
    mobileBottomNavJs.includes('/quy/members') && mobileBottomNavJs.includes('/giai-dau') && mobileBottomNavJs.includes('/quy/admin'),
    'MobileBottomNav fund tabs should include members, tournament, and admin links.'
);

assert(
    !homeHeaderJs.includes('useState') && !homeHeaderJs.includes('hamburger'),
    'HomeHeader should not keep mobile hamburger state or markup.'
);

assert(
    !homeHeaderJs.includes('home-mobile-bottom-tabs'),
    'HomeHeader should not render the mobile bottom tab bar directly.'
);

assert(
    mobileBottomNavJs.includes('/giai-dau/live') && mobileBottomNavJs.includes('/giai-dau/admin') && mobileBottomNavJs.includes('/giai-dau/captain'),
    'MobileBottomNav tournament tabs should include live plus role-specific admin/captain destinations.'
);

assert(
    mobileBottomNavJs.includes('function isActivePath') && mobileBottomNavJs.includes("pathname.startsWith(`${href}/`)"),
    'MobileBottomNav should keep role/action tabs active on nested routes.'
);

assert(
    !tournamentNavJs.includes('tournament-mobile-bottom-tabs'),
    'TournamentNavBar should not render the mobile bottom tab bar directly.'
);

assert(
    !tournamentNavJs.includes('isMenuOpen') && !tournamentNavJs.includes('mobile-menu'),
    'TournamentNavBar should not keep mobile dropdown menu state or markup.'
);

assert(
    mobileBottomNavCss.includes('position: fixed') && mobileBottomNavCss.includes('bottom: 0') && mobileBottomNavCss.includes('mobile-bottom-nav'),
    'MobileBottomNav CSS should fix mobile tabs to the bottom.'
);

assert(
    globalsCss.includes('--mobile-bottom-nav-height') && globalsCss.includes('safe-area-inset-bottom'),
    'Global CSS should reserve mobile safe-area space for the fixed bottom nav.'
);

console.log('mobile bottom tabs contract ok');
