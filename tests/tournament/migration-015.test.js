const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const sql = read('database/migrations/015_tournament_module_v2.sql');

for (const t of ['tournament_teams', 'tournament_players', 'tournament_pairings', 'tournament_matches', 'tournament_settings']) {
  assert(new RegExp(`DROP TABLE IF EXISTS ${t}`, 'i').test(sql), `phải drop bảng cũ ${t}`);
}
for (const t of ['tournaments', 'tournament_stages', 'tournament_entrants', 'tournament_entrant_members', 'tournament_stage_entrants', 'tournament_matches', 'tournament_games']) {
  assert(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`, 'i').test(sql), `phải tạo bảng ${t}`);
}
assert(/entrant_type[\s\S]*?CHECK[\s\S]*?'pair'[\s\S]*?'team'/i.test(sql), 'tournaments.entrant_type check pair/team');
assert(/schedule_format[\s\S]*?'round_robin'[\s\S]*?'knockout'/i.test(sql), 'stage.schedule_format check');
assert(/match_format[\s\S]*?'simple'[\s\S]*?'mlp'/i.test(sql), 'stage.match_format check');
assert((sql.match(/group_id/gi) || []).length >= 7, 'mọi bảng có group_id');
assert(/DISABLE ROW LEVEL SECURITY/i.test(sql), 'RLS disable backstop');
console.log('migration-015 contract ok');
