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
  // Loại kép (Epic 1 D1 §7): hạng và nhãn do engine tính (đồng hạng theo vòng nhánh thua).
  // Chưa đá xong chung kết tổng thì chưa có BXH chung cuộc.
  if (stage.schedule_format === 'double_elim') {
    const gf = matches.find((m) => m.match_key === 'GF');
    if (!gf || !(gf.status === 'finalized' || gf.status === 'done') || !gf.winner_entrant_id) return [];
    return standingsRows.filter((row) => row.rank != null)
      .sort((a, b) => Number(a.rank) - Number(b.rank))
      .map((row) => ({ rank: row.rank, entry_id: row.entrant_id, label: row.label }));
  }
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

// Nhãn cho BXH loại trực tiếp. engines/knockout.computeStandings mã hóa thứ bậc vào exit_round:
// có trận F mang match_key thì vô địch = R+3, á quân = R+2 (hoặc cả hai đội vào chung kết khi F
// chưa xong), thắng hạng ba = R+1, thua hạng ba = R; còn lại là vòng bị loại (R = số vòng nhánh).
// Suy nhãn từ khoảng cách tới exit_round lớn nhất (cách cũ) sai từ hạng ba trở xuống.
function knockoutPlacementLabels(rows = [], matches = []) {
  const rounds = matches.reduce((max, match) => Math.max(max, Number(match.round) || 0), 0);
  const keyed = matches.some((match) => match.match_key === 'F');
  const hasBronze = matches.some((match) => match.match_key === 'BRONZE');
  const exits = new Set(rows.map((row) => Number(row.exit_round) || 0));
  const decided = keyed ? exits.has(rounds + 3) : exits.has(rounds + 1);
  const roundName = (round) => {
    const fromEnd = rounds - round;
    if (fromEnd === 1) return hasBronze || !decided ? 'Bán kết' : 'Đồng hạng ba';
    if (fromEnd === 2) return 'Tứ kết';
    return `Vòng 1/${2 ** fromEnd}`;
  };
  const labelOf = (exit) => {
    if (!exit) return 'Đang thi đấu';
    if (keyed) {
      if (exit === rounds + 3) return 'Vô địch';
      if (exit === rounds + 2) return decided ? 'Á quân' : 'Vào chung kết';
      if (exit === rounds + 1) return 'Hạng ba';
      if (exit === rounds && hasBronze) return 'Hạng tư';
    } else {
      if (exit === rounds + 1) return 'Vô địch';
      if (exit === rounds) return 'Á quân';
    }
    return roundName(exit);
  };
  return rows.map((row) => ({ ...row, label: labelOf(Number(row.exit_round) || 0) }));
}

module.exports = { qualificationOutlook, finalStandingsFrom, knockoutPlacementLabels };
