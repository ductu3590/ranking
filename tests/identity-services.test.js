'use strict';

const assert = require('node:assert/strict');

const { IdentityServiceError } = require('../lib/application/identity/errors');
const { createJoinClubWithCode } = require('../lib/application/identity/joinClubWithCode');
const {
  createRotateClubSession,
  createRevokeClubSessions,
} = require('../lib/application/identity/clubSessions');
const { createClubSessionIssuer } = require('../lib/application/identity/sessionIssuer');
const {
  createCreateUnclaimedAthlete,
  createUpdateMembershipAlias,
  createEndClubMembership,
} = require('../lib/application/identity/roster');
const { createRecordMembershipAssessment } = require('../lib/application/identity/assessments');
const {
  createSearchPotentialDuplicateAthletes,
  createReviewAthleteLink,
} = require('../lib/application/identity/duplicateReviews');

const now = 1_800_000_000_000;
const adminSession = {
  group_id: 7,
  group_code: 'PICKHUB7',
  group_name: 'PickHub 7',
  role: 'admin',
  issued_at: now - 1_000,
  expires_at: now + 60_000,
  session_version: 1,
  access_version: 3,
  session_key: 'active-admin-key',
};
const memberSession = { ...adminSession, role: 'member', session_key: 'active-member-key' };

function expectCode(code) {
  return (error) => error instanceof IdentityServiceError && error.code === code;
}

function authorizationRepository(overrides = {}) {
  return {
    async findClubById(id) {
      return id === 7 ? { id: 7, code: 'PICKHUB7', name: 'PickHub 7', access_version: 3 } : null;
    },
    async isSessionActive() {
      return true;
    },
    ...overrides,
  };
}

async function testJoinUsesOneStableCredentialError() {
  const issued = [];
  const repository = {
    async findClubByCode(code) {
      assert.equal(code, 'PICKHUB7');
      return {
        id: 7,
        code,
        name: 'PickHub 7',
        description: 'Club',
        access_version: 3,
        admin_password_hash: 'admin-hash',
        member_password_hash: 'member-hash',
      };
    },
  };
  const join = createJoinClubWithCode({
    repository,
    verifyPassword: (password, hash) => `${password}-hash` === hash,
    issueSession: async (value) => {
      issued.push(value);
      return { token: 'signed-token', session: { role: value.role } };
    },
  });

  const result = await join({ code: '  pickhub7 ', password: 'admin', rateLimitKey: 'ip-1' });
  assert.equal(result.role, 'admin');
  assert.equal(result.redirectTo, '/admin');
  assert.equal(result.token, 'signed-token');
  assert.deepEqual(issued, [{
    groupId: 7,
    groupCode: 'PICKHUB7',
    groupName: 'PickHub 7',
    role: 'admin',
    accessVersion: 3,
  }]);

  await assert.rejects(
    join({ code: 'PICKHUB7', password: 'wrong', rateLimitKey: 'ip-1' }),
    expectCode('CLUB_CREDENTIALS_INVALID')
  );
  const missingJoin = createJoinClubWithCode({
    repository: { findClubByCode: async () => null },
    verifyPassword: () => false,
    issueSession: async () => null,
  });
  await assert.rejects(
    missingJoin({ code: 'MISSING', password: 'wrong', rateLimitKey: 'ip-1' }),
    expectCode('CLUB_CREDENTIALS_INVALID')
  );
}

async function testJoinRateLimitIsInsideServiceBoundary() {
  let lookedUp = false;
  const join = createJoinClubWithCode({
    repository: { findClubByCode: async () => { lookedUp = true; } },
    verifyPassword: () => false,
    issueSession: async () => null,
    consumeRateLimit: () => ({ allowed: false, retryAfterSeconds: 17 }),
  });
  await assert.rejects(
    join({ code: 'PICKHUB7', password: 'secret', rateLimitKey: 'ip-2' }),
    (error) => expectCode('RATE_LIMITED')(error) && error.retryAfterSeconds === 17
  );
  assert.equal(lookedUp, false);
}

