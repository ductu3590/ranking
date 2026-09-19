'use strict';

function ordinalVietnamese(rank) {
  return rank === 1 ? 'Nhất' : rank === 2 ? 'Nhì' : `Hạng ${rank}`;
}

function qualificationOutlook(rows = [], remainingByEntry = {}, options = {}) {
  const slots = Math.max(1, Number(options.slots || 2));
  const winPoints = Number(options.winPoints || 2);
  const groupLabel = options.groupLabel || 'A';
  const sorted = rows.slice().sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999));
  const result = {};
  const cutoff = sorted[slots - 1];
  if (!cutoff) return result;
  const anyRemaining = sorted.some((row) => Number(remainingByEntry[row.entrant_id] || 0) > 0);

  for (const row of sorted) {
    const id = row.entrant_id;
    const points = Number(row.points || row.match_points || 0);
    const remaining = Number(remainingByEntry[id] || 0);
    const potential = points + remaining * winPoints;
    const rank = Number(row.rank || sorted.indexOf(row) + 1);
    const abovePotential = sorted.filter((other) => other.entrant_id !== id
      && Number(other.points || other.match_points || 0) + Number(remainingByEntry[other.entrant_id] || 0) * winPoints > points).length;

    if (rank <= slots && abovePotential < slots) {
      result[id] = { status: 'qualified', label: `${ordinalVietnamese(rank)} bảng ${groupLabel}` };
    } else if (rank <= slots) {
      result[id] = { status: 'provisional', label: `Tạm ${ordinalVietnamese(rank).toLowerCase()} bảng ${groupLabel}` };
    } else if (potential >= Number(cutoff.points || cutoff.match_points || 0) && anyRemaining) {
      result[id] = { status: 'contending', label: 'Tranh vé vớt' };
    } else {
      result[id] = { status: 'eliminated', label: 'Đã loại' };
    }
  }
  return result;
}

function labelForRank(rank) {
  if (rank === 1) return 'Vô địch';
  if (rank === 2) return 'Á quân';
  if (rank === 3) return 'Hạng ba';
  return `Hạng ${rank}`;
}

function finalStandingsFrom(stage = {}, standingsRows = [], matches = []) {
  if (stage.schedule_format !== 'knockout') {
    return standingsRows.slice().sort((a, b) => Number(a.rank || 999) - Number(b.rank || 999))
      .map((row, index) => ({ rank: index + 1, entry_id: row.entrant_id, label: labelForRank(index + 1) }));
  }
  // Trận đã chốt mang status 'finalized' ở nhánh entrants cũ, nhưng standingsService
  // đổi sang 'done' cho nhánh entry (nội dung thi đấu). Chỉ nhận một giá trị thì
  // final_standings của mọi nội dung đôi luôn rỗng.
  const finals = matches.filter((m) => (m.status === 'finalized' || m.status === 'done') && m.winner_entrant_id);
  if (!finals.length) return [];
  const keyedFinal = finals.find((m) => m.match_key === 'F');
  const bronze = finals.find((m) => m.match_key === 'BRONZE');
  // Nhánh có match_key (playoff dựng bởi migration 065): chung kết CHỈ là 'F'.
  // BRONZE cùng vòng với F, nên fallback theo vòng cao nhất sẽ phong nhầm người
  // thắng tranh hạng ba làm vô địch khi F chưa xong. Chưa đá xong F thì chưa có
  // BXH chung cuộc để công bố.
  const hasKeyedBracket = matches.some((m) => m.match_key);
  if (hasKeyedBracket && !keyedFinal) return [];
  const final = keyedFinal
    || finals.filter((m) => m.match_key !== 'BRONZE')
      .find((m) => Number(m.round || 0) === Math.max(...finals.filter((x) => x.match_key !== 'BRONZE').map((x) => Number(x.round || 0))));
  if (!final) return [];
  const finalRound = Number(final.round || 0);
  const runnerUp = final.winner_entrant_id === final.entrant_a_id ? final.entrant_b_id : final.entrant_a_id;
  const output = [
    { rank: 1, entry_id: final.winner_entrant_id, label: 'Vô địch' },
    { rank: 2, entry_id: runnerUp, label: 'Á quân' },
  ];
  if (bronze) {
    const bronzeLoser = bronze.winner_entrant_id === bronze.entrant_a_id ? bronze.entrant_b_id : bronze.entrant_a_id;
    if (bronze.winner_entrant_id) output.push({ rank: 3, entry_id: bronze.winner_entrant_id, label: 'Hạng ba' });
    if (bronzeLoser) output.push({ rank: 4, entry_id: bronzeLoser, label: 'Hạng tư' });
    return output;
  }
  const semiLosers = finals.filter((m) => Number(m.round || 0) === finalRound - 1)
    .map((m) => (m.winner_entrant_id === m.entrant_a_id ? m.entrant_b_id : m.entrant_a_id))
    .filter(Boolean);
  for (const entryId of semiLosers) output.push({ rank: 3, entry_id: entryId, label: 'Đồng hạng ba', placement: 'joint_third' });
  return output;
}

module.exports = { qualificationOutlook, finalStandingsFrom };
