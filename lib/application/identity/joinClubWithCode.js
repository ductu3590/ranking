'use strict';

const { normalizeClubCode } = require('../../domain/identity/clubCode');
const { identityError } = require('./errors');

function createJoinClubWithCode({
  repository,
  verifyPassword,
  issueSession,
  consumeRateLimit = () => ({ allowed: true }),
}) {
  if (!repository || !verifyPassword || !issueSession) {
    throw new TypeError('JoinClubWithCode dependencies are required');
  }

  return async function joinClubWithCode(input = {}) {
    const code = normalizeClubCode(input.code);
    const password = String(input.password ?? '');
    const rate = consumeRateLimit(`club-join:${input.rateLimitKey || 'unknown'}:${code || 'unknown'}`);
    if (!rate.allowed) {
      throw identityError('RATE_LIMITED', 'Too many club join attempts', {
        retryAfterSeconds: rate.retryAfterSeconds,
        rate,
      });
    }
    if (!code || !password) throw identityError('INVALID_INPUT', 'Club code and password are required');

    const club = await repository.findClubByCode(code);
    let role = null;
    if (club && verifyPassword(password, club.admin_password_hash)) role = 'admin';
    else if (club && verifyPassword(password, club.member_password_hash)) role = 'member';
    if (!role) {
      // One response for an unknown code and a wrong password prevents club enumeration.
      throw identityError('CLUB_CREDENTIALS_INVALID', 'Club code or password is invalid');
    }

    const issued = await issueSession({
      groupId: club.id,
      groupCode: club.code,
      groupName: club.name,
      role,
      accessVersion: Number(club.access_version) || 1,
    });
    return {
      group: {
        id: club.id,
        code: club.code,
        name: club.name,
        description: club.description || '',
      },
      role,
      redirectTo: role === 'admin' ? '/admin' : '/quy',
      token: issued.token,
      session: issued.session,
    };
  };
}

module.exports = { createJoinClubWithCode };
