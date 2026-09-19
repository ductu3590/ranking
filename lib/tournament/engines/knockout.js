// lib/tournament/engines/knockout.js
const { seedOrder, nextPowerOfTwo } = require('../seeding');

function topTwoGroupQualifiers(standings) {
  const groups = new Map();
  for (const row of standings) {
    const label = String(row.group_label || '');
    if (label !== 'A' && label !== 'B') continue;
    if (!groups.has(label)) groups.set(label, new Map());
    const rank = Number(row.rank);
    if (rank === 1 || rank === 2) {
      if (groups.get(label).has(rank)) throw new Error('DUPLICATE_GROUP_RANK');
      groups.get(label).set(rank, row.entrant_id);
    }
  }

  const qualifiers = {};
  for (const label of ['A', 'B']) {
    const group = groups.get(label);
    if (!group || group.get(1) == null || group.get(2) == null) {
      throw new Error('TOP_TWO_GROUP_QUALIFIERS_REQUIRED');
    }
    qualifiers[`${label}1`] = group.get(1);
    qualifiers[`${label}2`] = group.get(2);
  }
  return qualifiers;
}

// This fixed plan deliberately avoids bracket seeding: semifinals always cross groups.
function generateTopTwoGroupPlayoff(standings, { bronze = false } = {}) {
  const qualifiers = topTwoGroupQualifiers(standings);
  const matches = [
    {
      round: 1, bracket_slot: 0, parent_slot: 2, slot: 0,
      group_label: null, match_key: 'SF1',
      entrant_a_id: qualifiers.A1, entrant_b_id: qualifiers.B2,
      entrant_a_source: { group_label: 'A', rank: 1 },
      entrant_b_source: { group_label: 'B', rank: 2 }, order: 0,
    },
    {
      round: 1, bracket_slot: 1, parent_slot: 2, slot: 1,
      group_label: null, match_key: 'SF2',
      entrant_a_id: qualifiers.B1, entrant_b_id: qualifiers.A2,
      entrant_a_source: { group_label: 'B', rank: 1 },
      entrant_b_source: { group_label: 'A', rank: 2 }, order: 1,
    },
    {
      round: 2, bracket_slot: 0, parent_slot: null, slot: 2,
      group_label: null, match_key: 'F',
      entrant_a_id: null, entrant_b_id: null,
      entrant_a_source: { match_key: 'SF1', result: 'winner' },
      entrant_b_source: { match_key: 'SF2', result: 'winner' }, order: 2,
    },
  ];
  if (bronze) {
    matches.push({
      round: 2, bracket_slot: 1, parent_slot: null, slot: 3,
      group_label: null, match_key: 'BRONZE',
      entrant_a_id: null, entrant_b_id: null,
      entrant_a_source: { match_key: 'SF1', result: 'loser' },
      entrant_b_source: { match_key: 'SF2', result: 'loser' }, order: 3,
    });
  }
  const transitions = [
    { source_kind: 'group_rank', source_group_label: 'A', source_rank: 1, target_match_key: 'SF1', target_slot: 'a' },
    { source_kind: 'group_rank', source_group_label: 'B', source_rank: 2, target_match_key: 'SF1', target_slot: 'b' },
    { source_kind: 'group_rank', source_group_label: 'B', source_rank: 1, target_match_key: 'SF2', target_slot: 'a' },
    { source_kind: 'group_rank', source_group_label: 'A', source_rank: 2, target_match_key: 'SF2', target_slot: 'b' },
    { source_kind: 'match_outcome', source_match_key: 'SF1', source_outcome: 'winner', target_match_key: 'F', target_slot: 'a' },
    { source_kind: 'match_outcome', source_match_key: 'SF2', source_outcome: 'winner', target_match_key: 'F', target_slot: 'b' },
  ];
  if (bronze) {
    transitions.push(
      { source_kind: 'match_outcome', source_match_key: 'SF1', source_outcome: 'loser', target_match_key: 'BRONZE', target_slot: 'a' },
      { source_kind: 'match_outcome', source_match_key: 'SF2', source_outcome: 'loser', target_match_key: 'BRONZE', target_slot: 'b' },
    );
  }
  return {
    qualifiers,
    matches,
    transitions,
  };
}

