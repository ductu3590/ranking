'use strict';
// Epic 3 F2 §4 (D41) — rải cặp cùng CLB ra các bảng / nửa nhánh khi bốc thăm; cảnh báo không chặn.
// Nội bộ (không entryClubs hoặc một CLB) giữ đúng đường cũ: fingerprint bằng hằng số ghi trước Epic 3.

const { assert, lib, suite } = require('../_harness');
const { buildSetupPlan } = lib('lib/tournament/setupPlans/index.js');
const { spreadIntoGroups, spreadSeedOrder, orderByClub } = lib('lib/tournament/setupPlans/clubSpread.js');
const { dealtGroupSizes } = lib('lib/tournament/playoffPlan.js');
const { seedOrder, nextPowerOfTwo } = lib('lib/tournament/seeding.js');
const { distributeEntriesAcrossPools } = lib('lib/tournament/interclub.js');
const { seededShuffle } = lib('lib/tournament/setupPlans/common.js');

const GK = { groupCount: 2, qualifiersPerGroup: 2 };
const ids = (n) => Array.from({ length: n }, (_, i) => `pair_${String(i + 1).padStart(2, '0')}`);

// Fingerprint ghi trên code TRƯỚC Epic 3 F2 (HEAD b4b3652), cặp pair_01…, seed 'seed-1', division '9'.
const PRE_EPIC3 = {
  gk7: 'b72358606f1a04415d02a6886bdb0927319274e5e9266f3ebfeb3de495484e63',
  gk7Bronze: '7bf4b671e85d91dde063ac89cc845b80c69d07017ba3c32f26a39cff942d5d0f',
  ko7: 'ac6e88bce86426f7f75cb40b0484e5e26f4a0113f3e8e9989a421fcc0b80445b',
  de8: '6d671559f7a797832bd2e241ee246055f281efa14e5e13368ad4a8fa93d49da0',
  rr7: '6b9eea58663f550946fa95b8ba0d7a844dbd0572c67c87f99b920e2bd0ecb3b0',
  ko12Bronze: '13b93381497d9ae0bda11063b55d43286e11b3a590ea3dd65daf7f574146ff13',
};

// Cặp theo CLB: { host: 4, 'tc:881': 3 } → pairIds h1..h4, c881.7.pair_1..3 và entryClubs.
function clubPairs(spec) {
  const pairIds = [];
  const entryClubs = {};
  for (const [clubKey, count] of Object.entries(spec)) {
    for (let i = 1; i <= count; i += 1) {
      const pairId = clubKey === 'host' ? `h${i}` : `c${clubKey.slice(3)}.7.pair_${i}`;
      pairIds.push(pairId);
      entryClubs[pairId] = clubKey;
    }
  }
  return { pairIds, entryClubs };
}

function plan(formatKey, spec, { config = GK, seed = 'seed-f', entry = true } = {}) {
  const { pairIds, entryClubs } = clubPairs(spec);
  return { plan: buildSetupPlan({ formatKey, config, pairIds, seed, divisionId: '9', ...(entry ? { entryClubs } : {}) }), entryClubs };
}

function perGroup(p, entryClubs) {
  return Object.fromEntries(p.groups.map((g) => {
    const counts = {};
    for (const id of g.entryIds) counts[entryClubs[id]] = (counts[entryClubs[id]] || 0) + 1;
    return [g.label, counts];
  }));
}

function groupMatchKinds(p, entryClubs) {
  const group = p.matches.filter((m) => m.stageKind === 'group');
  const inter = group.filter((m) => entryClubs[m.entryAId] !== entryClubs[m.entryBId]).length;
  return { inter, internal: group.length - inter };
}

// Hai nửa (và bốn phần tư) của nhánh theo vị trí engine: vị trí p nhận hạt giống seedOrder(B)[p].
function bracketParts(order, parts) {
  const B = nextPowerOfTwo(order.length);
  const seeds = seedOrder(B);
  const size = B / parts;
  return Array.from({ length: parts }, (_, k) => seeds.slice(k * size, (k + 1) * size).map((s) => order[s - 1] || null));
}

