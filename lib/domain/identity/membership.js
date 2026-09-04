'use strict';

function parseDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

function validateMembershipPeriod(membership) {
  const start = parseDateOnly(membership?.effective_from);
  if (start === null) return { valid: false, reason: 'invalid_effective_from' };

  if (membership.effective_to === null || membership.effective_to === undefined) {
    return { valid: true, reason: null };
  }
  const end = parseDateOnly(membership.effective_to);
  if (end === null) return { valid: false, reason: 'invalid_effective_to' };
  if (end <= start) {
    return { valid: false, reason: 'effective_to_must_be_after_effective_from' };
  }
  return { valid: true, reason: null };
}

function isMembershipEffective(membership, onDate) {
  if (membership?.status !== 'active') return false;
  if (!validateMembershipPeriod(membership).valid) return false;
  const at = parseDateOnly(onDate);
  if (at === null) return false;

  const start = parseDateOnly(membership.effective_from);
  const end = membership.effective_to ? parseDateOnly(membership.effective_to) : null;
  return at >= start && (end === null || at < end);
}

module.exports = { isMembershipEffective, validateMembershipPeriod };
