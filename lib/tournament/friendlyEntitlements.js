'use strict';
// Điểm quyết định DUY NHẤT về quyền lợi giải giao hữu (ADR-007 D46, spec Epic 3 F1 §3.2).
//
// Tài khoản CLB thường mời tối đa 1 CLB khách mỗi giải; nhiều hơn là quyền lợi gói trả phí (làm sau).
// Route không bao giờ tự viết số hạn mức: mọi chỗ cần hạn mức gọi resolveFriendlyEntitlements, rồi TRUYỀN giá trị
// vào RPC (`p_max_guest_clubs`) và finalize (`p_plan.friendly.maxGuestClubs`). SQL chỉ thực thi, không quyết định.
// Thuần CommonJS, không I/O, không biến môi trường / cờ runtime nào nâng hạn mức.

// Gói trả phí: thêm khóa ở đây, vd { club_plus: 5 } — làm khi có gói.
const PLAN_GUEST_CLUB_LIMITS = Object.freeze({ free: 1 });
const DEFAULT_PLAN = 'free';
// Trần kỹ thuật (giải ≤ 32 cặp, mỗi CLB ≥ 1 cặp), không phải hạn mức kinh doanh. SQL kiểm cùng trần (1–31).
const CORE_MAX_GUEST_CLUBS = 31;
const UPGRADE_HINT = 'Mời nhiều CLB hơn là quyền lợi của gói trả phí (sắp ra mắt).';
// Trạng thái KHÔNG chiếm suất: CLB đã từ chối hoặc đã bị rút → chủ nhà mời được CLB khác thay.
const NON_COUNTING_STATUSES = Object.freeze(['declined', 'withdrawn']);

// Điểm cắm gói DUY NHẤT. Khi có nơi lưu gói: đổi thành async resolveClubPlan({ db, groupId }) — mọi caller đã đi qua
// resolveFriendlyEntitlements (async) nên không phải sửa route.
// eslint-disable-next-line no-unused-vars
function resolveClubPlan({ groupId } = {}) {
  return DEFAULT_PLAN;
}

// Kẹp vào 1..CORE_MAX_GUEST_CLUBS; giá trị không phải số → 1 (fail closed).
function clampGuestClubLimit(value) {
  const number = Number(value);
  if (value == null || value === '' || Number.isNaN(number)) return 1;
  if (number === Infinity) return CORE_MAX_GUEST_CLUBS;
  return Math.max(1, Math.min(CORE_MAX_GUEST_CLUBS, Math.floor(number)));
}

// Khớp kiểm tham số `p_max_guest_clubs` của RPC: số nguyên 1–31, không ép kiểu.
function isValidMaxGuestClubs(value) {
  return Number.isInteger(value) && value >= 1 && value <= CORE_MAX_GUEST_CLUBS;
}

function maxGuestClubsPerTournament({ plan = DEFAULT_PLAN } = {}) {
  const key = typeof plan === 'string' ? plan : DEFAULT_PLAN;
  // Chỉ khóa riêng của bảng (không đi prototype: '__proto__', 'toString'…). Gói lạ → hạn mức gói free.
  const limit = Object.prototype.hasOwnProperty.call(PLAN_GUEST_CLUB_LIMITS, key)
    ? PLAN_GUEST_CLUB_LIMITS[key]
    : PLAN_GUEST_CLUB_LIMITS.free;
  return clampGuestClubLimit(limit);
}

async function resolveFriendlyEntitlements({ db, groupId } = {}) {
  const plan = await resolveClubPlan({ db, groupId });
  return { plan, maxGuestClubs: maxGuestClubsPerTournament({ plan }), upgradeAvailable: false };
}

// Mọi trạng thái trừ declined | withdrawn chiếm suất (trạng thái lạ cũng chiếm — fail closed).
function countsTowardGuestLimit(status) {
  return !NON_COUNTING_STATUSES.includes(status);
}

function isHostRow(row) {
  return row?.club_id != null && row?.group_id != null && String(row.club_id) === String(row.group_id);
}

// rows = dòng tournament_clubs của giải. Dòng chủ nhà (club_id = group_id, finalize tạo) không tính — khớp SQL
// `club_id IS DISTINCT FROM p_group_id`.
function guestClubLimitView({ maxGuestClubs, rows } = {}) {
  const max = clampGuestClubLimit(maxGuestClubs);
  const used = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && !isHostRow(row))
    .filter((row) => countsTowardGuestLimit(row.invitation_status ?? row.status))
    .length;
  const reached = used >= max;
  return { max, used, remaining: Math.max(0, max - used), reached, upgradeHint: reached ? UPGRADE_HINT : null };
}

module.exports = {
  PLAN_GUEST_CLUB_LIMITS,
  DEFAULT_PLAN,
  CORE_MAX_GUEST_CLUBS,
  UPGRADE_HINT,
  NON_COUNTING_STATUSES,
  resolveClubPlan,
  clampGuestClubLimit,
  isValidMaxGuestClubs,
  maxGuestClubsPerTournament,
  resolveFriendlyEntitlements,
  countsTowardGuestLimit,
  guestClubLimitView,
};
