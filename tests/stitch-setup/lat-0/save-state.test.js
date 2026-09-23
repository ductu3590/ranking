'use strict';

const { assert, lib, suite, sequence } = require('../_harness');
const { initialSaveState, saveReducer, keyForNextSave, isDirty } = lib('lib/tournament/setupSaveState.js');

const named = (name) => (draft) => ({ ...draft, tournament: { ...draft.tournament, name } });
const response = (name, revision, completedThrough = 1) => ({
  tournament_id: 10, division_id: 20, setup_revision: revision,
  draft: { draftVersion: 3, tournament: { name }, progress: { completedThrough } },
});

function run(state, ...actions) {
  return actions.reduce(saveReducer, state);
}

suite('save state', {
  'lưu thành công cập nhật id, revision, progress, trạng thái saved'() {
    const s = run(initialSaveState(), { type: 'edit', update: named('A') }, { type: 'saveStart', key: 'k1', seq: 1 },
      { type: 'saveSuccess', seq: 1, response: response('A', 2, 1) });
    assert.equal(s.status, 'saved');
    assert.equal(s.tournamentId, '10');
    assert.equal(s.revision, 2);
    assert.equal(s.completedThrough, 1);
    assert.equal(isDirty(s), false);
  },

  'response muộn không ghi đè edit mới; trạng thái vẫn dirty'() {
    const s = run(initialSaveState(), { type: 'edit', update: named('A') }, { type: 'saveStart', key: 'k1', seq: 1 },
      { type: 'edit', update: named('B') }, { type: 'saveSuccess', seq: 1, response: response('A', 2) });
    assert.equal(s.draft.tournament.name, 'B');
    assert.equal(s.status, 'dirty');
    assert.equal(s.revision, 2, 'revision vẫn cập nhật để lần lưu sau không conflict giả');
  },

  'response của request cũ (seq khác) bị bỏ qua hoàn toàn'() {
    const base = run(initialSaveState(), { type: 'edit', update: named('A') }, { type: 'saveStart', key: 'k2', seq: 2 });
    const s = saveReducer(base, { type: 'saveSuccess', seq: 1, response: response('X', 9) });
    assert.equal(s, base);
  },

  'lỗi mạng giữ dữ liệu; thử lại chưa sửa gì dùng lại đúng key'() {
    const makeKey = sequence('key_');
    let s = run(initialSaveState(), { type: 'edit', update: named('A') });
    const k = keyForNextSave(s, makeKey);
    s = run(s, { type: 'saveStart', key: k, seq: 1 }, { type: 'saveFailure', seq: 1, error: { code: 'NETWORK' } });
    assert.equal(s.status, 'error');
    assert.equal(s.draft.tournament.name, 'A');
    assert.equal(keyForNextSave(s, makeKey), k);
  },

  'lỗi rồi sửa tiếp thì lần lưu sau dùng key mới'() {
    const makeKey = sequence('key_');
    let s = run(initialSaveState(), { type: 'edit', update: named('A') });
    const k = keyForNextSave(s, makeKey);
    s = run(s, { type: 'saveStart', key: k, seq: 1 }, { type: 'saveFailure', seq: 1, error: { code: 'NETWORK' } }, { type: 'edit', update: named('B') });
    assert.notEqual(keyForNextSave(s, makeKey), k);
  },

  'conflict không ghi đè, chờ người dùng chọn; hydrate bị chặn'() {
    let s = run(initialSaveState(), { type: 'edit', update: named('Mine') }, { type: 'saveStart', key: 'k', seq: 1 },
      { type: 'saveFailure', seq: 1, error: { code: 'SETUP_REVISION_CONFLICT' } });
    assert.equal(s.status, 'conflict');
    assert.equal(s.draft.tournament.name, 'Mine');
    s = saveReducer(s, { type: 'hydrate', payload: { draft: { tournament: { name: 'Server' } }, tournamentId: 10 } });
    assert.equal(s.draft.tournament.name, 'Mine');
    const kept = saveReducer(s, { type: 'conflictKeepMine', revision: 7 });
    assert.equal(kept.status, 'dirty');
    assert.equal(kept.revision, 7);
    const reloaded = saveReducer(s, { type: 'conflictReload', payload: { draft: { tournament: { name: 'Server' } }, tournamentId: 10, revision: 7 } });
    assert.equal(reloaded.draft.tournament.name, 'Server');
  },

  'bỏ thay đổi chưa lưu quay về bản server đã xác nhận'() {
    const s = run(initialSaveState({ draft: { tournament: { name: 'Server' } }, tournamentId: 10, revision: 3 }),
      { type: 'edit', update: named('Nháp') }, { type: 'discard' });
    assert.equal(s.draft.tournament.name, 'Server');
    assert.equal(s.status, 'saved');
  },
});
