const { generatePairSchedule } = require('../../lib/tournament/match/mlpPairs');
const assert = (c, m) => { if (!c) { console.error(`FAIL: ${m}`); process.exit(1); } };

const mk = (id, names) => ({ entrantId: id, members: names.map((name) => ({ name })) });

// Helper: kiểm tra 1 đôi đúng shape [{mi,name},{mi,name}]
function isPair(p, members) {
  if (!Array.isArray(p) || p.length !== 2) return false;
  for (const ref of p) {
    if (typeof ref.mi !== 'number') return false;
    if (members[ref.mi].name !== ref.name) return false;
  }
  return true;
}

// Helper: với 1 vòng, mỗi mi xuất hiện tối đa 1 lần (không trùng người trong cùng vòng)
function noDup(roundPairs) {
  const seen = new Set();
  for (const pair of roundPairs) for (const ref of pair) {
    if (seen.has(ref.mi)) return false;
    seen.add(ref.mi);
  }
  return true;
}

// ── Test 1: 8 members / 4 rounds ────────────────────────────────────────
{
  const teams = [mk('10', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])];
  const out = generatePairSchedule(teams, 4, 42);
  assert(out.seed === 42, 'T1 seed lưu lại');
  assert(out.rounds === 4, 'T1 rounds=4');
  assert(JSON.stringify(out.subKinds) === JSON.stringify([
    'round_1_pair_1', 'round_1_pair_2', 'round_1_pair_3', 'round_1_pair_4',
    'round_2_pair_1', 'round_2_pair_2', 'round_2_pair_3', 'round_2_pair_4',
    'round_3_pair_1', 'round_3_pair_2', 'round_3_pair_3', 'round_3_pair_4',
    'round_4_pair_1', 'round_4_pair_2', 'round_4_pair_3', 'round_4_pair_4',
  ]), 'T1 subKinds round-based');
  const t = out.teams['10'];
  assert(t.pairsPerRound === 4, 'T1 pairsPerRound=4');
  assert(t.rounds.length === 4, 'T1 có 4 vòng');
  const members = teams[0].members;
  for (let r = 0; r < 4; r++) {
    assert(t.rounds[r].length === 4, `T1 vòng ${r} có 4 đôi`);
    assert(noDup(t.rounds[r]), `T1 vòng ${r} không trùng người`);
    for (const p of t.rounds[r]) assert(isPair(p, members), `T1 vòng ${r} đôi đúng shape`);
  }
  console.log('T1 8 members/4 rounds ok');
}

// ── Test 2: 4 members / 4 rounds → subKinds length 8, biên 2 đầu ─────────
{
  const teams = [mk('10', ['A', 'B', 'C', 'D'])];
  const out = generatePairSchedule(teams, 4, 7);
  assert(out.subKinds.length === 8, 'T2 subKinds length=8');
  assert(out.subKinds[0] === 'round_1_pair_1', 'T2 subKinds[0]=round_1_pair_1');
  assert(out.subKinds[7] === 'round_4_pair_2', 'T2 subKinds[7]=round_4_pair_2');
  assert(out.teams['10'].pairsPerRound === 2, 'T2 pairsPerRound=2');
  console.log('T2 4 members/4 rounds subKinds ok');
}

// ── Test 3: Determinism — cùng seed → byte-identical ────────────────────
{
  const teams = () => [
    mk('10', ['Lan', 'Tú', 'Nam', 'Mai', 'An', 'Bình']),
    mk('11', ['Hoa', 'Yến', 'Kim', 'Loan']),
  ];
  const a = generatePairSchedule(teams(), 4, 99);
  const b = generatePairSchedule(teams(), 4, 99);
  assert(JSON.stringify(a) === JSON.stringify(b), 'T3 cùng seed → byte-identical');
  const c = generatePairSchedule(teams(), 4, 100);
  assert(JSON.stringify(a) !== JSON.stringify(c), 'T3 khác seed → khác hoán vị');
  console.log('T3 determinism ok');
}

// ── Test 4: Odd members (7) → bench xoay vòng, pairsPerRound=3 ───────────
{
  const teams = [mk('20', ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'])];
  const out = generatePairSchedule(teams, 7, 5);
  const t = out.teams['20'];
  assert(t.pairsPerRound === 3, 'T4 pairsPerRound=3 (floor(7/2))');
  const members = teams[0].members;
  const benched = [];
  for (let r = 0; r < 7; r++) {
    assert(t.rounds[r].length === 3, `T4 vòng ${r} có 3 đôi`);
    assert(noDup(t.rounds[r]), `T4 vòng ${r} không trùng`);
    const onCourt = new Set();
    for (const p of t.rounds[r]) {
      assert(isPair(p, members), `T4 vòng ${r} đôi shape`);
      for (const ref of p) onCourt.add(ref.mi);
    }
    assert(onCourt.size === 6, `T4 vòng ${r} đúng 6 người trên sân (1 bench)`);
    // tìm người bench
    for (let mi = 0; mi < 7; mi++) if (!onCourt.has(mi)) benched.push(mi);
  }
  // bench xoay vòng: 7 vòng, mỗi mi 0..6 bench đúng 1 lần
  assert(benched.length === 7, 'T4 mỗi vòng đúng 1 người bench');
  assert(new Set(benched).size === 7, 'T4 bench xoay đủ 7 người khác nhau');
  console.log('T4 odd members bench rotate ok');
}

// ── Test 5: <2 VĐV → throw ──────────────────────────────────────────────
{
  let threw = false;
  try { generatePairSchedule([mk('30', ['Solo'])], 4, 1); }
  catch (e) { threw = true; assert(/2 VĐV/.test(e.message), 'T5 message đúng'); }
  assert(threw, 'T5 <2 VĐV phải throw');

  // 0 member cũng throw
  let threw0 = false;
  try { generatePairSchedule([{ entrantId: '31', members: [] }], 2, 1); }
  catch (e) { threw0 = true; }
  assert(threw0, 'T5 0 VĐV phải throw');
  console.log('T5 <2 VĐV throw ok');
}

// ── Test 6: 2 members / 2 rounds → subKinds = ['round_1','round_2'] ──────
{
  const teams = [mk('40', ['X', 'Y'])];
  const out = generatePairSchedule(teams, 2, 3);
  assert(JSON.stringify(out.subKinds) === JSON.stringify(['round_1', 'round_2']), 'T6 subKinds no _pair suffix');
  assert(out.teams['40'].pairsPerRound === 1, 'T6 pairsPerRound=1');
  console.log('T6 2 members/2 rounds subKinds ok');
}

// ── Test 7: 4 members / 2 rounds → 4 subKinds với _pair suffix ───────────
{
  const teams = [mk('50', ['A', 'B', 'C', 'D'])];
  const out = generatePairSchedule(teams, 2, 9);
  assert(JSON.stringify(out.subKinds) === JSON.stringify([
    'round_1_pair_1', 'round_1_pair_2', 'round_2_pair_1', 'round_2_pair_2',
  ]), 'T7 subKinds round_pair');
  assert(out.teams['50'].pairsPerRound === 2, 'T7 pairsPerRound=2');
  console.log('T7 4 members/2 rounds subKinds ok');
}

console.log('mlp-pairs ok');
