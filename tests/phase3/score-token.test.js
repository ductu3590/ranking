const assert = require('assert');
const {
  issueScorekeeperToken,
  validateScorekeeperToken,
  consumeScorekeeperToken,
} = require('../../lib/tournament/scorekeeperToken');

const issued = issueScorekeeperToken({ match_id: 42, court: 'A1', ttl_ms: 60_000, now: 1_000 });
assert(issued.raw_token && issued.record.token_hash, 'token có secret trả một lần và hash lưu server');
assert.strictEqual(validateScorekeeperToken(issued.raw_token, issued.record, 1_001).ok, true, 'token hợp lệ trong hạn');
assert.strictEqual(validateScorekeeperToken(issued.raw_token, issued.record, 61_001).code, 'TOKEN_EXPIRED', 'token hết hạn bị từ chối');
assert.strictEqual(validateScorekeeperToken(issued.raw_token, { ...issued.record, revoked_at: 2_000 }, 1_001).code, 'TOKEN_REVOKED', 'token bị thu hồi bị từ chối');
const consumed = consumeScorekeeperToken(issued.raw_token, issued.record, 1_001);
assert.strictEqual(consumed.ok, true, 'lần dùng đầu được chấp nhận');
assert.strictEqual(validateScorekeeperToken(issued.raw_token, consumed.record, 1_002).code, 'TOKEN_REPLAYED', 'token đã dùng không thể dùng lại');
assert.strictEqual(validateScorekeeperToken('khac', issued.record, 1_001).code, 'TOKEN_INVALID', 'token sai bị từ chối');
console.log('phase3 scorekeeper token ok');
