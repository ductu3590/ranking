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
