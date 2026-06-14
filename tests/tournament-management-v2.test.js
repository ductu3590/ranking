const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

assert(
    exists('database/migrations/012_tournament_management_v2.sql'),
    'Tournament management v2 migration should exist.'
);

const migration = read('database/migrations/012_tournament_management_v2.sql');
for (const column of [
    'tournament_format',
    'assignment_mode',
    'team_size',
    'teams_per_match',
    'scoring_config',
]) {
    assert(migration.includes(column), `Migration should add tournaments.${column}.`);
}

const assignment = read('lib/tournamentAssignment.js');
assert(
    assignment.includes('TOURNAMENT_FORMATS') &&
    assignment.includes('mlp_team') &&
    assignment.includes('doubles_round_robin') &&
    assignment.includes('group_playoff') &&
    assignment.includes('knockout') &&
    assignment.includes('buildRandomTeams') &&
    assignment.includes('buildRandomPairs') &&
    assignment.includes('shuffleMembers'),
    'Tournament assignment helper should define supported formats and random team/pair builders.'
);

const tournamentsRoute = read('app/api/tournaments/route.js');
assert(
    tournamentsRoute.includes('export async function PATCH') &&
    tournamentsRoute.includes('export async function DELETE') &&
    tournamentsRoute.includes('requireGroupAdmin') &&
    tournamentsRoute.includes(".eq('group_id', adminCheck.groupId)") &&
    tournamentsRoute.includes('tournament_format') &&
    tournamentsRoute.includes('assignment_mode'),
    'Tournaments API should support admin-guarded create/update/delete scoped to the current club.'
);

const autoAssignRoute = read('app/api/tournaments/auto-assign/route.js');
assert(
    autoAssignRoute.includes('export async function POST') &&
    autoAssignRoute.includes('requireGroupAdmin') &&
    autoAssignRoute.includes('club_members') &&
    autoAssignRoute.includes('tournament_teams') &&
    autoAssignRoute.includes('tournament_players') &&
    autoAssignRoute.includes('buildRandomTeams') &&
    autoAssignRoute.includes('buildRandomPairs') &&
    autoAssignRoute.includes(".eq('group_id', adminCheck.groupId)"),
    'Auto-assign route should load club members and create tournament teams/players inside the current club only.'
);
assert(
    autoAssignRoute.includes("['tournament_matches', 'tournament_pairings', 'tournament_players', 'tournament_teams']"),
    'Auto-assign should delete matches before pairings because matches reference pairing rows.'
);

const overviewRoute = read('app/api/tournament/admin/overview/route.js');
assert(
    overviewRoute.includes('player_name') && !overviewRoute.includes('full_name)'),
    'Tournament overview should select tournament player_name fields, not missing full_name fields.'
);

const adminPage = read('app/giai-dau/admin/page.js');
assert(
    adminPage.includes('loadTournaments') &&
    adminPage.includes('fetchJson') &&
    adminPage.includes('AbortController') &&
    adminPage.includes('finally') &&
    adminPage.includes('openCreateTournament') &&
    adminPage.includes('handleSaveTournament') &&
    adminPage.includes('handleDeleteTournament') &&
    adminPage.includes('handleAutoAssign') &&
    adminPage.includes('/api/tournaments/auto-assign'),
    'Tournament admin page should manage tournament CRUD and auto assignment.'
);
assert(
    adminPage.includes('m.round_number === round') && !adminPage.includes('m.round === round'),
    'Tournament admin round summaries should use tournament_matches.round_number.'
);

for (const label of [
    'MLP Team Match',
    'Đánh đôi vòng tròn',
    'Vòng bảng + Playoff',
    'Loại trực tiếp',
    'Chia ngẫu nhiên',
    'Chia cặp ngẫu nhiên',
]) {
    assert(adminPage.includes(label), `Tournament admin UI should include "${label}".`);
}

const pkg = read('package.json');
assert(
    pkg.includes('"test:tournament-management-v2"'),
    'package.json should expose the tournament management v2 test script.'
);

console.log('tournament management v2 contract ok');
