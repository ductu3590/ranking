const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const sql = fs.readFileSync(path.join(root, 'database/migrations/030_phase3_interclub_tournament.sql'), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};

for (const table of [
  'tournament_divisions', 'tournament_clubs', 'tournament_registrations',
  'tournament_entries', 'tournament_entry_members', 'tournament_staff',
]) {
  assert(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`, 'i').test(sql), `${table} được tạo idempotent`);
  assert(new RegExp(`${table}[\\s\\S]{0,900}group_id bigint NOT NULL`, 'i').test(sql), `${table} có group_id bắt buộc`);
  assert(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i').test(sql), `${table} enable RLS bảo vệ dữ liệu`);
}

for (const token of [
  'organizer_type', 'organizer_club_id', 'created_by_profile_id',
  'interclub_friendly_team_v1', 'UNIQUE (tournament_id, club_id)',
  'idx_tournament_clubs_group_tournament', 'idx_tournament_registrations_group_division',
]) {
  assert(sql.includes(token), `migration có ${token}`);
}

assert(/CHECK[\s\S]*organizer_type[\s\S]*platform[\s\S]*community[\s\S]*club/i.test(sql), 'có constraint organizer type');
assert(!/DROP TABLE/i.test(sql), 'migration Phase 3 không drop dữ liệu Phase 2');
console.log('phase3 migration contract ok');
