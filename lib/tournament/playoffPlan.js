'use strict';
// Kế hoạch playoff "nhất/nhì hai bảng" — hàm thuần, KHÔNG I/O, KHÔNG React, KHÔNG fetch.
//
// Nguồn chân lý là RPC đã deploy `configure_top_two_group_playoff_revisioned`
// (migration 065, vá tiếp 066 / 071 / 072). Module này KHÔNG tự nghĩ ra thể thức
// mới: nó chỉ mô tả lại đúng đồ thị mà SQL đang ghi, để wizard, console và test
// cùng đọc một chỗ thay vì chép cứng kế hoạch ba nơi.
//
// Thứ tự cạnh dưới đây khớp TỪNG DÒNG với các lệnh INSERT trong 072:
//   A1 -> SF1.a, B2 -> SF1.b, B1 -> SF2.a, A2 -> SF2.b,
//   SF1.winner -> F.a, SF2.winner -> F.b,
//   SF1.loser -> BRONZE.a, SF2.loser -> BRONZE.b   (chỉ khi bật tranh hạng ba)
//
// Quy ước lỗi: hàm dựng kế hoạch NÉM Error có `.code` là mã ổn định.
// Riêng validatePlanPreconditions KHÔNG BAO GIỜ ném — nó trả mã chuỗi ổn định
// để UI từ chối tại chỗ trước khi đi một vòng lên server.

const GROUP_LABELS = Object.freeze(['A', 'B']);
const PLAYOFF_MATCH_KEYS = Object.freeze(['SF1', 'SF2', 'F', 'BRONZE']);
const GROUP_SCHEDULE_FORMAT = 'round_robin';
const PLAYOFF_SCHEDULE_FORMAT = 'knockout';
const ADVANCE_PER_GROUP = 2;

// Tối thiểu 2 đội mỗi bảng: kế hoạch cần cả hạng nhất VÀ hạng nhì của từng bảng.
// Bảng chỉ có 1 đội thì đội đó không đá trận nào, standings không gán được
// group_label, và advance_division_group_rank_transitions sẽ chết ở
// GROUP_RANKING_MISSING. Chặn ngay từ lúc lập kế hoạch cho rẻ.
const MIN_ENTRANTS_PER_GROUP = 2;

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function isPositiveInt(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function groupLabel(index) {
  return String.fromCharCode(65 + index); // 0 -> 'A'
}

// Số cặp trong một bảng n đội = C(n,2). Nhận mảng [4,3] hoặc object {A:4,B:3}.
function expectedGroupFixtureCount(groupSizes) {
  let sizes;
  if (Array.isArray(groupSizes)) {
    sizes = groupSizes.slice();
  } else if (groupSizes && typeof groupSizes === 'object') {
    sizes = Object.keys(groupSizes).sort().map((key) => groupSizes[key]);
  } else {
    throw fail('PLAN_GROUP_SIZES_INVALID', 'groupSizes phải là mảng hoặc object nhãn bảng.');
  }
  if (!sizes.length) throw fail('PLAN_GROUP_SIZES_INVALID', 'Phải có ít nhất một bảng.');
  let total = 0;
  for (const raw of sizes) {
    const size = Number(raw);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw fail('PLAN_GROUP_SIZES_INVALID', 'Số đội mỗi bảng phải là số nguyên không âm.');
    }
    total += (size * (size - 1)) / 2;
  }
  return total;
}

// Tổng số trận của cả vòng bảng lẫn playoff.
// 4/3 đội, không tranh hạng ba = 9 + 3 = 12; có tranh hạng ba = 9 + 4 = 13.
function expectedTotalFixtureCount({ groupSizes, bronze = false } = {}) {
  return expectedGroupFixtureCount(groupSizes) + (bronze === true ? 4 : 3);
}

