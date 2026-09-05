const assert = require('assert');
const {
  hashPassword,
  verifyPassword,
  signPlatformSession,
  verifyPlatformSession,
  PlatformLoginRateLimiter,
  authorizePlatformActor,
  validatePlatformLogin,
  findPlatformAccount,
  getPlatformRateLimitKey,
  validatePlatformSessionRecord,
  revokePlatformSessionRecord,
} = require('../../lib/platformSessionCore');
const { signSession } = require('../../lib/groupSessionCore');
const { assertTournamentOrganizer } = require('../../lib/tournament/interclub');

const secret = 'phase-3-platform-secret';
const now = 1_800_000_000_000;

(async () => {
  const passwordHash = await hashPassword('Correct123!');
  assert.notStrictEqual(passwordHash, 'Correct123!', 'password must not be stored as plaintext');
  assert.strictEqual(await verifyPassword('Correct123!', passwordHash), true, 'correct password verifies');
  assert.strictEqual(await verifyPassword('Wrong123!', passwordHash), false, 'wrong password is rejected');

  const accountRows = [{ id: 7, login: 'admin@example.com', status: 'active' }];
  for (const wildcard of ['admin%', 'admin_', '%admin', '_admin']) {
    assert.deepStrictEqual(validatePlatformLogin(wildcard), { ok: false, status: 401, error: 'Invalid credentials' }, 'wildcard login has generic auth failure');
    assert.strictEqual(findPlatformAccount(accountRows, wildcard), null, 'wildcard login cannot match an account');
  }
  assert.strictEqual(findPlatformAccount(accountRows, ' ADMIN@example.com '), null, 'lookup helper does not hide normalization responsibility');
  const invalidLoginLimiter = new PlatformLoginRateLimiter({ maxFailures: 3, windowMs: 60_000, now: () => now });
  for (const wildcard of ['admin%', 'admin_', '%admin']) {
    assert.strictEqual(getPlatformRateLimitKey({ login: wildcard, account: null }), 'platform-invalid-login', 'all wildcard attempts share defensive key');
    invalidLoginLimiter.recordFailure(getPlatformRateLimitKey({ login: wildcard, account: null }));
  }
  assert.strictEqual(invalidLoginLimiter.canAttempt('platform-invalid-login').allowed, false, 'wildcard variants share one rate-limit bucket');

  const session = signPlatformSession({
    accountId: 42,
    role: 'community_admin',
    sessionKey: 'platform-session-key-1234',
    now,
    expiresAt: now + 60_000,
  }, secret);
  assert.strictEqual(verifyPlatformSession(session, secret, now + 30_000)?.account_id, 42, 'active session verifies');
  assert.strictEqual(verifyPlatformSession(session, secret, now + 60_001), null, 'expired session is rejected');
  assert.strictEqual(
    verifyPlatformSession(session, secret, now + 30_000, { revokedSessionKeys: new Set(['platform-session-key-1234']) }),
    null,
    'revoked session is rejected',
  );
  const sessionRecord = {
    account_id: 42,
    session_key_hash: require('crypto').createHash('sha256').update('platform-session-key-1234').digest('hex'),
    expires_at: new Date(now + 60_000).toISOString(),
    revoked_at: null,
  };
  assert.ok(validatePlatformSessionRecord(session, secret, now + 30_000, sessionRecord), 'database-backed session is accepted before revoke');
  revokePlatformSessionRecord(sessionRecord, now + 31_000);
  assert.strictEqual(validatePlatformSessionRecord(session, secret, now + 31_001, sessionRecord), null, 'database-backed revoked session is rejected through auth validation');

  const limiter = new PlatformLoginRateLimiter({ maxFailures: 3, windowMs: 60_000, now: () => now });
  assert.strictEqual(limiter.recordFailure('admin@example.com').blocked, false);
  assert.strictEqual(limiter.recordFailure('admin@example.com').blocked, false);
  assert.strictEqual(limiter.recordFailure('admin@example.com').blocked, true, 'rate limit blocks after N failures');
  assert.strictEqual(limiter.canAttempt('admin@example.com').allowed, false);

  const groupCookie = signSession({
    groupId: 7,
    groupCode: 'CLUB7',
    groupName: 'Club 7',
    role: 'admin',
    now,
  }, secret);
  assert.strictEqual(
    authorizePlatformActor({ actor_type: 'group', ...JSON.parse(Buffer.from(groupCookie.split('.')[0], 'base64url').toString('utf8')) }, ['community_admin']).allowed,
    false,
    'group_session actor cannot access platform permissions',
  );

  assert.deepStrictEqual(
    assertTournamentOrganizer({ organizer_type: 'community' }),
    { organizer_type: 'community', organizer_club_id: null, organizer_community_id: null },
    'global community organizer does not require organizer_community_id',
  );
  assert.throws(
    () => assertTournamentOrganizer({ organizer_type: 'community', organizer_club_id: 7 }),
    (error) => error.code === 'ORGANIZER_CLUB_FORBIDDEN',
    'community organizer cannot carry organizer_club_id',
  );

  console.log('Phase 3 Task 2 platform auth contract: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
