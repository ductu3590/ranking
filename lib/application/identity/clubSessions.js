'use strict';

const { authorizeClubSession } = require('./authorization');
const { identityError } = require('./errors');

function createRotateClubSession({ repository, issueSession, now = Date.now }) {
  return async function rotateClubSession({ session, reason = 'rotation' } = {}) {
    const timestamp = now();
    const club = await authorizeClubSession({
      repository,
      session,
      action: 'read',
      groupId: session?.group_id,
      now: timestamp,
    });
    if (!session.session_key) throw identityError('SESSION_INVALID', 'Session key is required for rotation');
    const revoked = await repository.revokeSession(session.session_key, reason, timestamp);
    if (!revoked) throw identityError('SESSION_REVOKED', 'Club session has already been revoked');

    return issueSession({
      groupId: club.id,
      groupCode: club.code,
      groupName: club.name,
      role: session.role,
      accessVersion: Number(club.access_version),
    });
  };
}

function createRevokeClubSessions({ repository, now = Date.now }) {
  return async function revokeClubSessions({ session, reason = 'manual_revoke' } = {}) {
    const timestamp = now();
    const club = await authorizeClubSession({
      repository,
      session,
      action: 'manage',
      groupId: session?.group_id,
      now: timestamp,
    });
    const accessVersion = await repository.bumpClubAccessVersion(
      club.id,
      Number(club.access_version),
      timestamp
    );
    if (!accessVersion) throw identityError('VERSION_CONFLICT', 'Club access version changed');
    const revokedSessions = await repository.revokeSessionsByClub(club.id, reason, timestamp);
    return { accessVersion, revokedSessions };
  };
}

module.exports = { createRotateClubSession, createRevokeClubSessions };
