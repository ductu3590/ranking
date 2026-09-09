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
  const finals = matches.filter((m) => m.status === 'finalized' && m.winner_entrant_id);
  if (!finals.length) return [];
  const finalRound = Math.max(...finals.map((m) => Number(m.round || 0)));
  const final = finals.find((m) => Number(m.round || 0) === finalRound);
  if (!final) return [];
  const runnerUp = final.winner_entrant_id === final.entrant_a_id ? final.entrant_b_id : final.entrant_a_id;
  const output = [
    { rank: 1, entry_id: final.winner_entrant_id, label: 'Vô địch' },
    { rank: 2, entry_id: runnerUp, label: 'Á quân' },
  ];
  const semiLosers = finals.filter((m) => Number(m.round || 0) === finalRound - 1)
    .map((m) => (m.winner_entrant_id === m.entrant_a_id ? m.entrant_b_id : m.entrant_a_id))
    .filter(Boolean);
  if (semiLosers.length) output.push({ rank: 3, entry_id: semiLosers[0], label: 'Hạng ba' });
  return output;
}

module.exports = { qualificationOutlook, finalStandingsFrom };
