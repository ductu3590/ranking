'use strict';
// Epic 4 · C1 — bảng hạn mức tần suất + thông điệp tiếng Việt (spec lat-c1-danh-tinh.md §4, D60).

const { assert, lib, suite } = require('../_harness');

const limits = lib('lib/domain/identity/playerRateLimits.js');
const messages = lib('lib/tournament/communityMessages.js');
const { PLAYER_ERRORS } = lib('lib/domain/identity/playerAccount.js');

suite('C1 hạn mức tần suất + thông điệp', {
  'bảng hạn mức đúng spec §4': () => {
    assert.deepEqual({ ...limits.RATE_POLICIES.register_ip }, { limit: 5, windowSeconds: 3600 });
    assert.deepEqual({ ...limits.RATE_POLICIES.register_phone }, { limit: 3, windowSeconds: 3600 });
    assert.deepEqual({ ...limits.RATE_POLICIES.login }, { limit: 8, windowSeconds: 300 });
    assert.deepEqual({ ...limits.RATE_POLICIES.session_read_ip }, { limit: 30, windowSeconds: 60 });
    assert.deepEqual({ ...limits.RATE_POLICIES.profile }, { limit: 20, windowSeconds: 60 });
    assert.deepEqual({ ...limits.RATE_POLICIES.platform_login }, { limit: 8, windowSeconds: 300 });
    assert.ok(Object.isFrozen(limits.RATE_POLICIES));
  },
  'bucketFor ổn định, khác khóa thì khác bucket': () => {
    assert.equal(limits.bucketFor('login', { phoneNorm: '0912345678', ip: '1.2.3.4' }), 'player:login:0912345678:1.2.3.4');
    assert.equal(limits.bucketFor('register_ip', { ip: '1.2.3.4' }), 'player:register_ip:1.2.3.4');
    assert.equal(limits.bucketFor('register_phone', { phoneNorm: '0912345678' }), 'player:register_phone:0912345678');
    assert.notEqual(
      limits.bucketFor('login', { phoneNorm: '0912345678', ip: '1.2.3.4' }),
      limits.bucketFor('login', { phoneNorm: '0912345678', ip: '5.6.7.8' }),
    );
    assert.equal(limits.bucketFor('platform_login', { login: 'A@B.com', ip: '1.1.1.1' }), 'player:platform_login:a@b.com:1.1.1.1');
  },
  'bucket bị cắt ≤ 300 ký tự và thiếu tham số vẫn dựng được': () => {
    const long = limits.bucketFor('register_ip', { ip: 'x'.repeat(1000) });
    assert.ok(long.length <= 300);
    assert.equal(limits.bucketFor('register_ip', {}), 'player:register_ip:unknown');
  },
  'khóa chính sách lạ ném lỗi': () => {
    assert.throws(() => limits.bucketFor('khong-co', { ip: '1.1.1.1' }));
    assert.throws(() => limits.policyFor('khong-co'));
    assert.equal(limits.policyFor('login').limit, 8);
  },
  'mọi mã lỗi có thông điệp tiếng Việt, mã lạ có thông điệp chung': () => {
    for (const code of PLAYER_ERRORS) {
      const text = messages.messageFor(code);
      assert.ok(typeof text === 'string' && text.length > 5, code);
      assert.ok(/[À-ỹ]|\s/.test(text), `${code} phải là tiếng Việt`);
    }
    assert.equal(messages.messageFor('MA_LA_KHONG_CO'), messages.GENERIC_MESSAGE);
    assert.equal(messages.messageFor(undefined), messages.GENERIC_MESSAGE);
  },
  'đăng nhập sai dùng một thông điệp, không tiết lộ SĐT': () => {
    const text = messages.messageFor('PLAYER_LOGIN_FAILED');
    assert.ok(/không đúng/.test(text));
    assert.ok(!/không tồn tại|chưa đăng ký/.test(text));
  },
  'thông điệp giới hạn nhận số giây chờ': () => {
    assert.ok(messages.rateLimitedMessage(240).includes('4 phút'));
    assert.ok(messages.rateLimitedMessage(30).includes('30 giây'));
    assert.ok(messages.rateLimitedMessage(0).includes('1 giây'));
  },
});
