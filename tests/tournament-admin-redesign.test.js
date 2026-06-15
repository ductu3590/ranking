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

console.log('tournament admin redesign contract ok');
