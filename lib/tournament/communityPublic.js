'use strict';
// Chiếu dữ liệu CÔNG KHAI của giải cộng đồng (Epic 4 C2, ADR-007 D57). Thuần.
// MỘT hàm chiếu duy nhất: chỉ tên cặp đã duyệt + bộ đếm X/Y. Route công khai phải chọn cột trước (không select *):
// đầu vào có khóa cấm → ném lỗi, để lỗi cấu hình lộ ra ở test thay vì rò rỉ SĐT/ngày sinh ra internet.

const FORBIDDEN_KEYS = Object.freeze([
  'phone', 'phone_norm', 'contact_phone_norm', 'dob', 'track_token', 'player_account_id',
  'athlete_id', 'password_hash', 'private_note', 'email',
]);
const FORBIDDEN_SET = new Set(FORBIDDEN_KEYS);

function forbiddenError(key) {
  const error = new Error(`PUBLIC_PROJECTION_FORBIDDEN_KEY: ${key}`);
  error.code = 'PUBLIC_PROJECTION_FORBIDDEN_KEY';
  return error;
}

// Quét mọi độ sâu của object/mảng. Khóa cấm xuất hiện (bất kể giá trị) → ném.
function assertNoForbiddenKeys(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_SET.has(key)) throw forbiddenError(key);
      assertNoForbiddenKeys(child);
    }
  }
}

function admittedAtMs(row) {
  const time = Date.parse(row?.admitted_at);
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

// rows: [{ status, admitted_at, members: [{ seat, full_name }] }] → [{ key, pairLabel, seatNames }] cặp ĐÃ DUYỆT,
// theo thứ tự duyệt. Đơn chờ duyệt / đang tìm bạn / danh sách chờ không bao giờ vào kết quả.
function projectPublicPairs(rows = []) {
  assertNoForbiddenKeys(rows);
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row?.status === 'approved')
    .sort((a, b) => admittedAtMs(a.row) - admittedAtMs(b.row) || a.index - b.index)
    .map(({ row }, position) => {
      const seatNames = (row.members || [])
        .slice()
        .sort((a, b) => Number(a.seat) - Number(b.seat))
        .map((member) => String(member.full_name ?? '').trim())
        .filter(Boolean);
      return { key: `pair-${position + 1}`, pairLabel: seatNames.join(' & '), seatNames };
    });
}

// Bộ đếm X/Y: Y là mức tối đa, không ngụ ý phải đủ (D51). capacity null = không giới hạn.
function publicSummary({ approvedCount = 0, capacity = null } = {}) {
  const approved = Number(approvedCount) || 0;
  if (capacity == null) return { approved, capacity: null, remaining: null, full: false };
  const cap = Number(capacity);
  const remaining = Math.max(0, cap - approved);
  return { approved, capacity: cap, remaining, full: remaining === 0 };
}

module.exports = { FORBIDDEN_KEYS, assertNoForbiddenKeys, projectPublicPairs, publicSummary };
