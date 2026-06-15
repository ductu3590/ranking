const { seedNextStage, isStageComplete } = require('../../lib/tournament/orchestrator');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const stage1 = { schedule_format: 'round_robin', config: { groupCount: 2, advancePerGroup: 2 } };
const standings = [
  { entrant_id: 1, group_label: 'A', rank: 1 }, { entrant_id: 4, group_label: 'A', rank: 2 },
  { entrant_id: 5, group_label: 'A', rank: 3 }, { entrant_id: 8, group_label: 'A', rank: 4 },
  { entrant_id: 2, group_label: 'B', rank: 1 }, { entrant_id: 3, group_label: 'B', rank: 2 },
  { entrant_id: 6, group_label: 'B', rank: 3 }, { entrant_id: 7, group_label: 'B', rank: 4 },
];
const seeded = seedNextStage(stage1, standings);
assert(seeded.length === 4, '4 đội đi tiếp');
assert(seeded[0].entrant_id === 1 && seeded[0].seed_in_stage === 1, 'nhất A seed 1');
assert(seeded.map((s) => s.entrant_id).sort().join(',') === '1,2,3,4', 'đúng 4 đội đi tiếp');
assert(isStageComplete([{ status: 'done' }, { status: 'done' }]) === true, 'mọi trận done');
assert(isStageComplete([{ status: 'done' }, { status: 'pending' }]) === false, 'còn trận chưa xong');
console.log('orchestrator ok');
