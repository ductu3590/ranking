'use strict';
// Vòng tròn tính điểm cho giải nội bộ đánh đôi (spec Lát B): một bảng, mọi cặp gặp nhau
// một lần, xếp hạng chung cuộc theo bảng điểm. Không vòng loại, không chung kết → mọi
// trận BO1.
//
// Thứ tự: xáo pairId (đã sort) bằng PRNG chuỗi của setupPlans rồi gọi engine roundRobin
// với shuffle:false. roundRobin.js là file đóng băng và PRNG của nó chỉ nhận seed số.

const roundRobin = require('../engines/roundRobin');
const { getFormat } = require('../setupFormats');
const { planError, seededShuffle, STAGE_SCORING } = require('./common');

function buildRoundRobinPlan({ pairIds = [], seed, divisionId }) {
  if (!seed) planError('DRAW_SEED_REQUIRED', 'Chưa bốc thăm');
  const ids = pairIds.map(String);
  if (new Set(ids).size !== ids.length) planError('DUPLICATE_ENTRY_ID', 'Một cặp xuất hiện hai lần');
  const min = getFormat('round_robin').minPairs();
  if (ids.length < min) planError('PAIR_COUNT_BELOW_MINIMUM', 'Không đủ số cặp cho vòng tròn', { min, count: ids.length });

  const order = seededShuffle(ids.sort(), `round-robin:${seed}`);
  const fixtures = roundRobin.generateSchedule(
    { schedule_format: 'round_robin', config: { groupCount: 1, shuffle: false } },
    order.map((id) => ({ id })),
    1,
  );
  const matches = fixtures
    .map((fixture) => ({ round: fixture.round, a: String(fixture.entrant_a_id), b: String(fixture.entrant_b_id) }))
    .sort((x, y) => x.round - y.round)
    .map((fixture, index) => ({
      matchKey: `GROUP-A-${index + 1}`,
      // planKey 'group-stage' để RPC v4 ghi stage_entrants theo cùng một đường với vòng bảng.
      stagePlanKey: 'group-stage',
      stageKind: 'group',
      groupLabel: 'A',
      round: fixture.round,
      entryAId: fixture.a,
      entryBId: fixture.b,
      order: index + 1,
    }));

  return {
    planVersion: 4,
    formatKey: 'round_robin',
    divisionId: divisionId ? String(divisionId) : null,
    seed: String(seed),
    layout: 'single-group',
    stages: [{
      planKey: 'group-stage', name: 'Vòng tròn', scheduleFormat: 'round_robin', order: 1,
      config: { groupCount: 1, advancePerGroup: 0, setupPlanVersion: 4, scoring: { ...STAGE_SCORING } },
    }],
    groups: [{ label: 'A', entryIds: order }],
    matches,
    progressions: [],
    counts: { groupMatches: matches.length, knockoutMatches: 0, total: matches.length },
    rounds: Math.max(0, ...matches.map((match) => match.round)),
    finalBestOf: 1,
    warnings: [],
  };
}

module.exports = { buildRoundRobinPlan };