async function testRotateAndRevokeUseAuthoritativeAccessVersion() {
  const events = [];
  const repository = authorizationRepository({
    async revokeSession(key, reason) {
      events.push(['revoke-one', key, reason]);
      return true;
    },
    async bumpClubAccessVersion(groupId, expectedVersion) {
      events.push(['bump', groupId, expectedVersion]);
      return 4;
    },
    async revokeSessionsByClub(groupId, reason) {
      events.push(['revoke-all', groupId, reason]);
      return 2;
    },
  });
  const rotate = createRotateClubSession({
    repository,
    now: () => now,
    issueSession: async (value) => ({ token: 'rotated', session: value }),
  });
  const rotated = await rotate({ session: adminSession, reason: 'manual_rotation' });
  assert.equal(rotated.token, 'rotated');
  assert.deepEqual(events[0], ['revoke-one', 'active-admin-key', 'manual_rotation']);

  const revoke = createRevokeClubSessions({ repository, now: () => now });
  const revoked = await revoke({ session: adminSession, reason: 'password_changed' });
  assert.deepEqual(revoked, { accessVersion: 4, revokedSessions: 2 });
  assert.deepEqual(events.slice(1), [
    ['bump', 7, 3],
    ['revoke-all', 7, 'password_changed'],
  ]);

  const staleRotate = createRotateClubSession({
    repository: authorizationRepository({
      findClubById: async () => ({ id: 7, code: 'PICKHUB7', access_version: 4 }),
    }),
    now: () => now,
    issueSession: async () => null,
  });
  await assert.rejects(staleRotate({ session: adminSession }), expectCode('SESSION_REVOKED'));
}

async function testSessionIssuerPersistsOnlyAHashableOpaqueKey() {
  const records = [];
  let signed;
  const issueSession = createClubSessionIssuer({
    repository: { createSession: async (record) => { records.push(record); } },
    signSession: (payload) => { signed = payload; return 'signed-session'; },
    randomSessionKey: () => 'opaque-session-key',
    now: () => now,
    maxAgeMs: 60_000,
  });
  const result = await issueSession({
    groupId: 7,
    groupCode: 'PICKHUB7',
    groupName: 'PickHub 7',
    role: 'member',
    accessVersion: 3,
  });
  assert.equal(result.token, 'signed-session');
  assert.equal(records[0].sessionKey, 'opaque-session-key');
  assert.equal(records[0].expiresAt, now + 60_000);
  assert.equal(signed.sessionKey, 'opaque-session-key');
  assert.equal(signed.accessVersion, 3);
}

async function testRosterMutationsAreAdminOnlyScopedAndVersioned() {
  const calls = [];
  const repository = authorizationRepository({
    async createCompatibilityRosterEntry(input) {
      calls.push(['create', input]);
      return { athlete: { id: 31, status: 'unclaimed' }, membership: { id: 41, version: 1 } };
    },
    async updateMembershipAlias(input) {
      calls.push(['alias', input]);
      return input.expectedVersion === 1 ? { id: input.membershipId, club_alias: input.alias, version: 2 } : null;
    },
    async endMembership(input) {
      calls.push(['end', input]);
      return { id: input.membershipId, status: 'ended', effective_to: input.effectiveTo, version: 3 };
    },
  });

  const createAthlete = createCreateUnclaimedAthlete({ repository, now: () => now });
  const created = await createAthlete({
    session: adminSession,
    displayName: ' Nguyễn Văn An ',
    alias: ' An ',
    effectiveFrom: '2026-09-03',
    correlationId: 'req-create',
  });
  assert.equal(created.athlete.status, 'unclaimed');
  assert.equal(calls[0][1].clubId, 7);
  assert.equal(calls[0][1].displayName, 'Nguyễn Văn An');
  assert.equal(calls[0][1].actorType, 'club_admin_session');

  const updateAlias = createUpdateMembershipAlias({ repository, now: () => now });
  const updated = await updateAlias({
    session: adminSession,
    membershipId: 41,
    alias: 'An mới',
    expectedVersion: 1,
    correlationId: 'req-alias',
  });
  assert.equal(updated.version, 2);
  await assert.rejects(
    updateAlias({ session: adminSession, membershipId: 41, alias: 'An', expectedVersion: 9 }),
    expectCode('VERSION_CONFLICT')
  );

  const endMembership = createEndClubMembership({ repository, now: () => now });
  const ended = await endMembership({
    session: adminSession,
    membershipId: 41,
    effectiveTo: '2026-09-04',
    expectedVersion: 2,
  });
  assert.equal(ended.status, 'ended');

  await assert.rejects(
    createAthlete({ session: memberSession, displayName: 'Member cannot write' }),
    expectCode('ADMIN_REQUIRED')
  );
}

