const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const homeHeaderJs = read('components/HomeHeader.js');
const homeHeaderCss = read('components/HomeHeader.css');
const globalNavigation = require('../lib/globalNavigation');
const quyLayoutJs = read('app/quy/layout.js');
const giaiDauLayoutJs = read('app/giai-dau/layout.js');
const giaiDauPageJs = read('app/giai-dau/page.js');
const quyPageJs = read('app/quy/page.js');
const quyMembersPageJs = read('app/quy/members/page.js');
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
    quyLayoutJs.includes('MobileBottomNav') && !quyLayoutJs.includes('area='),
    'Fund layout should mount MobileBottomNav for every /quy page.'
);

assert(
    giaiDauLayoutJs.includes('MobileBottomNav') && !giaiDauLayoutJs.includes('area='),
    'Tournament layout should mount MobileBottomNav for every /giai-dau page.'
);

assert(
    quyLayoutJs.includes('HomeHeader') && giaiDauLayoutJs.includes('HomeHeader'),
    'Fund and Tournament layouts should share the same HomeHeader app shell.'
);

assert(
    !giaiDauPageJs.includes('TournamentNavBar') &&
    !giaiDauLayoutJs.includes('TournamentNavBar'),
    'Tournament pages should not import or render TournamentNavBar.'
);

assert(
    !quyPageJs.includes('<HomeHeader') && !quyMembersPageJs.includes('<HomeHeader'),
    'Fund pages should rely on the shared layout HomeHeader instead of rendering their own.'
);

assert(
    homeHeaderJs.includes('GLOBAL_NAV_LINKS') &&
    mobileBottomNavJs.includes('getGlobalNavLinksForRole'),
    'Desktop and mobile navigation should derive their links from the shared global menu definition.'
);

assert(
    globalNavigation.GLOBAL_NAV_LINKS.map((link) => link.label).join('|') === 'Quỹ|Thành viên|BXH|Giải|Cấu hình',
    'Global navigation should expose the approved five-item menu in order.'
);

assert(
    !homeHeaderJs.includes('hamburger') && !homeHeaderJs.includes('menuOpen'),
    'HomeHeader should not keep mobile hamburger state or markup.'
);

assert(
    !homeHeaderJs.includes('home-mobile-bottom-tabs'),
    'HomeHeader should not render the mobile bottom tab bar directly.'
);

assert(
    !mobileBottomNavJs.includes('getTournamentTabs') && !mobileBottomNavJs.includes('/giai-dau/live') && !mobileBottomNavJs.includes('/giai-dau/captain'),
    'MobileBottomNav should use one global tab set instead of tournament-specific tabs.'
);

assert(
    homeHeaderJs.includes('isGlobalNavActive') && mobileBottomNavJs.includes('isGlobalNavActive'),
    'Desktop and mobile navigation should share nested-route active state behavior.'
);

assert(
    !fs.existsSync(path.join(root, 'components/TournamentNavBar.js')) &&
    !fs.existsSync(path.join(root, 'components/TournamentNavBar.css')),
    'TournamentNavBar files should be removed so the app has one shared shell.'
);

assert(
    mobileBottomNavCss.includes('position: fixed') &&
    mobileBottomNavCss.includes('bottom: 0') &&
    mobileBottomNavCss.includes('repeat(5') &&
    mobileBottomNavCss.includes('mobile-bottom-nav-link.featured'),
    'MobileBottomNav should fix five tabs to the bottom and visually feature BXH.'
);

assert(
    homeHeaderCss.includes('.nav-link.featured'),
    'Desktop navigation should visually feature BXH.'
);

assert(
    globalsCss.includes('--mobile-bottom-nav-height') && globalsCss.includes('safe-area-inset-bottom'),
    'Global CSS should reserve mobile safe-area space for the fixed bottom nav.'
);

console.log('mobile bottom tabs contract ok');
