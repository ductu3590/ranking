const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

assert(exists('database/migrations/006_create_tournaments.sql'), 'A tournaments parent-table migration should exist.');
assert(exists('app/api/tournaments/route.js'), 'A tournaments list API route should exist.');
assert(exists('app/giai-dau/[id]/page.js'), 'Tournament detail route /giai-dau/[id] should exist.');
assert(exists('app/giai-dau/[id]/live/page.js'), 'Tournament scoped live route should exist.');
assert(exists('app/giai-dau/[id]/admin/page.js'), 'Tournament scoped admin route should exist.');
assert(exists('app/giai-dau/[id]/captain/page.js'), 'Tournament scoped captain route should exist.');

const dashboardPage = read('app/giai-dau/page.js');
const detailPage = read('app/giai-dau/[id]/page.js');
const moduleNav = read('components/TournamentModuleNav.js');
const apiRoute = read('app/api/tournaments/route.js');
const tournamentsHelper = read('lib/tournaments.js');
const dashboardActionsPath = 'app/giai-dau/TournamentDashboardActions.js';
assert(exists(dashboardActionsPath), 'Tournament dashboard should have a client actions component for admin create/edit/delete controls.');
const dashboardActions = read(dashboardActionsPath);

assert(
    dashboardPage.includes('TournamentDashboard') &&
    dashboardPage.includes('getTournaments') &&
    dashboardPage.includes('tournament-dashboard'),
    '/giai-dau should render the tournament dashboard list on the server.'
);

assert(
    dashboardPage.includes('/giai-dau/${tournament.id}') || dashboardPage.includes('`/giai-dau/${tournament.id}`'),
    'Dashboard cards should link to /giai-dau/[id].'
);

assert(
    dashboardPage.includes('Tạo giải đấu') &&
    dashboardPage.includes('TournamentDashboardActions') &&
    !dashboardPage.includes('Quản trị giải'),
    'Dashboard should put the create-tournament action outside the tournament list instead of showing a generic manage button.'
);

assert(
    dashboardActions.includes('aria-label={`Sửa ${tournament.name}`') &&
    dashboardActions.includes('aria-label={`Xóa ${tournament.name}`') &&
    dashboardActions.includes('/api/tournaments?id=${tournament.id}') &&
    dashboardActions.includes("method: 'DELETE'"),
    'Dashboard cards should expose edit/delete icon actions that call the scoped tournaments API.'
);

assert(
    detailPage.includes('TournamentDetail') || detailPage.includes('tournament-module-page'),
    '/giai-dau/[id] should render the tournament detail/rules page.'
);

assert(
    moduleNav.includes("pathname === '/giai-dau'") &&
    moduleNav.includes('getTournamentBasePath') &&
    moduleNav.includes('`${basePath}/live`'),
    'TournamentModuleNav should hide on dashboard and build links from the selected tournament id.'
);

assert(
    apiRoute.includes('getTournaments') &&
    tournamentsHelper.includes('DEFAULT_TOURNAMENT') &&
    tournamentsHelper.includes("from('tournaments')"),
    'Tournaments API should read tournaments and provide a default fallback.'
);

console.log('tournament dashboard contract ok');
