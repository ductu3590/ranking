const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const groupSession = read('lib/groupSession.js');
assert.match(groupSession, /accessVersion/, 'session helper carries the club access version');
assert.match(groupSession, /verifySession\(cookieValue, getSessionSecret\(\), Date\.now\(\), \{ currentAccessVersion \}\)/, 'session helper supports authoritative version checks');

const joinRoute = read('app/api/groups/join/route.js');
assert.match(joinRoute, /createJoinClubWithCode/);
assert.match(joinRoute, /issueSession:\s*issueClubSession/);
const identityRepository = read('lib/repositories/identity/compatibilityRepository.js');
assert.match(identityRepository, /member_password_hash, access_version/);
assert.match(identityRepository, /group_sessions/);
const sessionIssuer = read('lib/application/identity/sessionIssuer.js');
assert.match(sessionIssuer, /accessVersion:\s*input\.accessVersion/);
assert.match(sessionIssuer, /repository\.createSession/);

const createRoute = read('app/api/groups/route.js');
assert.match(createRoute, /accessVersion:\s*group\.access_version/);
assert.match(createRoute, /issueClubSession/, 'new clubs persist their initial admin session');

for (const route of ['app/api/club/settings/route.js', 'app/api/club/settings/regenerate-code/route.js']) {
  const source = read(route);
  assert.match(source, /access_version\s*[:=]\s*nextAccessVersion/, `${route} bumps the club access version`);
  assert.match(source, /await requireValidatedGroupAdmin\(\)/,
    `${route} rejects a stale access_version before changing club access settings`);
}

assert.match(groupSession, /export async function requireValidatedGroupAdmin/);
assert.match(groupSession, /identityRepository/);
const groupSessionRoute = read('app/api/groups/session/route.js');
assert.match(groupSessionRoute, /await getValidatedGroupSessionFromCookies\(\)/,
  'session introspection checks the current club access version');

console.log('identity session integration contract ok');
