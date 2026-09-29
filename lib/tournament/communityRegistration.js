'use strict';
// Đăng ký giải cộng đồng (Epic 4 C2, spec lat-c2-dang-ky-ghep-cap.md §3). Thuần CommonJS, deterministic, không I/O.
// Bọc `openRegistration.js` (máy trạng thái, trường bắt buộc theo nội dung) — không sao chép luật.
// Ghế 1 lấy từ hồ sơ tài khoản VĐV (D54): không nhập lại SĐT/họ tên trong form đăng ký.

const { normalizePhone, requiredMemberFields, transitionOpenRegistration } = require('./openRegistration');

const COMMUNITY_ERRORS = Object.freeze([
  'COMMUNITY_NOT_FOUND',
  'COMMUNITY_NOT_OPEN',
  'COMMUNITY_DEADLINE_PASSED',
  'COMMUNITY_ALREADY_REGISTERED',
  'COMMUNITY_ALREADY_PAIRED',
  'COMMUNITY_CAPACITY_FULL',
  'COMMUNITY_INVITE_SELF',
  'COMMUNITY_LINK_INVALID',
  'COMMUNITY_GENDER_REQUIRED',
  'COMMUNITY_DOB_REQUIRED',
  'COMMUNITY_PHR_REQUIRED',
  'COMMUNITY_MIXED_GENDER_REQUIRED',
  'COMMUNITY_PARTNER_PHONE_INVALID',
  'COMMUNITY_PARTNER_MODE_REQUIRED',
  'COMMUNITY_FEE_NOT_APPLICABLE',
  'COMMUNITY_TOURNAMENT_LOCKED',
  'COMMUNITY_INVALID_TRANSITION',
  'COMMUNITY_CONFLICT',
]);

// Giải đã chốt danh sách (scheduled trở đi): đơn không còn sửa/rút được ở trang "Đơn của tôi".
const LOCKED_TOURNAMENT_STATUSES = Object.freeze(['scheduled', 'live', 'completed', 'archived']);

function fail(code) {
  return { ok: false, code };
}

function phoneOrNull(raw) {
  try {
    return normalizePhone(raw);
  } catch {
    return null;
  }
}

