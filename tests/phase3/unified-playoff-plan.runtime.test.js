'use strict';
// Kế hoạch playoff dùng chung (lib/tournament/playoffPlan.js) phải khớp đúng đồ
// thị mà SQL đã deploy đang ghi, chứ không phải khớp với một bản chép tay.
// Vì vậy test này ĐỌC THẲNG file migration, rút cạnh ra bằng regex rồi so.
// Các file migration trong cây này là CRLF, nên phải chuẩn hoá trước khi so khớp.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const readSql = (file) => fs
  .readFileSync(path.join(root, 'database', 'migrations', file), 'utf8')
  .replace(/\r\n/g, '\n');

const plan = require('../../lib/tournament/playoffPlan');
const { buildDrawSlots } = require('../../lib/tournament/draw');

// Biến PL/pgSQL giữ id trận -> match_key tương ứng.
const SQL_MATCH_SYMBOL = { sf1: 'SF1', sf2: 'SF2', final_id: 'F', bronze_id: 'BRONZE' };

function parseTransitionEdgesFromSql(sql) {
  const edges = [];
  const groupRank = /'group_rank','([AB])',(\d+),p_playoff_stage_id,(\w+),'([ab])'/g;
  let match = groupRank.exec(sql);
  while (match) {
    edges.push({
      source_kind: 'group_rank',
      source_group_label: match[1],
      source_rank: Number(match[2]),
      source_match_key: null,
      source_outcome: null,
      target_match_key: SQL_MATCH_SYMBOL[match[3]],
      target_slot: match[4],
    });
    match = groupRank.exec(sql);
  }
  // 065/066 dùng danh sách cột có source_group_label/source_rank nên có 'NULL,NULL,'
  // ở giữa; 071/072 tách thành câu INSERT riêng nên không có. Chấp nhận cả hai.
  const outcome = /'match_outcome',(?:NULL,NULL,)?(sf\d),'(winner|loser)',p_playoff_stage_id,(\w+),'([ab])'/g;
  match = outcome.exec(sql);
  while (match) {
    edges.push({
      source_kind: 'match_outcome',
      source_group_label: null,
      source_rank: null,
      source_match_key: SQL_MATCH_SYMBOL[match[1]],
      source_outcome: match[2],
      target_match_key: SQL_MATCH_SYMBOL[match[3]],
      target_slot: match[4],
    });
    match = outcome.exec(sql);
  }
  return edges;
}

function parsePlayoffMatchesFromSql(sql) {
  const rows = [];
  const re = /VALUES\(p_group_id,p_division_id,p_playoff_stage_id,(\d+),(\d+),(\d+),'(SF1|SF2|F|BRONZE)','pending','simple'\)/g;
  let match = re.exec(sql);
  while (match) {
    rows.push({
      match_key: match[4],
      round: Number(match[1]),
      bracket_slot: Number(match[2]),
      match_order: Number(match[3]),
      status: 'pending',
      result_type: 'simple',
    });
    match = re.exec(sql);
  }
  return rows;
}

function comparableEdge(edge) {
  return {
    source_kind: edge.source_kind,
    source_group_label: edge.source_group_label,
    source_rank: edge.source_rank,
    source_match_key: edge.source_match_key,
    source_outcome: edge.source_outcome,
    target_match_key: edge.target_match_key,
    target_slot: edge.target_slot,
  };
}

// --- 1. Bảy đội chia 4/3 sinh đúng 9 trận vòng bảng -------------------------

const sevenPlan = plan.planTopTwoGroupPlayoff({ groupCount: 2, entrantCount: 7, bronze: false });
assert.deepEqual(
  sevenPlan.group_stage.group_sizes,
  { A: 4, B: 3 },
  'bảy đội chia hai bảng cho A=4 và B=3',
);
assert.equal(
  plan.expectedGroupFixtureCount({ A: 4, B: 3 }),
  9,
  'C(4,2) + C(3,2) = 6 + 3 = 9 trận vòng bảng',
);
assert.equal(plan.expectedGroupFixtureCount([4, 3]), 9, 'nhận cả dạng mảng');
assert.equal(sevenPlan.group_stage.fixture_count, 9, 'kế hoạch tự tính ra 9 trận vòng bảng');
assert.notEqual(plan.expectedGroupFixtureCount({ A: 4, B: 4 }), 9, '8 đội đều bảng phải khác 9 trận');
assert.equal(plan.expectedGroupFixtureCount({ A: 4, B: 4 }), 12, '4/4 cho 6 + 6 = 12 trận');
assert.equal(plan.expectedGroupFixtureCount({ A: 1, B: 1 }), 0, 'bảng một đội không sinh trận nào');

