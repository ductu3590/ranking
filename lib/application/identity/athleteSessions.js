'use strict';

// Dịch vụ đăng nhập / đăng xuất / đọc hồ sơ cho tài khoản VĐV.
// Không phụ thuộc next/headers hay Supabase client: mọi I/O đi qua `repository`,
// việc ký cookie tiêm vào qua `signSession` — nhờ đó test chạy được với fake.

const { verifyPassword } = require('../../domain/identity/password');
const { validateAthleteAccountContact } = require('../../domain/identity/athleteAccount');
const {
  ATHLETE_SESSION_MAX_AGE_MS,
  generateAthleteSessionKey,
  getAthleteSessionState,
  validateAthleteLoginInput,
} = require('../../domain/identity/athleteSession');
const { identityError } = require('./errors');

// Sai login và sai mật khẩu phải cho ra cùng một thông báo, tránh dò tên đăng nhập.
const CREDENTIALS_MESSAGE = 'Tên đăng nhập hoặc mật khẩu không đúng';
const DISABLED_MESSAGE = 'Tài khoản đã bị tạm ngưng. Liên hệ quản trị CLB.';

// Mã ATHLETE_* chứ không mượn mã của phiên CLB: routeAdapter map mã ra thông báo
// công khai, mượn mã CLB thì VĐV nhận được câu "Mã CLB hoặc mật khẩu không đúng".
const SESSION_STATE_ERRORS = Object.freeze({
  invalid: ['ATHLETE_SESSION_UNAUTHORIZED', 'Bạn cần đăng nhập bằng tài khoản VĐV'],
  expired: ['ATHLETE_SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'],
  revoked: ['ATHLETE_SESSION_REVOKED', 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.'],
});

function toPublicAccount(account) {
  return {
    id: account.id,
    login: account.login,
    displayName: account.display_name,
    clubId: account.club_id,
    athleteId: account.athlete_id,
    membershipId: account.club_membership_id,
    status: account.status,
  };
}

function createAthleteLogin({ repository, signSession, now = Date.now, maxAgeMs = ATHLETE_SESSION_MAX_AGE_MS }) {
  if (typeof signSession !== 'function') throw new TypeError('signSession is required');

  return async function loginAthleteAccount(input = {}) {
    const parsed = validateAthleteLoginInput(input);
    if (!parsed.valid) throw identityError('ATHLETE_CREDENTIALS_INVALID', CREDENTIALS_MESSAGE);

    const account = await repository.findAthleteAccountForLogin(parsed.login);
    // Vẫn chạy verifyPassword khi không tìm thấy tài khoản để thời gian phản hồi
    // của "login sai" và "mật khẩu sai" không lệch nhau rõ rệt.
    const passwordOk = verifyPassword(parsed.password, account?.password_hash ?? '');
    if (!account || !passwordOk) throw identityError('ATHLETE_CREDENTIALS_INVALID', CREDENTIALS_MESSAGE);
    if (account.status !== 'active') throw identityError('ATHLETE_ACCOUNT_DISABLED', DISABLED_MESSAGE);

    const issuedAt = now();
    const expiresAt = issuedAt + maxAgeMs;
    const sessionKey = generateAthleteSessionKey();
    await repository.createAthleteAccountSession({
      accountId: account.id,
      sessionKey,
      issuedAt,
      expiresAt,
    });

    const cookieValue = signSession({
      accountId: Number(account.id),
      clubId: Number(account.club_id),
      athleteId: Number(account.athlete_id),
      membershipId: Number(account.club_membership_id),
      sessionKey,
      accessVersion: Number(account.access_version),
      now: issuedAt,
      expiresAt,
    });

    return { account: toPublicAccount(account), cookieValue, expiresAt };
  };
}

// Đối chiếu vé cookie đã verify chữ ký với bản ghi phiên + tài khoản trong DB.
function createResolveAthleteSession({ repository, now = Date.now }) {
  return async function resolveAthleteSession(token) {
    if (!token) throw identityError(...SESSION_STATE_ERRORS.invalid);
    const [sessionRecord, account] = await Promise.all([
      repository.findAthleteAccountSession(token.session_key, token.account_id),
      repository.findAthleteAccountById(token.account_id),
    ]);
    const state = getAthleteSessionState({ token, sessionRecord, account, now: now() });
    if (state !== 'active') {
      throw identityError(...(SESSION_STATE_ERRORS[state] || SESSION_STATE_ERRORS.invalid));
    }
    return { token, account: toPublicAccount(account) };
  };
}

function createAthleteLogout({ repository, now = Date.now }) {
  return async function logoutAthleteAccount(token) {
    // Không có vé hợp lệ thì coi như đã đăng xuất: route vẫn xoá cookie.
    if (!token?.session_key) return { revoked: false };
    const revoked = await repository.revokeAthleteAccountSession(token.session_key, now());
    return { revoked };
  };
}

// Hồ sơ của chính người đang đăng nhập: chỉ đọc theo accountId trong vé, không nhận
// id từ client, nên không có đường nào xem hồ sơ người khác.
function createGetAthleteProfile({ repository, now = Date.now }) {
  const resolve = createResolveAthleteSession({ repository, now });
  return async function getAthleteProfile(token) {
    const { account } = await resolve(token);
    const profile = await repository.findAthleteAccountProfile(account.id);
    if (!profile) throw identityError('NOT_FOUND', 'Không tìm thấy hồ sơ VĐV của tài khoản này');
    return profile;
  };
}

// Cập nhật liên hệ của chính chủ. accountId luôn lấy từ vé đã đối chiếu DB, không
// bao giờ từ body — nên không có đường sửa liên hệ của tài khoản khác.
const CONTACT_MESSAGES = Object.freeze({
  email_format_invalid: 'Email không hợp lệ',
  email_too_long: 'Email quá dài',
  phone_format_invalid: 'Số điện thoại không hợp lệ',
  facebook_profile_url_invalid: 'Link Facebook không hợp lệ',
  facebook_profile_url_too_long: 'Link Facebook quá dài',
  contact_no_changes: 'Không có thông tin nào cần cập nhật',
});

function createUpdateAthleteContact({ repository, now = Date.now }) {
  const resolve = createResolveAthleteSession({ repository, now });
  return async function updateAthleteContact(token, input = {}) {
    const { account } = await resolve(token);
    const parsed = validateAthleteAccountContact(input);
    if (!parsed.valid) {
      throw identityError('INVALID_INPUT', CONTACT_MESSAGES[parsed.reason] || 'Dữ liệu liên hệ không hợp lệ');
    }
    const updated = await repository.updateAthleteAccountContact(account.id, parsed.changes, now());
    if (!updated) throw identityError('NOT_FOUND', 'Không tìm thấy tài khoản VĐV này');
    if (updated.storageReady === false) {
      throw identityError('CONTACT_STORAGE_NOT_READY', 'Chưa chạy migration liên hệ nên chưa lưu được thông tin');
    }
    return {
      email: updated.email,
      phone: updated.phone,
      facebookProfileUrl: updated.facebookProfileUrl,
      contactUpdatedAt: updated.contactUpdatedAt,
    };
  };
}

module.exports = {
  CREDENTIALS_MESSAGE,
  DISABLED_MESSAGE,
  CONTACT_MESSAGES,
  createAthleteLogin,
  createResolveAthleteSession,
  createAthleteLogout,
  createGetAthleteProfile,
  createUpdateAthleteContact,
};
