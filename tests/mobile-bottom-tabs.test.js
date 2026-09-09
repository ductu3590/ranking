const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const homeHeaderJs = read('components/HomeHeader.js');
const homeHeaderCss = read('components/HomeHeader.css');
const sideRailJs = read('components/pickhub/SideRail.js');
const globalNavigation = require('../lib/globalNavigation');
const quyLayoutJs = read('app/quy/layout.js');
const giaiDauLayoutJs = read('app/giai-dau/layout.js');
const giaiDauPageJs = read('app/giai-dau/page.js');
const quyPageJs = read('app/quy/page.js');
const quyMembersPageJs = read('app/thanh-vien/page.js');
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
    quyLayoutJs.includes('AppShell') && !quyLayoutJs.includes('area='),
    'Fund layout should mount AppShell for every /quy page.'
);

assert(
    giaiDauLayoutJs.includes('AppShell') && !giaiDauLayoutJs.includes('area='),
    'Tournament layout should mount AppShell for every /giai-dau page.'
);

assert(
    !quyLayoutJs.includes('HomeHeader') && !giaiDauLayoutJs.includes('HomeHeader'),
    'Fund and Tournament layouts should delegate HomeHeader to AppShell.'
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
    sideRailJs.includes('getGlobalNavLinksForRole') &&
    mobileBottomNavJs.includes('getGlobalNavLinksForRole'),
    'Rail and mobile navigation should derive their links from the shared server-role menu function.'
);

assert(
    globalNavigation.getGlobalNavLinksForRole('member').map((link) => link.label).join('|') === 'Quỹ|Thành viên|BXH|Giải|Thông tin' &&
    globalNavigation.getGlobalNavLinksForRole('admin').map((link) => link.label).join('|') === 'Quỹ|Thành viên|BXH|Giải|Cấu hình',
    'Global navigation should expose both approved five-item role menus in order.'
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
    sideRailJs.includes('isGlobalNavActive') && mobileBottomNavJs.includes('isGlobalNavActive'),
    'Rail and mobile navigation should share nested-route active state behavior.'
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
    globalsCss.includes('--ph-bottom-nav-height') && globalsCss.includes('safe-area-inset-bottom'),
    'Global CSS should reserve mobile safe-area space for the fixed bottom nav.'
);

assert(
    /max-width:\s*1119px/.test(mobileBottomNavCss),
    'Bottom nav phai hien thi toi < 1120px vi side rail chi bat dau tu 1120px'
);
assert(
    !/max-width:\s*768px/.test(mobileBottomNavCss),
    'Khong duoc de bottom nav dung o 768px - dai 768-1119px se mat dieu huong'
);

console.log('mobile bottom tabs contract ok');
