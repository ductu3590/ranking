const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sql = read('database/migrations/056_atomic_draw_unlock.sql');
const hardenedSql = read('database/migrations/057_harden_atomic_draw_unlock.sql');
const finalizeHardenedSql = read('database/migrations/058_harden_atomic_draw_finalize.sql');
const route = read('app/api/tournament-v2/draw/route.js');

assert.match(sql, /CREATE OR REPLACE FUNCTION public\.unlock_tournament_draw/i);
assert.match(sql, /FOR UPDATE/i);
assert.match(sql, /DRAW_CONFLICT/i);
assert.match(sql, /DRAW_HAS_PLAYED_MATCHES/i);
assert.match(sql, /status IN \('warmup', 'live', 'paused', 'finalized'\)/i);
assert.match(sql, /DELETE FROM public\.tournament_matches/i);
assert.match(sql, /DELETE FROM public\.tournament_stage_entrants/i);
assert.match(sql, /pickhub_mutation_idempotency/i);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.unlock_tournament_draw/i);
assert.match(hardenedSql, /LOCK TABLE public\.tournament_matches IN SHARE ROW EXCLUSIVE MODE/i);
assert.match(hardenedSql, /IDEMPOTENCY_KEY_REUSED/i);
assert.match(hardenedSql, /'stageId', p_stage_id/i);
assert.match(finalizeHardenedSql, /CREATE OR REPLACE FUNCTION public\.finalize_tournament_draw/i);
assert.match(finalizeHardenedSql, /LOCK TABLE public\.tournament_matches IN SHARE ROW EXCLUSIVE MODE/i);
assert(finalizeHardenedSql.indexOf('LOCK TABLE public.tournament_matches') < finalizeHardenedSql.indexOf('DRAW_HAS_EXISTING_MATCHES'),
  'finalize takes the fixture-writer lock before checking existing fixtures');
assert.match(route, /rpc\('unlock_tournament_draw'/);
assert.doesNotMatch(route, /from\('tournament_matches'\)[\s\S]{0,120}\.delete\(\)/);
assert.doesNotMatch(route, /if \(status !== 'locked'\)/);
assert.match(route, /Draw unlock audit log failed/);
assert.doesNotMatch(route, /p_expected_config:\s*stage\.config\s*\|\|/,
  'unlock CAS preserves nullable config rather than coercing it to an object');
console.log('atomic draw unlock contract ok');