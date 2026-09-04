'use strict';

const crypto = require('node:crypto');

function createClubSessionIssuer({
  repository,
  signSession,
  randomSessionKey = () => crypto.randomBytes(32).toString('base64url'),
  now = Date.now,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000,
}) {
  return async function issueClubSession(input) {
    const issuedAt = now();
    const expiresAt = issuedAt + maxAgeMs;
    const sessionKey = randomSessionKey();
    await repository.createSession({
      groupId: input.groupId,
      groupCode: input.groupCode,
      role: input.role,
      sessionKey,
      issuedAt,
      expiresAt,
      sessionVersion: 1,
    });
    const session = {
      groupId: input.groupId,
      groupCode: input.groupCode,
      groupName: input.groupName,
      role: input.role,
      accessVersion: input.accessVersion,
      sessionKey,
      now: issuedAt,
      expiresAt,
    };
    return { token: signSession(session), session };
  };
}

module.exports = { createClubSessionIssuer };
