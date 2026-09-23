'use strict';
// Mã lỗi/cảnh báo của luồng tạo giải → câu tiếng Việt, bước và trường cần sửa.
// UI chỉ hiện `text`; mã thô chỉ nằm ở data-code để test đọc (spec Lát 0 §8).

const MESSAGES = Object.freeze({
  TOURNAMENT_NAME_REQUIRED: { step: 1, field: 'name', text: () => 'Nhập tên giải.' },
  TOURNAMENT_NAME_TOO_LONG: { step: 1, field: 'name', text: () => 'Tên giải tối đa 120 ký tự.' },
  EVENT_DATE_REQUIRED: { step: 1, field: 'eventDate', text: () => 'Chọn ngày thi đấu.' },
  EVENT_DATE_IN_PAST: { step: 1, field: 'eventDate', text: () => 'Ngày thi đấu đã qua. Kiểm tra lại nếu không phải giải bù.' },
  START_TIME_REQUIRED: { step: 1, field: 'startTime', text: () => 'Chọn giờ bắt đầu.' },
  COURT_COUNT_INVALID: { step: 1, field: 'courtCount', text: () => 'Số sân phải từ 1 đến 20.' },
  POSTER_URL_INVALID: { step: 1, field: 'posterUrl', text: () => 'Đường dẫn áp phích phải bắt đầu bằng https://.' },

  ROSTER_EMPTY: { step: 2, field: 'participants', text: () => 'Chọn ít nhất 2 người tham gia.' },
  MEMBER_OUTSIDE_GROUP: { step: 2, field: 'participants', text: () => 'Có người không thuộc CLB này. Bỏ chọn rồi chọn lại từ danh sách.' },
  ATHLETE_ID_MISSING: { step: 2, field: 'participants', text: (p = {}) => `${p.name || 'Một thành viên'} chưa có hồ sơ thi đấu. Liên hệ quản trị để tạo hồ sơ hoặc bỏ chọn.` },
  GUEST_NAME_INVALID: { step: 2, field: 'guests', text: () => 'Tên khách mời cần từ 2 đến 60 ký tự.' },
  GUEST_REF_INVALID: { step: 2, field: 'guests', text: () => 'Khách mời không hợp lệ. Xóa rồi thêm lại.' },
  INACTIVE_MEMBER_SELECTED: { step: 2, field: 'participants', text: (p = {}) => `${p.count || 1} người đã ngừng hoạt động nhưng vẫn được chọn.` },
  GUEST_NAME_MATCHES_MEMBER: { step: 2, field: 'guests', text: (p = {}) => `Khách "${p.name || ''}" trùng tên với người khác. Kiểm tra để tránh nhầm người.` },

  FORMAT_REQUIRED: { step: 3, field: 'format', text: () => 'Chọn thể thức thi đấu.' },
  FORMAT_NOT_AVAILABLE: { step: 3, field: 'format', text: () => 'Thể thức này sắp có. Hãy chọn thể thức khác.' },
  FORMAT_CONFIG_INVALID: { step: 3, field: 'format', text: () => 'Cấu hình thể thức chưa hợp lệ.' },
  UNPAIRED_MEMBER: { step: 3, field: 'pairs', text: (p = {}) => `Còn ${p.count || 1} người chưa ghép cặp. Ghép cặp, thêm 1 người hoặc bỏ chọn người lẻ.` },
  PAIR_MEMBER_COUNT_INVALID: { step: 3, field: 'pairs', text: () => 'Có cặp không đủ hai người hợp lệ. Tách cặp đó rồi ghép lại.' },
  PAIR_COUNT_BELOW_MINIMUM: { step: 3, field: 'pairs', text: (p = {}) => `Thể thức này cần ít nhất ${p.min} cặp (hiện có ${p.count}).` },
  PAIR_COUNT_OUTSIDE_RECOMMENDED: { step: 3, field: 'pairs', text: (p = {}) => `Thể thức này phù hợp nhất với ${p.min}–${p.max} cặp (hiện có ${p.count}).` },

  DRAW_REQUIRED: { step: 4, field: 'draw', text: () => 'Bấm Bốc thăm để xem trước lịch.' },
  DRAW_STALE: { step: 4, field: 'draw', text: () => 'Cấu hình đã thay đổi. Hãy bốc thăm lại.' },
  KNOCKOUT_BYE: { step: 4, field: 'draw', text: () => 'Số cặp chưa tròn nhánh (4, 8, 16, 32) nên một số cặp được vào thẳng vòng 2 theo kết quả bốc thăm. Vẫn chốt được.' },
  GROUP_SIZE_IMBALANCE: { step: 4, field: 'draw', text: () => 'Các bảng lệch nhau một cặp: bảng đông hơn sẽ đá nhiều trận hơn. Vẫn chốt được.' },

  FINALIZE_NOT_ATOMIC: { step: 4, field: 'draw', text: () => 'Không thể chốt giải. Không có dữ liệu nào bị ghi dở; thử lại sau.' },
  ROSTER_LOCKED: { step: null, field: null, text: () => 'Giải này đã được chốt trước đó.' },

  SETUP_REVISION_CONFLICT: { step: null, field: null, text: () => 'Bản nháp vừa được sửa ở nơi khác.' },
  IDEMPOTENCY_KEY_REUSED: { step: null, field: null, text: () => 'Yêu cầu lưu bị trùng. Tải lại trang rồi thử lại.' },
  SETUP_PAYLOAD_INVALID: { step: null, field: null, text: () => 'Dữ liệu bản nháp không hợp lệ. Tải lại trang rồi thử lại.' },
  SETUP_SAVE_FAILED: { step: null, field: null, text: () => 'Lưu thất bại. Dữ liệu vẫn còn trên màn hình; thử lưu lại.' },
});

function messageFor(code, params) {
  const entry = MESSAGES[code];
  if (!entry) return { code, step: null, field: null, text: 'Có lỗi xảy ra. Thử lại sau.' };
  return { code, step: entry.step, field: entry.field, text: entry.text(params || {}) };
}

module.exports = { MESSAGES, messageFor };
