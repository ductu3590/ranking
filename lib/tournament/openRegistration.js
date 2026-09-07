'use strict';

class OpenRegError extends Error {
  constructor(code, message) { super(message); this.name = 'OpenRegError'; this.code = code; }
}
function fail(code, message) { throw new OpenRegError(code, message); }

function normalizePhone(raw) {
  let digits = String(raw == null ? '' : raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('84') && digits.length >= 11) digits = '0' + digits.slice(2);
  digits = digits.replace(/\D/g, '');
  if (!/^0\d{8,10}$/.test(digits)) fail('INVALID_PHONE', 'Số điện thoại không hợp lệ');
  return digits;
}

function requiredMemberFields(division = {}) {
  return {
    phr: division.rating_cap != null,
    gender: division.gender_mode === 'mixed',
    dob: division.age_min != null || division.age_max != null,
  };
}

function isRegistrationOpen(tournament = {}, division = {}, nowISO) {
  if (tournament.organizer_mode !== 'community') return { ok: false, reason: 'NOT_COMMUNITY' };
  if (!tournament.open_registration) return { ok: false, reason: 'TOURNAMENT_CLOSED' };
  if (!division.registration_open) return { ok: false, reason: 'DIVISION_CLOSED' };
  if (division.registration_deadline && !division.allow_late_registration) {
    const now = new Date(nowISO).getTime();
    const deadline = new Date(division.registration_deadline).getTime();
    if (Number.isFinite(now) && Number.isFinite(deadline) && now > deadline) return { ok: false, reason: 'DEADLINE_PASSED' };
  }
  return { ok: true };
}

function validateSubmission({ division = {}, members = [] } = {}) {
  const isPair = division.entrant_type === 'pair';
  const need = requiredMemberFields(division);
  const clean = (members || []).filter((m) => m && (String(m.full_name || '').trim() || m.phone));
  if (!clean.length) fail('NO_MEMBER', 'Cần ít nhất một VĐV');
  if (!isPair && clean.length !== 1) fail('SINGLES_ONE_MEMBER', 'Nội dung đơn chỉ một VĐV');
  if (isPair && clean.length > 2) fail('PAIR_MAX_TWO', 'Cặp tối đa 2 VĐV');

  const out = clean.map((m, i) => {
    const full_name = String(m.full_name || '').trim();
    if (!full_name) fail('NAME_REQUIRED', 'Thiếu họ tên');
    const phone_norm = normalizePhone(m.phone);
    const rec = { seat: i + 1, full_name, phone_norm };
    if (need.phr) rec.self_declared_phr = m.phr == null || m.phr === '' ? null : Number(m.phr);
    if (need.gender) {
      if (!['male', 'female'].includes(m.gender)) fail('GENDER_REQUIRED', 'Thiếu giới tính');
      rec.gender = m.gender;
    }
    if (need.dob) {
      if (!m.dob) fail('DOB_REQUIRED', 'Thiếu ngày sinh');
      rec.dob = m.dob;
    }
    return rec;
  });

  if (out.length === 2 && out[0].phone_norm === out[1].phone_norm) fail('DUPLICATE_IN_PAIR', 'Hai VĐV trùng số điện thoại');
  if (isPair && out.length === 2 && division.gender_mode === 'mixed') {
    const genders = out.map((m) => m.gender).sort().join(',');
    if (genders !== 'female,male') fail('MIXED_GENDER_REQUIRED', 'Nội dung Nam-Nữ cần một nam và một nữ');
  }
  return { members: out, needs_partner: isPair && out.length === 1, contact_phone_norm: out[0].phone_norm };
}

const OPEN_TRANSITIONS = {
  awaiting_partner: { pair: 'submitted', withdraw: 'withdrawn', merge: 'merged' },
  submitted: { admit: 'approved', reject: 'rejected', withdraw: 'withdrawn' },
  approved: { remove: 'submitted', withdraw: 'withdrawn' },
  rejected: { restore: 'submitted' },
  withdrawn: {}, merged: {},
};
function transitionOpenRegistration(status, action) {
  const next = OPEN_TRANSITIONS[status] && OPEN_TRANSITIONS[status][action];
  if (!next) fail('INVALID_TRANSITION', `${status} không thể ${action}`);
  return next;
}

function waitlistView({ capacity = null, approvedCount = 0, pending = [] } = {}) {
  const ordered = pending.slice().sort((a, b) => Number(a.queue_seq || 0) - Number(b.queue_seq || 0));
  const freeSlots = capacity == null ? Infinity : Math.max(0, Number(capacity) - Number(approvedCount));
  let admittable = freeSlots;
  let wlPos = 0;
  const rows = ordered.map((r) => {
    if (admittable > 0) { admittable -= 1; return { ...r, isWaitlist: false, position: null }; }
    wlPos += 1; return { ...r, isWaitlist: true, position: wlPos };
  });
  return { freeSlots: capacity == null ? null : freeSlots, rows };
}

function canAdmit({ capacity = null, approvedCount = 0 } = {}) {
  return capacity == null || Number(approvedCount) < Number(capacity);
}

function buildPairFromSolos(primary, secondary, division = {}) {
  const m1 = (primary.members || [])[0];
  const m2 = (secondary.members || [])[0];
  if (!m1 || !m2) fail('SOLO_MEMBER_REQUIRED', 'Mỗi bên cần đúng một VĐV');
  if (m1.phone_norm === m2.phone_norm) fail('DUPLICATE_IN_PAIR', 'Hai VĐV trùng số điện thoại');
  const members = [{ ...m1, seat: 1 }, { ...m2, seat: 2 }];
  if (division.gender_mode === 'mixed') {
    const g = members.map((m) => m.gender).sort().join(',');
    if (g !== 'female,male') fail('MIXED_GENDER_REQUIRED', 'Nội dung Nam-Nữ cần một nam và một nữ');
  }
  return { primary_id: primary.id, merged_id: secondary.id, members };
}

module.exports = {
  OpenRegError,
  normalizePhone,
  requiredMemberFields,
  isRegistrationOpen,
  validateSubmission,
  transitionOpenRegistration,
  waitlistView,
  canAdmit,
  buildPairFromSolos,
};
