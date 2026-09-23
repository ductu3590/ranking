'use strict';

const { assert, lib, suite, sequence, seededRandom } = require('../_harness');
const P = lib('lib/tournament/pairingDraft.js');

const refs = (n) => Array.from({ length: n }, (_, i) => `member:${i + 1}`);
const start = (n) => ({ pairs: [], unpairedRefs: refs(n) });

suite('pairing (chạm hai người)', {
  'máy trạng thái: chọn A → chọn B → sẵn sàng; chọn lại A hủy'() {
    let sel = P.clearSelection();
    assert.equal(P.selectionPhase(sel), 'idle');
    sel = P.toggleSelection(sel, 'member:1');
    assert.equal(P.selectionPhase(sel), 'first');
    assert.equal(P.selectionPhase(P.toggleSelection(sel, 'member:1')), 'idle');
    sel = P.toggleSelection(sel, 'member:2');
    assert.equal(P.selectionPhase(sel), 'ready');
    assert.deepEqual(sel, { first: 'member:1', second: 'member:2' });
  },

  'ở trạng thái sẵn sàng: bỏ B về first(A), bỏ A về first(B), chọn C thay B'() {
    const ready = { first: 'member:1', second: 'member:2' };
    assert.deepEqual(P.toggleSelection(ready, 'member:2'), { first: 'member:1', second: null });
    assert.deepEqual(P.toggleSelection(ready, 'member:1'), { first: 'member:2', second: null });
    assert.deepEqual(P.toggleSelection(ready, 'member:3'), { first: 'member:1', second: 'member:3' });
  },

  'tạo cặp dùng ID ổn định, gỡ hai người khỏi danh sách chưa ghép'() {
    const makeId = sequence();
    const state = P.createPair(start(4), 'member:1', 'member:3', makeId);
    assert.deepEqual(state.pairs, [{ pairId: 'pair_0001', participantRefs: ['member:1', 'member:3'], locked: false }]);
    assert.deepEqual(state.unpairedRefs, ['member:2', 'member:4']);
  },

  'không tạo cặp một người, không dùng người đã có cặp'() {
    const makeId = sequence();
    const state = P.createPair(start(4), 'member:1', 'member:2', makeId);
    assert.throws(() => P.createPair(state, 'member:3', 'member:3', makeId), /PAIR_MEMBER_COUNT_INVALID/);
    assert.throws(() => P.createPair(state, 'member:1', 'member:3', makeId), /PAIR_MEMBER_COUNT_INVALID/);
  },

  'thêm người chỉ vào danh sách chưa ghép; cặp cũ giữ nguyên'() {
    const makeId = sequence();
    let state = P.createPair(start(4), 'member:1', 'member:2', makeId);
    state = P.createPair(state, 'member:3', 'member:4', makeId);
    const next = P.syncParticipants(state, [...refs(4), 'guest:g_12345678']);
    assert.deepEqual(next.pairs, state.pairs);
    assert.deepEqual(next.unpairedRefs, ['guest:g_12345678']);
  },

  'bỏ một người ở giữa chỉ tách cặp của người đó, kể cả cặp khác chưa khóa'() {
    const makeId = sequence();
    let state = start(6);
    state = P.createPair(state, 'member:1', 'member:2', makeId);
    state = P.createPair(state, 'member:3', 'member:4', makeId);
    state = P.createPair(state, 'member:5', 'member:6', makeId);
    const next = P.syncParticipants(state, refs(6).filter((ref) => ref !== 'member:3'));
    assert.deepEqual(next.pairs.map((p) => p.pairId), ['pair_0001', 'pair_0003']);
    assert.deepEqual(next.unpairedRefs, ['member:4']);
  },

  'tách cặp đã khóa bị từ chối; mở khóa rồi tách được'() {
    const makeId = sequence();
    let state = P.setLocked(P.createPair(start(2), 'member:1', 'member:2', makeId), 'pair_0001', true);
    assert.throws(() => P.splitPair(state, 'pair_0001'), /LOCKED_PAIR_MUTATION_FORBIDDEN/);
    state = P.splitPair(P.setLocked(state, 'pair_0001', false), 'pair_0001');
    assert.deepEqual(state.pairs, []);
    assert.deepEqual(state.unpairedRefs.sort(), ['member:1', 'member:2']);
  },

  'ghép ngẫu nhiên phần còn lại không đụng cặp đã có; lẻ còn đúng một người'() {
    const makeId = sequence();
    const state = P.createPair(start(7), 'member:1', 'member:2', makeId);
    const next = P.pairRemainingRandomly(state, { random: seededRandom(7), makeId });
    assert.deepEqual(next.pairs[0], state.pairs[0]);
    assert.equal(next.pairs.length, 3);
    assert.equal(next.unpairedRefs.length, 1);
    assert.deepEqual(P.pairingBlockers(next).map((b) => b.code), ['UNPAIRED_MEMBER']);
  },

  'ghép lại bỏ qua cặp đã khóa'() {
    const makeId = sequence();
    let state = P.createPair(start(6), 'member:1', 'member:2', makeId);
    state = P.setLocked(state, 'pair_0001', true);
    state = P.createPair(state, 'member:3', 'member:4', makeId);
    const next = P.regenerateUnlocked(state, { random: seededRandom(3), makeId });
    assert.deepEqual(next.pairs.find((p) => p.pairId === 'pair_0001').participantRefs, ['member:1', 'member:2']);
    assert.equal(next.pairs.some((p) => p.pairId === 'pair_0002'), false, 'cặp chưa khóa được ghép mới');
    assert.equal(next.pairs.length, 3);
  },

  'bỏ chọn người lẻ không đụng cặp nào'() {
    const makeId = sequence();
    const state = P.createPair(start(3), 'member:1', 'member:2', makeId);
    const next = P.dropUnpaired(state, 'member:3');
    assert.deepEqual(next.pairs, state.pairs);
    assert.deepEqual(next.unpairedRefs, []);
  },

  'pruneSelection bỏ người đã không còn trong danh sách chưa ghép'() {
    const sel = P.pruneSelection({ first: 'member:1', second: 'member:9' }, { unpairedRefs: ['member:1', 'member:2'] });
    assert.deepEqual(sel, { first: 'member:1', second: null });
  },
});
