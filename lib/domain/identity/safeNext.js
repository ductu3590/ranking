'use strict';

// Địa chỉ quay lại sau đăng nhập (?next=) của khu /cong-dong. Chỉ nhận đường dẫn nội bộ dưới /cong-dong; mọi thứ khác
// (URL tuyệt đối, //host, \ , .., ký tự điều khiển, mã hóa che ..) → fallback. Thuần, dùng được ở client lẫn server.

const COMMUNITY_HOME = '/cong-dong/tai-khoan/ho-so';
const ALLOWED = /^\/cong-dong(?:\/[A-Za-z0-9._~\-]+)*\/?(?:\?[A-Za-z0-9._~\-=&%]*)?$/;

function safeNext(value, fallback = COMMUNITY_HOME) {
  if (typeof value !== 'string') return fallback;
  if (!ALLOWED.test(value)) return fallback;
  const [pathname] = value.split('?');
  if (pathname.split('/').some((segment) => segment === '..' || segment === '.')) return fallback;
  if (/%2e|%2f|%5c/i.test(pathname)) return fallback;
  return value;
}

module.exports = { COMMUNITY_HOME, safeNext };
