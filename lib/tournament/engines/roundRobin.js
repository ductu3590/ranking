// lib/tournament/engines/roundRobin.js
// Engine vòng tròn. Hàm thuần, deterministic; random dùng seed.
const { rankStandings } = require('../rules/tiebreak');
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, seed) {
  const r = rng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function circleMethod(ids) {
  const arr = ids.slice();
  if (arr.length % 2 === 1) arr.push(null); // BYE ảo
  const n = arr.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== null && b !== null) pairs.push([a, b]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}
function splitGroups(entrants, groupCount) {
  const sorted = entrants.slice().sort((a, b) => (a.seed || 0) - (b.seed || 0));
  const labels = Array.from({ length: groupCount }, (_, i) => String.fromCharCode(65 + i));
  const groups = {};
  labels.forEach((l) => (groups[l] = []));
  let idx = 0, dir = 1;
  for (const e of sorted) {
    groups[labels[idx]].push(e);
    if (dir === 1 && idx === groupCount - 1) dir = -1;
    else if (dir === -1 && idx === 0) dir = 1;
    else idx += dir;
  }
  return groups;
}
function generateSchedule(stage, entrants, seed = 1) {
  const config = stage.config || {};
  const groupCount = config.groupCount || 1;
  let order = 0;
  const matches = [];
  const buildGroup = (members, label) => {
    const shuffled = config.shuffle === false ? members.slice() : shuffle(members, seed + label.charCodeAt(0));
    const rounds = circleMethod(shuffled.map((e) => e.id));
    rounds.forEach((pairs, ri) => {
      pairs.forEach(([a, b]) => {
        matches.push({
          round: ri + 1, group_label: label, bracket_slot: null,
          parent_slot: null, slot: null,
          entrant_a_id: a, entrant_b_id: b, order: order++,
        });
      });
    });
  };
  if (groupCount <= 1) {
    buildGroup(entrants, 'A');
  } else if (config.duplicate_club_policy || config.ruleset?.duplicate_club_policy) {
    const { distributeEntriesAcrossPools } = require('../interclub');
    const draw = distributeEntriesAcrossPools(entrants, {
      poolCount: groupCount,
      policy: config.duplicate_club_policy || config.ruleset.duplicate_club_policy,
      seed,
    });
    draw.pools.forEach((pool, index) => buildGroup(pool, String.fromCharCode(65 + index)));
    matches.warnings = draw.warnings;
  } else {
    const groups = splitGroups(entrants, groupCount);
    Object.keys(groups).forEach((label) => buildGroup(groups[label], label));
  }
  return matches;
}
function computeStandings(stage, entrants, matches) {
  const config = stage.config || {};
  const scoring = config.scoring?.engine || config.scoring || config;
  const winPoints = scoring.winPoints ?? scoring.win_points ?? 2;
  const lossPoints = scoring.lossPoints ?? scoring.loss_points ?? 0;
  const rows = new Map();
  for (const e of entrants) {
    rows.set(e.id, {
      entrant_id: e.id, played: 0, won: 0, lost: 0,
      games_won: 0, games_lost: 0, points_for: 0, points_against: 0,
      diff: 0, match_points: 0, group_label: null, seed: e.seed || 0,
    });
  }
  const h2h = new Map();
  for (const m of matches) {
    if (m.status !== 'done' || !m.winner_entrant_id) continue;
    const ra = rows.get(m.entrant_a_id);
    const rb = rows.get(m.entrant_b_id);
    if (!ra || !rb) continue;
    ra.group_label = rb.group_label = m.group_label || ra.group_label;
    ra.played++; rb.played++;
    ra.games_won += m.games_a; ra.games_lost += m.games_b;
    rb.games_won += m.games_b; rb.games_lost += m.games_a;
    ra.points_for += m.points_a; ra.points_against += m.points_b;
    rb.points_for += m.points_b; rb.points_against += m.points_a;
    if (m.winner_entrant_id === m.entrant_a_id) { ra.won++; rb.lost++; }
    else { rb.won++; ra.lost++; }
    h2h.set([m.entrant_a_id, m.entrant_b_id].sort((x, y) => x - y).join('-'), m.winner_entrant_id);
  }
  const all = [];
  for (const row of rows.values()) {
    row.diff = row.points_for - row.points_against;
    row.match_points = row.won * winPoints + row.lost * lossPoints;
    all.push(row);
  }
  // Keep legacy_v2 ordering (points, diff, head-to-head, points_for, seed)
  // behind the versioned policy boundary.
  return rankStandings(all, matches, config.tiebreak || 'legacy_v2', config.drawSeed || 1);
}
function advance(stage, standings) {
  const config = stage.config || {};
  const k = config.advancePerGroup || 2;
  const byGroup = {};
  for (const row of standings) (byGroup[row.group_label || 'A'] ||= []).push(row);
  for (const label of Object.keys(byGroup)) byGroup[label].sort((a, b) => a.rank - b.rank);
  const labels = Object.keys(byGroup).sort();
  const advanced = [];
  for (let r = 0; r < k; r++) {
    for (const label of labels) {
      const row = byGroup[label][r];
      if (row) advanced.push({ entrant_id: row.entrant_id, from_group: label, from_rank: r + 1 });
    }
  }
  return advanced.map((a, i) => ({ ...a, seed_in_stage: i + 1 }));
}
module.exports = { generateSchedule, splitGroups, computeStandings, advance };
