'use strict';

const { getClubSessionState } = require('./session');

const MEMBER_ACTIONS = new Set(['read', 'list', 'view']);
const ADMIN_ACTIONS = new Set(['create', 'write', 'update', 'delete', 'manage']);

function resolveClubPermission({
  session,
  action,
  resourceGroupId,
  now = Date.now(),
  currentAccessVersion,
}) {
  if (session?.signed === false) return { allowed: false, reason: 'unsigned_session' };

  const state = getClubSessionState(session, { now, currentAccessVersion });
  if (state !== 'active') return { allowed: false, reason: `session_${state}` };
  if (String(session.group_id) !== String(resourceGroupId)) {
    return { allowed: false, reason: 'group_scope_mismatch' };
  }
  if (MEMBER_ACTIONS.has(action)) return { allowed: true, reason: null };
  if (ADMIN_ACTIONS.has(action)) {
    return session.role === 'admin'
      ? { allowed: true, reason: null }
      : { allowed: false, reason: 'admin_required' };
  }
  return { allowed: false, reason: 'unsupported_action' };
}

module.exports = { resolveClubPermission };
