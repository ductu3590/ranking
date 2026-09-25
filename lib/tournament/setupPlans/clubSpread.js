'use strict';
// Rải cặp cùng CLB khi bốc thăm giải giao hữu (spec Epic 3 F2 §4, ADR-007 D41). Thuần, deterministic.
//
// Chính sách = `spread_if_possible` của interclub.distributeEntriesAcrossPools (ít cặp cùng CLB nhất trước; không đủ chỗ
// thì cảnh báo, không chặn) nhưng KHÔNG gọi thẳng hàm đó: nó không biết sức chứa cố định của từng bảng
// (dealtGroupSizes: A 4 / B 3) và xáo bằng PRNG số riêng — fingerprint sẽ không còn chỉ phụ thuộc `seed`.
//
// Chỉ dùng khi giải có ≥ 2 CLB (builder tự kiểm qua `shouldSpread`); giải nội bộ đi đúng đường cũ.

const { planError, seededRandom } = require('./common');
const { seedOrder, nextPowerOfTwo } = require('../seeding');

const HOST_CLUB_KEY = 'host';
const CLUB_KEY_RE = /^tc:([0-9]+)$/;

// 'host' trước; 'tc:<id>' theo id số tăng dần (so chuỗi số không đổi sang Number để giữ bigint); khóa khác theo chữ.
function compareClubKeys(a, b) {
  if (a === b) return 0;
  if (a === HOST_CLUB_KEY) return -1;
  if (b === HOST_CLUB_KEY) return 1;
  const ma = CLUB_KEY_RE.exec(a);
  const mb = CLUB_KEY_RE.exec(b);
  if (ma && mb) return (ma[1].length - mb[1].length) || (ma[1] < mb[1] ? -1 : 1);
  if (ma) return -1;
  if (mb) return 1;
  return a < b ? -1 : 1;
}

function clubOf(entryClubs, id) {
  const club = entryClubs && Object.prototype.hasOwnProperty.call(entryClubs, id) ? entryClubs[id] : null;
  if (typeof club !== 'string' || !club) planError('ENTRY_CLUBS_INVALID', 'Thiếu CLB của một cặp', { pairId: id });
  return club;
}

// Có rải không: entryClubs là object và các cặp thuộc ≥ 2 CLB khác nhau. Vắng / một CLB → đường cũ.
function shouldSpread(ids, entryClubs) {
  if (!entryClubs || typeof entryClubs !== 'object' || Array.isArray(entryClubs)) return false;
  const clubs = new Set(ids.map((id) => clubOf(entryClubs, String(id))));
  return clubs.size >= 2;
}

// Nhóm theo CLB: CLB nhiều cặp trước (hoà: host, rồi tournamentClubId tăng); trong CLB giữ thứ tự shuffledIds.
function clubGroups(shuffledIds, entryClubs) {
  const byClub = new Map();
  for (const id of shuffledIds) {
    const club = clubOf(entryClubs, id);
    if (!byClub.has(club)) byClub.set(club, []);
    byClub.get(club).push(id);
  }
  return [...byClub.entries()]
    .map(([clubKey, ids]) => ({ clubKey, ids }))
    .sort((x, y) => (y.ids.length - x.ids.length) || compareClubKeys(x.clubKey, y.clubKey));
}

function orderByClub(shuffledIds, entryClubs) {
  return clubGroups(shuffledIds.map(String), entryClubs).flatMap((club) => club.ids);
}

function seededIndex(seed, count) {
  return Math.floor(seededRandom(seed)() * count) % count;
}

// Chia bài vòng tròn có sức chứa: mỗi cặp (theo thứ tự CLB) vào đơn vị (bảng / nửa nhánh) còn chỗ có ÍT cặp cùng CLB
// nhất; hoà thì đơn vị còn NHIỀU chỗ hơn; hoà nữa thì theo con trỏ vòng tròn (bắt đầu ở seededIndex, tiến sau mỗi lần
// đặt). Luôn lấp đúng sức chứa → kích thước đơn vị không đổi.
function deal(clubs, capacities, startIndex) {
  const units = capacities.map((capacity) => ({ capacity, ids: [], byClub: new Map() }));
  let pointer = startIndex % units.length;
  for (const { clubKey, ids } of clubs) {
    for (const id of ids) {
      let best = -1;
      for (let step = 0; step < units.length; step += 1) {
        const index = (pointer + step) % units.length;
        const unit = units[index];
        if (unit.ids.length >= unit.capacity) continue;
        if (best < 0) { best = index; continue; }
        const current = units[best];
        const same = unit.byClub.get(clubKey) || 0;
        const bestSame = current.byClub.get(clubKey) || 0;
        const room = unit.capacity - unit.ids.length;
        const bestRoom = current.capacity - current.ids.length;
        if (same < bestSame || (same === bestSame && room > bestRoom)) best = index;
      }
      if (best < 0) planError('GROUP_DEAL_MISMATCH', 'Chia bảng lệch kích thước dự kiến');
      const unit = units[best];
      unit.ids.push(id);
      unit.byClub.set(clubKey, (unit.byClub.get(clubKey) || 0) + 1);
      pointer = (best + 1) % units.length;
    }
  }
  return units;
}

