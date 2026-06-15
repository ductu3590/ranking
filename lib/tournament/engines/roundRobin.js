// lib/tournament/engines/roundRobin.js
// Engine vòng tròn. Hàm thuần, deterministic; random dùng seed.
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
function generateSchedule(stage, entrants, seed = 1) {
  const config = stage.config || {};
  const shuffled = config.shuffle === false ? entrants.slice() : shuffle(entrants, seed);
  const ids = shuffled.map((e) => e.id);
  const rounds = circleMethod(ids);
  const matches = [];
  let order = 0;
  rounds.forEach((pairs, ri) => {
    pairs.forEach(([a, b]) => {
      matches.push({
        round: ri + 1, group_label: 'A', bracket_slot: null,
        parent_slot: null, slot: null,
        entrant_a_id: a, entrant_b_id: b, order: order++,
      });
    });
  });
  return matches;
}
module.exports = { generateSchedule };
