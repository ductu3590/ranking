const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

assert(exists('app/admin/page.js'), 'A unified /admin route should exist.');
assert(exists('app/admin/admin-center.css'), 'Unified admin route should have scoped styles.');

const adminPage = read('app/admin/page.js');
const homeHeader = read('components/HomeHeader.js');
const mobileBottomNav = read('components/MobileBottomNav.js');
const tournamentModuleNav = read('components/TournamentModuleNav.js');
const fundAdminPage = read('app/quy/admin/page.js');
const tournamentAdminPage = read('app/giai-dau/admin/page.js');
const pairingsPage = read('app/giai-dau/admin/pairings/page.js');
const nextConfig = read('next.config.js');

assert(
    adminPage.includes('UnifiedAdminCenter') &&
    adminPage.includes('FundAdminPage') &&
    adminPage.includes('AdminTournamentPanel') &&
    adminPage.includes("section === 'fund'") &&
    adminPage.includes("section === 'tournament'"),
    '/admin should render one shared admin center with fund and tournament sections.'
);

assert(
    homeHeader.includes("href=\"/admin\"") &&
    !homeHeader.includes("href=\"/quy/admin\""),
    'HomeHeader should link global admin navigation to /admin.'
);

assert(
    mobileBottomNav.includes("href: '/admin'") &&
    !mobileBottomNav.includes("href: '/quy/admin'"),
    'MobileBottomNav should link global admin navigation to /admin.'
);

assert(
    tournamentModuleNav.includes('/admin?section=tournament') &&
    !tournamentModuleNav.includes('`${basePath}/admin`'),
    'TournamentModuleNav should send tournament admin actions to the unified admin center.'
);

assert(
    fundAdminPage.includes('embedded = false') &&
    fundAdminPage.includes('!embedded') &&
    !fundAdminPage.includes('href="/giai-dau/admin"'),
    'Fund admin page should be embeddable and not cross-link to the old tournament admin route.'
);

assert(
    tournamentAdminPage.includes('embedded = false') &&
    tournamentAdminPage.includes('/admin?section=tournament&view=pairings') &&
    !tournamentAdminPage.includes('href="/quy/admin"'),
    'Tournament admin page should be embeddable and link within the unified admin center.'
);

assert(
    pairingsPage.includes('/admin?section=tournament') &&
    !pairingsPage.includes("router.push('/giai-dau/admin')"),
    'Pairings admin should navigate back to the unified tournament admin section.'
);

assert(
    !nextConfig.includes("source: '/admin',") &&
    nextConfig.includes("destination: '/admin?section=tournament'"),
    'next.config.js should not redirect /admin back to an old module admin route.'
);

console.log('unified admin center contract ok');
