const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } }

assert(exists('database/migrations/013_tournament_settings_group_unique.sql'),
    'Migration 013 should exist.');
const m013 = read('database/migrations/013_tournament_settings_group_unique.sql');
assert(/drop\s+index/i.test(m013) && m013.includes('unique_setting'),
    'Migration 013 should drop the old unique_setting index.');
assert(/group_id,\s*tournament_id,\s*setting_key/i.test(m013),
    'Migration 013 should create a unique index on (group_id, tournament_id, setting_key).');

const settingsRoute = read('app/api/tournament/admin/settings/route.js');
assert(settingsRoute.includes("'round1_reveal_time'") &&
    settingsRoute.includes("'total_courts'") &&
    settingsRoute.includes('setting_key') && settingsRoute.includes('setting_value'),
    'Settings route should read/write key-value settings, not flat columns.');
assert(settingsRoute.includes('tournamentId') &&
    settingsRoute.includes(".eq('tournament_id'"),
    'Settings route should be scoped by tournamentId.');
assert(settingsRoute.includes("onConflict: 'group_id,tournament_id,setting_key'"),
    'Settings upsert should target the group-aware unique index.');
assert(!settingsRoute.includes('tournament_name') && !settingsRoute.includes("order('created_at'"),
    'Settings route should drop dead flat-column logic.');

for (const f of [
    'app/api/tournament/admin/overview/route.js',
    'app/api/tournament/teams/route.js',
    'app/api/tournament/admin/toggle-round1/route.js',
    'app/api/tournament/admin/toggle-pairings-lock/route.js',
    'app/api/tournament/admin/reorder/route.js',
    'app/api/tournament/admin/reset/route.js',
]) {
    const c = read(f);
    assert(c.includes('tournamentId') && c.includes(".eq('tournament_id'"),
        `${f} should be scoped by tournamentId.`);
}
const reset = read('app/api/tournament/admin/reset/route.js');
assert(!reset.includes('00000000-0000-0000-0000-000000000000'),
    'reset route should not use the UUID sentinel against integer ids.');
const teamsRoute = read('app/api/tournament/teams/route.js');
assert(!teamsRoute.includes(".eq('tournament_id', 1)"),
    'teams route should not hardcode tournament_id = 1.');

const adminCenter = read('app/admin/page.js');
assert(adminCenter.includes("searchParams.get('t')") &&
    adminCenter.includes("searchParams.get('tab')"),
    'Admin center should read tournament id (t) and tab from the URL.');
assert(!adminCenter.includes('admin-center-subtabs'),
    'Admin center should drop the hardcoded overview/pairings subtabs.');

assert(exists('app/giai-dau/admin/components/TournamentList.js'),
    'TournamentList component should exist.');
const panel = read('app/giai-dau/admin/page.js');
assert(panel.includes('tournamentId') && panel.includes('TournamentConsole') &&
    panel.includes('TournamentList'),
    'Panel should switch between TournamentList and TournamentConsole.');
const listView = read('app/giai-dau/admin/components/TournamentList.js');
assert(listView.includes('section=tournament&t=') && listView.includes('Tạo'),
    'TournamentList should link into a console and offer create.');

assert(exists('app/giai-dau/admin/components/TournamentForm.js'),
    'TournamentForm component should exist.');
const form = read('app/giai-dau/admin/components/TournamentForm.js');
assert(form.includes("'/api/tournaments'") && form.includes('PATCH') && form.includes('POST') &&
    form.includes('tournament_format') && form.includes('assignment_mode'),
    'TournamentForm should create/update tournaments with format + assignment mode.');
for (const label of ['MLP Team Match', 'Đánh đôi vòng tròn', 'Vòng bảng + Playoff', 'Loại trực tiếp']) {
    assert(form.includes(label), `TournamentForm should include "${label}".`);
}

assert(exists('app/giai-dau/admin/components/TournamentConsole.js'),
    'TournamentConsole component should exist.');
const consoleSrc = read('app/giai-dau/admin/components/TournamentConsole.js');
for (const t of ['Tổng quan', 'Cài đặt', 'Đội', 'Pairings', 'Trận đấu']) {
    assert(consoleSrc.includes(t), `Console tab bar should include "${t}".`);
}
assert(consoleSrc.includes('OverviewTab') && consoleSrc.includes('SettingsTab') &&
    consoleSrc.includes('TeamsTab') && consoleSrc.includes('PairingsTab') && consoleSrc.includes('MatchesTab'),
    'Console should render all five tab components.');
assert(consoleSrc.includes('/api/tournament/admin/reset') && consoleSrc.includes('tournamentId'),
    'Console overflow should reset scoped to this tournament.');

for (const f of ['OverviewTab', 'SettingsTab', 'TeamsTab', 'PairingsTab', 'MatchesTab']) {
    assert(exists(`app/giai-dau/admin/components/tabs/${f}.js`), `${f} should exist.`);
}
const settingsTab = read('app/giai-dau/admin/components/tabs/SettingsTab.js');
assert(settingsTab.includes('/api/tournament/admin/settings') &&
    settingsTab.includes('round1_reveal_time') && settingsTab.includes('total_courts') &&
    settingsTab.includes('tournamentId'),
    'SettingsTab should save per-tournament key-value settings.');
const teamsTab = read('app/giai-dau/admin/components/tabs/TeamsTab.js');
assert(teamsTab.includes('/api/tournaments/auto-assign') && teamsTab.includes('tournamentId'),
    'TeamsTab should auto-assign scoped to this tournament.');
const pairingsTab = read('app/giai-dau/admin/components/tabs/PairingsTab.js');
assert(pairingsTab.includes('read-only') || pairingsTab.includes('chỉ xem'),
    'PairingsTab should be read-only this round.');

console.log('tournament admin redesign contract ok');
