'use strict';
// Epic 2 E1 §6.2–6.4: chặn dữ liệu khi lưu tỉ số / W.O. và phân loại lỗi RPC theo message.

const { lib, assert, suite } = require('../_harness');

const { assertScoreSavable, statusForSave, assertWithdrawAllowed, classifyRpcConflict } = lib('lib/tournament/scoreEntry');

const ready = (status) => ({ id: 1, status, entry_a_id: 11, entry_b_id: 12 });
const game = [{ score_a: 11, score_b: 7 }];

suite('epic-2 · scoreEntry', {
  'trận đã chốt → USE_CORRECTION (sửa đi route corrections)': () => {
    const verdict = assertScoreSavable({ match: ready('finalized'), games: game, complete: true });
    assert.equal(verdict.code, 'USE_CORRECTION');
    assert.equal(verdict.status, 409);
  },
  'thiếu cặp → MATCH_NOT_READY (ca trận GF 1469)': () => {
    const verdict = assertScoreSavable({ match: { id: 1469, status: 'pending', entry_a_id: 5, entry_b_id: null }, games: [], complete: false });
    assert.equal(verdict.code, 'MATCH_NOT_READY');
  },
  'không có ván → GAMES_REQUIRED': () => {
    assert.equal(assertScoreSavable({ match: ready('live'), games: [], complete: false }).code, 'GAMES_REQUIRED');
  },
  'lưu dở khi trận chưa đấu → MATCH_NOT_STARTED': () => {
    for (const status of ['pending', 'warmup']) {
      assert.equal(assertScoreSavable({ match: ready(status), games: game, complete: false }).code, 'MATCH_NOT_STARTED', status);
    }
  },
  'lưu dở khi đang đấu/tạm dừng → được; giữ nguyên trạng thái': () => {
    for (const status of ['live', 'paused']) {
      assert.equal(assertScoreSavable({ match: ready(status), games: game, complete: false }).ok, true, status);
      assert.equal(statusForSave(ready(status), false), status);
    }
  },
  'chốt đủ thắng từ pending/warmup/live/paused khi đủ cặp → được (nhập bù, E1 §6.7)': () => {
    for (const status of ['pending', 'warmup', 'live', 'paused']) {
      assert.equal(assertScoreSavable({ match: ready(status), games: game, complete: true }).ok, true, status);
      assert.equal(statusForSave(ready(status), true), 'finalized');
    }
  },
  'W.O. chỉ khi khởi động; bỏ cuộc khi đang đấu/tạm dừng; action theo loại': () => {
    assert.equal(assertWithdrawAllowed({ match: ready('warmup'), kind: 'walkover' }).action, 'match_walkover');
    for (const status of ['pending', 'live', 'paused', 'finalized']) {
      assert.equal(assertWithdrawAllowed({ match: ready(status), kind: 'walkover' }).code, 'WITHDRAW_STATUS_INVALID', status);
    }
    for (const status of ['live', 'paused']) {
      assert.equal(assertWithdrawAllowed({ match: ready(status), kind: 'retired' }).action, 'match_retired', status);
    }
    for (const status of ['pending', 'warmup', 'finalized']) {
      assert.equal(assertWithdrawAllowed({ match: ready(status), kind: 'retired' }).code, 'WITHDRAW_STATUS_INVALID', status);
    }
    assert.equal(assertWithdrawAllowed({ match: ready('warmup'), kind: 'xyz' }).code, 'WITHDRAW_KIND_INVALID');
  },
  'phân loại lỗi RPC theo message, cùng mã PH409': () => {
    assert.equal(classifyRpcConflict({ code: 'PH409', message: 'match version conflict' }).code, 'MATCH_VERSION_CONFLICT');
    assert.equal(classifyRpcConflict({ code: 'PH409', message: 'PLAYOFF_TARGET_CONFLICT' }).code, 'PLAYOFF_TARGET_CONFLICT');
    assert.equal(classifyRpcConflict({ code: 'PH409', message: 'CORRECTION_BLOCKED_DOWNSTREAM' }).code, 'CORRECTION_BLOCKED_DOWNSTREAM');
    assert.equal(classifyRpcConflict({ code: '40001', message: 'match version conflict' }).code, 'MATCH_VERSION_CONFLICT');
    assert.equal(classifyRpcConflict({ code: 'PH409', message: 'ROSTER_LOCKED' }).code, 'CONFLICT');
    assert.equal(classifyRpcConflict({ code: '22023', message: 'invalid game payload' }), null);
    assert.notEqual(
      classifyRpcConflict({ code: 'PH409', message: 'match version conflict' }).message,
      classifyRpcConflict({ code: 'PH409', message: 'PLAYOFF_TARGET_CONFLICT' }).message,
    );
  },
});
