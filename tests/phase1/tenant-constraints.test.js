const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(
  path.join(root, 'database/migrations/020_phase1_tenant_constraints.sql'),
  'utf8',
);

assert.match(sql, /club_members[\s\S]*group_id/);
assert.match(sql, /idx_club_members_group_full_name/);
assert.match(sql, /ranking_snapshots[\s\S]*ADD COLUMN IF NOT EXISTS group_id/);
assert.match(sql, /ranking_snapshots[\s\S]*SET group_id/);
assert.match(sql, /ranking_snapshots_group_member_date/);
assert.match(sql, /orphan|cross-tenant|ambiguous/i);
assert.match(sql, /RAISE EXCEPTION/);
for (const constraint of [
  'tournament_stages_group_tournament_fk',
  'tournament_entrants_group_tournament_fk',
  'tournament_entrant_members_group_entrant_fk',
  'tournament_stage_entrants_group_stage_fk',
  'tournament_stage_entrants_group_entrant_fk',
  'tournament_matches_group_stage_fk',
  'tournament_matches_group_entrant_a_fk',
  'tournament_matches_group_entrant_b_fk',
  'tournament_matches_group_winner_fk',
  'tournament_matches_group_parent_fk',
  'tournament_games_group_match_fk',
  'tournament_games_group_winner_fk',
]) assert(sql.includes(constraint), `thiếu composite FK ${constraint}`);
assert(sql.includes('tournament_entrant_members_member_fk'), 'member_id phải có semantic FK');
assert(!/DELETE FROM|DROP TABLE/i.test(sql), 'migration không xoá dữ liệu/bảng');
console.log('phase 1 tenant constraints contract ok');
