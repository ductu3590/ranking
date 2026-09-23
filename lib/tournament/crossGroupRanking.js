'use strict';
// So các cặp cùng hạng giữa những bảng có số cặp khác nhau (ADR-005 D7, spec Lát A §6):
// tỉ lệ thắng → hiệu số điểm TB/trận → điểm ghi TB/trận → bốc thăm theo seed.
// Thứ hạng TRONG bảng vẫn theo tiebreak hiện có; hàm này chỉ dùng cho suất bù.

const { seededRandom } = require('./setupPlans/common');

function perMatch(value, played) {
  return played > 0 ? Number(value || 0) / played : 0;
}

function metrics(row) {
  const played = Number(row.played || 0);
  return {
    winRatio: perMatch(row.won ?? row.wins, played),
    avgDiff: perMatch(Number(row.points_for || 0) - Number(row.points_against || 0), played),
    avgFor: perMatch(row.points_for, played),
  };
}

// candidates: [{ entryId, groupLabel, played, won, points_for, points_against }]
function rankAcrossGroups(candidates, seed) {
  const random = seededRandom(`cross-group:${seed}`);
  // Số thăm gán theo thứ tự entryId đã sort để kết quả không phụ thuộc thứ tự đầu vào.
  const lots = new Map([...candidates].map((row) => String(row.entryId)).sort().map((id) => [id, random()]));
  const EPS = 1e-9;
  return candidates
    .map((row) => ({ ...row, metrics: metrics(row), lot: lots.get(String(row.entryId)) }))
    .sort((a, b) => {
      for (const key of ['winRatio', 'avgDiff', 'avgFor']) {
        const delta = b.metrics[key] - a.metrics[key];
        if (Math.abs(delta) > EPS) return delta;
      }
      return a.lot - b.lot;
    });
}

module.exports = { rankAcrossGroups };
