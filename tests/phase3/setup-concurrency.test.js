const assert = require('assert/strict');
const { findNextStage } = require('../../lib/tournament/nextStage');
const { saveDrawSnapshot } = require('../../lib/tournament/saveDraw');

function mockDb(result) {
  const calls = [];
  const query = {};
  for (const method of ['from', 'select', 'eq', 'is', 'update']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.maybeSingle = async () => result;
  return { db: query, calls };
}

(async () => {
  const stage = { id: 4, tournament_id: 9, division_id: 12, stage_order: 1, config: { draw: { status: 'draft' } } };
  for (const divisionId of [12, null]) {
    const { db, calls } = mockDb({ data: null, error: null });
    await findNextStage(db, { ...stage, division_id: divisionId }, 7);
    for (const filter of [['eq', 'group_id', 7], ['eq', 'tournament_id', 9], ['eq', 'stage_order', 2],
      [divisionId == null ? 'is' : 'eq', 'division_id', divisionId]]) {
      assert(calls.some((call) => JSON.stringify(call) === JSON.stringify(filter)));
    }
  }
  const duplicate = { code: 'PGRST116', message: 'Multiple rows' };
  assert.equal((await findNextStage(mockDb({ error: duplicate }).db, stage, 7)).error, duplicate);
  const stale = mockDb({ data: null, error: null });
  await assert.rejects(saveDrawSnapshot(stale.db, stage, 7, { status: 'draft' }), { code: '40001' });
  assert(stale.calls.some((call) => call[0] === 'eq' && call[1] === 'config' && call[2] === JSON.stringify(stage.config)));
  assert(stale.calls.some((call) => call[0] === 'eq' && call[1] === 'group_id' && call[2] === 7));
  const saved = { id: 4, config: {} };
  assert.equal(await saveDrawSnapshot(mockDb({ data: saved }).db, stage, 7, {}), saved);
  const nullable = mockDb({ data: saved });
  await saveDrawSnapshot(nullable.db, { ...stage, config: null }, 7, {});
  assert(nullable.calls.some((call) => call[0] === 'is' && call[1] === 'config' && call[2] === null));
  const failure = new Error('database unavailable');
  await assert.rejects(saveDrawSnapshot(mockDb({ error: failure }).db, stage, 7, {}), failure);
  console.log('setup concurrency and division-scoped progression runtime tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });