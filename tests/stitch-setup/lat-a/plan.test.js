'use strict';

const { assert, lib, suite } = require('../_harness');
const { buildSetupPlan } = lib('lib/tournament/setupPlans/index.js');
const { resolveGroupKnockoutAdvance } = lib('lib/tournament/setupPlans/groupKnockout.js');
const { rankAcrossGroups } = lib('lib/tournament/crossGroupRanking.js');
const { estimateSchedule } = lib('lib/tournament/setupSchedule.js');
const { validateStep } = lib('lib/tournament/setupStepRules.js');

const pairIds = (n) => Array.from({ length: n }, (_, i) => `pair_${String(i + 1).padStart(2, '0')}`);
const plan = (n, config, seed = 'seed-1') => buildSetupPlan({ formatKey: 'group_knockout', config, pairIds: pairIds(n), seed, divisionId: '9' });
const keys = (p, kind) => p.matches.filter((m) => m.stageKind === kind).map((m) => m.matchKey);

function expectPlan(n, config, { sizes, group, knockout, total }) {
  const p = plan(n, config);
  assert.deepEqual(p.groups.map((g) => g.entryIds.length), sizes, 'kích thước bảng');
  assert.equal(p.counts.groupMatches, group);
  assert.equal(p.counts.knockoutMatches, knockout);
  assert.equal(p.counts.total, total);
  assert.equal(p.matches.length, total);
  assert.equal(new Set(p.matches.map((m) => m.matchKey)).size, total, 'matchKey duy nhất');
  // mỗi cặp đúng một bảng
  assert.deepEqual(p.groups.flatMap((g) => g.entryIds).sort(), pairIds(n));
  // mọi ô vòng loại có đúng một nguồn
  const slots = p.progressions.map((edge) => `${edge.targetMatchKey}:${edge.targetSlot}`);
  assert.equal(new Set(slots).size, slots.length);
  assert.equal(slots.length, knockout * 2);
  assert.ok(p.matches.filter((m) => m.stageKind === 'knockout').every((m) => !m.entryAId && !m.entryBId), 'không có entrant giả');
  return p;
}