// Chia bảng kiểu chia bài, GIỐNG HỆT lib/tournament/draw.js::buildDrawSlots cho
// stage round_robin: nhãn = index % groupCount, seed_in_stage = floor(index/groupCount)+1.
// Hàm này KHÔNG xáo: người gọi tự xáo theo seed bốc thăm rồi truyền thứ tự vào,
// nhờ vậy nó deterministic tuyệt đối và test lại được.
// 7 đội / 2 bảng -> A = 4 (chỉ số 0,2,4,6), B = 3 (chỉ số 1,3,5).
function splitEntrantsIntoGroups(entrantIds, groupCount) {
  if (!Array.isArray(entrantIds) || !entrantIds.length) {
    throw fail('PLAN_ENTRANTS_INVALID', 'Danh sách đội phải là mảng không rỗng.');
  }
  if (entrantIds.some((id) => id == null || id === '')) {
    throw fail('PLAN_ENTRANTS_INVALID', 'Danh sách đội có phần tử rỗng.');
  }
  const keys = entrantIds.map((id) => String(id));
  if (new Set(keys).size !== keys.length) {
    throw fail('PLAN_ENTRANTS_DUPLICATE', 'Một đội xuất hiện nhiều hơn một lần.');
  }
  const count = Number(groupCount);
  if (!isPositiveInt(count)) {
    throw fail('PLAN_GROUP_COUNT_INVALID', 'Số bảng phải là số nguyên dương.');
  }
  // Dùng lại đúng mã lỗi của draw.js để UI không phải dịch hai lần.
  if (count > entrantIds.length) {
    throw fail('GROUP_COUNT_EXCEEDS_ENTRIES', 'Số bảng nhiều hơn số đội.');
  }

  const labels = Array.from({ length: count }, (_, index) => groupLabel(index));
  const groups = {};
  const sizes = {};
  labels.forEach((label) => { groups[label] = []; sizes[label] = 0; });

  const slots = entrantIds.map((entrantId, index) => {
    const label = labels[index % count];
    groups[label].push(entrantId);
    sizes[label] += 1;
    return {
      entry_id: entrantId,
      group_label: label,
      seed_in_stage: Math.floor(index / count) + 1,
    };
  });

  return { labels, groups, sizes, slots };
}

// Số đội của bảng thứ i khi chia bài n đội vào g bảng.
function dealtGroupSizes(entrantCount, groupCount) {
  const sizes = {};
  for (let index = 0; index < groupCount; index += 1) {
    sizes[groupLabel(index)] = Math.ceil((entrantCount - index) / groupCount);
  }
  return sizes;
}

function slotSource(edge) {
  return edge.source_kind === 'group_rank'
    ? { kind: 'group_rank', group_label: edge.source_group_label, rank: edge.source_rank }
    : { kind: 'match_outcome', match_key: edge.source_match_key, outcome: edge.source_outcome };
}

function groupRankEdge(label, rank, targetMatchKey, targetSlot) {
  return {
    source_kind: 'group_rank',
    source_stage: 'group',
    source_group_label: label,
    source_rank: rank,
    source_match_key: null,
    source_outcome: null,
    target_stage: 'playoff',
    target_match_key: targetMatchKey,
    target_slot: targetSlot,
  };
}

function matchOutcomeEdge(sourceMatchKey, outcome, targetMatchKey, targetSlot) {
  return {
    source_kind: 'match_outcome',
    source_stage: 'playoff',
    source_group_label: null,
    source_rank: null,
    source_match_key: sourceMatchKey,
    source_outcome: outcome,
    target_stage: 'playoff',
    target_match_key: targetMatchKey,
    target_slot: targetSlot,
  };
}