async function testAssessmentAndDuplicateReviewStayScopedAndManual() {
  const reviews = [];
  const repository = authorizationRepository({
    async findMembershipById(id, clubId) {
      return id === 41 && clubId === 7
        ? { id: 41, club_id: 7, athlete_id: 31, status: 'active', effective_from: '2026-01-01' }
        : null;
    },
    async createMembershipAssessment(input) {
      return { id: 51, ...input };
    },
    async findAthleteById(id) {
      if (id === 31) return { id, display_name: 'Nguyễn Văn An', aliases: ['An'], club_ids: [7] };
      if (id === 34) return { id, display_name: 'Ngoài CLB', aliases: [], club_ids: [8] };
      if (id === 32) return { id, display_name: 'nguyễn văn an', aliases: ['An'], club_ids: [8] };
      return null;
    },
    async searchDuplicateCandidates() {
      return [
        { id: 32, display_name: 'nguyễn văn an', aliases: ['An'], club_ids: [8] },
        { id: 33, display_name: 'Trần Bình', aliases: [], club_ids: [9] },
      ];
    },
    async recordAthleteLinkReview(input) {
      reviews.push(input);
      return { id: 61, status: input.decision };
    },
  });

  const assess = createRecordMembershipAssessment({ repository, now: () => now });
  const assessment = await assess({
    session: adminSession,
    membershipId: 41,
    skillLevel: 3.75,
    effectiveFrom: '2026-09-03',
    notes: 'Đánh giá tại CLB',
  });
  assert.equal(assessment.clubId, 7);
  assert.equal(assessment.athleteId, 31);
  assert.equal(assessment.actorType, 'club_admin_session');
  await assert.rejects(
    assess({ session: adminSession, membershipId: 41, skillLevel: 5.25, effectiveFrom: '2026-09-03' }),
    expectCode('INVALID_INPUT')
  );
  await assert.rejects(
    assess({ session: adminSession, membershipId: 41, skillLevel: 3.5, effectiveFrom: '2026-99-99' }),
    expectCode('INVALID_INPUT')
  );

  const search = createSearchPotentialDuplicateAthletes({ repository, now: () => now });
  const candidates = await search({ session: adminSession, athleteId: 31 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].athleteId, 32);
  assert.equal(candidates[0].autoMerge, false);
  assert.deepEqual(candidates[0].reasons, ['normalized_name_match', 'shared_alias']);
  await assert.rejects(
    search({ session: adminSession, athleteId: 34 }),
    expectCode('CLUB_SCOPE_MISMATCH')
  );

  const review = createReviewAthleteLink({ repository, now: () => now });
  await assert.rejects(
    review({ session: adminSession, athleteId: 31, candidateAthleteId: 32, decision: 'approve' }),
    expectCode('INVALID_INPUT')
  );
  await assert.rejects(
    review({
      session: adminSession,
      athleteId: '31',
      candidateAthleteId: 31,
      decision: 'reject',
      reason: 'Same athlete',
    }),
    expectCode('INVALID_INPUT')
  );
  const reviewed = await review({
    session: adminSession,
    athleteId: 31,
    candidateAthleteId: 32,
    decision: 'reject',
    reason: 'Hai người khác nhau, đã xác minh trực tiếp',
    correlationId: 'req-review',
  });
  assert.equal(reviewed.status, 'reject');
  assert.equal(reviews[0].actorType, 'club_admin_session');
  assert.equal(reviews[0].clubId, 7);
  await assert.rejects(
    review({
      session: adminSession,
      athleteId: 34,
      candidateAthleteId: 32,
      decision: 'reject',
      reason: 'Out of scope',
    }),
    expectCode('CLUB_SCOPE_MISMATCH')
  );
}

(async () => {
  await testJoinUsesOneStableCredentialError();
  await testJoinRateLimitIsInsideServiceBoundary();
  await testRotateAndRevokeUseAuthoritativeAccessVersion();
  await testSessionIssuerPersistsOnlyAHashableOpaqueKey();
  await testRosterMutationsAreAdminOnlyScopedAndVersioned();
  await testAssessmentAndDuplicateReviewStayScopedAndManual();
  console.log('identity application service tests ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
