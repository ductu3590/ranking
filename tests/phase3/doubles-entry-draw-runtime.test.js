'use strict';

const assert = require('node:assert/strict');
const { buildDrawSlots, validateDraw } = require('../../lib/tournament/draw');
const { generateSchedule } = require('../../lib/tournament/engines/roundRobin');

const stage = { schedule_format: 'round_robin', config: { groupCount: 2 } };
const athleteIds = Array.from({ length: 14 }, (_, index) => `athlete-${index + 1}`);

function persistedStyleEntries(athletes) {
  const pairs = [];
  for (let index = 0; index < athletes.length; index += 2) {
    const memberIds = [athletes[index], athletes[index + 1]].sort();
    pairs.push({
      id: `entry-${index / 2 + 1}`,
      pair_id: `pair:${memberIds.join(':')}`,
      athlete_ids: memberIds,
    });
  }
  return pairs;
}

const entries = persistedStyleEntries(athleteIds);
const reorderedEntries = persistedStyleEntries([
  ...athleteIds.slice(1, 2), athleteIds[0],
  ...athleteIds.slice(3, 4), athleteIds[2],
  ...athleteIds.slice(5, 6), athleteIds[4],
  ...athleteIds.slice(7, 8), athleteIds[6],
  ...athleteIds.slice(9, 10), athleteIds[8],
  ...athleteIds.slice(11, 12), athleteIds[10],
  ...athleteIds.slice(13, 14), athleteIds[12],
]);

assert.equal(entries.length, 7);
assert.equal(new Set(entries.flatMap((entry) => entry.athlete_ids)).size, 14);
assert.deepEqual(
  entries.map((entry) => [entry.id, entry.pair_id, entry.athlete_ids]),
  reorderedEntries.map((entry) => [entry.id, entry.pair_id, entry.athlete_ids]),
  'pair identities remain stable when each pair is received in a different order',
);

const slots = buildDrawSlots(stage, entries, 20260918);
assert.equal(validateDraw(slots, entries, { stage }).ok, true);
const assignedEntries = slots.map((slot) => ({
  id: slot.entry_id,
  seed: slot.seed_in_stage,
  group_label: slot.group_label,
}));
const matches = generateSchedule(stage, assignedEntries, 20260918);
const groupSizes = assignedEntries.reduce((sizes, entry) => {
  sizes[entry.group_label] = (sizes[entry.group_label] || 0) + 1;
  return sizes;
}, {});

assert.deepEqual(groupSizes, { A: 4, B: 3 });
assert.equal(matches.length, 9);
assert.equal(matches.filter((match) => match.group_label === 'A').length, 6);
assert.equal(matches.filter((match) => match.group_label === 'B').length, 3);

const entryIds = new Set(entries.map((entry) => entry.id));
const athleteIdSet = new Set(athleteIds);
for (const match of matches) {
  assert.ok(entryIds.has(match.entrant_a_id));
  assert.ok(entryIds.has(match.entrant_b_id));
  assert.ok(!athleteIdSet.has(match.entrant_a_id));
  assert.ok(!athleteIdSet.has(match.entrant_b_id));
}

console.log('doubles entry draw runtime ok');