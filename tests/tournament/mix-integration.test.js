// tests/tournament/mix-integration.test.js
// End-to-end: round-robin stage -> standings -> seedNextStage -> knockout generateSchedule must build a real bracket.
const roundRobin = require('../../lib/tournament/engines/roundRobin');
const knockout = require('../../lib/tournament/engines/knockout');
const { seedNextStage } = require('../../lib/tournament/orchestrator');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const stage1 = { schedule_format: 'round_robin', config: { groupCount: 2, advancePerGroup: 2 } };
// 4 đội đi tiếp (top-2 mỗi bảng) -> knockout bracket 4
const standings = [
  { entrant_id: 1, group_label: 'A', rank: 1 }, { entrant_id: 4, group_label: 'A', rank: 2 },
  { entrant_id: 5, group_label: 'A', rank: 3 }, { entrant_id: 8, group_label: 'A', rank: 4 },
  { entrant_id: 2, group_label: 'B', rank: 1 }, { entrant_id: 3, group_label: 'B', rank: 2 },
  { entrant_id: 6, group_label: 'B', rank: 3 }, { entrant_id: 7, group_label: 'B', rank: 4 },
];
const seeded = seedNextStage(stage1, standings);
// output phải dùng được trực tiếp cho generateSchedule: có id + seed
assert(seeded.every((s) => s.id != null && s.seed != null), 'seedNextStage phải trả id + seed');
// vẫn giữ entrant_id + seed_in_stage cho API lưu
assert(seeded.every((s) => s.entrant_id != null && s.seed_in_stage != null), 'giữ entrant_id + seed_in_stage');

const ko = knockout.generateSchedule({ config: {} }, seeded, 1);
const r1 = ko.filter((m) => m.round === 1);
assert(r1.length === 2, `bracket 4 -> 2 trận vòng 1, got ${r1.length}`);
assert(r1.every((m) => m.entrant_a_id && m.entrant_b_id), 'vòng 1 không có entrant null (bracket không rỗng)');
const ids = new Set(ko.flatMap((m) => [m.entrant_a_id, m.entrant_b_id]).filter(Boolean));
assert([1, 2, 3, 4].every((x) => ids.has(x)), 'đúng 4 đội đi tiếp vào bracket');
console.log('mix-integration ok');
