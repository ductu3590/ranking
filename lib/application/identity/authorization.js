'use strict';

const { resolveClubPermission } = require('../../domain/identity/permissions');
const { identityError } = require('./errors');

const REASON_TO_CODE = Object.freeze({
  unsigned_session: 'SESSION_UNAUTHORIZED',
  session_invalid: 'SESSION_INVALID',
  session_expired: 'SESSION_EXPIRED',
  session_revoked: 'SESSION_REVOKED',
  session_not_yet_valid: 'SESSION_NOT_YET_VALID',
  admin_required: 'ADMIN_REQUIRED',
  group_scope_mismatch: 'CLUB_SCOPE_MISMATCH',
});

async function authorizeClubSession({ repository, session, action, groupId, now }) {
  if (!session?.group_id) throw identityError('SESSION_UNAUTHORIZED', 'Club session is required');
  const club = await repository.findClubById(session.group_id);
  if (!club) throw identityError('SESSION_UNAUTHORIZED', 'Club session is invalid');

  const resourceGroupId = groupId ?? club.id;
  const permission = resolveClubPermission({
    session,
    action,
    resourceGroupId,
    now,
    currentAccessVersion: Number(club.access_version),
  });
  if (!permission.allowed) {
    throw identityError(REASON_TO_CODE[permission.reason] || 'SESSION_UNAUTHORIZED', permission.reason);
  }

  if (session.session_key && repository.isSessionActive) {
    const active = await repository.isSessionActive(session.session_key, {
      groupId: club.id,
      role: session.role,
      now,
    });
    if (!active) throw identityError('SESSION_REVOKED', 'Club session has been revoked');
  }

  return club;
}

module.exports = { authorizeClubSession };