function clubCounts(list, entryClubs) {
  const counts = {};
  for (const id of list.filter(Boolean)) counts[entryClubs[id]] = (counts[entryClubs[id]] || 0) + 1;
  return counts;
}

suite('f2 club spread', {
  'G1 (59 = 4, khách = 3, 2x2): A = 2 + 2, B = 2 + 1, hai CLB limited, 12 trận (6 + 3 nội bộ), 13 có hạng ba'() {
    for (const seed of ['seed-f', 's1', 's2', 's3', 'x', 'y', 'bốc lại 7']) {
      const { plan: p, entryClubs } = plan('group_knockout', { host: 4, 'tc:881': 3 }, { seed });
      assert.deepEqual(perGroup(p, entryClubs), { A: { host: 2, 'tc:881': 2 }, B: { host: 2, 'tc:881': 1 } }, seed);
      assert.deepEqual(p.groups.map((g) => g.entryIds.length), [4, 3]);
      assert.equal(p.counts.groupMatches, 9);
      assert.equal(p.counts.total, 12);
      assert.deepEqual(groupMatchKinds(p, entryClubs), { inter: 6, internal: 3 });
      assert.deepEqual(p.warnings, ['GROUP_SIZE_IMBALANCE', 'FRIENDLY_CLUB_SPREAD_LIMITED']);
      assert.deepEqual(p.clubSpread, [
        { clubKey: 'host', count: 4, perGroup: { A: 2, B: 2 }, limited: true },
        { clubKey: 'tc:881', count: 3, perGroup: { A: 2, B: 1 }, limited: true },
      ]);
    }
    assert.equal(plan('group_knockout', { host: 4, 'tc:881': 3 }, { config: { ...GK, thirdPlaceEnabled: true } }).plan.counts.total, 13);
  },

  'G-core3 (3/2/2, 2x2): A = 2 cặp 59 + 1 + 1, B = 1 + 1 + 1, chỉ 59 limited, 12 trận (8 liên CLB + 1 nội bộ)'() {
    for (const seed of ['seed-f', 's1', 's2', 's3', 's4', 's5', 's6', 's7']) {
      const { plan: p, entryClubs } = plan('group_knockout', { host: 3, 'tc:881': 2, 'tc:882': 2 }, { seed });
      assert.deepEqual(perGroup(p, entryClubs), { A: { host: 2, 'tc:881': 1, 'tc:882': 1 }, B: { host: 1, 'tc:881': 1, 'tc:882': 1 } }, seed);
      assert.equal(p.counts.total, 12);
      assert.deepEqual(groupMatchKinds(p, entryClubs), { inter: 8, internal: 1 });
      assert.deepEqual(p.clubSpread.map((c) => [c.clubKey, c.limited]), [['host', true], ['tc:881', false], ['tc:882', false]]);
      assert.ok(p.warnings.includes('FRIENDLY_CLUB_SPREAD_LIMITED'));
    }
  },

  'G-core3-KO (2/2/2, nhánh 8): mỗi CLB một cặp mỗi nửa, không limited, 5 trận (6 có hạng ba)'() {
    for (const seed of ['seed-f', 'a', 'b', 'c', 'd']) {
      const { plan: p, entryClubs } = plan('knockout', { host: 2, 'tc:881': 2, 'tc:882': 2 }, { config: {}, seed });
      const [top, bottom] = bracketParts(p.groups[0].entryIds, 2);
      assert.deepEqual(clubCounts(top, entryClubs), { host: 1, 'tc:881': 1, 'tc:882': 1 }, seed);
      assert.deepEqual(clubCounts(bottom, entryClubs), { host: 1, 'tc:881': 1, 'tc:882': 1 }, seed);
      assert.equal(p.counts.total, 5);
      assert.deepEqual(p.warnings, ['KNOCKOUT_BYE']);
      assert.ok(p.clubSpread.every((c) => c.limited === false));
      assert.deepEqual(p.byeEntryIds.length, 2);
    }
    assert.equal(plan('knockout', { host: 2, 'tc:881': 2, 'tc:882': 2 }, { config: { thirdPlaceEnabled: true } }).plan.counts.total, 6);
  },

  'G2-KO (4/3, nhánh 8, 1 bye): nửa 4 chỗ = 2 + 2, nửa 3 chỗ = 2 + 1, cả hai limited; vòng 1 không trận nội bộ'() {
    for (const seed of ['seed-f', 'a', 'b', 'c', 'd', 'e', 'f']) {
      const { plan: p, entryClubs } = plan('knockout', { host: 4, 'tc:881': 3 }, { config: {}, seed });
      const halves = bracketParts(p.groups[0].entryIds, 2);
      const full = halves.find((h) => h.every(Boolean));
      const short = halves.find((h) => h.some((x) => !x));
      assert.deepEqual(clubCounts(full, entryClubs), { host: 2, 'tc:881': 2 }, seed);
      assert.deepEqual(clubCounts(short, entryClubs), { host: 2, 'tc:881': 1 }, seed);
      const firstRound = p.matches.filter((m) => m.entryAId && m.entryBId);
      assert.ok(firstRound.length > 0);
      for (const m of firstRound) assert.notEqual(entryClubs[m.entryAId], entryClubs[m.entryBId], `${seed} ${m.matchKey}`);
      assert.equal(p.counts.total, 6);
      assert.deepEqual(p.warnings, ['KNOCKOUT_BYE', 'FRIENDLY_CLUB_SPREAD_LIMITED']);
      assert.deepEqual(p.clubSpread.map((c) => [c.clubKey, c.count, c.limited]), [['host', 4, true], ['tc:881', 3, true]]);
      assert.equal(p.byeEntryIds.length, 1);
    }
    assert.equal(plan('knockout', { host: 4, 'tc:881': 3 }, { config: { thirdPlaceEnabled: true } }).plan.counts.total, 7);
  },

  'loại kép 2 CLB × 4 cặp: mỗi nửa nhánh thắng 2 + 2, mỗi phần tư 1 + 1'() {
    for (const seed of ['seed-f', 'a', 'b']) {
      const { plan: p, entryClubs } = plan('double_elimination', { host: 4, 'tc:881': 4 }, { config: {}, seed });
      for (const half of bracketParts(p.groups[0].entryIds, 2)) assert.deepEqual(clubCounts(half, entryClubs), { host: 2, 'tc:881': 2 }, seed);
      for (const quarter of bracketParts(p.groups[0].entryIds, 4)) assert.deepEqual(clubCounts(quarter, entryClubs), { host: 1, 'tc:881': 1 }, seed);
      const w1 = p.matches.filter((m) => m.bracket === 'W' && m.entryAId && m.entryBId);
      for (const m of w1) assert.notEqual(entryClubs[m.entryAId], entryClubs[m.entryBId]);
      assert.deepEqual(p.warnings, ['FRIENDLY_CLUB_SPREAD_LIMITED']);
    }
  },

  'kích thước bảng luôn bằng dealtGroupSizes (mọi tổ hợp, phân bố CLB ngẫu nhiên)'() {
    const combos = [[2, 2], [3, 1], [4, 1], [3, 2], [4, 2]];
    let checked = 0;
    for (const [groupCount, qualifiersPerGroup] of combos) {
      for (let n = 6; n <= 20; n += 1) {
        for (let variant = 0; variant < 4; variant += 1) {
          const clubs = variant + 2;
          const spec = {};
          for (let i = 0; i < n; i += 1) {
            const key = i % clubs === 0 ? 'host' : `tc:${880 + (((i * (variant + 3)) % clubs) || clubs)}`;
            spec[key] = (spec[key] || 0) + 1;
          }
          let p;
          try {
            p = plan('group_knockout', spec, { config: { groupCount, qualifiersPerGroup }, seed: `v${variant}` }).plan;
          } catch (error) {
            if (error.code === 'PAIR_COUNT_BELOW_MINIMUM') continue;
            throw error;
          }
          const expected = dealtGroupSizes(n, groupCount);
          assert.deepEqual(Object.fromEntries(p.groups.map((g) => [g.label, g.entryIds.length])), expected, `${groupCount}x${qualifiersPerGroup} n=${n} v=${variant}`);
          checked += 1;
        }
      }
    }
    assert.ok(checked > 200);
  },

  'mỗi CLB mỗi bảng: lệch nhau tối đa 1 khi sức chứa cho phép (rải đều)'() {
    const { plan: p, entryClubs } = plan('group_knockout', { host: 6, 'tc:881': 3, 'tc:882': 3 }, { config: { groupCount: 3, qualifiersPerGroup: 1 } });
    const groups = perGroup(p, entryClubs);
    for (const club of ['host', 'tc:881', 'tc:882']) {
      const counts = Object.values(groups).map((g) => g[club] || 0);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${club}: ${counts}`);
    }
  },

  'đối chứng distributeEntriesAcrossPools (sức chứa không ràng buộc): cùng phân bố số cặp mỗi CLB mỗi bảng'() {
    const specs = [{ host: 4, 'tc:881': 3 }, { host: 3, 'tc:881': 2, 'tc:882': 2 }, { host: 5, 'tc:881': 5, 'tc:882': 1 }, { host: 7, 'tc:881': 2 }];
    for (const spec of specs) {
      for (const groupCount of [2, 3, 4]) {
        const { pairIds, entryClubs } = clubPairs(spec);
        const shuffledIds = seededShuffle(pairIds.slice().sort(), 'groups:cmp');
        const unbounded = Object.fromEntries(['A', 'B', 'C', 'D'].slice(0, groupCount).map((label) => [label, pairIds.length]));
        const mine = spreadIntoGroups({ shuffledIds, entryClubs, groupCount, sizes: unbounded, seed: 'cmp' });
        const theirs = distributeEntriesAcrossPools(orderByClub(shuffledIds, entryClubs).map((id, index) => ({ id, club_id: entryClubs[id], seed: index })), { poolCount: groupCount, seed: 3 });
        const shape = (pools) => Object.fromEntries(Object.keys(spec).map((club) => [club, pools.map((pool) => pool.filter((id) => entryClubs[id] === club).length).sort()]));
        assert.deepEqual(shape(mine.groups.map((g) => g.entryIds)), shape(theirs.pools.map((pool) => pool.map((e) => e.id))), JSON.stringify(spec) + groupCount);
      }
    }
  },

  'deterministic: cùng seed → cùng plan (thứ tự đầu vào khác); khác seed → vị trí khác'() {
    const { pairIds, entryClubs } = clubPairs({ host: 4, 'tc:881': 3 });
    const build = (list, seed, clubs = entryClubs) => buildSetupPlan({ formatKey: 'group_knockout', config: GK, pairIds: list, seed, divisionId: '9', entryClubs: clubs });
    const a = build(pairIds, 's1');
    const reversedClubs = Object.fromEntries(Object.entries(entryClubs).reverse());
    const b = build(pairIds.slice().reverse(), 's1', reversedClubs);
    assert.equal(a.fingerprint, b.fingerprint, 'preview = finalize dù thứ tự cặp / khóa entryClubs khác');
    assert.deepEqual(a, b);
    const positions = new Set(['s1', 's2', 's3', 's4', 's5', 's6'].map((seed) => JSON.stringify(build(pairIds, seed).groups)));
    assert.ok(positions.size > 1, 'đổi seed đổi vị trí');
    const ko = (seed) => buildSetupPlan({ formatKey: 'knockout', config: {}, pairIds, seed, divisionId: '9', entryClubs }).groups[0].entryIds.join(',');
    assert.equal(ko('k1'), ko('k1'));
    assert.ok(new Set(['k1', 'k2', 'k3', 'k4', 'k5'].map(ko)).size > 1);
  },

  'hồi quy: nội bộ không entryClubs → fingerprint bằng hằng số trước Epic 3; ca 14 người 12 / 13 trận'() {
    const build = (formatKey, n, config = {}) => buildSetupPlan({ formatKey, config, pairIds: ids(n), seed: 'seed-1', divisionId: '9' });
    const gk = build('group_knockout', 7, GK);
    assert.equal(gk.fingerprint, PRE_EPIC3.gk7);
    assert.equal(gk.counts.total, 12);
    assert.equal('clubSpread' in gk, false);
    const bronze = build('group_knockout', 7, { ...GK, thirdPlaceEnabled: true });
    assert.equal(bronze.fingerprint, PRE_EPIC3.gk7Bronze);
    assert.equal(bronze.counts.total, 13);
    assert.equal(build('knockout', 7).fingerprint, PRE_EPIC3.ko7);
    assert.equal(build('double_elimination', 8).fingerprint, PRE_EPIC3.de8);
    assert.equal(build('round_robin', 7).fingerprint, PRE_EPIC3.rr7);
    assert.equal(buildSetupPlan({ formatKey: 'knockout', config: { thirdPlaceEnabled: true }, pairIds: Array.from({ length: 12 }, (_, i) => `p${i}`), seed: 'z', divisionId: '1' }).fingerprint, PRE_EPIC3.ko12Bronze);
  },

  'một CLB duy nhất / entryClubs rỗng → đúng đường cũ (fingerprint như không truyền)'() {
    const oneClub = Object.fromEntries(ids(7).map((id) => [id, 'host']));
    for (const formatKey of ['group_knockout', 'knockout', 'round_robin']) {
      const config = formatKey === 'group_knockout' ? GK : {};
      const base = buildSetupPlan({ formatKey, config, pairIds: ids(7), seed: 'seed-1', divisionId: '9' });
      assert.equal(buildSetupPlan({ formatKey, config, pairIds: ids(7), seed: 'seed-1', divisionId: '9', entryClubs: oneClub }).fingerprint, base.fingerprint, formatKey);
      assert.equal(buildSetupPlan({ formatKey, config, pairIds: ids(7), seed: 'seed-1', divisionId: '9', entryClubs: null }).fingerprint, base.fingerprint, formatKey);
    }
    const de = buildSetupPlan({ formatKey: 'double_elimination', config: {}, pairIds: ids(8), seed: 'seed-1', divisionId: '9', entryClubs: Object.fromEntries(ids(8).map((id) => [id, 'host'])) });
    assert.equal(de.fingerprint, PRE_EPIC3.de8);
  },

  'round_robin (một bảng) không rải: có entryClubs vẫn bằng plan không entryClubs'() {
    const { pairIds, entryClubs } = clubPairs({ host: 3, 'tc:881': 3 });
    const a = buildSetupPlan({ formatKey: 'round_robin', config: {}, pairIds, seed: 'r', divisionId: '9' });
    const b = buildSetupPlan({ formatKey: 'round_robin', config: {}, pairIds, seed: 'r', divisionId: '9', entryClubs });
    assert.equal(a.fingerprint, b.fingerprint);
  },

  'entryClubs thiếu cặp → ENTRY_CLUBS_INVALID (không đoán)'() {
    const { pairIds, entryClubs } = clubPairs({ host: 4, 'tc:881': 3 });
    delete entryClubs.h2;
    assert.throws(() => buildSetupPlan({ formatKey: 'group_knockout', config: GK, pairIds, seed: 's', divisionId: '9', entryClubs }), (e) => e.code === 'ENTRY_CLUBS_INVALID');
  },

  'orderByClub: CLB nhiều cặp trước, hoà thì host trước rồi tournamentClubId tăng (số, không chữ)'() {
    const entryClubs = { a: 'tc:1000', b: 'tc:99', c: 'host', d: 'tc:99', e: 'tc:1000', f: 'host', g: 'tc:5' };
    assert.deepEqual(orderByClub(['a', 'b', 'c', 'd', 'e', 'f', 'g'], entryClubs), ['c', 'f', 'b', 'd', 'a', 'e', 'g']);
  },

  'spreadSeedOrder trả thứ tự hạt giống đủ n cặp, không trùng'() {
    const { pairIds, entryClubs } = clubPairs({ host: 5, 'tc:881': 4, 'tc:882': 3 });
    const out = spreadSeedOrder({ shuffledIds: seededShuffle(pairIds.slice().sort(), 'x'), entryClubs, seed: 'x' });
    assert.deepEqual(out.order.slice().sort(), pairIds.slice().sort());
    assert.deepEqual(out.clubSpread.map((c) => [c.clubKey, c.count, c.perHalf.top + c.perHalf.bottom]), [['host', 5, 5], ['tc:881', 4, 4], ['tc:882', 3, 3]]);
  },
});
