// lib/tournament/engines/doubleElim.js
// Loại trực tiếp 2 nhánh (double elimination): nhánh thắng (W), nhánh thua (L), chung kết (GF).
// Chỉ SINH CẤU TRÚC (structure) — không mô phỏng kết quả.
//   parent_slot     = slot trận mà KẺ THẮNG đi vào.
//   loser_to_slot   = slot trận nhánh thua mà KẺ THUA đi vào (mọi trận nhánh W đều có).
//   bracket         = 'W' | 'L' | 'GF'.
// Grand final reset (mặc định bật): phát 2 slot GF; slot GF2 là placeholder runtime kích hoạt khi
// nhà vô địch nhánh thua thắng GF1. Định tuyến loser + reset thuộc lớp runtime (persistence/results),
// engine chỉ phát shape.
const { seedOrder, nextPowerOfTwo } = require('../seeding');

function generateSchedule(stage, entrants, seed = 1) {
  const cfg = (stage && stage.config) || {};
  const reset = cfg.grandFinalReset !== false;
  const sorted = entrants.slice().sort((a, b) => (a.seed || 0) - (b.seed || 0));
  const n = sorted.length;
  const B = nextPowerOfTwo(Math.max(2, n));
  const K = Math.log2(B);
  const order = seedOrder(B);
  const positions = order.map((sr) => (sorted[sr - 1] ? sorted[sr - 1].id : null));

  const matches = [];
  let slot = 0;
  let ord = 0;
  const make = (o) => {
    const m = {
      round: o.round,
      bracket_slot: o.bracket_slot,
      parent_slot: null,
      slot: slot++,
      group_label: null,
      entrant_a_id: o.a != null ? o.a : null,
      entrant_b_id: o.b != null ? o.b : null,
      order: ord++,
      bracket: o.bracket,
      loser_to_slot: null,
    };
    matches.push(m);
    return m;
  };

  // ---- Nhánh thắng (Winners bracket) ----
  const wbRounds = {}; // r -> [{ match, idx }]  (idx = chỉ số trong vòng; R1 idx = pairing p)
  wbRounds[1] = [];
  const r1Khe = []; // feed cho vòng 2 (giống knockout: giữ bye)
  for (let i = 0; i < B; i += 2) {
    const p = i / 2;
    const a = positions[i];
    const b = positions[i + 1];
    if (a && b) {
      const m = make({ round: 1, bracket_slot: p, a, b, bracket: 'W' });
      wbRounds[1].push({ match: m, idx: p });
      r1Khe.push({ matchSlot: m.slot, entrantId: null });
    } else {
      r1Khe.push({ matchSlot: null, entrantId: a || b });
    }
  }

  let prevKhe = r1Khe;
  for (let r = 2; r <= K; r++) {
    wbRounds[r] = [];
    const curKhe = [];
    let q = 0;
    for (let i = 0; i < prevKhe.length; i += 2) {
      const left = prevKhe[i];
      const right = prevKhe[i + 1];
      const m = make({
        round: r,
        bracket_slot: q,
        a: left.entrantId || null,
        b: right.entrantId || null,
        bracket: 'W',
      });
      if (left.matchSlot != null) matches.find((x) => x.slot === left.matchSlot).parent_slot = m.slot;
      if (right.matchSlot != null) matches.find((x) => x.slot === right.matchSlot).parent_slot = m.slot;
      wbRounds[r].push({ match: m, idx: q });
      curKhe.push({ matchSlot: m.slot, entrantId: null });
      q++;
    }
    prevKhe = curKhe;
  }

  // ---- Nhánh thua (Losers bracket) ----
  // Danh sách vòng LB theo thứ tự thi đấu.
  const lbRounds = []; // { type, wbRound?, matches: [match] }
  if (K >= 2) {
    let lbRoundNo = 0;
    // vòng ghép đầu: nhận kẻ thua vòng 1 nhánh W (2 kẻ thua / trận)
    lbRoundNo++;
    const pairCount = B / 4;
    const pairMatches = [];
    for (let j = 0; j < pairCount; j++) {
      pairMatches.push(make({ round: lbRoundNo, bracket_slot: j, bracket: 'L' }));
    }
    lbRounds.push({ type: 'pair', wbRound: 1, matches: pairMatches });

    for (let r = 2; r <= K; r++) {
      // vòng "minor": winner LB trước + kẻ thua vòng r nhánh W
      lbRoundNo++;
      const minorCount = B / Math.pow(2, r);
      const minorMatches = [];
      for (let j = 0; j < minorCount; j++) {
        minorMatches.push(make({ round: lbRoundNo, bracket_slot: j, bracket: 'L' }));
      }
      lbRounds.push({ type: 'minor', wbRound: r, matches: minorMatches });
      // vòng "major": winner LB tự đấu với nhau (trừ khi đây là vòng cuối)
      if (r < K) {
        lbRoundNo++;
        const majorCount = B / Math.pow(2, r + 1);
        const majorMatches = [];
        for (let j = 0; j < majorCount; j++) {
          majorMatches.push(make({ round: lbRoundNo, bracket_slot: j, bracket: 'L' }));
        }
        lbRounds.push({ type: 'major', matches: majorMatches });
      }
    }
  }

  // ---- Chung kết (Grand final) ----
  const gf1 = make({ round: 1, bracket_slot: 0, bracket: 'GF' });
  let gf2 = null;
  if (reset) gf2 = make({ round: 2, bracket_slot: 1, bracket: 'GF' });

  // ---- Đấu nối kẻ thắng / kẻ thua ----
  // Kẻ thua vòng 1 nhánh W -> vòng ghép LB.
  if (K >= 2) {
    const pair = lbRounds[0].matches;
    for (const { match: m, idx: p } of wbRounds[1]) {
      m.loser_to_slot = pair[Math.floor(p / 2)].slot;
    }
    // Kẻ thua vòng r>=2 nhánh W -> vòng minor tương ứng (1:1 theo idx).
    for (let r = 2; r <= K; r++) {
      const minor = lbRounds.find((lr) => lr.type === 'minor' && lr.wbRound === r);
      for (const { match: m, idx: q } of wbRounds[r]) {
        m.loser_to_slot = minor.matches[q].slot;
      }
    }
    // Nối kẻ thắng trong LB giữa các vòng liên tiếp.
    for (let i = 0; i < lbRounds.length - 1; i++) {
      const cur = lbRounds[i].matches;
      const next = lbRounds[i + 1].matches;
      if (next.length === cur.length) {
        for (let j = 0; j < cur.length; j++) cur[j].parent_slot = next[j].slot;
      } else if (next.length === cur.length / 2) {
        for (let j = 0; j < cur.length; j++) cur[j].parent_slot = next[Math.floor(j / 2)].slot;
      } else {
        throw new Error('LB round shape không hợp lệ');
      }
    }
    // Kẻ thắng nhánh L (vòng cuối) -> GF1.
    const lbFinal = lbRounds[lbRounds.length - 1].matches;
    lbFinal[lbFinal.length - 1].parent_slot = gf1.slot;
  }

  // Nhánh W: kẻ thắng chung cuộc -> GF1.
  const wbFinal = wbRounds[K][wbRounds[K].length - 1].match;
  wbFinal.parent_slot = gf1.slot;
  // Kẻ thua chung kết nhánh W -> vòng cuối nhánh L (đã set qua rule minor r=K); nếu K==1 (2 đội) -> GF1.
  if (K === 1) wbFinal.loser_to_slot = gf1.slot;

  // GF reset: GF1 -> GF2 (runtime kích hoạt khi cần).
  if (reset && gf2) gf1.parent_slot = gf2.slot;

  return matches;
}

