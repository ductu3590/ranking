'use strict';

// Phiên đăng nhập của tài khoản VĐV. Tách hẳn khỏi group_session (phiên CLB, dùng
// Mã CLB + mật khẩu chung) và platform_session (actor hệ thống): một VĐV đăng nhập
// bằng tài khoản cá nhân của mình, và phiên đó luôn gắn với đúng một CLB.
//
// Cùng khuôn với platformSessionCore: payload JSON base64url + HMAC-SHA256, so sánh
// chữ ký bằng timingSafeEqual. Cookie chỉ là "vé" — bảng athlete_account_sessions mới
// là nguồn sự thật (thu hồi được), nên mọi lần dùng đều phải đối chiếu DB.

const crypto = require('node:crypto');

const ATHLETE_SESSION_VERSION = 1;
const ATHLETE_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_KEY_BYTES = 32;

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded) {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function generateAthleteSessionKey() {
  return crypto.randomBytes(SESSION_KEY_BYTES).toString('base64url');
}

function hashAthleteSessionKey(sessionKey) {
  return crypto.createHash('sha256').update(String(sessionKey ?? '')).digest('hex');
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function signAthleteSession(input, secret) {
  if (!secret) throw new Error('athlete session secret is required');
  const accountId = Number(input?.accountId);
  const clubId = Number(input?.clubId);
  const athleteId = Number(input?.athleteId);
  const membershipId = Number(input?.membershipId);
  if (!isPositiveInteger(accountId)) throw new TypeError('accountId must be a positive integer');
  if (!isPositiveInteger(clubId)) throw new TypeError('clubId must be a positive integer');
  if (!isPositiveInteger(athleteId)) throw new TypeError('athleteId must be a positive integer');
  if (!isPositiveInteger(membershipId)) throw new TypeError('membershipId must be a positive integer');
  const sessionKey = String(input?.sessionKey ?? '');
  if (sessionKey.length < 16) throw new TypeError('sessionKey must be opaque');
  const accessVersion = Number(input?.accessVersion ?? 1);
  if (!isPositiveInteger(accessVersion)) throw new TypeError('accessVersion must be a positive integer');

  const now = Number.isFinite(input?.now) ? input.now : Date.now();
  const expiresAt = Number.isFinite(input?.expiresAt) ? input.expiresAt : now + ATHLETE_SESSION_MAX_AGE_MS;
  if (expiresAt <= now) throw new RangeError('expiresAt must be after issued_at');

  const payload = {
    account_id: accountId,
    club_id: clubId,
    athlete_id: athleteId,
    membership_id: membershipId,
    session_key: sessionKey,
    issued_at: now,
    expires_at: expiresAt,
    session_version: ATHLETE_SESSION_VERSION,
    access_version: accessVersion,
  };
  const encoded = encodePayload(payload);
  return `${encoded}.${signValue(encoded, secret)}`;
}

function verifyAthleteSession(cookieValue, secret, now = Date.now(), { currentAccessVersion } = {}) {
  if (!cookieValue || !secret) return null;
  const parts = String(cookieValue).split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  try {
    const given = Buffer.from(String(signature || ''));
    const expected = Buffer.from(signValue(encoded, secret));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    const payload = decodePayload(encoded);
    if (!isPositiveInteger(payload?.account_id)) return null;
    if (!isPositiveInteger(payload?.club_id)) return null;
    if (!isPositiveInteger(payload?.athlete_id)) return null;
    if (!isPositiveInteger(payload?.membership_id)) return null;
    if (payload.session_version !== ATHLETE_SESSION_VERSION) return null;
    if (!payload.session_key || String(payload.session_key).length < 16) return null;
    if (!Number.isFinite(payload.issued_at) || payload.issued_at > now) return null;
    if (!Number.isFinite(payload.expires_at) || payload.expires_at <= now) return null;
    if (currentAccessVersion !== undefined && payload.access_version !== currentAccessVersion) return null;
    return payload;
  } catch {
    return null;
  }
}

// Cookie hợp lệ chưa đủ: bản ghi phiên phải còn sống và tài khoản phải còn active.
// Trả về lý do cụ thể để route map ra đúng mã lỗi (hết hạn vs bị thu hồi).
function getAthleteSessionState({ token, sessionRecord, account, now = Date.now() } = {}) {
  if (!token) return 'invalid';
  if (!sessionRecord || !account) return 'invalid';
  if (String(sessionRecord.session_key_hash) !== hashAthleteSessionKey(token.session_key)) return 'invalid';
  if (Number(sessionRecord.account_id) !== Number(token.account_id)) return 'invalid';
  if (Number(account.id) !== Number(token.account_id)) return 'invalid';
  if (sessionRecord.revoked_at) return 'revoked';
  if (account.status !== 'active') return 'revoked';
  if (Number(account.access_version) !== Number(token.access_version)) return 'revoked';
  // Phiên gắn chặt vào CLB đã đăng ký; hồ sơ chuyển CLB thì vé cũ hết giá trị.
  if (Number(account.club_id) !== Number(token.club_id)) return 'revoked';
  if (Number(account.athlete_id) !== Number(token.athlete_id)) return 'revoked';
  const expiresAt = new Date(sessionRecord.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return 'expired';
  return 'active';
}

function validateAthleteLoginInput(input = {}) {
  // Cố tình không tái dùng validateAthleteAccountLogin ở đây: nếu login sai định dạng
  // vẫn phải trả "sai tài khoản hoặc mật khẩu" chứ không tiết lộ lý do khác nhau.
  const login = String(input.login ?? '').normalize('NFKC').trim().toLowerCase();
  const password = String(input.password ?? '');
  if (!login || !password) return { valid: false, reason: 'credentials_required' };
  if (login.length > 30 || password.length > 128) return { valid: false, reason: 'credentials_invalid' };
  return { valid: true, login, password };
}

module.exports = {
  ATHLETE_SESSION_VERSION,
  ATHLETE_SESSION_MAX_AGE_MS,
  generateAthleteSessionKey,
  hashAthleteSessionKey,
  signAthleteSession,
  verifyAthleteSession,
  getAthleteSessionState,
  validateAthleteLoginInput,
};
