'use strict';

const ERROR_STATUS = Object.freeze({
  INVALID_INPUT: 400,
  CLUB_CREDENTIALS_INVALID: 401,
  SESSION_UNAUTHORIZED: 401,
  SESSION_INVALID: 401,
  SESSION_EXPIRED: 401,
  SESSION_REVOKED: 401,
  SESSION_NOT_YET_VALID: 401,
  // Tài khoản VĐV dùng mã riêng để thông báo công khai nói đúng ngữ cảnh
  // ("tên đăng nhập" chứ không phải "mã CLB"). Xem PUBLIC_MESSAGES ở routeAdapter.
  ATHLETE_CREDENTIALS_INVALID: 401,
  ATHLETE_ACCOUNT_DISABLED: 401,
  ATHLETE_SESSION_UNAUTHORIZED: 401,
  ATHLETE_SESSION_EXPIRED: 401,
  ATHLETE_SESSION_REVOKED: 401,
  ADMIN_REQUIRED: 403,
  CLUB_SCOPE_MISMATCH: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  // Cột email/phone của athlete_accounts do migration 051 tạo và migration được
  // chạy tay. Deploy code trước khi chạy migration là 503 "chưa sẵn sàng", không
  // phải 500: người dùng biết chờ, còn log không bị lẫn với lỗi thật.
  CONTACT_STORAGE_NOT_READY: 503,
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

// Vé VĐV hỏng/hết hạn/bị thu hồi không phải lỗi cần báo đỏ ở route đọc phiên:
// dùng chung một phép thử để route nào cũng nhận diện đúng nhóm lỗi này.
function isAthleteSessionError(code) {
  return String(code || '').startsWith('ATHLETE_SESSION_');
}

module.exports = { ERROR_STATUS, IdentityServiceError, identityError, isAthleteSessionError };