// Thứ hạng double-elim: vô địch (thắng GF quyết định) -> á quân -> theo thời điểm bị loại ở nhánh L.
// Bị loại muộn hơn (order lớn hơn) = hạng cao hơn.
function computeStandings(stage, entrants, matches) {
  const done = matches.filter((m) => m.status === 'done' && m.winner_entrant_id);
  const maxOrder = matches.reduce((mx, m) => Math.max(mx, m.order || 0), 0);

  // Trận GF quyết định = trận GF đã done có order lớn nhất.
  const gfDone = done.filter((m) => m.bracket === 'GF').sort((a, b) => b.order - a.order);
  let champion = null;
  let runnerUp = null;
  if (gfDone.length) {
    const dec = gfDone[0];
    champion = dec.winner_entrant_id;
    runnerUp = dec.winner_entrant_id === dec.entrant_a_id ? dec.entrant_b_id : dec.entrant_a_id;
  }

  // Bị loại = thua 1 trận nhánh L (lần thua thứ 2). Ghi thời điểm bằng order.
  const elimOrder = new Map();
  for (const m of done) {
    if (m.bracket !== 'L') continue;
    const loser = m.winner_entrant_id === m.entrant_a_id ? m.entrant_b_id : m.entrant_a_id;
    if (loser) elimOrder.set(loser, m.order);
  }

  const rows = entrants.map((e) => {
    let exit;
    if (e.id === champion) exit = maxOrder + 2;
    else if (e.id === runnerUp) exit = maxOrder + 1;
    else exit = elimOrder.has(e.id) ? elimOrder.get(e.id) : 0;
    return { entrant_id: e.id, exit_round: exit, seed: e.seed || 0, rank: 0 };
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
  const champ = standings.find((r) => r.rank === 1);
  return champ ? [{ entrant_id: champ.entrant_id, seed_in_stage: 1 }] : [];
}

module.exports = { generateSchedule, computeStandings, advance };
