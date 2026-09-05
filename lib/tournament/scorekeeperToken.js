'use strict';

const crypto = require('crypto');

function hashScorekeeperToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function issueScorekeeperToken({ tournament_id = null, stage_id = null, match_id = null, court = null, ttl_ms = 2 * 60 * 60 * 1000, now = Date.now() } = {}) {
  const raw_token = crypto.randomBytes(32).toString('base64url');
  const issued_at = Number(now);
  const expires_at = issued_at + Number(ttl_ms);
  return {
    raw_token,
    record: { tournament_id, stage_id, match_id, court, token_hash: hashScorekeeperToken(raw_token), issued_at, expires_at, revoked_at: null, last_used_at: null },
  };
}

// Token dùng được nhiều lần cho tới khi hết hạn hoặc bị thu hồi. Người cầm điểm
// lưu nhiều lần trong một trận (sau mỗi ván, sửa tỉ số nhầm, thử lại khi mất
// mạng), nên khoá token sau lần đầu sẽ chặn đúng luồng vận hành thật. Chống ghi
// trùng do p_idempotency_key của replace_tournament_games đảm nhiệm.
function validateScorekeeperToken(rawToken, record, now = Date.now()) {
  if (!rawToken || !record?.token_hash || hashScorekeeperToken(rawToken) !== record.token_hash) return { ok: false, code: 'TOKEN_INVALID' };
  if (record.revoked_at != null) return { ok: false, code: 'TOKEN_REVOKED' };
  const expiresAt = typeof record.expires_at === 'number' ? record.expires_at : new Date(record.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || Number(now) >= expiresAt) return { ok: false, code: 'TOKEN_EXPIRED' };
  return { ok: true, code: null };
}

// Ghi dấu lần dùng gần nhất để audit; không ảnh hưởng tới việc token còn dùng được.
function markScorekeeperTokenUsed(rawToken, record, now = Date.now()) {
  const validation = validateScorekeeperToken(rawToken, record, now);
  if (!validation.ok) return { ...validation, record };
  return { ok: true, code: null, record: { ...record, last_used_at: Number(now) } };
}

module.exports = { hashScorekeeperToken, issueScorekeeperToken, validateScorekeeperToken, markScorekeeperTokenUsed };
