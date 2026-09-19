'use strict';

const assert = require('node:assert/strict');
const { resolveGroupCount } = require('../../lib/tournament/setupContract');
const { buildDrawSlots, swapDrawSlots, validateDraw } = require('../../lib/tournament/draw');
const rr = require('../../lib/tournament/engines/roundRobin');

for (const key of ['groupCount', 'groups', 'group_count']) {
  assert.equal(resolveGroupCount({ [key]: 2 }), 2);
}
assert.equal(resolveGroupCount({}), 1);
assert.throws(() => resolveGroupCount({ groupCount: 2, groups: 1 }), /CONFLICTING/);
for (const value of [0, -1, 1.5, '', 'bad']) {
  assert.throws(() => resolveGroupCount({ groupCount: value }), /INVALID/);
}

const stage = { schedule_format: 'round_robin', config: { groupCount: 2 } };
const entries = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 }));
const original = buildDrawSlots(stage, entries, 42);
const slots = swapDrawSlots(original, original[0].entry_id, original[1].entry_id);
const assigned = slots.map((slot) => ({ id: slot.entry_id, seed: slot.seed_in_stage, group_label: slot.group_label }));
const matches = rr.generateSchedule(stage, assigned, 42);
assert.equal(matches.length, 9);
assert.equal(matches.filter((match) => match.group_label === 'A').length, 6);
assert.equal(matches.filter((match) => match.group_label === 'B').length, 3);
for (const match of matches) {
  for (const id of [match.entrant_a_id, match.entrant_b_id]) {
    assert.equal(assigned.find((entry) => entry.id === id).group_label, match.group_label);
  }
}
assert.equal(new Set(matches.map((match) => [match.entrant_a_id, match.entrant_b_id].sort().join(':'))).size, 9);
assert.deepEqual(rr.generateSchedule(stage, assigned, 42), matches);
assert.throws(() => rr.generateSchedule(stage, [...assigned.slice(0, 6), { id: 7 }]), /INCOMPLETE/);
assert.throws(() => rr.generateSchedule({ config: { groupCount: 3 } }, assigned), /MISMATCH/);
assert.throws(() => buildDrawSlots({ config: { groupCount: 8 } }, entries), /EXCEEDS/);
console.log('setup draw contract ok');

const options = { stage, organizerMode: 'internal' };
const sameClubEntries = entries.map((entry) => ({ ...entry, club_id: 10 }));
assert.equal(validateDraw(slots, sameClubEntries, options).ok, true);
assert.equal(validateDraw(slots, sameClubEntries, options).warnings.length, 0);
assert.ok(validateDraw(slots, sameClubEntries, { stage, organizerMode: 'friendly' }).warnings
  .some((warning) => warning.code === 'DRAW_SAME_CLUB_IN_GROUP'));
assert.equal(validateDraw(slots.slice(1), entries, options).code, 'DRAW_MISSING_ENTRY');
assert.equal(validateDraw([...slots.slice(1), { ...slots[0], entry_id: 999 }], entries, options).code, 'DRAW_UNKNOWN_ENTRY');
assert.equal(validateDraw(null, entries, options).code, 'DRAW_INVALID_SLOTS');
assert.equal(validateDraw([null], entries, options).code, 'DRAW_INVALID_SLOTS');
assert.equal(validateDraw(slots.map((slot) => ({ ...slot, group_label: 'Z' })), entries, options).code, 'DRAW_INVALID_GROUP');
assert.equal(validateDraw(slots.map((slot) => ({ ...slot, group_label: 'A' })), entries, options).code, 'DRAW_EMPTY_GROUP');
assert.equal(validateDraw(slots.map((slot) => ({ ...slot, seed_in_stage: 0 })), entries, options).code, 'DRAW_INVALID_SEED');
assert.equal(validateDraw(slots.map((slot) => ({ ...slot, seed_in_stage: 1 })), entries, options).code, 'DRAW_DUPLICATE_POSITION');
const koStage = { schedule_format: 'knockout', config: {} };
assert.equal(validateDraw(buildDrawSlots(koStage, entries, 42), entries, { stage: koStage }).ok, true);
assert.equal(validateDraw(slots, entries, { stage: { ...stage, config: { groupCount: 2, groups: 3 } } }).code, 'DRAW_INVALID_CONFIG');
console.log('setup draw validation ok');