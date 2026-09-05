'use strict';

const crypto = require('crypto');

const PLATFORM_SESSION_VERSION = 1;
const PLATFORM_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_SCRYPT_COST = 16_384;
const PASSWORD_SCRYPT_BLOCK_SIZE = 8;
const PASSWORD_SCRYPT_PARALLELIZATION = 1;

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded) {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  if (typeof password !== 'string' || password.length < 8) {
    return Promise.reject(new TypeError('password must contain at least 8 characters'));
  }
  const hash = crypto.scryptSync(password, salt, 64, {
    N: PASSWORD_SCRYPT_COST,
    r: PASSWORD_SCRYPT_BLOCK_SIZE,
    p: PASSWORD_SCRYPT_PARALLELIZATION,
  }).toString('base64url');
  return Promise.resolve(`scrypt$${PASSWORD_SCRYPT_COST}$${PASSWORD_SCRYPT_BLOCK_SIZE}$${PASSWORD_SCRYPT_PARALLELIZATION}$${salt}$${hash}`);
}

function verifyPassword(password, encoded) {
  try {
    const [algorithm, n, r, p, salt, expectedEncoded] = String(encoded || '').split('$');
    if (algorithm !== 'scrypt' || !salt || !expectedEncoded) return Promise.resolve(false);
    const actual = crypto.scryptSync(String(password || ''), salt, 64, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    const expected = Buffer.from(expectedEncoded, 'base64url');
    return Promise.resolve(expected.length === actual.length && crypto.timingSafeEqual(expected, actual));
  } catch {
    return Promise.resolve(false);
  }
}

function signPlatformSession({ accountId, role, sessionKey, accessVersion = 1, now = Date.now(), expiresAt }, secret) {
  if (!secret) throw new Error('platform session secret is required');
  if (!Number.isSafeInteger(accountId) || accountId <= 0) throw new TypeError('accountId must be positive');
  if (!['community_admin', 'platform_admin'].includes(role)) throw new TypeError('invalid platform role');
  if (!sessionKey || String(sessionKey).length < 16) throw new TypeError('sessionKey must be opaque');
  const payload = {
    account_id: accountId,
    role,
    session_key: String(sessionKey),
    issued_at: now,
    expires_at: expiresAt || now + PLATFORM_SESSION_MAX_AGE_MS,
    session_version: PLATFORM_SESSION_VERSION,
    access_version: accessVersion,
  };
  const encoded = encodePayload(payload);
  return `${encoded}.${signValue(encoded, secret)}`;
}

function verifyPlatformSession(cookieValue, secret, now = Date.now(), { revokedSessionKeys, currentAccessVersion } = {}) {
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
    if (!Number.isSafeInteger(payload?.account_id) || payload.account_id <= 0) return null;
    if (!['community_admin', 'platform_admin'].includes(payload.role)) return null;
    if (payload.session_version !== PLATFORM_SESSION_VERSION) return null;
    if (!Number.isFinite(payload.issued_at) || payload.issued_at > now) return null;
    if (!Number.isFinite(payload.expires_at) || payload.expires_at <= now) return null;
    if (currentAccessVersion !== undefined && payload.access_version !== currentAccessVersion) return null;
    if (revokedSessionKeys?.has?.(payload.session_key)) return null;
    return payload;
  } catch {
    return null;
  }
}

function validatePlatformLogin(login) {
  const value = String(login ?? '');
  if (!value || /[%_]/.test(value)) return { ok: false, status: 401, error: 'Invalid credentials' };
  return { ok: true, login: value };
}

function findPlatformAccount(accounts = [], normalizedLogin) {
  return accounts.find((account) => account?.login === normalizedLogin) || null;
}

function getPlatformRateLimitKey({ login, account } = {}) {
  if (account?.id != null) return `platform-account:${account.id}`;
  if (/[\%_]/.test(String(login || ''))) return 'platform-invalid-login';
  return `platform-login:${String(login || '').trim().toLowerCase()}`;
}

function validatePlatformSessionRecord(cookieValue, secret, now, sessionRecord, account = null) {
  const token = verifyPlatformSession(cookieValue, secret, now);
  if (!token || !sessionRecord) return null;
  const expectedHash = crypto.createHash('sha256').update(token.session_key).digest('hex');
  if (String(sessionRecord.session_key_hash) !== expectedHash) return null;
  if (sessionRecord.account_id !== token.account_id || sessionRecord.revoked_at) return null;
  if (new Date(sessionRecord.expires_at).getTime() <= now) return null;
  if (account && (account.status !== 'active' || account.access_version !== token.access_version)) return null;
  return token;
}

function revokePlatformSessionRecord(sessionRecord, now = Date.now()) {
  if (!sessionRecord) return null;
  sessionRecord.revoked_at = new Date(now).toISOString();
  return sessionRecord;
}

class PlatformLoginRateLimiter {
  constructor({ maxFailures = 5, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.now = now;
    this.failures = new Map();
  }

  canAttempt(identifier) {
    const key = String(identifier).toLowerCase();
    const record = this.failures.get(key);
    if (!record || record.expiresAt <= this.now()) {
      this.failures.delete(key);
      return { allowed: true, remaining: this.maxFailures };
    }
    return { allowed: record.count < this.maxFailures, remaining: Math.max(0, this.maxFailures - record.count) };
  }

  recordFailure(identifier) {
    const key = String(identifier).toLowerCase();
    const timestamp = this.now();
    const current = this.failures.get(key);
    const record = !current || current.expiresAt <= timestamp
      ? { count: 0, expiresAt: timestamp + this.windowMs }
      : current;
    record.count += 1;
    this.failures.set(key, record);
    return { blocked: record.count >= this.maxFailures, remaining: Math.max(0, this.maxFailures - record.count) };
  }

  clear(identifier) {
    this.failures.delete(String(identifier).toLowerCase());
  }
}

function authorizePlatformActor(actor, allowedRoles = ['community_admin', 'platform_admin']) {
  if (!actor || actor.actor_type !== 'platform') return { allowed: false, reason: 'platform_actor_required' };
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return roles.includes(actor.role)
    ? { allowed: true, reason: null }
    : { allowed: false, reason: 'platform_role_forbidden' };
}

module.exports = {
  PLATFORM_SESSION_VERSION,
  PLATFORM_SESSION_MAX_AGE_MS,
  hashPassword,
  verifyPassword,
  signPlatformSession,
  verifyPlatformSession,
  PlatformLoginRateLimiter,
  authorizePlatformActor,
  validatePlatformLogin,
  findPlatformAccount,
  getPlatformRateLimitKey,
  validatePlatformSessionRecord,
  revokePlatformSessionRecord,
};
