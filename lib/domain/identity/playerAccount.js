'use strict';

// Tài khoản VĐV công khai (Epic 4, D54): SĐT + mật khẩu, không gắn CLB. Thuần CommonJS, không I/O.
// Tách hẳn khỏi athleteAccount.js (tài khoản gắn CLB). Đăng nhập cố tình trả MỘT mã lỗi duy nhất cho mọi
// đầu vào hỏng để không lộ SĐT nào tồn tại.

const { normalizePhone } = require('../../tournament/openRegistration');

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MAX = 60;
const PHR_MAX = 10;

const PLAYER_ERRORS = Object.freeze([
  'PLAYER_PHONE_INVALID',
  'PLAYER_PASSWORD_WEAK',
  'PLAYER_NAME_INVALID',
  'PLAYER_PHONE_TAKEN',
  'PLAYER_LOGIN_FAILED',
  'PLAYER_HONEYPOT',
  'PLAYER_PROFILE_INVALID',
  'PLAYER_PROFILE_EMPTY',
  'PLAYER_SESSION_REQUIRED',
  'RATE_LIMITED',
]);

function fail(code) {
  return { ok: false, code };
}

function phoneOf(raw) {
  try {
    return normalizePhone(raw);
  } catch {
    return null;
  }
}

function validPassword(raw) {
  return typeof raw === 'string' && raw.length >= PASSWORD_MIN && raw.length <= PASSWORD_MAX;
}

function blank(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function parseName(raw) {
  const name = String(raw ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  return name && name.length <= NAME_MAX ? name : null;
}

function parseGender(raw) {
  if (blank(raw)) return { ok: true, value: null };
  return raw === 'male' || raw === 'female' ? { ok: true, value: raw } : { ok: false };
}

function todayInVietnam() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function parseDob(raw) {
  if (blank(raw)) return { ok: true, value: null };
  const text = String(raw).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return { ok: false };
  const date = new Date(`${text}T00:00:00Z`);
  const same = date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]);
  if (!same || text > todayInVietnam() || Number(match[1]) < 1900) return { ok: false };
  return { ok: true, value: text };
}

function parsePhr(raw) {
  if (blank(raw)) return { ok: true, value: null };
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > PHR_MAX) return { ok: false };
  return { ok: true, value: number };
}

// Các trường hồ sơ tùy chọn dùng chung cho đăng ký và sửa hồ sơ. Chỉ trả khóa có mặt trong `input`.
function parseOptionalProfile(input, { onlyPresent }) {
  const value = {};
  const specs = [
    ['gender', parseGender], ['dob', parseDob], ['selfDeclaredPhr', parsePhr],
  ];
  for (const [key, parse] of specs) {
    if (onlyPresent && !(key in input)) continue;
    const result = parse(input[key]);
    if (!result.ok) return fail('PLAYER_PROFILE_INVALID');
    value[key] = result.value;
  }
  return { ok: true, value };
}

function parseRegisterInput(input = {}) {
  if (input && typeof input.company === 'string' && input.company.trim() !== '') return fail('PLAYER_HONEYPOT');
  const phoneNorm = phoneOf(input?.phone);
  if (!phoneNorm) return fail('PLAYER_PHONE_INVALID');
  if (!validPassword(input?.password)) return fail('PLAYER_PASSWORD_WEAK');
  const displayName = parseName(input?.displayName);
  if (!displayName) return fail('PLAYER_NAME_INVALID');
  const profile = parseOptionalProfile(input || {}, { onlyPresent: false });
  if (!profile.ok) return profile;
  return { ok: true, value: { phoneNorm, password: input.password, displayName, ...profile.value } };
}

function parseLoginInput(input = {}) {
  const phoneNorm = phoneOf(input?.phone);
  const password = input?.password;
  if (!phoneNorm || typeof password !== 'string' || !password || password.length > PASSWORD_MAX) return fail('PLAYER_LOGIN_FAILED');
  return { ok: true, value: { phoneNorm, password } };
}

function parseProfilePatch(input = {}) {
  const value = {};
  if ('displayName' in input) {
    const displayName = parseName(input.displayName);
    if (!displayName) return fail('PLAYER_NAME_INVALID');
    value.displayName = displayName;
  }
  const profile = parseOptionalProfile(input, { onlyPresent: true });
  if (!profile.ok) return profile;
  Object.assign(value, profile.value);

  const wantsPassword = 'currentPassword' in input || 'newPassword' in input;
  if (wantsPassword) {
    if (!validPassword(input.currentPassword) || !validPassword(input.newPassword)) return fail('PLAYER_PASSWORD_WEAK');
    value.currentPassword = input.currentPassword;
    value.newPassword = input.newPassword;
  }
  return Object.keys(value).length ? { ok: true, value } : fail('PLAYER_PROFILE_EMPTY');
}

// Chỉ 5 khóa của CHÍNH tài khoản đang đăng nhập; không SĐT, băm, athlete_id, phiên bản truy cập.
function projectPlayerAccount(row) {
  if (!row) return null;
  const phr = row.self_declared_phr;
  return {
    id: row.id,
    displayName: row.display_name,
    gender: row.gender ?? null,
    dob: row.dob ?? null,
    selfDeclaredPhr: phr == null || phr === '' ? null : Number(phr),
  };
}

module.exports = {
  PASSWORD_MIN,
  PASSWORD_MAX,
  NAME_MAX,
  PLAYER_ERRORS,
  parseRegisterInput,
  parseLoginInput,
  parseProfilePatch,
  projectPlayerAccount,
};