// --- 2. Tổng số trận 12 (không tranh hạng ba) và 13 (có tranh hạng ba) ------

assert.equal(plan.expectedTotalFixtureCount({ groupSizes: { A: 4, B: 3 }, bronze: false }), 12);
assert.equal(plan.expectedTotalFixtureCount({ groupSizes: { A: 4, B: 3 }, bronze: true }), 13);
assert.equal(sevenPlan.total_fixture_count, 12, 'không tranh hạng ba: 9 + 3 = 12');
assert.equal(sevenPlan.playoff_stage.fixture_count, 3);
assert.deepEqual(sevenPlan.playoff_stage.match_keys, ['SF1', 'SF2', 'F']);

const bronzePlan = plan.planTopTwoGroupPlayoff({ groupCount: 2, entrantCount: 7, bronze: true });
assert.equal(bronzePlan.total_fixture_count, 13, 'có tranh hạng ba: 9 + 4 = 13');
assert.equal(bronzePlan.playoff_stage.fixture_count, 4);
assert.deepEqual(bronzePlan.playoff_stage.match_keys, ['SF1', 'SF2', 'F', 'BRONZE']);
assert.equal(bronzePlan.total_fixture_count - sevenPlan.total_fixture_count, 1, 'bật hạng ba thêm đúng 1 trận');

// bronze phải là boolean thật, không truthy tuỳ tiện.
assert.equal(plan.planTopTwoGroupPlayoff({ entrantCount: 7, bronze: 'yes' }).bronze, false);
assert.equal(plan.planTopTwoGroupPlayoff({ entrantCount: 7, bronze: 'yes' }).total_fixture_count, 12);

// --- 3. Bộ cạnh khớp ĐÚNG migration đã deploy ------------------------------

const sqlFiles = [
  '065_explicit_playoff_transition_graph.sql',
  '066_harden_playoff_transition_scope.sql',
  '071_fix_playoff_plan_transition_insert.sql',
  '072_fix_playoff_plan_mutation_insert.sql',
];

const expectedBronzeEdges = bronzePlan.transitions.map(comparableEdge);
assert.equal(expectedBronzeEdges.length, 8, 'kế hoạch có hạng ba gồm đúng 8 cạnh');
assert.deepEqual(expectedBronzeEdges, [
  { source_kind: 'group_rank', source_group_label: 'A', source_rank: 1, source_match_key: null, source_outcome: null, target_match_key: 'SF1', target_slot: 'a' },
  { source_kind: 'group_rank', source_group_label: 'B', source_rank: 2, source_match_key: null, source_outcome: null, target_match_key: 'SF1', target_slot: 'b' },
  { source_kind: 'group_rank', source_group_label: 'B', source_rank: 1, source_match_key: null, source_outcome: null, target_match_key: 'SF2', target_slot: 'a' },
  { source_kind: 'group_rank', source_group_label: 'A', source_rank: 2, source_match_key: null, source_outcome: null, target_match_key: 'SF2', target_slot: 'b' },
  { source_kind: 'match_outcome', source_group_label: null, source_rank: null, source_match_key: 'SF1', source_outcome: 'winner', target_match_key: 'F', target_slot: 'a' },
  { source_kind: 'match_outcome', source_group_label: null, source_rank: null, source_match_key: 'SF2', source_outcome: 'winner', target_match_key: 'F', target_slot: 'b' },
  { source_kind: 'match_outcome', source_group_label: null, source_rank: null, source_match_key: 'SF1', source_outcome: 'loser', target_match_key: 'BRONZE', target_slot: 'a' },
  { source_kind: 'match_outcome', source_group_label: null, source_rank: null, source_match_key: 'SF2', source_outcome: 'loser', target_match_key: 'BRONZE', target_slot: 'b' },
], 'A1-B2 / B1-A2, người thắng bán kết vào chung kết, người thua vào tranh hạng ba');

for (const file of sqlFiles) {
  const sql = readSql(file);
  const sqlEdges = parseTransitionEdgesFromSql(sql);
  assert.equal(sqlEdges.length, 8, file + ': rút đúng 8 cạnh khỏi SQL (regex không hụt)');
  assert.deepEqual(sqlEdges, expectedBronzeEdges, file + ': đồ thị của kế hoạch khớp SQL đã deploy');
  // Không có cạnh nào đổ vào cùng một ô của cùng một trận: đúng ràng buộc
  // UNIQUE (group_id, target_match_id, target_slot) của bảng transitions.
  const slotKeys = sqlEdges.map((edge) => edge.target_match_key + ':' + edge.target_slot);
  assert.equal(new Set(slotKeys).size, slotKeys.length, file + ': mỗi ô nhánh chỉ có đúng một nguồn');
}

