const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { generateAndPersistSchedule } = require('../../lib/tournament/generateSchedule');

const generateScheduleSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'tournament', 'generateSchedule.js'),
  'utf8',
);
assert.match(generateScheduleSource, /p_expected_config:\s*stage\.config/,
  'finalize CAS passes the loaded config snapshot unchanged');
assert.doesNotMatch(generateScheduleSource, /p_expected_config:\s*stage\.config\s*\|\|/,
  'finalize CAS must not coerce a nullable config snapshot to an object');

(async () => {
  const stage = { id: 7, division_id: 8, schedule_format: 'round_robin', config: { groupCount: 2 } };
  const entrants = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, group_label: i < 4 ? 'A' : 'B' }));
  let calls = 0;
  const db = { rpc: async (name, args) => {
    calls++;
    assert.equal(name, 'finalize_tournament_draw');
    assert.deepEqual(args.p_expected_config, stage.config);
    assert.equal(args.p_matches.length, 9);
    assert.equal(args.p_group_id, 3);
    assert.equal(args.p_idempotency_key, 'retry-key');
    return { data: { success: true, matchCount: 9, draw: { status: 'locked' } } };
  } };
  const result = await generateAndPersistSchedule(db, { stage, entrants, groupId: 3, finalizeDraw: true, idempotencyKey: 'retry-key' });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);

  console.log('atomic draw RPC dispatch ok');
})().catch((error) => { console.error(error); process.exitCode = 1; });