// Vòng bảng. sizes = dealtGroupSizes(n, groupCount) ({ A: 4, B: 3 }).
// → { groups: [{ label, entryIds }], clubSpread: [{ clubKey, count, perGroup: { A, B, … }, limited }] }
function spreadIntoGroups({ shuffledIds, entryClubs, groupCount, sizes, seed, labels }) {
  const groupLabels = labels || Object.keys(sizes).slice(0, groupCount);
  const clubs = clubGroups(shuffledIds.map(String), entryClubs);
  const units = deal(clubs, groupLabels.map((label) => Number(sizes[label])), seededIndex(`club-spread:${seed}`, groupCount));
  const groups = groupLabels.map((label, index) => ({ label, entryIds: units[index].ids }));
  const clubSpread = clubs.map(({ clubKey, ids }) => {
    const perGroup = Object.fromEntries(groupLabels.map((label, index) => [label, units[index].byClub.get(clubKey) || 0]));
    return { clubKey, count: ids.length, perGroup, limited: Object.values(perGroup).some((count) => count >= 2) };
  });
  return { groups, clubSpread };
}

// Loại trực tiếp / loại kép. Vị trí nhánh p nhận hạt giống seedOrder(B)[p]; hạt giống > n là chỗ trống (bye) — giữ đúng
// chỗ engine đặt. Chia đệ quy cây nhánh (nửa → tư → …) bằng `deal` với sức chứa = số chỗ THẬT của mỗi nửa.
// → { order: [pairId theo hạt giống 1..n], clubSpread: [{ clubKey, count, perHalf: { top, bottom }, limited }] }
function spreadSeedOrder({ shuffledIds, entryClubs, seed }) {
  const ids = shuffledIds.map(String);
  const n = ids.length;
  const B = nextPowerOfTwo(Math.max(2, n));
  const seeds = seedOrder(B);
  const real = seeds.map((s) => s <= n);
  const atPosition = new Array(B).fill(null);

  const place = (from, to, pairIds, path) => {
    if (!pairIds.length) return;
    if (to - from === 1) { atPosition[from] = pairIds[0]; return; }
    const mid = (from + to) / 2;
    const capacity = (a, b) => real.slice(a, b).filter(Boolean).length;
    const clubs = clubGroups(pairIds, entryClubs);
    const [left, right] = deal(clubs, [capacity(from, mid), capacity(mid, to)], seededIndex(`club-spread:${seed}:${path}`, 2));
    place(from, mid, left.ids, `${path}0`);
    place(mid, to, right.ids, `${path}1`);
  };
  place(0, B, ids, 'r');

  const order = new Array(n);
  atPosition.forEach((id, position) => { if (id) order[seeds[position] - 1] = id; });
  const halves = [atPosition.slice(0, B / 2), atPosition.slice(B / 2)];
  const clubSpread = clubGroups(ids, entryClubs).map(({ clubKey, ids: clubIds }) => {
    const [top, bottom] = halves.map((half) => half.filter((id) => id && clubOf(entryClubs, id) === clubKey).length);
    return { clubKey, count: clubIds.length, perHalf: { top, bottom }, limited: top >= 2 || bottom >= 2 };
  });
  return { order, clubSpread };
}

const SPREAD_WARNING = 'FRIENDLY_CLUB_SPREAD_LIMITED';

function spreadWarnings(clubSpread) {
  return clubSpread.some((club) => club.limited) ? [SPREAD_WARNING] : [];
}

module.exports = {
  HOST_CLUB_KEY,
  SPREAD_WARNING,
  compareClubKeys,
  shouldSpread,
  orderByClub,
  spreadIntoGroups,
  spreadSeedOrder,
  spreadWarnings,
};