// Kế hoạch không bật hạng ba = đúng phần SQL nằm ngoài nhánh IF bronze_id.
assert.deepEqual(
  sevenPlan.transitions.map(comparableEdge),
  expectedBronzeEdges.filter((edge) => edge.target_match_key !== 'BRONZE'),
  'tắt hạng ba thì bỏ đúng hai cạnh loser, các cạnh còn lại giữ nguyên thứ tự',
);
assert.equal(
  sevenPlan.transitions.filter((edge) => edge.source_outcome === 'loser').length,
  0,
  'không tạo BRONZE thì không có cạnh loser nào treo lơ lửng',
);

// Toạ độ trận (round / bracket_slot / match_order) cũng phải khớp SQL.
const sqlMatches = parsePlayoffMatchesFromSql(readSql('072_fix_playoff_plan_mutation_insert.sql'));
assert.equal(sqlMatches.length, 4, 'SQL tạo SF1, SF2, F và BRONZE');
assert.deepEqual(
  bronzePlan.matches.map(({ match_key, round, bracket_slot, match_order, status, result_type }) => ({
    match_key, round, bracket_slot, match_order, status, result_type,
  })),
  sqlMatches,
  'toạ độ trận playoff khớp SQL đã deploy',
);

// Mỗi ô của mỗi trận playoff phải có nguồn tường minh — không ô nào bỏ trống.
for (const match of bronzePlan.matches) {
  assert.ok(match.slot_a && match.slot_b, match.match_key + ' phải có nguồn cho cả hai ô');
}
assert.deepEqual(bronzePlan.matches[0].slot_a, { kind: 'group_rank', group_label: 'A', rank: 1 });
assert.deepEqual(bronzePlan.matches[0].slot_b, { kind: 'group_rank', group_label: 'B', rank: 2 });
assert.deepEqual(bronzePlan.matches[2].slot_a, { kind: 'match_outcome', match_key: 'SF1', outcome: 'winner' });
assert.deepEqual(bronzePlan.matches[3].slot_b, { kind: 'match_outcome', match_key: 'SF2', outcome: 'loser' });

// --- 4. Chia bảng deterministic cho 7 đội ----------------------------------

const entrantIds = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'];
const split = plan.splitEntrantsIntoGroups(entrantIds, 2);
assert.deepEqual(split.sizes, { A: 4, B: 3 }, 'bảy đội: A=4, B=3');
assert.deepEqual(split.groups, { A: ['e1', 'e3', 'e5', 'e7'], B: ['e2', 'e4', 'e6'] }, 'chia bài luân phiên');
assert.deepEqual(split.slots[0], { entry_id: 'e1', group_label: 'A', seed_in_stage: 1 });
assert.deepEqual(split.slots[1], { entry_id: 'e2', group_label: 'B', seed_in_stage: 1 });
assert.deepEqual(split.slots[6], { entry_id: 'e7', group_label: 'A', seed_in_stage: 4 });
assert.equal(split.slots.length, 7, 'không đội nào rơi mất');
assert.deepEqual(
  split.slots.map((slot) => slot.entry_id).slice().sort(),
  entrantIds.slice().sort(),
  'đúng bảy đội ban đầu, không thêm không bớt',
);
// Mỗi (bảng, hạt giống) chỉ có đúng một đội — điều kiện validateDraw đòi hỏi.
const positionKeys = split.slots.map((slot) => slot.group_label + ':' + slot.seed_in_stage);
assert.equal(new Set(positionKeys).size, 7, 'không hai đội nào chung một vị trí bốc thăm');

// Deterministic: gọi lại cho kết quả y hệt, không phụ thuộc lần chạy.
assert.deepEqual(plan.splitEntrantsIntoGroups(entrantIds, 2), split, 'gọi lại cho cùng một kết quả');
// Đổi thứ tự đầu vào PHẢI đổi kết quả — nếu không thì test trên là vô nghĩa.
assert.notDeepEqual(
  plan.splitEntrantsIntoGroups(entrantIds.slice().reverse(), 2).groups,
  split.groups,
  'thứ tự đầu vào quyết định bảng, nên đảo thứ tự phải ra bảng khác',
);

