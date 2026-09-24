'use strict';
// Tiện ích dùng chung cho test Epic 1: dựng plan loại kép và mô phỏng định tuyến như RPC 068
// (điền cặp thắng/thua theo cạnh match_outcome vào đúng ô, không ghi đè ô đã có cặp).

const { lib, assert, seededRandom } = require('../_harness');

const { buildSetupPlan } = lib('lib/tournament/setupPlans');

const pairIdsOf = (n) => Array.from({ length: n }, (_, i) => `pair_${String(i + 1).padStart(4, '0')}`);

function dePlan(n, { seed = 'seed-de', finalBestOf = 1 } = {}) {
  return buildSetupPlan({ formatKey: 'double_elimination', config: { finalBestOf }, pairIds: pairIdsOf(n), seed });
}

// Chơi hết giải theo thứ tự `order`. pickWinner(match, a, b) → id thắng. Trả về trận dạng DB đã chốt.
function simulate(plan, pickWinner) {
  const state = new Map(plan.matches.map((m) => [m.matchKey, { a: m.entryAId, b: m.entryBId }]));
  const outgoing = new Map();
  for (const edge of plan.progressions) {
    const list = outgoing.get(edge.source.matchKey) || [];
    list.push(edge);
    outgoing.set(edge.source.matchKey, list);
  }
  const played = [];
  const pending = plan.matches.slice().sort((x, y) => x.order - y.order);
  let guard = 0;
  while (pending.length) {
    guard += 1;
    assert.ok(guard < 10000, 'mô phỏng không dừng');
    const index = pending.findIndex((m) => state.get(m.matchKey).a && state.get(m.matchKey).b);
    assert.ok(index >= 0, `kẹt: còn ${pending.map((m) => m.matchKey).join(',')} nhưng không trận nào đủ hai cặp`);
    const match = pending.splice(index, 1)[0];
    const { a, b } = state.get(match.matchKey);
    assert.notEqual(a, b, `${match.matchKey}: hai ô cùng một cặp`);
    const winner = pickWinner(match, a, b);
    const loser = winner === a ? b : a;
    played.push({ match_key: match.matchKey, round: match.round, entrant_a_id: a, entrant_b_id: b, winner_entrant_id: winner, status: 'done' });
    for (const edge of outgoing.get(match.matchKey) || []) {
      const target = state.get(edge.targetMatchKey);
      assert.equal(target[edge.targetSlot], null, `${edge.targetMatchKey}.${edge.targetSlot} bị điền hai lần`);
      target[edge.targetSlot] = edge.source.outcome === 'winner' ? winner : loser;
    }
  }
  return played;
}

const randomPicker = (seed) => {
  const random = seededRandom(seed);
  return (match, a, b) => (random() < 0.5 ? a : b);
};

module.exports = { dePlan, simulate, randomPicker, pairIdsOf };
