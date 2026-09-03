const assert = require('assert');
const {
  normalizePublicSlug,
  projectPublicRecord,
  buildPublicSnapshot,
} = require('../../lib/tournament/publicSnapshot');

assert.strictEqual(normalizePublicSlug('  Spring-2026  '), 'spring-2026');
assert.strictEqual(normalizePublicSlug('   '), null);

const projected = projectPublicRecord({
  id: 7,
  name: 'Spring',
  visibility: 'public',
  group_id: 99,
  settings: { secret: true },
  created_by: 12,
}, ['id', 'name', 'visibility']);
assert.deepStrictEqual(projected, { id: 7, name: 'Spring', visibility: 'public' });

const snapshot = buildPublicSnapshot({
  tournament: { id: 7, name: 'Spring', group_id: 99, visibility: 'public' },
  stages: [{ id: 8, name: 'Vòng bảng', config: { secret: true }, group_id: 99 }],
  entrants: [{ id: 10, name: 'A', member_id: 42, group_id: 99 }],
  matches: [{ id: 20, stage_id: 8, entrant_a_id: 10, group_id: 99 }],
  games: [{ id: 30, match_id: 20, game_no: 1, score_a: 11, score_b: 8, lineup: { secret: true }, group_id: 99 }],
  standingsByStage: {
    8: { schedule_format: 'round_robin', standings: [{ entrant_id: 10, rank: 1, group_id: 99 }] },
  },
});

assert.strictEqual(snapshot.tournament.group_id, undefined);
assert.strictEqual(snapshot.stages[0].config, undefined);
assert.strictEqual(snapshot.entrants[0].member_id, undefined);
assert.strictEqual(snapshot.matches[0].group_id, undefined);
assert.deepStrictEqual(snapshot.gamesByMatchId['20'][0], {
  match_id: 20,
  game_no: 1,
  score_a: 11,
  score_b: 8,
});
assert.strictEqual(snapshot.standingsByStage['8'].standings[0].group_id, undefined);
console.log('phase 1 public snapshot projection behavior ok');
