const assert = require('assert');
const {
  signSession,
  verifySession,
  getActorFromSession,
  authorizeActor,
  getClubScopeFromSession,
  GROUP_SESSION_MAX_AGE_MS,
} = require('../../lib/groupSessionCore');

const secret = 'phase1-test-secret';
const now = 1_700_000_000_000;
const token = signSession({ groupId: 42, groupCode: 'ABC123', groupName: 'Test', role: 'admin', now }, secret);
const session = verifySession(token, secret, now + 1000);
assert.strictEqual(session.group_id, 42);
assert.strictEqual(session.session_version, 1);
assert.strictEqual(session.expires_at, now + GROUP_SESSION_MAX_AGE_MS);
assert.deepStrictEqual(getActorFromSession(session), {
  groupId: 42, groupCode: 'ABC123', groupName: 'Test', role: 'admin', session,
});
assert.strictEqual(verifySession(token, 'wrong-secret', now), null);
assert.strictEqual(verifySession(token, secret, now + GROUP_SESSION_MAX_AGE_MS + 1), null);
assert.strictEqual(verifySession('not-a-token', secret, now), null);
assert.strictEqual(authorizeActor(null, ['admin']).status, 401);
assert.strictEqual(authorizeActor(getActorFromSession(session), ['member']).status, 403);
assert.strictEqual(authorizeActor(getActorFromSession(session), ['admin']).ok, true);
assert.strictEqual(getClubScopeFromSession(null).status, 401);
assert.deepStrictEqual(getClubScopeFromSession(session), {
  ok: true, groupId: 42, role: 'admin', actor: getActorFromSession(session),
});
console.log('phase 1 auth boundary behavior ok');
