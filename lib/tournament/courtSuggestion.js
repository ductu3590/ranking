'use strict';
// Gợi ý số sân ở Bước 3 (yêu cầu người dùng 2026-09-24): biết số cặp + thể thức thì nói được
// cần bao nhiêu sân để các trận chạy song song. Thuần, không I/O.
//
// suggestCourts({ formatKey, config, pairCount }) → null khi chưa đủ 2 cặp, ngược lại
//   { suggested, maxUseful, reason }
//   suggested: số sân nên dùng; maxUseful: số trận tối đa có thể diễn ra cùng lúc (sân thừa sẽ trống).

const MAX_COURTS = 20;

function clamp(value) {
  return Math.max(1, Math.min(MAX_COURTS, Math.floor(value)));
}

function nextPowerOfTwo(n) {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

// Chia n cặp vào g bảng lệch nhau tối đa 1 (giống cách bốc thăm chia bảng).
function groupSizes(n, g) {
  const base = Math.floor(n / g);
  const extra = n % g;
  return Array.from({ length: g }, (_, index) => base + (index < extra ? 1 : 0));
}

function suggestCourts({ formatKey, config = {}, pairCount } = {}) {
  const n = Math.floor(Number(pairCount) || 0);
  if (n < 2) return null;
  const perRound = Math.floor(n / 2);

  if (formatKey === 'group_knockout') {
    const groups = Math.max(1, Math.min(n, Number(config.groupCount ?? 2) || 2));
    const maxUseful = groupSizes(n, groups).reduce((sum, size) => sum + Math.floor(size / 2), 0) || 1;
    const suggested = Math.min(groups, maxUseful);
    return { suggested: clamp(suggested), maxUseful: clamp(maxUseful), reason: `${groups} bảng — mỗi bảng một sân để các bảng đấu cùng lúc.` };
  }

  if (formatKey === 'knockout' || formatKey === 'double_elimination') {
    const size = nextPowerOfTwo(n);
    // Vòng đầu có (n − size/2) trận thật (còn lại là miễn đấu); vòng sau có size/4 trận.
    const busiest = Math.max(n - size / 2, size / 4, 1);
    const reason = formatKey === 'knockout'
      ? `Vòng đầu nhiều nhất ${busiest} trận diễn ra cùng lúc.`
      : `Nhánh thắng có tới ${busiest} trận cùng lúc; nhánh thua đấu xen kẽ.`;
    return { suggested: clamp(busiest), maxUseful: clamp(perRound), reason };
  }

  if (formatKey === 'round_robin') {
    return { suggested: clamp(perRound), maxUseful: clamp(perRound), reason: `Mỗi lượt có ${perRound} trận diễn ra cùng lúc.` };
  }

  return { suggested: clamp(perRound), maxUseful: clamp(perRound), reason: `${n} cặp — tối đa ${perRound} trận cùng lúc.` };
}

module.exports = { suggestCourts };
