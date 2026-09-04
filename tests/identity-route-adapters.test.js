'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const routes = {
  'app/api/groups/join/route.js': ['createJoinClubWithCode'],
  'app/api/identity/session/rotate/route.js': ['createRotateClubSession'],
  'app/api/identity/session/revoke/route.js': ['createRevokeClubSessions'],
  'app/api/identity/roster/route.js': [
    'createCreateUnclaimedAthlete',
    'createUpdateMembershipAlias',
    'createEndClubMembership',
  ],
  'app/api/identity/assessments/route.js': ['createRecordMembershipAssessment'],
  'app/api/identity/duplicates/route.js': ['createSearchPotentialDuplicateAthletes'],
  'app/api/identity/duplicates/review/route.js': ['createReviewAthleteLink'],
};

for (const [file, serviceNames] of Object.entries(routes)) {
  const source = read(file);
  for (const name of serviceNames) assert.match(source, new RegExp(name), `${file} delegates to ${name}`);
  assert.doesNotMatch(source, /\.from\(['"]/, `${file} must not contain persistence queries`);
  assert.match(source, /toIdentityResponse|identityRouteError/, `${file} uses the stable identity response adapter`);
}

const roster = read('app/api/identity/roster/route.js');
assert.match(roster, /export async function GET/);
assert.match(roster, /export async function POST/);
assert.match(roster, /export async function PATCH/);
assert.match(roster, /export async function DELETE/);

console.log('identity route adapter contracts ok');