// Kế hoạch khai báo cho thể thức "hai bảng, lấy nhất/nhì, bán kết chéo bảng".
// Trả plain object; nơi gọi chỉ đọc, không sửa tại chỗ.
function planTopTwoGroupPlayoff({ groupCount = 2, entrantCount, bronze = false } = {}) {
  const groups = Number(groupCount);
  if (!isPositiveInt(groups)) {
    throw fail('PLAN_GROUP_COUNT_INVALID', 'Số bảng phải là số nguyên dương.');
  }
  if (groups !== 2) {
    throw fail(
      'PLAYOFF_PLAN_GROUP_COUNT_UNSUPPORTED',
      'Kế hoạch playoff tường minh đang deploy chỉ hỗ trợ đúng 2 bảng A/B.',
    );
  }
  const entrants = Number(entrantCount);
  if (!isPositiveInt(entrants)) {
    throw fail('PLAYOFF_PLAN_ENTRANT_COUNT_INVALID', 'Số đội phải là số nguyên dương.');
  }
  if (entrants < groups * MIN_ENTRANTS_PER_GROUP) {
    throw fail(
      'PLAYOFF_PLAN_ENTRANT_COUNT_INVALID',
      'Cần ít nhất ' + (groups * MIN_ENTRANTS_PER_GROUP) + ' đội để mỗi bảng đủ hạng nhất và hạng nhì.',
    );
  }
  const withBronze = bronze === true;

  const groupSizes = dealtGroupSizes(entrants, groups);
  const groupFixtureCount = expectedGroupFixtureCount(groupSizes);

  // Toạ độ trận khớp đúng các lệnh INSERT tournament_matches của 072.
  const matches = [
    { match_key: 'SF1', round: 1, bracket_slot: 0, match_order: 0 },
    { match_key: 'SF2', round: 1, bracket_slot: 1, match_order: 1 },
    { match_key: 'F', round: 2, bracket_slot: 0, match_order: 2 },
  ];
  if (withBronze) matches.push({ match_key: 'BRONZE', round: 2, bracket_slot: 1, match_order: 3 });

  // Thứ tự cạnh khớp đúng các lệnh INSERT tournament_stage_transitions của 072.
  const transitions = [
    groupRankEdge('A', 1, 'SF1', 'a'),
    groupRankEdge('B', 2, 'SF1', 'b'),
    groupRankEdge('B', 1, 'SF2', 'a'),
    groupRankEdge('A', 2, 'SF2', 'b'),
    matchOutcomeEdge('SF1', 'winner', 'F', 'a'),
    matchOutcomeEdge('SF2', 'winner', 'F', 'b'),
  ];
  if (withBronze) {
    transitions.push(
      matchOutcomeEdge('SF1', 'loser', 'BRONZE', 'a'),
      matchOutcomeEdge('SF2', 'loser', 'BRONZE', 'b'),
    );
  }

  const bySlot = new Map();
  for (const edge of transitions) bySlot.set(edge.target_match_key + ':' + edge.target_slot, edge);

  const matchPlan = matches.map((match) => ({
    ...match,
    status: 'pending',
    result_type: 'simple',
    slot_a: slotSource(bySlot.get(match.match_key + ':a')),
    slot_b: slotSource(bySlot.get(match.match_key + ':b')),
  }));

  return {
    format: 'top_two_group_playoff',
    bronze: withBronze,
    rpc: {
      name: 'configure_top_two_group_playoff_revisioned',
      setup_action: 'configure_top_two_playoff',
      migration: '065_explicit_playoff_transition_graph.sql',
    },
    group_stage: {
      schedule_format: GROUP_SCHEDULE_FORMAT,
      group_count: groups,
      group_labels: Object.keys(groupSizes),
      group_sizes: groupSizes,
      entrant_count: entrants,
      advance_per_group: ADVANCE_PER_GROUP,
      fixture_count: groupFixtureCount,
    },
    playoff_stage: {
      schedule_format: PLAYOFF_SCHEDULE_FORMAT,
      match_keys: matchPlan.map((match) => match.match_key),
      fixture_count: matchPlan.length,
    },
    matches: matchPlan,
    transitions,
    total_fixture_count: groupFixtureCount + matchPlan.length,
  };
}

function blocker(code, message) {
  return { code, message };
}

function sameId(left, right) {
  return String(left == null ? '' : left) === String(right == null ? '' : right);
}

