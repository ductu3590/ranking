'use strict';
// Epic 4 · C2 — hồi quy: phiên admin hệ thống phải xác thực được. Lỗi có từ trước: lib/platformSession.js chỉ select
// session_key_hash/revoked_at/expires_at, còn validatePlatformSessionRecord so sessionRecord.account_id (không được select)
// → phiên hợp lệ luôn bị coi là không hợp lệ. Tài khoản admin hệ thống chưa từng tồn tại nên lỗi chưa lộ ra.

const { assert, read, lib, suite } = require('../_harness');

const core = lib('lib/platformSessionCore.js');
const SECRET = 'test-secret-platform-session';

suite('C2 phiên admin hệ thống', {
  'getValidatedPlatformSessionFromCookies select đủ account_id': () => {
    const code = read('lib/platformSession.js');
    const block = code.slice(code.indexOf("from('platform_sessions')"), code.indexOf("from('platform_accounts')"));
    assert.ok(/\.select\('account_id, session_key_hash, revoked_at, expires_at'\)/.test(block), 'phải select account_id');
  },
  'lõi xác thực: bản ghi phiên thiếu account_id bị từ chối, đủ account_id được chấp nhận': () => {
    const now = Date.now();
    const sessionKey = 'k'.repeat(43);
    const token = core.signPlatformSession({ accountId: 2, role: 'community_admin', sessionKey, accessVersion: 1, now: now - 1000 }, SECRET);
    const hash = require('node:crypto').createHash('sha256').update(sessionKey).digest('hex');
    const account = { data: { id: 2, role: 'community_admin', status: 'active', access_version: 1 }, error: null };
    const expiresAt = new Date(now + 3600_000).toISOString();
    const lookup = (record) => core.validatePlatformSessionLookup({
      cookieValue: token, secret: SECRET, now, sessionResult: { data: record, error: null }, accountResult: account,
    });
    assert.equal(lookup({ session_key_hash: hash, revoked_at: null, expires_at: expiresAt }), null, 'thiếu account_id → null (nguyên nhân lỗi cũ)');
    assert.ok(lookup({ account_id: 2, session_key_hash: hash, revoked_at: null, expires_at: expiresAt }), 'đủ account_id → hợp lệ');
    assert.equal(lookup({ account_id: 2, session_key_hash: hash, revoked_at: new Date(now).toISOString(), expires_at: expiresAt }), null, 'phiên thu hồi → null');
    assert.equal(lookup({ account_id: 2, session_key_hash: 'x'.repeat(64), revoked_at: null, expires_at: expiresAt }), null, 'băm khóa sai → null');
  },
});