// Phải khớp với đường bốc thăm thật (draw.js), nếu không UI hiện một đằng
// server lưu một nẻo.
const drawSlots = buildDrawSlots(
  { schedule_format: 'round_robin', config: { groupCount: 2 } },
  entrantIds.map((id) => ({ id })),
  20260918,
);
const drawSizes = drawSlots.reduce((sizes, slot) => {
  sizes[slot.group_label] = (sizes[slot.group_label] || 0) + 1;
  return sizes;
}, {});
assert.deepEqual(drawSizes, split.sizes, 'kích thước bảng khớp buildDrawSlots của đường bốc thăm thật');
assert.deepEqual(
  plan.splitEntrantsIntoGroups(drawSlots.map((slot) => slot.entry_id), 2).slots,
  drawSlots,
  'cùng thứ tự đội thì sinh ra đúng bộ slot mà buildDrawSlots sinh ra',
);
assert.equal(
  plan.expectedGroupFixtureCount(drawSizes),
  9,
  'bản bốc thăm thật cũng cho 9 trận vòng bảng',
);

// --- 5. Từ chối đầu vào không hợp lệ --------------------------------------

// Mã lỗi nằm trên `.code`, không phải trên chuỗi thông báo cho người dùng.
function throwsCode(run, code, label) {
  assert.throws(run, (error) => error && error.code === code, label || code);
}

throwsCode(() => plan.splitEntrantsIntoGroups(['e1', 'e1', 'e2'], 2), 'PLAN_ENTRANTS_DUPLICATE');
throwsCode(() => plan.splitEntrantsIntoGroups([], 2), 'PLAN_ENTRANTS_INVALID');
throwsCode(() => plan.splitEntrantsIntoGroups([null, 'e2'], 2), 'PLAN_ENTRANTS_INVALID');
throwsCode(() => plan.splitEntrantsIntoGroups(['e1'], 2), 'GROUP_COUNT_EXCEEDS_ENTRIES');
throwsCode(() => plan.splitEntrantsIntoGroups(entrantIds, 0), 'PLAN_GROUP_COUNT_INVALID');
throwsCode(() => plan.splitEntrantsIntoGroups(entrantIds, 2.5), 'PLAN_GROUP_COUNT_INVALID');
throwsCode(() => plan.expectedGroupFixtureCount(null), 'PLAN_GROUP_SIZES_INVALID');
throwsCode(() => plan.expectedGroupFixtureCount({ A: -1 }), 'PLAN_GROUP_SIZES_INVALID');
throwsCode(() => plan.expectedGroupFixtureCount([]), 'PLAN_GROUP_SIZES_INVALID');
// Ba bảng: đồ thị SF1/SF2 đang deploy chỉ có bốn suất, nên phải từ chối rõ ràng
// thay vì im lặng sinh kế hoạch sai.
throwsCode(
  () => plan.planTopTwoGroupPlayoff({ groupCount: 3, entrantCount: 9 }),
  'PLAYOFF_PLAN_GROUP_COUNT_UNSUPPORTED',
);
// Bảng chỉ có một đội thì không có hạng nhì để lấy.
throwsCode(
  () => plan.planTopTwoGroupPlayoff({ groupCount: 2, entrantCount: 3 }),
  'PLAYOFF_PLAN_ENTRANT_COUNT_INVALID',
);
throwsCode(
  () => plan.planTopTwoGroupPlayoff({ groupCount: 2, entrantCount: 0 }),
  'PLAYOFF_PLAN_ENTRANT_COUNT_INVALID',
);
assert.equal(
  plan.planTopTwoGroupPlayoff({ groupCount: 2, entrantCount: 4 }).group_stage.fixture_count,
  2,
  'bốn đội chia 2/2 là trường hợp nhỏ nhất hợp lệ, cho 1 + 1 = 2 trận bảng',
);
try {
  plan.planTopTwoGroupPlayoff({ groupCount: 2, entrantCount: 3 });
  assert.fail('phải ném lỗi');
} catch (error) {
  assert.equal(error.code, 'PLAYOFF_PLAN_ENTRANT_COUNT_INVALID', 'lỗi mang mã ổn định trên .code');
}

// --- 6. Điều kiện tiên quyết: từ chối tại chỗ đúng như RPC từ chối ---------

const groupStage = { id: 38, tournament_id: 47, division_id: 35, schedule_format: 'round_robin' };
const playoffStage = { id: 39, tournament_id: 47, division_id: 35, schedule_format: 'knockout' };

const clean = plan.validatePlanPreconditions({
  groupStage,
  playoffStage,
  existingMatches: [],
  existingTransitions: [],
});
assert.deepEqual(clean, { ok: true, code: null, message: null, blockers: [] }, 'chưa có gì thì cho phép lập kế hoạch');

