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
    record: { tournament_id, stage_id, match_id, court, token_hash: hashScorekeeperToken(raw_token), issued_at, expires_at, revoked_at: null, consumed_at: null },
  };
}

function validateScorekeeperToken(rawToken, record, now = Date.now()) {
  if (!rawToken || !record?.token_hash || hashScorekeeperToken(rawToken) !== record.token_hash) return { ok: false, code: 'TOKEN_INVALID' };
  if (record.revoked_at != null) return { ok: false, code: 'TOKEN_REVOKED' };
  if (record.consumed_at != null) return { ok: false, code: 'TOKEN_REPLAYED' };
  const expiresAt = typeof record.expires_at === 'number' ? record.expires_at : new Date(record.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || Number(now) >= expiresAt) return { ok: false, code: 'TOKEN_EXPIRED' };
  return { ok: true, code: null };
}

function consumeScorekeeperToken(rawToken, record, now = Date.now()) {
  const validation = validateScorekeeperToken(rawToken, record, now);
  if (!validation.ok) return { ...validation, record };
  return { ok: true, code: null, record: { ...record, consumed_at: Number(now) } };
}

module.exports = { hashScorekeeperToken, issueScorekeeperToken, validateScorekeeperToken, consumeScorekeeperToken };