function phrOrNull(raw) {
  if (raw == null || raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

// account: { displayName, gender, dob, selfDeclaredPhr } (projectPlayerAccount). partnerMode: 'have' | 'need'.
function validateCommunitySubmission({ division = {}, account, partnerMode, partnerPhone } = {}) {
  if (!account) return fail('PLAYER_SESSION_REQUIRED');
  const fullName = String(account.displayName ?? '').trim();
  if (!fullName) return fail('PLAYER_NAME_INVALID');

  const need = requiredMemberFields(division);
  const gender = account.gender === 'male' || account.gender === 'female' ? account.gender : null;
  const selfDeclaredPhr = phrOrNull(account.selfDeclaredPhr);
  if (need.gender && !gender) return fail('COMMUNITY_GENDER_REQUIRED');
  if (need.dob && !account.dob) return fail('COMMUNITY_DOB_REQUIRED');
  if (need.phr && selfDeclaredPhr == null) return fail('COMMUNITY_PHR_REQUIRED');

  const seat1 = { fullName, gender, dob: account.dob || null, selfDeclaredPhr };
  if (division.entrant_type !== 'pair') {
    return { ok: true, value: { needsPartner: false, partnerPhoneNorm: null, seat1 } };
  }
  if (partnerMode !== 'have' && partnerMode !== 'need') return fail('COMMUNITY_PARTNER_MODE_REQUIRED');
  if (partnerMode === 'need') return { ok: true, value: { needsPartner: true, partnerPhoneNorm: null, seat1 } };
  const partnerPhoneNorm = phoneOrNull(partnerPhone);
  if (!partnerPhoneNorm) return fail('COMMUNITY_PARTNER_PHONE_INVALID');
  return { ok: true, value: { needsPartner: false, partnerPhoneNorm, seat1 } };
}

// Nội dung Nam-Nữ: đúng một nam và một nữ (luật của openRegistration.buildPairFromSolos, dùng chung cho RPC ghép).
function checkPairGenders(division = {}, genders = []) {
  if (division.gender_mode !== 'mixed') return { ok: true };
  const sorted = genders.map((g) => g ?? '').slice().sort().join(',');
  return sorted === 'female,male' ? { ok: true } : fail('COMMUNITY_MIXED_GENDER_REQUIRED');
}

const STATE_UNKNOWN = Object.freeze({ key: 'unknown', label: 'Không xác định', tone: 'muted' });

// Nhãn + tông màu hiển thị cho VĐV ("Đơn của tôi"). Hạng chờ do server tính (waitlistView) rồi truyền vào.
function communityRegistrationState({ status, waitlistPosition = null } = {}) {
  switch (status) {
    case 'awaiting_partner':
      return { key: 'awaiting_partner', label: 'Chờ bạn ghép', tone: 'warn' };
    case 'submitted':
      return waitlistPosition
        ? { key: 'waitlist', label: `Danh sách chờ #${waitlistPosition}`, tone: 'warn' }
        : { key: 'submitted', label: 'Chờ duyệt', tone: 'neutral' };
    case 'approved':
      return { key: 'approved', label: 'Đã duyệt', tone: 'ok' };
    case 'rejected':
      return { key: 'rejected', label: 'Bị từ chối', tone: 'danger' };
    case 'withdrawn':
      return { key: 'withdrawn', label: 'Đã rút', tone: 'muted' };
    case 'merged':
      return { key: 'merged', label: 'Đã ghép cặp', tone: 'muted' };
    default:
      return { ...STATE_UNKNOWN };
  }
}

function isRegistrationLocked(tournamentStatus) {
  return LOCKED_TOURNAMENT_STATUSES.includes(tournamentStatus);
}

// D56: phí thu ngoài hệ thống; chỉ hiển thị mức phí và cờ "đã xác nhận thu" do admin bấm.
function feeState({ entryFee = null, feeConfirmedAt = null } = {}) {
  const fee = Number(entryFee);
  if (!Number.isFinite(fee) || fee <= 0) return { key: 'free', label: 'Miễn phí', tone: 'ok' };
  return feeConfirmedAt
    ? { key: 'paid', label: 'Đã xác nhận thu', tone: 'ok' }
    : { key: 'unpaid', label: 'Chưa thu', tone: 'warn' };
}

// Hành động admin hiển thị theo trạng thái. Mỗi hành động ứng với một nhánh của transitionOpenRegistration
// (admit/reject/remove/restore/withdraw) hoặc cờ phí; RPC community_admin_action là nơi chốt thật.
const ADMIN_ACTIONS_BY_STATUS = Object.freeze({
  submitted: ['admit', 'reject'],
  approved: ['remove'],
  rejected: ['restore'],
  awaiting_partner: ['withdraw'],
  withdrawn: [],
  merged: [],
});
const OPEN_ACTION_FOR = Object.freeze({ admit: 'admit', reject: 'reject', remove: 'remove', restore: 'restore', withdraw: 'withdraw' });

function nextAdminActions({ status, hasFee = false, feeConfirmed = false, capacityFull = false } = {}) {
  const base = ADMIN_ACTIONS_BY_STATUS[status] || [];
  const actions = base.map((action) => {
    // Giữ liên kết với máy trạng thái: hành động không hợp lệ ném lỗi ở đây thay vì lệch âm thầm.
    transitionOpenRegistration(status, OPEN_ACTION_FOR[action]);
    return { action, disabled: action === 'admit' && capacityFull };
  });
  if (hasFee && (status === 'submitted' || status === 'approved')) {
    actions.push({ action: feeConfirmed ? 'fee_unconfirm' : 'fee_confirm', disabled: false });
  }
  return actions;
}

module.exports = {
  COMMUNITY_ERRORS,
  LOCKED_TOURNAMENT_STATUSES,
  validateCommunitySubmission,
  checkPairGenders,
  communityRegistrationState,
  isRegistrationLocked,
  feeState,
  nextAdminActions,
};
