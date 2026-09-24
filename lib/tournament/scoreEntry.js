'use strict';
// Chặn dữ liệu khi lưu tỉ số và phân loại lỗi RPC (spec Epic 2, Lát E1 §6.2–6.4). Thuần.
// Nguyên nhân gốc lỗi "Dữ liệu trận đã thay đổi" của Epic 1: lưu khi trận thiếu cặp / lưu dở từ pending
// đẩy trận sang 'live', rồi hàm 068 từ chối điền cặp vào trận đó.

const DRAFT_STATUSES = new Set(['live', 'paused']);
const FINALIZABLE_STATUSES = new Set(['pending', 'warmup', 'live', 'paused']);

function reject(code, status, message) {
  return { ok: false, code, status, message };
}

// complete: engine xác định đã đủ ván thắng.
function assertScoreSavable({ match, games, complete } = {}) {
  if (!match) return reject('MATCH_NOT_FOUND', 404, 'Không tìm thấy trận.');
  if (match.status === 'finalized') {
    return reject('USE_CORRECTION', 409, 'Trận đã chốt — dùng "Sửa kết quả".');
  }
  const entryA = match.entry_a_id ?? match.entrant_a_id ?? null;
  const entryB = match.entry_b_id ?? match.entrant_b_id ?? null;
  if (entryA == null || entryB == null) {
    return reject('MATCH_NOT_READY', 409, 'Trận chưa đủ hai cặp — chờ kết quả trận trước.');
  }
  if (!Array.isArray(games) || games.length === 0) {
    return reject('GAMES_REQUIRED', 400, 'Nhập ít nhất một ván.');
  }
  if (!complete && !DRAFT_STATUSES.has(match.status)) {
    return reject('MATCH_NOT_STARTED', 409, 'Bấm "Bắt đầu đấu" trước khi lưu tỉ số dở.');
  }
  if (complete && !FINALIZABLE_STATUSES.has(match.status)) {
    return reject('MATCH_STATUS_INVALID', 409, 'Trạng thái trận không cho phép chốt.');
  }
  return { ok: true };
}

// Trạng thái truyền cho RPC: chốt → finalized; lưu dở giữ nguyên live/paused (không "đấu tiếp" ngầm).
function statusForSave(match, complete) {
  if (complete) return 'finalized';
  return match && match.status === 'paused' ? 'paused' : 'live';
}

// W.O. chỉ khi trận đang khởi động (cặp không ra sân); bỏ cuộc khi đang đấu/tạm dừng.
const WITHDRAW_STATUS_BY_KIND = Object.freeze({ walkover: ['warmup'], retired: ['live', 'paused'] });

function assertWithdrawAllowed({ match, kind } = {}) {
  const allowed = WITHDRAW_STATUS_BY_KIND[kind];
  if (!allowed) return reject('WITHDRAW_KIND_INVALID', 400, 'Loại xử lý không hợp lệ.');
  if (!match) return reject('MATCH_NOT_FOUND', 404, 'Không tìm thấy trận.');
  if (!allowed.includes(match.status)) {
    return reject('WITHDRAW_STATUS_INVALID', 409, kind === 'walkover'
      ? 'Chỉ xử thắng W.O. khi trận đang khởi động.'
      : 'Chỉ xử bỏ cuộc khi trận đang đấu hoặc tạm dừng.');
  }
  if ((match.entry_a_id ?? null) == null || (match.entry_b_id ?? null) == null) {
    return reject('MATCH_NOT_READY', 409, 'Trận chưa đủ hai cặp — chờ kết quả trận trước.');
  }
  return { ok: true, action: kind === 'walkover' ? 'match_walkover' : 'match_retired' };
}

// Sau migration 078 mọi xung đột nghiệp vụ trên production là SQLSTATE PH409 (40001 giữ để tương thích),
// nên phân biệt bằng thông điệp exception, không bằng mã.
const CONFLICT_MESSAGES = Object.freeze([
  ['match version conflict', 'MATCH_VERSION_CONFLICT', 'Trận vừa được cập nhật ở máy khác.'],
  ['MATCH_VERSION_CONFLICT', 'MATCH_VERSION_CONFLICT', 'Trận vừa được cập nhật ở máy khác.'],
  ['PLAYOFF_TARGET_CONFLICT', 'PLAYOFF_TARGET_CONFLICT', 'Trận kế tiếp đã bắt đầu hoặc đã có cặp khác — không thể điền kết quả này.'],
  ['CORRECTION_BLOCKED_DOWNSTREAM', 'CORRECTION_BLOCKED_DOWNSTREAM', 'Trận kế tiếp đã bắt đầu — không thể đổi kết quả này.'],
  ['MATCH_ALREADY_FINALIZED', 'MATCH_ALREADY_FINALIZED', 'Trận đã chốt — dùng "Sửa kết quả".'],
]);
const CONFLICT_CODES = Object.freeze(['PH409', '40001']);

function classifyRpcConflict(error) {
  if (!error) return null;
  const message = String(error.message || '');
  for (const [needle, code, text] of CONFLICT_MESSAGES) {
    if (message.includes(needle)) return { code, status: 409, message: text };
  }
  if (CONFLICT_CODES.includes(error.code)) {
    return { code: 'CONFLICT', status: 409, message: 'Dữ liệu trận đã thay đổi, hãy tải lại.' };
  }
  return null;
}

module.exports = {
  assertScoreSavable,
  statusForSave,
  assertWithdrawAllowed,
  classifyRpcConflict,
  CONFLICT_CODES,
};