// Thiếu tham số hoàn toàn: trả mã, KHÔNG ném.
const empty = plan.validatePlanPreconditions();
assert.equal(empty.ok, false);
assert.equal(empty.code, 'GROUP_STAGE_NOT_FOUND');
assert.ok(empty.blockers.some((item) => item.code === 'PLAYOFF_STAGE_NOT_FOUND'));
assert.ok(empty.blockers.every((item) => typeof item.code === 'string' && item.code === item.code.toUpperCase()));

const wrongGroupFormat = plan.validatePlanPreconditions({
  groupStage: { ...groupStage, schedule_format: 'knockout' },
  playoffStage,
  existingMatches: [],
  existingTransitions: [],
});
assert.equal(wrongGroupFormat.ok, false);
assert.equal(wrongGroupFormat.code, 'PLAYOFF_STAGE_PLAN_INVALID', 'vòng bảng không phải round_robin thì từ chối');

const wrongPlayoffFormat = plan.validatePlanPreconditions({
  groupStage,
  playoffStage: { ...playoffStage, schedule_format: 'round_robin' },
  existingMatches: [],
  existingTransitions: [],
});
assert.equal(wrongPlayoffFormat.code, 'PLAYOFF_STAGE_PLAN_INVALID', 'playoff không phải knockout thì từ chối');

const alreadyHasMatches = plan.validatePlanPreconditions({
  groupStage,
  playoffStage,
  existingMatches: [{ id: 900, stage_id: 39, match_key: 'SF1' }],
  existingTransitions: [],
});
assert.equal(alreadyHasMatches.code, 'PLAYOFF_PLAN_ALREADY_EXISTS', 'stage playoff đã có trận thì không tạo chồng');

const alreadyHasTransitions = plan.validatePlanPreconditions({
  groupStage,
  playoffStage,
  existingMatches: [],
  existingTransitions: [{ id: 5, source_stage_id: 38, target_stage_id: 39, target_slot: 'a' }],
});
assert.equal(alreadyHasTransitions.code, 'PLAYOFF_PLAN_ALREADY_EXISTS', 'đã có cạnh thì không tạo chồng');

// Trận của CHÍNH vòng bảng không phải lý do từ chối: RPC chỉ nhìn stage playoff.
const groupFixturesOnly = plan.validatePlanPreconditions({
  groupStage,
  playoffStage,
  existingMatches: [{ id: 800, stage_id: 38, group_label: 'A' }],
  existingTransitions: [],
});
assert.equal(groupFixturesOnly.ok, true, 'đã bốc thăm vòng bảng vẫn lập được nhánh playoff');

// Cạnh của một cặp stage khác trong cùng giải cũng không được chặn nhầm.
const foreignTransition = plan.validatePlanPreconditions({
  groupStage,
  playoffStage,
  existingMatches: [],
  existingTransitions: [{ id: 6, source_stage_id: 77, target_stage_id: 78, target_slot: 'a' }],
});
assert.equal(foreignTransition.ok, true, 'cạnh của nội dung khác không chặn nội dung này');

const crossScope = plan.validatePlanPreconditions({
  groupStage,
  playoffStage: { ...playoffStage, division_id: 36 },
  existingMatches: [],
  existingTransitions: [],
});
assert.equal(crossScope.code, 'SETUP_SCOPE_MISMATCH', 'hai stage khác nội dung thì từ chối');

const sameStage = plan.validatePlanPreconditions({
  groupStage,
  playoffStage: { ...groupStage, schedule_format: 'knockout' },
  existingMatches: [],
  existingTransitions: [],
});
assert.equal(sameStage.code, 'PLAYOFF_STAGE_PLAN_INVALID', 'không thể lấy chính vòng bảng làm playoff');

// Checkpoint 8 của hợp đồng đóng băng: roster phải còn mở.
const locked = plan.validatePlanPreconditions({
  groupStage,
  playoffStage,
  existingMatches: [],
  existingTransitions: [],
  division: { id: 35, roster_lock_status: 'locked' },
});
assert.equal(locked.ok, false);
assert.equal(locked.code, 'ROSTER_LOCKED', 'roster đã khoá thì RPC sẽ từ chối, UI phải biết trước');
assert.equal(
  plan.validatePlanPreconditions({
    groupStage, playoffStage, existingMatches: [], existingTransitions: [],
    division: { id: 35, roster_lock_status: 'open' },
  }).ok,
  true,
  'roster đang mở thì không chặn',
);

console.log('unified playoff plan runtime ok');
