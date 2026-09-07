const assert = require('assert');
const { buildSchedulePreview } = require('../../lib/tournament/schedulePreview');

const rr = buildSchedulePreview({ competition: { schedule_format: 'round_robin', group_count: 1 }, entrantCount: 4, seed: 1 });
assert.strictEqual(rr.format, 'round_robin');
assert.strictEqual(rr.matches.length, 6, '4 đội vòng tròn = 6 trận');
const rr2 = buildSchedulePreview({ competition: { schedule_format: 'round_robin', group_count: 1 }, entrantCount: 4, seed: 1 });
assert.deepStrictEqual(rr.matches, rr2.matches, 'cùng seed cho cùng lịch');

const ko = buildSchedulePreview({ competition: { schedule_format: 'knockout' }, entrantCount: 4, seed: 1 });
assert.strictEqual(ko.format, 'knockout');
assert(ko.matches.length >= 2, 'knockout có trận vòng 1');

const mix = buildSchedulePreview({ competition: { schedule_format: 'round_robin', group_count: 2 }, entrantCount: 6, seed: 1 });
assert(mix.groups >= 2, 'mix có từ 2 bảng');

const empty = buildSchedulePreview({ competition: { schedule_format: 'round_robin', group_count: 1 }, entrantCount: 0, seed: 1 });
assert.strictEqual(empty.matches.length, 0);
console.log('phase3 schedule preview ok');
