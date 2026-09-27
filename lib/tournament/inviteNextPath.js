'use strict';
// Tham số `next` của trang đăng nhập CLB (ADR-007 D47, spec Epic 3 F3 §4.5): chỉ nhận đường nội bộ tới link mời /
// hộp lời mời — chống open redirect. Tách khỏi friendlyInviteLink.js (dùng node:crypto) để trang chủ phía client
// import được mà không kéo crypto vào bundle trình duyệt. friendlyInviteLink re-export cùng hàm này.

const SAFE_NEXT_RE = /^\/giai-dau\/(moi|loi-moi)(\/[A-Za-z0-9_-]+)?$/;

function safeNextPath(value) {
  return typeof value === 'string' && SAFE_NEXT_RE.test(value) ? value : null;
}

module.exports = { SAFE_NEXT_RE, safeNextPath };
