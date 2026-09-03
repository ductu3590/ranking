const assert = require('node:assert/strict');

const { normalizeClubCode } = require('../lib/domain/identity/clubCode');
const { hashPassword, verifyPassword } = require('../lib/domain/identity/password');
const {
  getClubSessionState,
  nextAccessVersion,
} = require('../lib/domain/identity/session');
const {
  isMembershipEffective,
  validateMembershipPeriod,
} = require('../lib/domain/identity/membership');
const {
  scoreDuplicateCandidate,
  shouldQueueDuplicateReview,
} = require('../lib/domain/identity/duplicates');
const { resolveClubPermission } = require('../lib/domain/identity/permissions');

assert.equal(normalizeClubCode('  p246club  '), 'P246CLUB');
assert.equal(normalizeClubCode(null), '');

const passwordHash = hashPassword('member-secret', {
  salt: Buffer.from('0123456789abcdef').toString('base64url'),
  iterations: 120000,
});
assert.match(passwordHash, /^pbkdf2:120000:[^:]+:[^:]+$/);
assert.equal(verifyPassword('member-secret', passwordHash), true);
assert.equal(verifyPassword('wrong-secret', passwordHash), false);
assert.equal(verifyPassword('member-secret', 'invalid-hash'), false);
assert.throws(() => hashPassword(''), /password/i);

const activeSession = {
  group_id: 12,
  group_code: 'P246CLUB',
  role: 'member',
  issued_at: 1_000,
  expires_at: 5_000,
  session_version: 1,
  access_version: 4,
};
assert.equal(
  getClubSessionState(activeSession, { now: 4_999, currentAccessVersion: 4 }),
  'active'
);
assert.equal(
  getClubSessionState(activeSession, { now: 5_000, currentAccessVersion: 4 }),
  'expired'
);
assert.equal(
  getClubSessionState(activeSession, { now: 4_000, currentAccessVersion: 5 }),
  'revoked'
);
assert.equal(
  getClubSessionState({ ...activeSession, role: 'owner' }, { now: 4_000, currentAccessVersion: 4 }),
  'invalid'
);
assert.equal(nextAccessVersion(4), 5);
assert.throws(() => nextAccessVersion(0), /access version/i);

const membership = {
  status: 'active',
  effective_from: '2026-01-01',
  effective_to: '2026-07-01',
};
assert.equal(isMembershipEffective(membership, '2026-01-01'), true);
assert.equal(isMembershipEffective(membership, '2026-06-30'), true);
assert.equal(isMembershipEffective(membership, '2026-07-01'), false);
assert.equal(isMembershipEffective({ ...membership, status: 'inactive' }, '2026-03-01'), false);
assert.deepEqual(validateMembershipPeriod(membership), { valid: true, reason: null });
assert.deepEqual(
  validateMembershipPeriod({ effective_from: '2026-07-01', effective_to: '2026-07-01' }),
  { valid: false, reason: 'effective_to_must_be_after_effective_from' }
);

const sameNameAcrossClubs = scoreDuplicateCandidate(
  { displayName: ' Nguyễn  Văn An ', aliases: ['An Nguyễn'], clubIds: [1] },
  { displayName: 'nguyễn văn an', aliases: ['AN NGUYỄN'], clubIds: [2] }
);
assert.equal(sameNameAcrossClubs.score, 70);
assert.deepEqual(sameNameAcrossClubs.reasons, ['normalized_name_match', 'shared_alias']);
assert.equal(sameNameAcrossClubs.autoMerge, false);
assert.equal(shouldQueueDuplicateReview(sameNameAcrossClubs), true);
assert.equal(
  shouldQueueDuplicateReview(scoreDuplicateCandidate(
    { displayName: 'Nguyễn Văn An', aliases: [], clubIds: [1] },
    { displayName: 'Trần Văn Bình', aliases: [], clubIds: [2] }
  )),
  false
);

assert.deepEqual(
  resolveClubPermission({
    session: { ...activeSession, role: 'member' },
    action: 'read',
    resourceGroupId: 12,
    now: 2_000,
    currentAccessVersion: 4,
  }),
  { allowed: true, reason: null }
);
assert.deepEqual(
  resolveClubPermission({
    session: { ...activeSession, role: 'member' },
    action: 'write',
    resourceGroupId: 12,
    now: 2_000,
    currentAccessVersion: 4,
  }),
  { allowed: false, reason: 'admin_required' }
);
assert.deepEqual(
  resolveClubPermission({
    session: { ...activeSession, role: 'admin' },
    action: 'write',
    resourceGroupId: 12,
    now: 2_000,
    currentAccessVersion: 4,
  }),
  { allowed: true, reason: null }
);
assert.deepEqual(
  resolveClubPermission({
    session: { ...activeSession, role: 'admin' },
    action: 'write',
    resourceGroupId: 99,
    now: 2_000,
    currentAccessVersion: 4,
  }),
  { allowed: false, reason: 'group_scope_mismatch' }
);
assert.deepEqual(
  resolveClubPermission({
    session: { ...activeSession, is_default: true, signed: false },
    action: 'read',
    resourceGroupId: 12,
    now: 2_000,
    currentAccessVersion: 4,
  }),
  { allowed: false, reason: 'unsigned_session' }
);

console.log('identity domain tests ok');
