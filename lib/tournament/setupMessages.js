'use strict';
// Mã lỗi/cảnh báo của luồng tạo giải → câu tiếng Việt, bước và trường cần sửa.
// UI chỉ hiện `text`; mã thô chỉ nằm ở data-code để test đọc (spec Lát 0 §8).

const MESSAGES = Object.freeze({
  TOURNAMENT_NAME_REQUIRED: { step: 1, field: 'name', text: () => 'Nhập tên giải.' },
  TOURNAMENT_NAME_TOO_LONG: { step: 1, field: 'name', text: () => 'Tên giải tối đa 120 ký tự.' },
  EVENT_DATE_REQUIRED: { step: 1, field: 'eventDate', text: () => 'Chọn ngày thi đấu.' },
  EVENT_DATE_IN_PAST: { step: 1, field: 'eventDate', text: () => 'Ngày thi đấu đã qua. Kiểm tra lại nếu không phải giải bù.' },
  START_TIME_REQUIRED: { step: 1, field: 'startTime', text: () => 'Chọn giờ bắt đầu.' },
  COURT_COUNT_INVALID: { step: 3, field: 'courtCount', text: () => 'Chọn số sân thi đấu (1–20 sân).' },
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
  PAIR_COUNT_ABOVE_MAXIMUM: { step: 3, field: 'pairs', text: (p = {}) => `Thể thức này nhận tối đa ${p.max} cặp (hiện có ${p.count}).` },
  PAIR_COUNT_OUTSIDE_RECOMMENDED: { step: 3, field: 'pairs', text: (p = {}) => `Thể thức này phù hợp nhất với ${p.min}–${p.max} cặp (hiện có ${p.count}).` },

  DRAW_REQUIRED: { step: 4, field: 'draw', text: () => 'Bấm Bốc thăm để xem trước lịch.' },
  DRAW_STALE: { step: 4, field: 'draw', text: () => 'Cấu hình đã thay đổi. Hãy bốc thăm lại.' },
  KNOCKOUT_BYE: { step: 4, field: 'draw', text: () => 'Số cặp chưa tròn nhánh (4, 8, 16, 32) nên một số cặp được vào thẳng vòng 2 theo kết quả bốc thăm. Vẫn chốt được.' },
  DOUBLE_ELIM_BYE: { step: 4, field: 'draw', text: () => 'Số cặp chưa tròn nhánh (8, 16, 32) nên một số cặp được vào thẳng vòng 2 nhánh thắng theo bốc thăm; nhánh thua được rút gọn tương ứng, không có trận thiếu đối thủ. Vẫn chốt được.' },
  GROUP_SIZE_IMBALANCE: { step: 4, field: 'draw', text: () => 'Các bảng lệch nhau một cặp: bảng đông hơn sẽ đá nhiều trận hơn. Vẫn chốt được.' },

  FINALIZE_NOT_ATOMIC: { step: 4, field: 'draw', text: () => 'Không thể chốt giải. Không có dữ liệu nào bị ghi dở; thử lại sau.' },
  ROSTER_LOCKED: { step: null, field: null, text: () => 'Giải này đã được chốt trước đó.' },

  SETUP_REVISION_CONFLICT: { step: null, field: null, text: () => 'Bản nháp vừa được sửa ở nơi khác.' },
  IDEMPOTENCY_KEY_REUSED: { step: null, field: null, text: () => 'Yêu cầu lưu bị trùng. Tải lại trang rồi thử lại.' },
  SETUP_PAYLOAD_INVALID: { step: null, field: null, text: () => 'Dữ liệu bản nháp không hợp lệ. Tải lại trang rồi thử lại.' },
  SETUP_SAVE_FAILED: { step: null, field: null, text: () => 'Lưu thất bại. Dữ liệu vẫn còn trên màn hình; thử lưu lại.' },

  // Giải giao hữu liên CLB (spec Epic 3 F1 §7). HTTP ở friendlyClubs.FRIENDLY_ERROR_STATUS.
  // UNAUTHENTICATED cố ý KHÔNG đặt ở đây: câu "mở lời mời" sẽ lọt vào lỗi lưu nháp setup (StudioChrome);
  // câu của route giải link nằm ở friendlyInviteLink.INVITE_LINK_MESSAGES.
  CLUB_IS_HOST: { step: 2, field: 'clubs', text: () => 'Đây là CLB của bạn.' },
  CLUB_NOT_FOUND: { step: 2, field: 'clubs', text: () => 'CLB không còn tồn tại.' },
  CLUB_ALREADY_INVITED: { step: 2, field: 'clubs', text: () => 'CLB này đã có trong danh sách mời.' },
  EXTERNAL_CLUB_NOT_SUPPORTED: { step: 2, field: 'clubs', text: () => 'Hiện chỉ mời được CLB có trên PickHub.' },
  FRIENDLY_CLUB_LIMIT_REACHED: { step: 2, field: 'clubs', text: (p = {}) => `Tài khoản CLB thường mời được tối đa ${p.max ?? 1} CLB khách cho mỗi giải. Mời nhiều CLB hơn là quyền lợi của gói trả phí (sắp ra mắt).` },
  RATE_LIMITED: { step: null, field: null, text: () => 'Thao tác quá nhiều lần, thử lại sau ít phút.' },
  FRIENDLY_MODE_REQUIRED: { step: 2, field: 'clubs', text: () => 'Chỉ giải giao hữu liên CLB mới mời được CLB.' },
  FRIENDLY_CLUB_NOT_FOUND: { step: null, field: null, text: () => 'Không tìm thấy lời mời.' },
  FRIENDLY_CLUB_VERSION_CONFLICT: { step: null, field: null, text: () => 'Danh sách vừa được cập nhật ở máy khác. Tải lại để xem bản mới nhất.' },
  FRIENDLY_TRANSITION_INVALID: { step: null, field: null, text: () => 'Thao tác không còn phù hợp với trạng thái hiện tại.' },
  FRIENDLY_REGISTRATION_CLOSED: { step: null, field: null, text: () => 'Đăng ký đã đóng (qua hạn, đã khoá hoặc giải đã chốt).' },
  FRIENDLY_ROSTER_EMPTY: { step: null, field: 'roster', text: () => 'Cần ít nhất một cặp.' },
  FRIENDLY_ROSTER_UNPAIRED: { step: null, field: 'roster', text: () => 'Còn người chưa ghép cặp: ghép thêm hoặc bỏ chọn.' },
  FRIENDLY_QUOTA_EXCEEDED: { step: null, field: 'roster', text: (p = {}) => `Vượt hạn mức ${p.quota ?? ''} cặp.` },
  FRIENDLY_QUOTA_INVALID: { step: null, field: 'quota', text: () => 'Hạn mức từ 1 đến 32 cặp.' },
  FRIENDLY_QUOTA_BELOW_ROSTER: { step: null, field: 'quota', text: (p = {}) => `CLB đã gửi ${p.count ?? ''} cặp; hạn mức không được nhỏ hơn.` },
  FRIENDLY_GUEST_NOT_ALLOWED: { step: null, field: 'roster', text: () => 'Đội CLB khách chỉ gồm thành viên CLB.' },
  FRIENDLY_MEMBER_OUTSIDE_CLUB: { step: null, field: 'roster', text: () => 'Có người không còn là thành viên đang hoạt động của CLB.' },
  FRIENDLY_ATHLETE_ID_MISSING: { step: null, field: 'roster', text: (p = {}) => `${p.name || 'Một thành viên'} chưa có hồ sơ thi đấu.` },
  FRIENDLY_NOTE_REQUIRED: { step: null, field: 'note', text: () => 'Nhập lý do cần sửa (2–300 ký tự).' },
  FRIENDLY_DEADLINE_INVALID: { step: null, field: 'deadline', text: () => 'Hạn chót không hợp lệ.' },
  FRIENDLY_INVITE_LINK_INVALID: { step: null, field: null, text: () => 'Link mời không hợp lệ hoặc đã bị thu hồi.' },
  FRIENDLY_INVITE_WRONG_CLUB: { step: null, field: null, text: () => 'Link mời này dành cho một CLB khác. Hãy đăng xuất rồi đăng nhập bằng tài khoản quản trị của CLB được mời.' },
  FRIENDLY_INVITE_LINK_EXPIRED: { step: null, field: null, text: () => 'Đăng ký của giải này đã đóng. Bạn vẫn xem được lời mời.' },
  SETUP_ACTION_RETIRED: { step: null, field: null, text: () => 'Thao tác cũ, không dùng cho luồng tạo giải hiện tại.' },

  // Giải giao hữu — chốt giải, rải CLB (spec Epic 3 F2 §8, D49). HTTP ở friendlySetup.FRIENDLY_SETUP_CODES.
  ORGANIZER_MODE_LOCKED: { step: 1, field: 'organizerMode', text: () => 'Không đổi được loại giải sau khi đã tạo.' },
  FRIENDLY_HOST_GUEST_NOT_ALLOWED: { step: 2, field: 'guests', text: (p = {}) => `Giải giao hữu liên CLB không có khách mời: mỗi cặp phải là thành viên CLB. Xoá ${p.count || 1} khách mời để tiếp tục.` },
  FRIENDLY_CLUB_NOT_READY: { step: 3, field: 'clubs', text: (p = {}) => `Còn CLB chưa được duyệt danh sách: ${(p.clubs || []).join(', ') || 'CLB khách'}. Duyệt, yêu cầu sửa hoặc rút CLB trước khi bốc thăm.` },
  FRIENDLY_CLUBS_TOO_FEW: { step: 3, field: 'clubs', text: () => 'Giải giao hữu cần ít nhất 2 CLB có cặp thi đấu.' },
  FRIENDLY_ATHLETE_DUPLICATE: { step: 3, field: 'clubs', text: (p = {}) => `${p.name || 'Một VĐV'} có tên trong danh sách của hai CLB.` },
  FRIENDLY_ROSTER_CHANGED: { step: 4, field: 'draw', text: () => 'Danh sách CLB khách vừa thay đổi. Bốc thăm lại trước khi chốt.' },

  // Giải cộng đồng (Epic 4 C3). Người tham gia là các cặp đã duyệt ở bảng đăng ký.
  COMMUNITY_TOO_FEW_PAIRS: { step: 2, field: 'pairs', text: (p = {}) => `Cần ít nhất ${p.min || 2} cặp đã duyệt để dựng giải (hiện có ${p.count ?? 0}). Duyệt thêm đăng ký ở bảng duyệt.` },
  COMMUNITY_MEMBER_PICK_NOT_ALLOWED: { step: 2, field: 'participants', text: () => 'Giải cộng đồng lấy người tham gia từ các đăng ký đã duyệt, không chọn thành viên CLB hay khách mời.' },
  COMMUNITY_PENDING_REGISTRATIONS: { step: 2, field: 'pairs', text: (p = {}) => `Còn ${p.count || 1} đăng ký chờ duyệt. Các đăng ký này sẽ không có trong giải nếu bạn chốt bây giờ.` },
  COMMUNITY_AWAITING_PARTNER: { step: 2, field: 'pairs', text: (p = {}) => `Còn ${p.count || 1} VĐV đang tìm bạn ghép. Họ sẽ không có trong giải nếu chưa được ghép và duyệt.` },
  COMMUNITY_FEE_UNCONFIRMED: { step: 2, field: 'pairs', text: (p = {}) => `${p.count || 1} cặp chưa xác nhận thu phí. Vẫn chốt được; hãy kiểm tra lại với các cặp này.` },
  COMMUNITY_ROSTER_CHANGED: { step: 4, field: 'draw', text: () => 'Danh sách cặp đã duyệt vừa thay đổi. Bốc thăm lại trước khi chốt.' },
  FRIENDLY_CLUB_SPREAD_LIMITED: { step: 4, field: 'draw', text: (p = {}) => `${p.club || 'Một CLB'} có ${p.count ?? ''} cặp cho ${p.groupCount ?? 2} ${p.unit === 'half' ? 'nửa nhánh' : 'bảng'}: có cặp cùng CLB gặp nhau sớm.` },
  FRIENDLY_CLUB_DECLINED: { step: 3, field: 'clubs', text: (p = {}) => `${(p.clubs || []).join(', ') || 'Một CLB'} đã từ chối hoặc đã rút.` },
});

function messageFor(code, params) {
  const entry = MESSAGES[code];
  if (!entry) return { code, step: null, field: null, text: 'Có lỗi xảy ra. Thử lại sau.' };
  return { code, step: entry.step, field: entry.field, text: entry.text(params || {}) };
}

module.exports = { MESSAGES, messageFor };
