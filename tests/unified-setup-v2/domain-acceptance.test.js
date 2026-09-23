'use strict';

const { assert, expectModule } = require('./_harness');

// Locked acceptance: the domain must produce the same real identities for preview
// and finalization, including pending progression slots rather than fake entrants.
const buildStagePlan = expectModule('lib/tournament/stagePlan.js', 'buildStagePlan');

const pairs = Array.from({ length: 7 }, (_, index) => ({
    pairId: `pair-${index + 1}`,
    memberIds: [`member-${index * 2 + 1}`, `member-${index * 2 + 2}`],
    locked: index === 0,
}));

for (const thirdPlaceEnabled of [false, true]) {
    const plan = buildStagePlan({
        divisionId: 'division-14',
        formatKey: 'group_knockout',
        groupCount: 2,
        pairs,
        thirdPlaceEnabled,
    });
    assert.equal(plan.stages.length, 2, 'group_knockout creates exactly two stages');
    assert.equal(plan.stages[0].division_id, 'division-14', 'group stage belongs to division');
    assert.equal(plan.stages[1].division_id, 'division-14', 'knockout stage belongs to same division');
    assert.deepEqual(plan.groupSizes, [4, 3], 'seven pairs are drawn into 4/3 groups');
    assert.equal(plan.matches.filter((match) => match.stageKind === 'group').length, 9, '4/3 groups create 6+3 group matches');
    assert.equal(plan.matches.length, thirdPlaceEnabled ? 13 : 12, 'total is 12, or 13 with third-place match');
    assert.ok(plan.progressions.some((item) => item.sourceGroupLabel === 'A' && item.sourceRank === 1 && item.targetSlot === 'semi-1-a'), 'Nhất A progresses to semifinal');
    assert.ok(plan.progressions.some((item) => item.sourceGroupLabel === 'B' && item.sourceRank === 2 && item.targetSlot === 'semi-1-b'), 'Nhì B progresses to semifinal');
    assert.ok(plan.matches.filter((match) => match.stageKind === 'knockout').every((match) => [match.slotA, match.slotB].filter(Boolean).every((slot) => slot.kind === 'progression')), 'playoff slots are pending progression references, not fake entrants');
}

console.log('domain acceptance: 14-athlete group-knockout contract ok');
