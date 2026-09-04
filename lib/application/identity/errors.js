'use strict';

const ERROR_STATUS = Object.freeze({
  INVALID_INPUT: 400,
  CLUB_CREDENTIALS_INVALID: 401,
  SESSION_UNAUTHORIZED: 401,
  SESSION_INVALID: 401,
  SESSION_EXPIRED: 401,
  SESSION_REVOKED: 401,
  SESSION_NOT_YET_VALID: 401,
  ADMIN_REQUIRED: 403,
  CLUB_SCOPE_MISMATCH: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
});

class IdentityServiceError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = 'IdentityServiceError';
    this.code = code;
    this.status = ERROR_STATUS[code] || 500;
    Object.assign(this, details);
  }
}

function identityError(code, message, details) {
  return new IdentityServiceError(code, message, details);
}

module.exports = { ERROR_STATUS, IdentityServiceError, identityError };
