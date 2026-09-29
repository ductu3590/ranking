'use strict';

// Thông điệp tiếng Việt cho mã lỗi của luồng giải cộng đồng (Epic 4). Thuần. Lát C2 bổ sung mã COMMUNITY_*.
// Thông điệp đăng nhập cố tình không phân biệt "sai SĐT" và "sai mật khẩu".

const GENERIC_MESSAGE = 'Có lỗi xảy ra. Vui lòng thử lại.';

const MESSAGES = Object.freeze({
  PLAYER_PHONE_INVALID: 'Số điện thoại không hợp lệ. Nhập số Việt Nam, ví dụ 0912 345 678.',
  PLAYER_PASSWORD_WEAK: 'Mật khẩu cần từ 8 đến 128 ký tự.',
  PLAYER_NAME_INVALID: 'Tên hiển thị cần từ 1 đến 60 ký tự.',
  PLAYER_PHONE_TAKEN: 'Số điện thoại này đã có tài khoản. Hãy đăng nhập.',
  PLAYER_LOGIN_FAILED: 'Số điện thoại hoặc mật khẩu không đúng.',
  PLAYER_HONEYPOT: 'Không thể gửi biểu mẫu. Vui lòng tải lại trang và thử lại.',
  PLAYER_PROFILE_INVALID: 'Thông tin hồ sơ chưa hợp lệ. Kiểm tra giới tính, ngày sinh và trình độ.',
  PLAYER_PROFILE_EMPTY: 'Chưa có thay đổi nào để lưu.',
  PLAYER_SESSION_REQUIRED: 'Cần đăng nhập tài khoản VĐV để tiếp tục.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
  // Lát C2: đăng ký, ghép cặp, duyệt.
  COMMUNITY_NOT_FOUND: 'Không tìm thấy giải hoặc nội dung này.',
  COMMUNITY_NOT_OPEN: 'Giải này hiện không nhận đăng ký.',
  COMMUNITY_DEADLINE_PASSED: 'Đã hết hạn đăng ký của nội dung này.',
  COMMUNITY_ALREADY_REGISTERED: 'Bạn đã có đơn đăng ký cho nội dung này.',
  COMMUNITY_ALREADY_PAIRED: 'Bạn hoặc bạn ghép đã có cặp trong nội dung này.',
  COMMUNITY_CAPACITY_FULL: 'Nội dung đã đủ số cặp được duyệt.',
  COMMUNITY_INVITE_SELF: 'Bạn không thể tự mời chính mình.',
  COMMUNITY_LINK_INVALID: 'Link rủ không hợp lệ hoặc đã hết hạn.',
  COMMUNITY_GENDER_REQUIRED: 'Nội dung này cần giới tính. Hãy bổ sung trong hồ sơ của bạn.',
  COMMUNITY_DOB_REQUIRED: 'Nội dung này cần ngày sinh. Hãy bổ sung trong hồ sơ của bạn.',
  COMMUNITY_PHR_REQUIRED: 'Nội dung này cần trình độ PHR. Hãy bổ sung trong hồ sơ của bạn.',
  COMMUNITY_MIXED_GENDER_REQUIRED: 'Nội dung Nam-Nữ cần đúng một nam và một nữ.',
  COMMUNITY_PARTNER_PHONE_INVALID: 'Số điện thoại của bạn ghép không hợp lệ.',
  COMMUNITY_PARTNER_MODE_REQUIRED: 'Hãy chọn "Tôi đã có bạn ghép" hoặc "Tôi cần tìm bạn ghép".',
  COMMUNITY_FEE_NOT_APPLICABLE: 'Nội dung này không thu lệ phí.',
  COMMUNITY_TOURNAMENT_LOCKED: 'Giải đã chốt danh sách nên không thể thay đổi đơn.',
  COMMUNITY_INVALID_TRANSITION: 'Không thể thực hiện thao tác này với trạng thái hiện tại của đơn.',
  COMMUNITY_CONFLICT: 'Dữ liệu vừa thay đổi. Hãy tải lại trang và thử lại.',
});

function messageFor(code) {
  return MESSAGES[code] || GENERIC_MESSAGE;
}

function rateLimitedMessage(retryAfterSeconds) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 0));
  const wait = seconds >= 60 ? `${Math.ceil(seconds / 60)} phút` : `${seconds} giây`;
  return `Bạn thử quá nhiều lần. Vui lòng thử lại sau ${wait}.`;
}

module.exports = { GENERIC_MESSAGE, MESSAGES, messageFor, rateLimitedMessage };
