'use strict';

const { assert, read } = require('../_harness');

const consoleSource = read('app/giai-dau/v2/console/TournamentConsoleV2.js');
const dashboardSource = read('app/giai-dau/v2/TournamentV2DashboardClient.js');

assert.ok(consoleSource.includes("create: 'internal'") && consoleSource.includes('router.replace(`/giai-dau/v2?${params.toString()}`)'), 'unfinished admin tournaments return to the unified setup workspace');
assert.ok(consoleSource.includes('if (!scheduleReady && isAdmin)'), 'legacy console setup does not render for unfinished admin tournaments');
assert.ok(consoleSource.includes('scheduleReady || !isAdmin'), 'redirect is limited to unfinished admin flows');
assert.ok(dashboardSource.includes("router.push(`/dieu-hanh-giai/${id}`)"), 'completed tournaments retain the operations console route');
assert.ok(dashboardSource.includes('create=internal'), 'legacy draft links remain compatible with the unified setup workspace');

console.log('R4 single setup path contract ok');