suite('lát A — plan vòng bảng → loại trực tiếp', {
  'ca chuẩn 14 VĐV: 7 cặp → 4/3 → 12 trận, 13 khi có tranh hạng ba'() {
    const p = expectPlan(7, { groupCount: 2, qualifiersPerGroup: 2 }, { sizes: [4, 3], group: 9, knockout: 3, total: 12 });
    assert.deepEqual(p.warnings, ['GROUP_SIZE_IMBALANCE']);
    assert.deepEqual(keys(p, 'knockout'), ['SF1', 'SF2', 'F']);
    assert.equal(p.matches.find((m) => m.matchKey === 'SF1').slotA.label, 'Nhất A');
    assert.equal(p.matches.find((m) => m.matchKey === 'SF1').slotB.label, 'Nhì B');
    assert.equal(p.matches.find((m) => m.matchKey === 'F').slotA.label, 'Thắng bán kết 1');
    expectPlan(7, { groupCount: 2, qualifiersPerGroup: 2, thirdPlaceEnabled: true }, { sizes: [4, 3], group: 9, knockout: 4, total: 13 });
  },

  '3 bảng × lấy 1 + 1 nhì tốt nhất (6 cặp → 6 trận)'() {
    const p = expectPlan(6, { groupCount: 3, qualifiersPerGroup: 1 }, { sizes: [2, 2, 2], group: 3, knockout: 3, total: 6 });
    assert.equal(p.matches.find((m) => m.matchKey === 'SF1').slotB.label, 'Nhì tốt nhất');
    assert.ok(p.progressions.some((e) => e.source.kind === 'group_rank_pool' && e.source.rank === 2 && e.source.poolPosition === 1));
  },

  '4 bảng × lấy 1 (8 cặp → 7 trận)'() {
    expectPlan(8, { groupCount: 4, qualifiersPerGroup: 1 }, { sizes: [2, 2, 2, 2], group: 4, knockout: 3, total: 7 });
  },

  '3 bảng × lấy 2 + 2 ba tốt nhất (9 cặp → 16 trận, 17 có hạng ba)'() {
    const p = expectPlan(9, { groupCount: 3, qualifiersPerGroup: 2 }, { sizes: [3, 3, 3], group: 9, knockout: 7, total: 16 });
    assert.deepEqual(keys(p, 'knockout'), ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'F']);
    assert.equal(p.matches.find((m) => m.matchKey === 'QF1').slotB.label, 'Ba tốt nhất #1');
    assert.equal(p.matches.find((m) => m.matchKey === 'SF1').slotA.label, 'Thắng tứ kết 1');
    expectPlan(9, { groupCount: 3, qualifiersPerGroup: 2, thirdPlaceEnabled: true }, { sizes: [3, 3, 3], group: 9, knockout: 8, total: 17 });
  },

  '4 bảng × lấy 2 (12 cặp → 19 trận); cùng bảng ở hai nửa nhánh'() {
    const p = expectPlan(12, { groupCount: 4, qualifiersPerGroup: 2 }, { sizes: [3, 3, 3, 3], group: 12, knockout: 7, total: 19 });
    const top = ['QF1', 'QF2'].flatMap((k) => p.progressions.filter((e) => e.targetMatchKey === k)).map((e) => e.source.groupLabel);
    const bottom = ['QF3', 'QF4'].flatMap((k) => p.progressions.filter((e) => e.targetMatchKey === k)).map((e) => e.source.groupLabel);
    assert.deepEqual(top.slice().sort(), ['A', 'B', 'C', 'D']);
    assert.deepEqual(bottom.slice().sort(), ['A', 'B', 'C', 'D']);
  },

  'tổ hợp sai và thiếu cặp trả mã lỗi đúng'() {
    assert.throws(() => plan(8, { groupCount: 2, qualifiersPerGroup: 1 }), (e) => e.code === 'FORMAT_CONFIG_INVALID');
    assert.throws(() => plan(5, { groupCount: 2, qualifiersPerGroup: 2 }), (e) => e.code === 'PAIR_COUNT_BELOW_MINIMUM' && e.params.min === 6);
    assert.throws(() => plan(8, { groupCount: 3, qualifiersPerGroup: 2 }), (e) => e.code === 'PAIR_COUNT_BELOW_MINIMUM');
    assert.throws(() => buildSetupPlan({ formatKey: 'round_robin', pairIds: pairIds(4), seed: 's' }), (e) => e.code === 'FORMAT_NOT_AVAILABLE');
    assert.throws(() => plan(7, { groupCount: 2, qualifiersPerGroup: 2 }, ''), (e) => e.code === 'DRAW_SEED_REQUIRED');
  },

  'cùng seed → cùng fingerprint; đổi seed → khác; thứ tự cặp đầu vào không ảnh hưởng'() {
    const a = plan(7, { groupCount: 2, qualifiersPerGroup: 2 }, 's1');
    const b = buildSetupPlan({ formatKey: 'group_knockout', config: { groupCount: 2, qualifiersPerGroup: 2 }, pairIds: pairIds(7).reverse(), seed: 's1', divisionId: '9' });
    assert.equal(a.fingerprint, b.fingerprint);
    assert.notEqual(a.fingerprint, plan(7, { groupCount: 2, qualifiersPerGroup: 2 }, 's2').fingerprint);
    assert.match(a.fingerprint, /^[a-f0-9]{64}$/);
  },

  'BO chung kết chỉ ghi cho F'() {
    const p = plan(7, { groupCount: 2, qualifiersPerGroup: 2, thirdPlaceEnabled: true, finalBestOf: 3 });
    assert.deepEqual(p.stages[1].config.match_scoring, { F: { best_of: 3 } });
    assert.equal(p.stages[0].config.match_scoring, undefined);
    assert.equal(plan(7, { groupCount: 2, qualifiersPerGroup: 2 }).stages[1].config.match_scoring, undefined);
  },

  'so chéo bảng: tỉ lệ thắng → hiệu số TB → điểm TB → bốc thăm lặp lại được'() {
    const ranked = rankAcrossGroups([
      { entryId: 'x', groupLabel: 'A', played: 3, won: 1, points_for: 30, points_against: 30 },
      { entryId: 'y', groupLabel: 'B', played: 2, won: 1, points_for: 22, points_against: 18 },
      { entryId: 'z', groupLabel: 'C', played: 2, won: 1, points_for: 20, points_against: 16 },
    ], 'fp');
    // x: 1/3 thắng; y, z: 1/2 → y, z trước; y và z cùng hiệu số TB 2 → điểm TB y 11 > z 10
    assert.deepEqual(ranked.map((r) => r.entryId), ['y', 'z', 'x']);
    const tie = [{ entryId: 'p', played: 2, won: 1, points_for: 20, points_against: 20 }, { entryId: 'q', played: 2, won: 1, points_for: 20, points_against: 20 }];
    assert.deepEqual(rankAcrossGroups(tie, 's').map((r) => r.entryId), rankAcrossGroups(tie.slice().reverse(), 's').map((r) => r.entryId));
  },

  'tiến cấp 3×1: nhì tốt nhất thuộc bảng A → đổi với Nhất C'() {
    const edges = [
      { id: 1, kind: 'group_rank', groupLabel: 'A', rank: 1, targetMatchKey: 'SF1', targetSlot: 'a' },
      { id: 2, kind: 'group_rank_pool', rank: 2, poolPosition: 1, targetMatchKey: 'SF1', targetSlot: 'b' },
      { id: 3, kind: 'group_rank', groupLabel: 'B', rank: 1, targetMatchKey: 'SF2', targetSlot: 'a' },
      { id: 4, kind: 'group_rank', groupLabel: 'C', rank: 1, targetMatchKey: 'SF2', targetSlot: 'b' },
    ];
    const row = (id, group, rank, won) => ({ entrant_id: id, group_label: group, rank, played: 1, won, points_for: won ? 11 : 5, points_against: won ? 5 : 11 });
    const standings = [row('A1', 'A', 1, 1), row('A2', 'A', 2, 0), row('B1', 'B', 1, 1), row('B2', 'B', 2, 0), row('C1', 'C', 1, 1), row('C2', 'C', 2, 0)];
    standings.find((r) => r.entrant_id === 'A2').points_for = 10; // A2 thua sát nhất → nhì tốt nhất
    const out = resolveGroupKnockoutAdvance({ edges, standings, seed: 'fp' });
    const at = (id) => out.find((r) => r.transitionId === id).entryId;
    assert.equal(at(1), 'A1');
    assert.equal(at(2), 'C1');
    assert.equal(at(4), 'A2');
    assert.equal(at(3), 'B1');
  },

  'tiến cấp 3×2: hoán đổi hai suất ba để tránh cùng bảng ở tứ kết'() {
    const p = plan(9, { groupCount: 3, qualifiersPerGroup: 2 });
    const edges = p.progressions.filter((e) => e.source.kind !== 'match_outcome').map((e, i) => ({
      id: i + 1, kind: e.source.kind, groupLabel: e.source.groupLabel, rank: e.source.rank, poolPosition: e.source.poolPosition,
      targetMatchKey: e.targetMatchKey, targetSlot: e.targetSlot,
    }));
    const opponents = (out) => {
      const byMatch = {};
      out.forEach((r) => { const edge = edges.find((e) => e.id === r.transitionId); (byMatch[edge.targetMatchKey] ||= []).push(r.entryId[0]); });
      return byMatch;
    };
    for (const [first, second] of [['A', 'B'], ['A', 'C'], ['B', 'A'], ['C', 'B'], ['B', 'C']]) {
      const standings = [];
      for (const label of ['A', 'B', 'C']) {
        for (const rank of [1, 2, 3]) standings.push({ entrant_id: `${label}${rank}`, group_label: label, rank, played: 2, won: rank === 1 ? 2 : rank === 2 ? 1 : 0, points_for: 20, points_against: 20 });
      }
      standings.find((r) => r.entrant_id === `${first}3`).points_for = 22;
      standings.find((r) => r.entrant_id === `${second}3`).points_for = 21;
      const out = resolveGroupKnockoutAdvance({ edges, standings, seed: 'fp' });
      for (const [match, groups] of Object.entries(opponents(out))) {
        assert.notEqual(groups[0], groups[1], `${first}3/${second}3: ${match} không được cùng bảng`);
      }
      assert.equal(new Set(out.map((r) => r.entryId)).size, 8);
    }
  },

  'Bước 4: đổi cặp → DRAW_STALE cần bốc lại; chỉ đổi hạng ba → cập nhật xem trước'() {
    const config = { groupCount: 2, qualifiersPerGroup: 2 };
    const p = plan(7, config);
    const memberIds = Array.from({ length: 14 }, (_, i) => String(i + 1));
    const pairs = pairIds(7).map((pairId, i) => ({ pairId, participantRefs: [`member:${2 * i + 1}`, `member:${2 * i + 2}`] }));
    const draft = { draftVersion: 3, participants: { memberIds, guests: [] }, pairs, format: { formatKey: 'group_knockout', config }, draw: { status: 'draft', seed: 'seed-1', previewFingerprint: p.fingerprint, plan: p } };
    assert.equal(validateStep(draft, 4).ok, true);
    const third = validateStep({ ...draft, format: { formatKey: 'group_knockout', config: { ...config, thirdPlaceEnabled: true } } }, 4);
    assert.equal(third.blockers[0].code, 'DRAW_STALE');
    assert.equal(third.blockers[0].params.groupsChanged, false);
    const repaired = validateStep({ ...draft, pairs: [...pairs.slice(0, 6), { pairId: 'pair_new', participantRefs: ['member:13', 'member:14'] }] }, 4);
    assert.equal(repaired.blockers[0].params.groupsChanged, true);
  },

  'ước tính lịch: không trùng cặp trong một lượt, F dùng BO chung kết, giờ tính từ giờ bắt đầu'() {
    const p = plan(7, { groupCount: 2, qualifiersPerGroup: 2, thirdPlaceEnabled: true, finalBestOf: 3 });
    const est = estimateSchedule(p, { courtCount: 3, startTime: '07:30' });
    assert.equal(est.rows.length, p.counts.total);
    assert.equal(est.startsAt, '07:30');
    const byKey = new Map(p.matches.map((m) => [m.matchKey, m]));
    const slots = {};
    for (const row of est.rows) (slots[row.startsAt] ||= []).push(byKey.get(row.matchKey));
    for (const matches of Object.values(slots)) {
      const ids = matches.flatMap((m) => [m.entryAId, m.entryBId]).filter(Boolean);
      assert.equal(new Set(ids).size, ids.length, 'một cặp không đá hai sân cùng lúc');
      assert.ok(matches.length <= 3);
    }
    assert.equal(est.rows.find((r) => r.matchKey === 'F').durationMinutes, 35);
    assert.equal(est.rows.find((r) => r.matchKey === 'BRONZE').durationMinutes, 15);
  },
});
