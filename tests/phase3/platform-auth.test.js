const assert = require('assert');
const {
  hashPassword,
  verifyPassword,
  signPlatformSession,
  verifyPlatformSession,
  PlatformLoginRateLimiter,
  authorizePlatformActor,
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
