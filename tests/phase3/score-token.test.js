const assert = require('assert');
const {
  issueScorekeeperToken,
  validateScorekeeperToken,
  markScorekeeperTokenUsed,
} = require('../../lib/tournament/scorekeeperToken');

const issued = issueScorekeeperToken({ match_id: 42, court: 'A1', ttl_ms: 60_000, now: 1_000 });
assert(issued.raw_token && issued.record.token_hash, 'token có secret trả một lần và hash lưu server');
assert.strictEqual(validateScorekeeperToken(issued.raw_token, issued.record, 1_001).ok, true, 'token hợp lệ trong hạn');
assert.strictEqual(validateScorekeeperToken(issued.raw_token, issued.record, 61_001).code, 'TOKEN_EXPIRED', 'token hết hạn bị từ chối');
assert.strictEqual(validateScorekeeperToken(issued.raw_token, { ...issued.record, revoked_at: 2_000 }, 1_001).code, 'TOKEN_REVOKED', 'token bị thu hồi bị từ chối');
assert.strictEqual(validateScorekeeperToken('khac', issued.record, 1_001).code, 'TOKEN_INVALID', 'token sai bị từ chối');

// Một phiên nhập điểm thật: lưu sau mỗi ván, sửa tỉ số gõ nhầm, và thử lại khi
// mất mạng. Token phải sống qua cả bốn lần; chống ghi trùng là việc của
// idempotency key ở replace_tournament_games, không phải của token.
let working = issued.record;
for (const [step, label] of [
  [1_001, 'lưu sau ván 1'],
  [1_002, 'lưu sau ván 2'],
  [1_003, 'sửa tỉ số gõ nhầm'],
  [1_004, 'thử lại sau khi mất mạng'],
]) {
  const used = markScorekeeperTokenUsed(issued.raw_token, working, step);
  assert.strictEqual(used.ok, true, `token vẫn dùng được khi ${label}`);
  working = used.record;
}
assert.strictEqual(working.last_used_at, 1_004, 'lần dùng gần nhất được ghi lại để audit');
assert.strictEqual(validateScorekeeperToken(issued.raw_token, { ...working, revoked_at: 1_005 }, 1_006).code, 'TOKEN_REVOKED', 'thu hồi vẫn chặn được token đã dùng nhiều lần');
assert.strictEqual(validateScorekeeperToken(issued.raw_token, working, 61_001).code, 'TOKEN_EXPIRED', 'hết hạn vẫn chặn được token đã dùng nhiều lần');
console.log('phase3 scorekeeper token ok');
