const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const homeHeaderJs = read('components/HomeHeader.js');
const homeHeaderCss = read('components/HomeHeader.css');
const quyLayoutJs = read('app/quy/layout.js');
const giaiDauLayoutJs = read('app/giai-dau/layout.js');
const giaiDauPageJs = read('app/giai-dau/page.js');
const giaiDauLivePageJs = read('app/giai-dau/live/page.js');
const giaiDauPairingsPageJs = read('app/giai-dau/admin/pairings/page.js');
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
    giaiDauLayoutJs.includes('TournamentModuleNav'),
    'Tournament layout should render a module subnav instead of a separate app navbar.'
);

assert(
    !giaiDauPageJs.includes('TournamentNavBar') &&
    !giaiDauLivePageJs.includes('TournamentNavBar') &&
    !giaiDauPairingsPageJs.includes('TournamentNavBar'),
    'Tournament pages should not import or render TournamentNavBar.'
);

assert(
    !quyPageJs.includes('<HomeHeader') && !quyMembersPageJs.includes('<HomeHeader'),
    'Fund pages should rely on the shared layout HomeHeader instead of rendering their own.'
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
    !mobileBottomNavJs.includes('getTournamentTabs') && !mobileBottomNavJs.includes('/giai-dau/live') && !mobileBottomNavJs.includes('/giai-dau/captain'),
    'MobileBottomNav should use one global tab set instead of tournament-specific tabs.'
);

assert(
    mobileBottomNavJs.includes('function isActivePath') && mobileBottomNavJs.includes("pathname.startsWith(`${href}/`)"),
    'MobileBottomNav should keep role/action tabs active on nested routes.'
);

assert(
    mobileBottomNavJs.includes("href === '/giai-dau'") && mobileBottomNavJs.includes("pathname.startsWith('/giai-dau/')"),
    'MobileBottomNav should keep the global tournament tab active on tournament subroutes.'
);

assert(
    !fs.existsSync(path.join(root, 'components/TournamentNavBar.js')) &&
    !fs.existsSync(path.join(root, 'components/TournamentNavBar.css')),
    'TournamentNavBar files should be removed so the app has one shared shell.'
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
