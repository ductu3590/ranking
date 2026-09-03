'use strict';

const CLUB_SESSION_ROLES = new Set(['member', 'admin']);

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function getClubSessionState(session, { now = Date.now(), currentAccessVersion } = {}) {
  if (
    !session ||
    !session.group_id ||
    !session.group_code ||
    !CLUB_SESSION_ROLES.has(session.role) ||
    !Number.isFinite(session.issued_at) ||
    !Number.isFinite(session.expires_at) ||
    session.expires_at <= session.issued_at ||
    !isPositiveInteger(session.session_version) ||
    !isPositiveInteger(currentAccessVersion) ||
    !Number.isFinite(now)
  ) {
    return 'invalid';
  }
  if (session.revoked_at !== undefined && session.revoked_at !== null) return 'revoked';
  if (session.session_version !== currentAccessVersion) return 'revoked';
  if (now >= session.expires_at) return 'expired';
  if (now < session.issued_at) return 'not_yet_valid';
  return 'active';
}

function nextAccessVersion(currentAccessVersion) {
  if (!isPositiveInteger(currentAccessVersion)) {
    throw new RangeError('Current access version must be a positive integer');
  }
  if (currentAccessVersion === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Current access version cannot be incremented safely');
  }
  return currentAccessVersion + 1;
}

module.exports = { getClubSessionState, nextAccessVersion };
