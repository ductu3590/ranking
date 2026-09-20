'use strict';

const assert = require('node:assert/strict');
const { buildStagePlan } = require('../../../lib/tournament/stagePlan');

const plan = buildStagePlan({
  divisionId: 'division-1',
  formatKey: 'group_knockout',
  pairs: Array.from({ length: 4 }, (_, index) => ({ pairId: `pair-${index + 1}` })),
});

const [groupStage, knockoutStage] = plan.stages;
assert.equal(groupStage.id, 'stage-1', 'group stage receives its fallback ID before references are built');
assert.equal(knockoutStage.id, 'stage-2', 'knockout stage receives its fallback ID before references are built');
assert.ok(plan.progressions.every((progression) => progression.sourceStageId === groupStage.id && progression.targetStageId === knockoutStage.id), 'progressions use returned stage identities');
assert.ok(plan.matches.filter((match) => match.stageKind === 'knockout').flatMap((match) => [match.slotA, match.slotB]).every((slot) => slot.sourceStageId === (slot.sourceGroupLabel ? groupStage.id : knockoutStage.id)), 'knockout slots use returned stage identities');

console.log('stage plan identities: stable references ok');