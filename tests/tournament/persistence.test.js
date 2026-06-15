// tests/tournament/persistence.test.js
const { scheduleToInsertRows, resolveParentLinks } = require('../../lib/tournament/persistence');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };
const sched = [
  { round: 1, group_label: 'A', bracket_slot: null, parent_slot: null, slot: null, entrant_a_id: 1, entrant_b_id: 2, order: 0 },
];
const rows = scheduleToInsertRows(sched, { stageId: 9, groupId: 7 });
assert(rows[0].group_id === 7 && rows[0].stage_id === 9, 'gắn group_id + stage_id');
assert(rows[0].round === 1 && rows[0].entrant_a_id === 1 && rows[0].match_order === 0, 'map đúng trường');
assert(rows[0].status === 'pending', 'mặc định pending');
assert(!('slot' in rows[0]) && !('parent_slot' in rows[0]), 'không đẩy field engine-local vào DB');
const ko = [
  { slot: 0, parent_slot: 2, round: 1, bracket_slot: 0 },
  { slot: 1, parent_slot: 2, round: 1, bracket_slot: 1 },
  { slot: 2, parent_slot: null, round: 2, bracket_slot: 0 },
];
const dbRows = [
  { id: 100, round: 1, bracket_slot: 0 },
  { id: 101, round: 1, bracket_slot: 1 },
  { id: 102, round: 2, bracket_slot: 0 },
];
const links = resolveParentLinks(ko, dbRows);
assert(links.length === 2, '2 trận có parent');
assert(links.find((l) => l.id === 100).parent_match_id === 102, 'slot0 -> final id 102');
assert(links.find((l) => l.id === 101).parent_match_id === 102, 'slot1 -> final id 102');
console.log('persistence ok');
