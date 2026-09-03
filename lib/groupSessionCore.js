const crypto = require('crypto');

const GROUP_SESSION_VERSION = 1;
const GROUP_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded) {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function signSession({ groupId, groupCode, groupName, role, now = Date.now(), expiresAt }, secret) {
  const payload = {
    group_id: groupId,
    group_code: groupCode,
    group_name: groupName,
    role,
    issued_at: now,
    expires_at: expiresAt || now + GROUP_SESSION_MAX_AGE_MS,
    session_version: GROUP_SESSION_VERSION,
  };
  const encoded = encodePayload(payload);
  return `${encoded}.${signValue(encoded, secret)}`;
}

function verifySession(cookieValue, secret, now = Date.now()) {
  if (!cookieValue || !secret) return null;
  const parts = String(cookieValue).split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  try {
    const expectedSignature = signValue(encoded, secret);
    const given = Buffer.from(signature || '');
    const expected = Buffer.from(expectedSignature);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const payload = decodePayload(encoded);
    if (!payload?.group_id || !payload?.group_code || !['admin', 'member'].includes(payload.role)) return null;
    if (payload.session_version != null && payload.session_version !== GROUP_SESSION_VERSION) return null;
    if (!Number.isFinite(payload.issued_at)) return null;
    const expiresAt = Number.isFinite(payload.expires_at)
      ? payload.expires_at
      : payload.issued_at + GROUP_SESSION_MAX_AGE_MS;
    if (expiresAt <= now || payload.issued_at > now) return null;
    return { ...payload, expires_at: expiresAt, session_version: GROUP_SESSION_VERSION };
  } catch {
    return null;
  }
}

function getActorFromSession(session) {
  if (!session) return null;
  return {
    groupId: session.group_id,
    groupCode: session.group_code,
    groupName: session.group_name,
    role: session.role,
    session,
  };
}

function authorizeActor(actor, allowedRoles) {
  if (!actor) return { ok: false, status: 401, error: 'Unauthorized' };
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (roles.length && !roles.includes(actor.role)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true, actor };
}

function getClubScopeFromSession(session) {
  const actor = getActorFromSession(session);
  if (!actor) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true, groupId: actor.groupId, role: actor.role, actor };
}

module.exports = {
  GROUP_SESSION_VERSION,
  GROUP_SESSION_MAX_AGE_MS,
  signSession,
  verifySession,
  getActorFromSession,
  authorizeActor,
  getClubScopeFromSession,
};
