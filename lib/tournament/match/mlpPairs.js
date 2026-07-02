// lib/tournament/match/mlpPairs.js
// Engine sinh lịch ghép đôi nội bộ MLP. Hàm thuần, deterministic; random dùng seed.
// Cùng kiểu RNG (mulberry32) với lib/tournament/engines/roundRobin.js để nhất quán codebase.

// RNG mulberry32 — clone từ roundRobin.js
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates seeded — như roundRobin.shuffle nhưng nhận sẵn 1 hàm rng
// để toàn bộ đội/vòng dùng chung tham số seed-hóa.
function shuffleWith(arr, r) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// entrantId -> số nguyên ổn định. parseInt nếu là số; nếu không, sum char codes.
function teamHash(entrantId) {
  const s = String(entrantId);
  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && String(n) === s.trim()) return n;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) | 0;
  return h >>> 0;
}

// Sinh subKinds động theo round + pair.
// pairsPerRound suy từ đội đầu tiên (mọi đội cùng pairsPerRound).
// - pairsPerRound===1 → ['round_1','round_2',...] (không suffix _pair)
// - pairsPerRound>1   → ['round_1_pair_1','round_1_pair_2',...]
// Mapping ngược: subKinds[i] với i = r*pairsPerRound + p (0-based) → round r+1, pair p+1.
function subKindsFor(rounds, pairsPerRound) {
  const out = [];
  for (let r = 1; r <= rounds; r++) {
    if (pairsPerRound === 1) {
      out.push(`round_${r}`);
    } else {
      for (let p = 1; p <= pairsPerRound; p++) {
        out.push(`round_${r}_pair_${p}`);
      }
    }
  }
  return out;
}

// Sinh lịch ghép đôi của 1 đội cho `rounds` vòng.
function buildTeamSchedule(team, rounds, seed) {
  const members = team.members || [];
  const n = members.length;
  if (n < 2) throw new Error('Đội cần ≥ 2 VĐV');
  const pairsPerRound = Math.floor(n / 2);
  const odd = n % 2 === 1;
  const th = teamHash(team.entrantId);

  const roundsOut = [];
  for (let r = 0; r < rounds; r++) {
    // Mảng index gốc [0..n-1]
    let indices = members.map((_, i) => i);
    // Nếu lẻ: 1 VĐV ngồi bench, xoay vòng theo r để công bằng.
    if (odd) {
      const benchPos = ((r % n) + n) % n;
      indices = indices.filter((mi) => mi !== benchPos);
    }
    // Shuffle phần còn lại bằng RNG seed-hóa riêng cho mỗi (đội, vòng).
    const r2 = rng((seed + r * 131 + th) >>> 0);
    const shuffled = shuffleWith(indices, r2);
    // Cắt thành các đôi liên tiếp. Phần dư (nếu có) bỏ — không tạo đôi 1 người.
    const pairs = [];
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const miA = shuffled[i];
      const miB = shuffled[i + 1];
      pairs.push([
        { mi: miA, name: members[miA].name },
        { mi: miB, name: members[miB].name },
      ]);
    }
    roundsOut.push(pairs);
  }
  return { pairsPerRound, rounds: roundsOut };
}

// API chính. Sinh pairSchedule cho mọi đội. Deterministic theo seed.
function generatePairSchedule(teams, rounds, seed = 1) {
  if (!Array.isArray(teams)) throw new Error('teams phải là mảng');
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error('rounds phải ≥ 1');
  // pairsPerRound suy từ đội đầu tiên (mọi đội cùng số VĐV nên cùng pairsPerRound).
  const pairsPerRound = teams.length > 0 ? Math.floor((teams[0].members || []).length / 2) : 1;
  const out = {
    seed,
    rounds,
    subKinds: subKindsFor(rounds, pairsPerRound),
    teams: {},
  };
  for (const team of teams) {
    out.teams[String(team.entrantId)] = buildTeamSchedule(team, rounds, seed);
  }
  return out;
}

module.exports = { generatePairSchedule };
