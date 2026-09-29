'use strict';
// Epic 4 · C1 — domain tài khoản VĐV công khai (spec lat-c1-danh-tinh.md §3, D54, D60).

const { assert, lib, suite } = require('../_harness');

const account = lib('lib/domain/identity/playerAccount.js');

const VALID = { phone: '+84 912 345 678', password: 'matkhau123', displayName: ' Nguyễn Minh ' };
const withPatch = (patch) => ({ ...VALID, ...patch });
const codeOf = (input) => account.parseRegisterInput(input).code;

suite('C1 domain tài khoản VĐV', {
  'đăng ký hợp lệ: chuẩn hóa SĐT và cắt khoảng trắng tên': () => {
    const result = account.parseRegisterInput(VALID);
    assert.equal(result.ok, true);
    assert.equal(result.value.phoneNorm, '0912345678');
    assert.equal(result.value.displayName, 'Nguyễn Minh');
    assert.equal(result.value.password, 'matkhau123');
  },
  'SĐT sai định dạng bị từ chối': () => {
    assert.equal(codeOf(withPatch({ phone: '123' })), 'PLAYER_PHONE_INVALID');
    assert.equal(codeOf(withPatch({ phone: '' })), 'PLAYER_PHONE_INVALID');
    assert.equal(codeOf(withPatch({ phone: undefined })), 'PLAYER_PHONE_INVALID');
  },
  'mật khẩu ngắn hoặc quá dài bị từ chối': () => {
    assert.equal(codeOf(withPatch({ password: '1234567' })), 'PLAYER_PASSWORD_WEAK');
    assert.equal(codeOf(withPatch({ password: 'a'.repeat(129) })), 'PLAYER_PASSWORD_WEAK');
    assert.equal(account.parseRegisterInput(withPatch({ password: 'a'.repeat(128) })).ok, true);
  },
  'tên hiển thị rỗng, toàn khoảng trắng hoặc quá 60 ký tự bị từ chối': () => {
    assert.equal(codeOf(withPatch({ displayName: '' })), 'PLAYER_NAME_INVALID');
    assert.equal(codeOf(withPatch({ displayName: '   ' })), 'PLAYER_NAME_INVALID');
    assert.equal(codeOf(withPatch({ displayName: 'x'.repeat(61) })), 'PLAYER_NAME_INVALID');
    assert.equal(account.parseRegisterInput(withPatch({ displayName: 'x'.repeat(60) })).ok, true);
  },
  'honeypot có giá trị bị từ chối': () => {
    assert.equal(codeOf(withPatch({ company: 'ACME' })), 'PLAYER_HONEYPOT');
    assert.equal(account.parseRegisterInput(withPatch({ company: '' })).ok, true);
  },
  'trường hồ sơ tùy chọn: rỗng thành null, sai giá trị bị từ chối': () => {
    const empty = account.parseRegisterInput(withPatch({ gender: '', dob: '', selfDeclaredPhr: '' }));
    assert.equal(empty.ok, true);
    assert.equal(empty.value.gender, null);
    assert.equal(empty.value.dob, null);
    assert.equal(empty.value.selfDeclaredPhr, null);
    assert.equal(codeOf(withPatch({ gender: 'x' })), 'PLAYER_PROFILE_INVALID');
    assert.equal(codeOf(withPatch({ selfDeclaredPhr: -1 })), 'PLAYER_PROFILE_INVALID');
    assert.equal(codeOf(withPatch({ selfDeclaredPhr: 'abc' })), 'PLAYER_PROFILE_INVALID');
    assert.equal(codeOf(withPatch({ dob: '2999-01-01' })), 'PLAYER_PROFILE_INVALID');
    assert.equal(codeOf(withPatch({ dob: '2000-13-40' })), 'PLAYER_PROFILE_INVALID');
    const full = account.parseRegisterInput(withPatch({ gender: 'female', dob: '1995-05-20', selfDeclaredPhr: '3.5' }));
    assert.equal(full.ok, true);
    assert.equal(full.value.gender, 'female');
    assert.equal(full.value.dob, '1995-05-20');
    assert.equal(full.value.selfDeclaredPhr, 3.5);
  },
  'đăng nhập: mọi đầu vào hỏng cùng một mã, không lộ lý do': () => {
    const bad = [
      {}, { phone: '0912345678' }, { password: 'matkhau123' }, { phone: 'abc', password: 'matkhau123' },
      { phone: '0912345678', password: 'a'.repeat(129) },
    ];
    for (const input of bad) {
      const result = account.parseLoginInput(input);
      assert.equal(result.ok, false);
      assert.equal(result.code, 'PLAYER_LOGIN_FAILED');
    }
    const ok = account.parseLoginInput({ phone: '84912345678', password: 'x' });
    assert.equal(ok.ok, true);
    assert.equal(ok.value.phoneNorm, '0912345678');
  },
  'sửa hồ sơ: chỉ trả trường có mặt, mật khẩu đi theo cặp': () => {
    assert.deepEqual(account.parseProfilePatch({ displayName: ' Trần Tuấn ' }).value, { displayName: 'Trần Tuấn' });
    assert.deepEqual(account.parseProfilePatch({ gender: 'male' }).value, { gender: 'male' });
    assert.equal(account.parseProfilePatch({}).ok, false);
    assert.equal(account.parseProfilePatch({}).code, 'PLAYER_PROFILE_EMPTY');
    assert.equal(account.parseProfilePatch({ currentPassword: 'matkhau123' }).code, 'PLAYER_PASSWORD_WEAK');
    assert.equal(account.parseProfilePatch({ newPassword: 'matkhau456' }).code, 'PLAYER_PASSWORD_WEAK');
    assert.equal(account.parseProfilePatch({ currentPassword: 'matkhau123', newPassword: '123' }).code, 'PLAYER_PASSWORD_WEAK');
    const both = account.parseProfilePatch({ currentPassword: 'matkhau123', newPassword: 'matkhau456' });
    assert.equal(both.ok, true);
    assert.equal(both.value.newPassword, 'matkhau456');
    assert.equal(both.value.currentPassword, 'matkhau123');
  },
  'chiếu tài khoản chỉ trả đúng 5 khóa, không lộ SĐT/băm/athlete': () => {
    const row = {
      id: 7, phone_norm: '0912345678', password_hash: 'pbkdf2:x', display_name: 'Nguyễn Minh', gender: 'male',
      dob: '1990-01-02', self_declared_phr: '3.25', athlete_id: 99, access_version: 4, status: 'active',
    };
    const projected = account.projectPlayerAccount(row);
    assert.deepEqual(Object.keys(projected).sort(), ['displayName', 'dob', 'gender', 'id', 'selfDeclaredPhr']);
    assert.equal(projected.selfDeclaredPhr, 3.25);
    assert.equal(projected.id, 7);
    assert.equal(JSON.stringify(projected).includes('0912345678'), false);
    assert.equal(account.projectPlayerAccount(null), null);
  },
  'mã lỗi đóng băng và có đủ mã theo spec': () => {
    for (const code of ['PLAYER_PHONE_INVALID', 'PLAYER_PASSWORD_WEAK', 'PLAYER_NAME_INVALID', 'PLAYER_PHONE_TAKEN',
      'PLAYER_LOGIN_FAILED', 'PLAYER_HONEYPOT', 'PLAYER_PROFILE_INVALID', 'PLAYER_PROFILE_EMPTY']) {
      assert.ok(account.PLAYER_ERRORS.includes(code), code);
    }
    assert.ok(Object.isFrozen(account.PLAYER_ERRORS));
  },
});
