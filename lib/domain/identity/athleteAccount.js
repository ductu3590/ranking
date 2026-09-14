'use strict';

const LOGIN_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{2,29})$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
// Giới hạn 254 là độ dài tối đa của một địa chỉ email theo RFC 5321.
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/;
const PHONE_PATTERN = /^0\d{8,10}$/;
const MAX_FACEBOOK_PROFILE_URL_LENGTH = 500;
const FACEBOOK_PROFILE_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
]);

function normalizeLogin(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

function normalizeName(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function validateAthleteAccountLogin(value) {
  const login = normalizeLogin(value);
  if (!login) return { valid: false, reason: 'login_required' };
  if (!LOGIN_PATTERN.test(login)) return { valid: false, reason: 'login_format_invalid' };
  return { valid: true, login };
}

function validateAthleteAccountPassword(value) {
  const password = String(value ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) return { valid: false, reason: 'password_too_short' };
  if (password.length > MAX_PASSWORD_LENGTH) return { valid: false, reason: 'password_too_long' };
  return { valid: true, password };
}

// Chỉ membership đang sinh hoạt và athlete chưa bị nhận mới được liên kết.
function validateMembershipClaimable(membership, { clubId } = {}) {
  if (!membership) return { valid: false, reason: 'membership_not_found' };
  if (clubId != null && Number(membership.club_id) !== Number(clubId)) {
    return { valid: false, reason: 'membership_club_mismatch' };
  }
  if (membership.status !== 'active') return { valid: false, reason: 'membership_not_active' };
  return { valid: true };
}

function validateAthleteClaimable(athlete) {
  if (!athlete) return { valid: false, reason: 'athlete_not_found' };
  if (athlete.status === 'linked') return { valid: false, reason: 'athlete_already_linked' };
  if (athlete.status !== 'unclaimed') return { valid: false, reason: 'athlete_not_claimable' };
  return { valid: true };
}

function validateAthleteAccountRegistration(input = {}) {
  const login = validateAthleteAccountLogin(input.login);
  if (!login.valid) return login;
  const password = validateAthleteAccountPassword(input.password);
  if (!password.valid) return password;
  const displayName = normalizeName(input.displayName);
  if (!displayName) return { valid: false, reason: 'display_name_required' };
  const membershipId = Number(input.membershipId);
  if (!Number.isSafeInteger(membershipId) || membershipId <= 0) {
    return { valid: false, reason: 'membership_id_invalid' };
  }
  return { valid: true, login: login.login, password: password.password, displayName, membershipId };
}

// --- Liên hệ của chính chủ tài khoản ----------------------------------------

// Email: chuẩn hoá về lowercase vì so khớp email không phân biệt hoa/thường.
// Trả về null khi người dùng bỏ trống — đó là "xoá liên hệ", không phải lỗi.
function normalizeContactEmail(value) {
  const email = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  return email || null;
}

// SĐT: cùng quy tắc với lib/tournament/openRegistration.normalizePhone để một
// người khai '+84 912 345 678' ở đăng ký giải và ở đây đều ra '0912345678'.
function normalizeContactPhone(value) {
  let digits = String(value ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+84')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  digits = digits.replace(/\D/g, '');
  return digits || null;
}

// Facebook: chấp nhận dán "facebook.com/...", tự thêm https://, chuẩn hoá về
// https + hostname thường, bỏ hash. Trả null khi bỏ trống = xoá liên kết.
function normalizeContactFacebookProfileUrl(value) {
  const raw = String(value ?? '').normalize('NFKC').trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function validateContactEmail(value) {
  const email = normalizeContactEmail(value);
  if (email === null) return { valid: true, email: null };
  if (email.length > MAX_EMAIL_LENGTH) return { valid: false, reason: 'email_too_long' };
  if (!EMAIL_PATTERN.test(email)) return { valid: false, reason: 'email_format_invalid' };
  return { valid: true, email };
}

function validateContactPhone(value) {
  const phone = normalizeContactPhone(value);
  if (phone === null) return { valid: true, phone: null };
  if (!PHONE_PATTERN.test(phone)) return { valid: false, reason: 'phone_format_invalid' };
  return { valid: true, phone };
}

function validateContactFacebookProfileUrl(value) {
  const raw = String(value ?? '').normalize('NFKC').trim();
  if (!raw) return { valid: true, facebookProfileUrl: null };
  if (raw.length > MAX_FACEBOOK_PROFILE_URL_LENGTH) {
    return { valid: false, reason: 'facebook_profile_url_too_long' };
  }

  let parsed;
  try {
    parsed = new URL(normalizeContactFacebookProfileUrl(raw));
  } catch {
    return { valid: false, reason: 'facebook_profile_url_invalid' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'facebook_profile_url_invalid' };
  }

  const host = parsed.hostname.toLowerCase();
  if (!FACEBOOK_PROFILE_HOSTS.has(host)) {
    return { valid: false, reason: 'facebook_profile_url_invalid' };
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  if (!path || path === '/') return { valid: false, reason: 'facebook_profile_url_invalid' };
  if (/^\/(pages|groups|events|watch|marketplace|gaming|share|stories)(\/|$)/i.test(path)) {
    return { valid: false, reason: 'facebook_profile_url_invalid' };
  }

  parsed.protocol = 'https:';
  parsed.hostname = host;
  parsed.pathname = path;
  parsed.hash = '';
  parsed.username = '';
  parsed.password = '';
  return { valid: true, facebookProfileUrl: parsed.toString() };
}

// Chỉ những khoá CÓ MẶT trong input được đưa vào `changes`: nhờ đó PATCH gửi một
// trường không xoá mất trường còn lại. Gửi rỗng/null = xoá đúng trường đó.
function validateAthleteAccountContact(input = {}) {
  const changes = {};
  if ('email' in input) {
    const email = validateContactEmail(input.email);
    if (!email.valid) return email;
    changes.email = email.email;
  }
  if ('phone' in input) {
    const phone = validateContactPhone(input.phone);
    if (!phone.valid) return phone;
    changes.phone = phone.phone;
  }
  if ('facebookProfileUrl' in input) {
    const facebook = validateContactFacebookProfileUrl(input.facebookProfileUrl);
    if (!facebook.valid) return facebook;
    changes.facebookProfileUrl = facebook.facebookProfileUrl;
  }
  if (Object.keys(changes).length === 0) return { valid: false, reason: 'contact_no_changes' };
  return { valid: true, changes };
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_FACEBOOK_PROFILE_URL_LENGTH,
  normalizeLogin,
  normalizeContactEmail,
  normalizeContactPhone,
  normalizeContactFacebookProfileUrl,
  validateAthleteAccountLogin,
  validateAthleteAccountPassword,
  validateContactEmail,
  validateContactPhone,
  validateContactFacebookProfileUrl,
  validateAthleteAccountContact,
  validateMembershipClaimable,
  validateAthleteClaimable,
  validateAthleteAccountRegistration,
};
