'use strict';
// Epic 4 · C1 — vé phiên VĐV công khai (spec lat-c1-danh-tinh.md §3, §7).

const { assert, lib, suite } = require('../_harness');

const session = lib('lib/domain/identity/playerSession.js');
const athleteSession = lib('lib/domain/identity/athleteSession.js');
const platformCore = lib('lib/platformSessionCore.js');

const SECRET = 'test-secret-for-player-session';
const KEY = session.generatePlayerSessionKey();
const NOW = 1_800_000_000_000;
const sign = (patch = {}) => session.signPlayerSession({ accountId: 5, sessionKey: KEY, accessVersion: 2, now: NOW, ...patch }, SECRET);
const record = (patch = {}) => ({
  account_id: 5, session_key_hash: session.hashPlayerSessionKey(KEY), revoked_at: null,
  expires_at: new Date(NOW + 3600_000).toISOString(), ...patch,
});
const account = (patch = {}) => ({ id: 5, status: 'active', access_version: 2, ...patch });

suite('C1 phiên VĐV', {
  'ký rồi xác minh cùng secret trả đúng payload': () => {
    const payload = session.verifyPlayerSession(sign(), SECRET, NOW + 1000);
    assert.equal(payload.account_id, 5);
    assert.equal(payload.access_version, 2);
    assert.equal(payload.kind, 'player');
  },
  'secret khác, vé sửa, vé hết hạn, vé rỗng đều bị từ chối': () => {
    const token = sign();
    assert.equal(session.verifyPlayerSession(token, 'other-secret', NOW + 1000), null);
    const [encoded, signature] = token.split('.');
    const tampered = `${encoded.slice(0, -2)}AA.${signature}`;
    assert.equal(session.verifyPlayerSession(tampered, SECRET, NOW + 1000), null);
    assert.equal(session.verifyPlayerSession(token, SECRET, NOW + session.PLAYER_SESSION_MAX_AGE_MS + 1), null);
    assert.equal(session.verifyPlayerSession('', SECRET, NOW), null);
    assert.equal(session.verifyPlayerSession(null, SECRET, NOW), null);
    assert.equal(session.verifyPlayerSession(token, '', NOW), null);
  },
  'vé của athlete, platform và group KHÔNG dùng được như vé VĐV': () => {
    const athlete = athleteSession.signAthleteSession({
      accountId: 5, clubId: 1, athleteId: 1, membershipId: 1, sessionKey: KEY, accessVersion: 2, now: NOW,
    }, SECRET);
    assert.equal(session.verifyPlayerSession(athlete, SECRET, NOW + 1000), null);
    const platform = platformCore.signPlatformSession({ accountId: 5, role: 'community_admin', sessionKey: KEY, accessVersion: 2, now: NOW }, SECRET);
    assert.equal(session.verifyPlayerSession(platform, SECRET, NOW + 1000), null);
    // Chiều ngược lại: vé VĐV không phải vé athlete.
    assert.equal(athleteSession.verifyAthleteSession(sign(), SECRET, NOW + 1000), null);
  },
  'khóa ký dẫn xuất riêng, không trùng khóa gốc hay khóa athlete': () => {
    const derived = session.derivePlayerSessionSecret('group-secret');
    assert.notEqual(derived, 'group-secret');
    assert.equal(derived, session.derivePlayerSessionSecret('group-secret'));
    assert.notEqual(derived, session.derivePlayerSessionSecret('group-secret-2'));
    assert.throws(() => session.derivePlayerSessionSecret(''));
  },
  'ký từ chối đầu vào sai': () => {
    assert.throws(() => session.signPlayerSession({ accountId: 0, sessionKey: KEY }, SECRET));
    assert.throws(() => session.signPlayerSession({ accountId: 1, sessionKey: 'ngan' }, SECRET));
    assert.throws(() => session.signPlayerSession({ accountId: 1, sessionKey: KEY }, ''));
  },
  'trạng thái phiên: active / revoked / expired / invalid': () => {
    const token = session.verifyPlayerSession(sign(), SECRET, NOW + 1000);
    const state = (over) => session.getPlayerSessionState({ token, sessionRecord: record(), account: account(), now: NOW + 1000, ...over });
    assert.equal(state({}), 'active');
    assert.equal(state({ sessionRecord: record({ revoked_at: new Date(NOW).toISOString() }) }), 'revoked');
    assert.equal(state({ account: account({ status: 'disabled' }) }), 'revoked');
    assert.equal(state({ account: account({ access_version: 3 }) }), 'revoked');
    assert.equal(state({ sessionRecord: record({ expires_at: new Date(NOW).toISOString() }) }), 'expired');
    assert.equal(state({ sessionRecord: null }), 'invalid');
    assert.equal(state({ account: null }), 'invalid');
    assert.equal(state({ token: null }), 'invalid');
    assert.equal(state({ sessionRecord: record({ session_key_hash: 'x'.repeat(64) }) }), 'invalid');
    assert.equal(state({ sessionRecord: record({ account_id: 6 }) }), 'invalid');
  },
});
