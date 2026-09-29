'use strict';
// Link rủ ghép cặp (Epic 4 C2, ADR-007 D59). Token chỉ là "địa chỉ": người mở link phải đăng nhập tài khoản VĐV,
// RPC mới quyết định ghép. Chỉ BĂM (sha256 hex) được lưu ở tournament_registrations.partner_link_hash; token thô trả cho
// chủ đơn đúng một lần. Hết hạn sau 7 ngày; tạo link mới làm link cũ mất hiệu lực (ghi đè băm). Thuần, dùng node:crypto.

const crypto = require('node:crypto');

const TOKEN_BYTES = 32;
const PARTNER_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PARTNER_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const PARTNER_PATH_PREFIX = '/cong-dong/ghep/';
const LOGIN_PATH = '/cong-dong/tai-khoan?tab=dang-nhap';

function invalidLinkError() {
  const error = new Error('COMMUNITY_LINK_INVALID: Link rủ không hợp lệ hoặc đã hết hạn.');
  error.code = 'COMMUNITY_LINK_INVALID';
  return error;
}

function isPartnerTokenShape(raw) {
  return typeof raw === 'string' && PARTNER_TOKEN_RE.test(raw);
}

function hashPartnerToken(rawToken) {
  if (!isPartnerTokenShape(rawToken)) throw invalidLinkError();
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

// 32 byte ngẫu nhiên → base64url 43 ký tự (256 bit). Chỉ tokenHash + expiresAt đi vào RPC.
function issuePartnerToken({ now = Date.now() } = {}) {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return {
    rawToken,
    tokenHash: hashPartnerToken(rawToken),
    expiresAt: new Date(now + PARTNER_LINK_TTL_MS).toISOString(),
  };
}

function isPartnerLinkExpired(expiresAt, now = Date.now()) {
  const time = Date.parse(expiresAt);
  return !Number.isFinite(time) || now >= time;
}

function partnerLinkPath(rawToken) {
  return `${PARTNER_PATH_PREFIX}${rawToken}`;
}

// URL đăng nhập kèm next quay lại link. Token sai định dạng → không gắn next (không phản chiếu chuỗi lạ).
function partnerLoginPath(rawToken) {
  if (!isPartnerTokenShape(rawToken)) return LOGIN_PATH;
  return `${LOGIN_PATH}&next=${encodeURIComponent(partnerLinkPath(rawToken))}`;
}

module.exports = {
  TOKEN_BYTES,
  PARTNER_LINK_TTL_MS,
  PARTNER_TOKEN_RE,
  isPartnerTokenShape,
  hashPartnerToken,
  issuePartnerToken,
  isPartnerLinkExpired,
  partnerLinkPath,
  partnerLoginPath,
};