// Từ chối TẠI CHỖ đúng những điều kiện mà RPC từ chối, để UI không phải bắn một
// vòng lên server chỉ để nhận 409. KHÔNG ném — trả mã chuỗi ổn định.
// `division` là tuỳ chọn: truyền vào thì kiểm thêm khoá roster, vì checkpoint 8
// của hợp đồng đóng băng yêu cầu roster còn 'open'.
function validatePlanPreconditions({
  groupStage,
  playoffStage,
  existingMatches,
  existingTransitions,
  division,
} = {}) {
  const blockers = [];
  const hasGroup = Boolean(groupStage && groupStage.id != null);
  const hasPlayoff = Boolean(playoffStage && playoffStage.id != null);

  if (!hasGroup) {
    blockers.push(blocker('GROUP_STAGE_NOT_FOUND', 'Chưa có giai đoạn vòng bảng của nội dung này.'));
  }
  if (!hasPlayoff) {
    blockers.push(blocker('PLAYOFF_STAGE_NOT_FOUND', 'Chưa có giai đoạn playoff của nội dung này.'));
  }
  if (hasGroup && hasPlayoff) {
    if (sameId(groupStage.id, playoffStage.id)) {
      blockers.push(blocker('PLAYOFF_STAGE_PLAN_INVALID', 'Vòng bảng và playoff không thể là cùng một giai đoạn.'));
    }
    const sameScope = ['tournament_id', 'division_id']
      .every((key) => sameId(groupStage[key], playoffStage[key]));
    if (!sameScope) {
      blockers.push(blocker('SETUP_SCOPE_MISMATCH', 'Hai giai đoạn không cùng một giải/nội dung.'));
    }
  }
  if (groupStage && groupStage.schedule_format !== GROUP_SCHEDULE_FORMAT) {
    blockers.push(blocker('PLAYOFF_STAGE_PLAN_INVALID', 'Giai đoạn vòng bảng phải là thể thức vòng tròn.'));
  }
  if (playoffStage && playoffStage.schedule_format !== PLAYOFF_SCHEDULE_FORMAT) {
    blockers.push(blocker('PLAYOFF_STAGE_PLAN_INVALID', 'Giai đoạn playoff phải là thể thức loại trực tiếp.'));
  }

  // RPC chỉ nhìn trận CỦA stage playoff, nhưng nhìn cạnh ở CẢ HAI đầu
  // (source_stage_id = vòng bảng HOẶC target_stage_id = playoff).
  const matches = (Array.isArray(existingMatches) ? existingMatches : []).filter(Boolean);
  const transitions = (Array.isArray(existingTransitions) ? existingTransitions : []).filter(Boolean);
  const playoffMatches = hasPlayoff
    ? matches.filter((row) => row.stage_id == null || sameId(row.stage_id, playoffStage.id))
    : matches;
  const relatedTransitions = transitions.filter((row) => {
    if (row.source_stage_id == null && row.target_stage_id == null) return true;
    const fromGroup = hasGroup && sameId(row.source_stage_id, groupStage.id);
    const toPlayoff = hasPlayoff && sameId(row.target_stage_id, playoffStage.id);
    return Boolean(fromGroup || toPlayoff);
  });
  if (playoffMatches.length || relatedTransitions.length) {
    blockers.push(blocker(
      'PLAYOFF_PLAN_ALREADY_EXISTS',
      'Nhánh playoff đã được tạo trước đó. Không tạo chồng lên kế hoạch cũ.',
    ));
  }

  if (division && division.roster_lock_status != null && division.roster_lock_status !== 'open') {
    blockers.push(blocker('ROSTER_LOCKED', 'Danh sách đã khoá. Mở khoá trước khi lập nhánh playoff.'));
  }

  const first = blockers.length ? blockers[0] : null;
  return {
    ok: blockers.length === 0,
    code: first ? first.code : null,
    message: first ? first.message : null,
    blockers,
  };
}

module.exports = {
  GROUP_LABELS,
  PLAYOFF_MATCH_KEYS,
  planTopTwoGroupPlayoff,
  expectedGroupFixtureCount,
  expectedTotalFixtureCount,
  splitEntrantsIntoGroups,
  validatePlanPreconditions,
  dealtGroupSizes,
};
