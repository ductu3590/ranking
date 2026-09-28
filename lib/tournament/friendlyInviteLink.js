'use strict';
// Link mời CLB khách (ADR-007 D47, spec Epic 3 F1 §3.3, README §5.3).
//
// Token chỉ là "địa chỉ": quyền do so khớp CLB của phiên với club_id được mời. Chỉ BĂM (sha256 hex) được lưu ở
// tournament_clubs.invite_token_hash; token thô trả cho chủ nhà đúng một lần. decideInviteLink là hàm thuần — route
// chỉ nạp dữ liệu (phiên, dòng theo băm, giải + division CHỈ SAU khi đã qua bước so CLB).
// CommonJS, dùng node:crypto; không I/O mạng/DB.

const crypto = require('node:crypto');
const { registrationWindow } = require('./friendlyClubs');

const TOKEN_BYTES = 32;
const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const INVITE_TOKEN_HASH_RE = /^[a-f0-9]{64}$/;
const INVITE_PATH_PREFIX = '/giai-dau/moi/';
// Tham số `next` của trang đăng nhập: chỉ đường nội bộ tới link mời / hộp lời mời (chống open redirect).
// Định nghĩa ở inviteNextPath.js (thuần, client import được); re-export ở đây giữ API cũ.
const { SAFE_NEXT_RE, safeNextPath } = require('./inviteNextPath');
const LOGIN_PATH = '/?dang-nhap=clb';

// Câu cho route giải link (không đặt UNAUTHENTICATED vào setupMessages để không đổi câu lỗi lưu nháp setup).
const INVITE_LINK_MESSAGES = Object.freeze({
  UNAUTHENTICATED: 'Cần đăng nhập CLB để mở lời mời.',
  FRIENDLY_INVITE_LINK_INVALID: 'Link mời không hợp lệ hoặc đã bị thu hồi.',
  FRIENDLY_INVITE_WRONG_CLUB: 'Link mời này dành cho một CLB khác. Hãy đăng xuất rồi đăng nhập bằng tài khoản quản trị của CLB được mời.',
  GROUP_ADMIN_REQUIRED: 'Cần tài khoản quản trị CLB để trả lời lời mời.',
  FRIENDLY_INVITE_LINK_EXPIRED: 'Đăng ký của giải này đã đóng. Bạn vẫn xem được lời mời.',
});

function isInviteTokenShape(raw) {
  return typeof raw === 'string' && INVITE_TOKEN_RE.test(raw);
}

function hashInviteToken(rawToken) {
  if (!isInviteTokenShape(rawToken)) {
    const error = new Error('Link mời không hợp lệ.');
    error.code = 'FRIENDLY_INVITE_LINK_INVALID';
    throw error;
  }
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

// 32 byte ngẫu nhiên → base64url 43 ký tự (256 bit). Chỉ tokenHash đi vào RPC.
function issueInviteToken() {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return { rawToken, tokenHash: hashInviteToken(rawToken) };
}

function isInviteTokenHash(value) {
  return typeof value === 'string' && INVITE_TOKEN_HASH_RE.test(value);
}

function invitePath(rawToken) {
  return `${INVITE_PATH_PREFIX}${rawToken}`;
}

// URL đăng nhập kèm next quay lại link. Token sai định dạng → không gắn next (không phản chiếu chuỗi lạ).
function inviteLoginPath(rawToken) {
  if (!isInviteTokenShape(rawToken)) return LOGIN_PATH;
  return `${LOGIN_PATH}&next=${encodeURIComponent(invitePath(rawToken))}`;
}

function sessionGroupId(session) {
  const id = session?.group_id ?? session?.groupId;
  return id == null || id === '' ? null : String(id);
}

// Đúng thứ tự README §5.3; mỗi nhánh chỉ mang đúng các khóa được phép:
//   401 { status, code }                              — chưa có group_session hợp lệ (route truyền null cho vé VĐV)
//   404 { status, code }                              — token không khớp băm / dòng withdrawn (route truyền row null)
//   403 { status, code, currentClubName }             — sai CLB: CHỈ tên CLB của chính phiên
//   403 { status, code }                              — đúng CLB, không phải admin
//   410 { status, code, invitationId }                — cửa sổ đăng ký đã đóng (khoá / qua hạn / đã chốt)
//   200 { status, code: null, invitationId }
// `row` chỉ cần id, club_id, invitation_status. `tournament` (settings) + `rosterLockStatus` chỉ cần từ bước 5.
function decideInviteLink({ session, row, tournament, rosterLockStatus, now } = {}) {
  const groupId = sessionGroupId(session);
  if (!groupId) return { status: 401, code: 'UNAUTHENTICATED' };
  if (!row || row.id == null || row.club_id == null || row.invitation_status === 'withdrawn') {
    return { status: 404, code: 'FRIENDLY_INVITE_LINK_INVALID' };
  }
  if (String(row.club_id) !== groupId) {
    const name = session.group_name ?? session.groupName;
    return { status: 403, code: 'FRIENDLY_INVITE_WRONG_CLUB', currentClubName: name == null ? null : String(name) };
  }
  if (session.role !== 'admin') return { status: 403, code: 'GROUP_ADMIN_REQUIRED' };
  const window = registrationWindow({ settings: tournament?.settings, rosterLockStatus, now });
  if (!window.open) return { status: 410, code: 'FRIENDLY_INVITE_LINK_EXPIRED', invitationId: row.id };
  return { status: 200, code: null, invitationId: row.id };
}

module.exports = {
  TOKEN_BYTES,
  INVITE_TOKEN_RE,
  INVITE_TOKEN_HASH_RE,
  SAFE_NEXT_RE,
  INVITE_LINK_MESSAGES,
  issueInviteToken,
  hashInviteToken,
  isInviteTokenShape,
  isInviteTokenHash,
  invitePath,
  inviteLoginPath,
  safeNextPath,
  decideInviteLink,
};