// Sinh bracket single-elimination. entrants có seed (nhỏ = mạnh).
// slot = chỉ số duy nhất trong stage; parent_slot = slot trận kế mà winner đi vào.
function generateSchedule(stage, entrants, seed = 1) {
  const sorted = entrants.slice().sort((a, b) => (a.seed || 0) - (b.seed || 0));
  const n = sorted.length;
  const B = nextPowerOfTwo(Math.max(2, n));
  const order = seedOrder(B);
  const positions = order.map((seedRank) => sorted[seedRank - 1] ? sorted[seedRank - 1].id : null);

  const rounds = Math.log2(B);
  const matches = [];
  let slot = 0;
  let orderCounter = 0;

  const r1Khe = [];
  for (let i = 0; i < B; i += 2) {
    const a = positions[i];
    const b = positions[i + 1];
    if (a && b) {
      const s = slot++;
      matches.push({
        round: 1, bracket_slot: i / 2, parent_slot: null, slot: s,
        group_label: null, entrant_a_id: a, entrant_b_id: b, order: orderCounter++,
      });
      r1Khe.push({ matchSlot: s, entrantId: null });
    } else {
      r1Khe.push({ matchSlot: null, entrantId: a || b });
    }
  }

  let prevKhe = r1Khe;
  for (let r = 2; r <= rounds; r++) {
    const curKhe = [];
    for (let i = 0; i < prevKhe.length; i += 2) {
      const left = prevKhe[i];
      const right = prevKhe[i + 1];
      const s = slot++;
      const entrant_a_id = left.entrantId || null;
      const entrant_b_id = right.entrantId || null;
      const match = {
        round: r, bracket_slot: i / 2, parent_slot: null, slot: s,
        group_label: null, entrant_a_id, entrant_b_id, order: orderCounter++,
      };
      matches.push(match);
      if (left.matchSlot != null) matches.find((m) => m.slot === left.matchSlot).parent_slot = s;
      if (right.matchSlot != null) matches.find((m) => m.slot === right.matchSlot).parent_slot = s;
      curKhe.push({ matchSlot: s, entrantId: null });
    }
    prevKhe = curKhe;
  }
  return matches;
}

// Thứ hạng knockout: vô địch -> á quân -> theo vòng bị loại (muộn hơn = hạng cao hơn).
function computeStandings(stage, entrants, matches) {
  const maxRound = matches.reduce((mx, m) => Math.max(mx, m.round), 0);
  const eliminatedRound = new Map();
  const completed = matches.filter((m) => m.status === 'done' && m.winner_entrant_id);
  const keyedFinal = completed.find((m) => m.match_key === 'F');
  const keyedBronze = completed.find((m) => m.match_key === 'BRONZE');
  // BRONZE nằm CÙNG vòng với F. Fallback "trận đã xong ở vòng cao nhất" vì thế có
  // thể chọn nhầm trận tranh hạng ba làm chung kết và phong người thắng bronze làm
  // vô địch khi F chưa đá xong. Loại BRONZE khỏi fallback; nhánh legacy không có
  // match_key nên không bị ảnh hưởng.
  const finalMatch = keyedFinal
    || completed.find((m) => m.round === maxRound && m.match_key !== 'BRONZE');
  const placements = new Map();
  if (keyedFinal) {
    const runnerUp = keyedFinal.winner_entrant_id === keyedFinal.entrant_a_id
      ? keyedFinal.entrant_b_id : keyedFinal.entrant_a_id;
    placements.set(keyedFinal.winner_entrant_id, maxRound + 3);
    if (runnerUp) placements.set(runnerUp, maxRound + 2);
  } else {
    // Chung kết chưa xong: hai đội đang vào chung kết vẫn phải đứng TRÊN cặp tranh
    // hạng ba, nhưng chưa được phân định vô địch/á quân nên xếp ngang nhau.
    const pendingFinal = matches.find((m) => m.match_key === 'F');
    if (pendingFinal) {
      for (const id of [pendingFinal.entrant_a_id, pendingFinal.entrant_b_id]) {
        if (id) placements.set(id, maxRound + 2);
      }
    }
  }
  // Hạng ba/tư do BRONZE quyết định, độc lập với việc F đã đá hay chưa.
  if (keyedBronze) {
    const fourth = keyedBronze.winner_entrant_id === keyedBronze.entrant_a_id
      ? keyedBronze.entrant_b_id : keyedBronze.entrant_a_id;
    placements.set(keyedBronze.winner_entrant_id, maxRound + 1);
    if (fourth) placements.set(fourth, maxRound);
  }
  for (const m of matches) {
    if (m.status !== 'done' || !m.winner_entrant_id) continue;
    const loser = m.winner_entrant_id === m.entrant_a_id ? m.entrant_b_id : m.entrant_a_id;
    if (loser) eliminatedRound.set(loser, m.round);
  }
  const rows = entrants.map((e) => {
    let exitRound;
    if (placements.has(e.id)) exitRound = placements.get(e.id);
    else if (e.id === finalMatch?.winner_entrant_id) exitRound = maxRound + 1;
    else exitRound = eliminatedRound.has(e.id) ? eliminatedRound.get(e.id) : 0;
    return { entrant_id: e.id, exit_round: exitRound, seed: e.seed || 0, rank: 0 };
  });
  rows.sort((a, b) => (b.exit_round - a.exit_round) || (a.seed - b.seed));
  let rank = 1;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i].exit_round !== rows[i - 1].exit_round) rank = i + 1;
    rows[i].rank = rank;
  }
  return rows;
}
function advance(stage, standings) {
  const rows = Array.isArray(standings) ? standings : [];
  const leaders = rows.filter((r) => r.rank === 1);
  // Chỉ tiến cấp khi ngôi vô địch đã được phân định duy nhất. Khi chung kết chưa
  // đá xong, hai đội vào chung kết đang xếp ngang nhau ở hạng 1, và chọn bừa một
  // trong hai (hoặc tệ hơn, người thắng bronze) là sai.
  if (leaders.length !== 1) return [];
  return [{ entrant_id: leaders[0].entrant_id, seed_in_stage: 1 }];
}
module.exports = {
  generateSchedule,
  computeStandings,
  advance,
  topTwoGroupQualifiers,
  generateTopTwoGroupPlayoff,
};
