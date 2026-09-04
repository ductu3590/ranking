'use strict';

const crypto = require('node:crypto');

const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = 'sha256';
const MAX_VERIFY_ITERATIONS = 1000000;

function requirePassword(password) {
  const value = String(password ?? '');
  if (!value) throw new TypeError('Password must not be empty');
  return value;
}

function hashPassword(password, options = {}) {
  const value = requirePassword(password);
  const iterations = options.iterations ?? PASSWORD_ITERATIONS;
  if (!Number.isSafeInteger(iterations) || iterations <= 0 || iterations > MAX_VERIFY_ITERATIONS) {
    throw new RangeError('Password iterations are invalid');
  }

  const salt = options.salt ?? crypto.randomBytes(16).toString('base64url');
  if (typeof salt !== 'string' || !salt || salt.includes(':')) {
    throw new TypeError('Password salt is invalid');
  }

  const derivedKey = crypto.pbkdf2Sync(
    value,
    salt,
    iterations,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST
  );
  return `pbkdf2:${iterations}:${salt}:${derivedKey.toString('base64url')}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 4) return false;

  const [scheme, iterationsValue, salt, encodedExpected] = parts;
  const iterations = Number(iterationsValue);
  if (
    scheme !== 'pbkdf2' ||
    !Number.isSafeInteger(iterations) ||
    iterations <= 0 ||
    iterations > MAX_VERIFY_ITERATIONS ||
    !salt ||
    !encodedExpected
  ) {
    return false;
  }

  try {
    const candidate = crypto.pbkdf2Sync(
      String(password ?? ''),
      salt,
      iterations,
      PASSWORD_KEY_LENGTH,
      PASSWORD_DIGEST
    );
    const expected = Buffer.from(encodedExpected, 'base64url');
    return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

module.exports = {
  PASSWORD_ITERATIONS,
  PASSWORD_KEY_LENGTH,
  PASSWORD_DIGEST,
  hashPassword,
  verifyPassword,
};
