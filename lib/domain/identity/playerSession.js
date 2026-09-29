'use strict';

// Phiên đăng nhập của tài khoản VĐV công khai (Epic 4, D54). Tách hẳn athlete_session (gắn CLB), group_session
// và platform_session: vé ở đây có `kind:'player'` bắt buộc khi xác minh, và khóa ký dẫn xuất bằng nhãn riêng,
// nên vé của hệ khác (dù cùng secret gốc) không bao giờ hợp lệ. Cookie chỉ là "vé"; bảng player_sessions mới là
// nguồn sự thật (thu hồi được), nên mọi lần dùng đều phải đối chiếu DB qua getPlayerSessionState.

const crypto = require('node:crypto');

const PLAYER_SESSION_VERSION = 1;
const PLAYER_SESSION_KIND = 'player';
const PLAYER_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_KEY_BYTES = 32;
const DERIVATION_LABEL = 'pickhub:player-session:v1';

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded) {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function derivePlayerSessionSecret(base) {
  if (!base) throw new Error('base secret is required');
  return crypto.createHmac('sha256', base).update(DERIVATION_LABEL).digest('base64url');
}

function generatePlayerSessionKey() {
  return crypto.randomBytes(SESSION_KEY_BYTES).toString('base64url');
}

function hashPlayerSessionKey(sessionKey) {
  return crypto.createHash('sha256').update(String(sessionKey ?? '')).digest('hex');
}

function signPlayerSession(input, secret) {
  if (!secret) throw new Error('player session secret is required');
  const accountId = Number(input?.accountId);
  if (!isPositiveInteger(accountId)) throw new TypeError('accountId must be a positive integer');
  const sessionKey = String(input?.sessionKey ?? '');
  if (sessionKey.length < 16) throw new TypeError('sessionKey must be opaque');
  const accessVersion = Number(input?.accessVersion ?? 1);
  if (!isPositiveInteger(accessVersion)) throw new TypeError('accessVersion must be a positive integer');

  const now = Number.isFinite(input?.now) ? input.now : Date.now();
  const expiresAt = Number.isFinite(input?.expiresAt) ? input.expiresAt : now + PLAYER_SESSION_MAX_AGE_MS;
  if (expiresAt <= now) throw new RangeError('expiresAt must be after issued_at');

  const encoded = encodePayload({
    kind: PLAYER_SESSION_KIND,
    account_id: accountId,
    session_key: sessionKey,
    issued_at: now,
    expires_at: expiresAt,
    session_version: PLAYER_SESSION_VERSION,
    access_version: accessVersion,
  });
  return `${encoded}.${signValue(encoded, secret)}`;
}

function verifyPlayerSession(cookieValue, secret, now = Date.now()) {
  if (!cookieValue || !secret) return null;
  const parts = String(cookieValue).split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  try {
    const given = Buffer.from(String(signature || ''));
    const expected = Buffer.from(signValue(encoded, secret));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    const payload = decodePayload(encoded);
    if (payload?.kind !== PLAYER_SESSION_KIND) return null;
    if (!isPositiveInteger(payload.account_id)) return null;
    if (payload.session_version !== PLAYER_SESSION_VERSION) return null;
    if (!payload.session_key || String(payload.session_key).length < 16) return null;
    if (!Number.isFinite(payload.issued_at) || payload.issued_at > now) return null;
    if (!Number.isFinite(payload.expires_at) || payload.expires_at <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

// Cookie hợp lệ chưa đủ: bản ghi phiên còn sống và tài khoản còn active. Trả lý do cụ thể để route map mã lỗi.
function getPlayerSessionState({ token, sessionRecord, account, now = Date.now() } = {}) {
  if (!token || !sessionRecord || !account) return 'invalid';
  if (String(sessionRecord.session_key_hash) !== hashPlayerSessionKey(token.session_key)) return 'invalid';
  if (Number(sessionRecord.account_id) !== Number(token.account_id)) return 'invalid';
  if (Number(account.id) !== Number(token.account_id)) return 'invalid';
  if (sessionRecord.revoked_at) return 'revoked';
  if (account.status !== 'active') return 'revoked';
  if (Number(account.access_version) !== Number(token.access_version)) return 'revoked';
  const expiresAt = new Date(sessionRecord.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return 'expired';
  return 'active';
}

module.exports = {
  PLAYER_SESSION_VERSION,
  PLAYER_SESSION_MAX_AGE_MS,
  derivePlayerSessionSecret,
  generatePlayerSessionKey,
  hashPlayerSessionKey,
  signPlayerSession,
  verifyPlayerSession,
  getPlayerSessionState,
};
