'use strict';

const LOGIN_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{2,29})$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

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

module.exports = {
  MIN_PASSWORD_LENGTH,
  normalizeLogin,
  validateAthleteAccountLogin,
  validateAthleteAccountPassword,
  validateMembershipClaimable,
  validateAthleteClaimable,
  validateAthleteAccountRegistration,
};
