'use strict';
// Epic 3 F1 §8 — link mời (D47): token, băm, quyết định mở link theo đúng thứ tự README §5.3, tham số next.

const crypto = require('node:crypto');
const { assert, lib, suite } = require('../_harness');
const L = lib('lib/tournament/friendlyInviteLink.js');

const NOW = '2026-10-01T00:00:00Z';
const ROW = { id: 881, club_id: 19, group_id: 59, tournament_id: 7, invitation_status: 'invited' };
const TOURNAMENT = { id: 7, settings: { organizer_mode: 'friendly', friendly: { registrationDeadline: '2026-10-05T23:59:00+07:00', registrationLockedAt: null } } };
const ADMIN_19 = { group_id: 19, group_name: 'CLB Test Responsive UI', role: 'admin' };
const MEMBER_19 = { group_id: 19, group_name: 'CLB Test Responsive UI', role: 'member' };
const ADMIN_59 = { group_id: 59, group_name: 'CLB Test 23.9.2026', role: 'admin' };

const decide = (over = {}) => L.decideInviteLink({ session: ADMIN_19, row: ROW, tournament: TOURNAMENT, rosterLockStatus: 'open', now: NOW, ...over });

suite('f1 invite link', {
  'issueInviteToken: 43 ký tự base64url, băm sha256 64 hex khớp hashInviteToken'() {
    const { rawToken, tokenHash } = L.issueInviteToken();
    assert.match(rawToken, /^[A-Za-z0-9_-]{43}$/);
    assert.match(tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(L.hashInviteToken(rawToken), tokenHash);
    assert.equal(tokenHash, crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex'));
    assert.deepEqual(Object.keys(L.issueInviteToken()).sort(), ['rawToken', 'tokenHash']);
  },

  '1000 token không trùng'() {
    const tokens = new Set();
    const hashes = new Set();
    for (let i = 0; i < 1000; i += 1) {
      const { rawToken, tokenHash } = L.issueInviteToken();
      tokens.add(rawToken);
      hashes.add(tokenHash);
    }
    assert.equal(tokens.size, 1000);
    assert.equal(hashes.size, 1000);
  },

  'isInviteTokenShape / invitePath / inviteLoginPath'() {
    const { rawToken } = L.issueInviteToken();
    assert.equal(L.isInviteTokenShape(rawToken), true);
    for (const bad of ['', null, undefined, 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}=`, `${'a'.repeat(42)}/`, 42]) {
      assert.equal(L.isInviteTokenShape(bad), false, String(bad));
    }
    assert.equal(L.invitePath(rawToken), `/giai-dau/moi/${rawToken}`);
    assert.equal(L.inviteLoginPath(rawToken), `/?dang-nhap=clb&next=%2Fgiai-dau%2Fmoi%2F${rawToken}`);
    assert.equal(L.inviteLoginPath('../../x'), '/?dang-nhap=clb', 'token sai định dạng không vào next');
  },

  'hashInviteToken từ chối token sai định dạng'() {
    assert.throws(() => L.hashInviteToken('ngắn'), (error) => error.code === 'FRIENDLY_INVITE_LINK_INVALID');
  },

  '1. chưa đăng nhập → 401, đi trước token sai'() {
    assert.deepEqual(decide({ session: null, row: null }), { status: 401, code: 'UNAUTHENTICATED' });
    assert.deepEqual(decide({ session: null }), { status: 401, code: 'UNAUTHENTICATED' });
    assert.deepEqual(decide({ session: { role: 'admin' } }), { status: 401, code: 'UNAUTHENTICATED' }, 'phiên không có group_id');
  },

  '2. token không khớp / dòng withdrawn → 404, không lộ gì'() {
    assert.deepEqual(decide({ row: null }), { status: 404, code: 'FRIENDLY_INVITE_LINK_INVALID' });
    assert.deepEqual(decide({ row: { ...ROW, invitation_status: 'withdrawn' } }), { status: 404, code: 'FRIENDLY_INVITE_LINK_INVALID' });
    assert.deepEqual(decide({ session: ADMIN_59, row: null }), { status: 404, code: 'FRIENDLY_INVITE_LINK_INVALID' }, 'token sai đi trước sai CLB');
  },

  '3. sai CLB → 403 chỉ có {status, code, currentClubName}, đi trước "hết hạn"'() {
    const wrong = decide({ session: ADMIN_59 });
    assert.deepEqual(Object.keys(wrong).sort(), ['code', 'currentClubName', 'status']);
    assert.deepEqual(wrong, { status: 403, code: 'FRIENDLY_INVITE_WRONG_CLUB', currentClubName: 'CLB Test 23.9.2026' });
    const closed = decide({ session: ADMIN_59, rosterLockStatus: 'locked' });
    assert.equal(closed.code, 'FRIENDLY_INVITE_WRONG_CLUB');
    assert.deepEqual(Object.keys(closed).sort(), ['code', 'currentClubName', 'status']);
    const memberOther = decide({ session: { ...ADMIN_59, role: 'member' } });
    assert.equal(memberOther.code, 'FRIENDLY_INVITE_WRONG_CLUB', 'sai CLB đi trước sai role');
    const noName = decide({ session: { group_id: 23, role: 'admin' } });
    assert.deepEqual(noName, { status: 403, code: 'FRIENDLY_INVITE_WRONG_CLUB', currentClubName: null });
  },

  '4. thành viên đúng CLB → 403 GROUP_ADMIN_REQUIRED, không lộ gì'() {
    assert.deepEqual(decide({ session: MEMBER_19 }), { status: 403, code: 'GROUP_ADMIN_REQUIRED' });
    assert.deepEqual(decide({ session: MEMBER_19, rosterLockStatus: 'locked' }), { status: 403, code: 'GROUP_ADMIN_REQUIRED' });
  },

  '5. hết hạn đúng mốc giây của registrationDeadline → 410 + invitationId'() {
    assert.deepEqual(decide({ now: '2026-10-05T16:58:59Z' }), { status: 200, code: null, invitationId: 881 });
    assert.deepEqual(decide({ now: '2026-10-05T16:59:00Z' }), { status: 410, code: 'FRIENDLY_INVITE_LINK_EXPIRED', invitationId: 881 });
  },

  '5. đã khoá / đã chốt → 410'() {
    const locked = { ...TOURNAMENT, settings: { ...TOURNAMENT.settings, friendly: { registrationDeadline: null, registrationLockedAt: '2026-09-30T00:00:00Z' } } };
    assert.equal(decide({ tournament: locked }).status, 410);
    assert.equal(decide({ rosterLockStatus: 'locked' }).status, 410);
    assert.equal(decide({ tournament: null }).status, 410, 'thiếu giải → đóng (fail closed)');
  },

  '6. hợp lệ → 200 { invitationId }; declined vẫn mở được để xem'() {
    assert.deepEqual(decide(), { status: 200, code: null, invitationId: 881 });
    assert.deepEqual(decide({ session: { groupId: '19', groupName: 'x', role: 'admin' } }), { status: 200, code: null, invitationId: 881 }, 'nhận cả khóa camelCase, so id theo chuỗi');
    assert.equal(decide({ row: { ...ROW, invitation_status: 'declined' } }).status, 200);
  },

  'INVITE_LINK_MESSAGES có câu cho mọi mã khác 200'() {
    assert.equal(L.INVITE_LINK_MESSAGES.UNAUTHENTICATED, 'Cần đăng nhập CLB để mở lời mời.');
    for (const code of ['FRIENDLY_INVITE_LINK_INVALID', 'FRIENDLY_INVITE_WRONG_CLUB', 'GROUP_ADMIN_REQUIRED', 'FRIENDLY_INVITE_LINK_EXPIRED']) {
      assert.ok(L.INVITE_LINK_MESSAGES[code], code);
    }
  },

  'safeNextPath: nhận đường dẫn lời mời nội bộ'() {
    for (const ok of ['/giai-dau/moi', '/giai-dau/moi/abc_DEF-123', '/giai-dau/loi-moi', '/giai-dau/loi-moi/881']) {
      assert.equal(L.safeNextPath(ok), ok);
    }
  },

  'safeNextPath: từ chối open redirect và đường khác'() {
    for (const bad of ['//evil.com', 'https://evil.com/giai-dau/moi/x', '/giai-dau/moi/../x', '/giai-dau/v2', '', null, undefined,
      '/giai-dau/moi/x/y', '/giai-dau/moi/', '/giai-dau/moi/x?y=1', '\\\\evil.com', '/giai-dau/moi/x\n', ' /giai-dau/moi', 42]) {
      assert.equal(L.safeNextPath(bad), null, JSON.stringify(bad));
    }
  },
});
