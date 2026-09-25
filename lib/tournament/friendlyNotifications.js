'use strict';
// Thông báo trong app cho giải giao hữu (ADR-007 D47, spec Epic 3 F1 §3.4, README §5.2) — tái dùng club_notifications.
//
// Thông báo đi THEO TRẠNG THÁI dòng tournament_clubs: hàm SQL nội bộ friendly_sync_notifications (110) mở/đóng trong
// cùng transaction với lần ghi. desiredNotificationState là nguồn sự thật JS; bảng render ở đây được CHÉP vào khối
// `-- friendly:notifications` của 110, test khoá hai bên bằng nhau. Route chuông dùng projectClubNotification để thêm
// `display` và shouldResolveNotification để tự sửa lệch (dòng mồ côi / trạng thái đã rời).
// Thuần CommonJS, không I/O.

const FRIENDLY_NOTIFICATION_KINDS = Object.freeze({ guest: 'tournament_invitation', host: 'tournament_roster_review' });
const FRIENDLY_NOTIFICATION_SUBJECT_TYPE = 'tournament_club';
const STATUSES = Object.freeze(['invited', 'accepted', 'declined', 'roster_submitted', 'changes_requested', 'approved', 'withdrawn']);
const GUEST_OPEN_STATUSES = Object.freeze(['invited', 'changes_requested']);
const HOST_OPEN_STATUSES = Object.freeze(['roster_submitted']);

// Allowlist payload. Khách: KHÔNG tournamentId / group_id chủ nhà. Chủ nhà: thêm tournamentId + divisionId (giải của
// chính họ) để dựng href tới Bước 2 — spec §5.2 chưa liệt kê hai khóa này (xem 10_engine_f1.md, lệch spec #3).
const NOTIFICATION_PAYLOAD_KEYS = Object.freeze({
  guest: Object.freeze(['reason', 'tournamentName', 'hostClubName', 'eventDate']),
  host: Object.freeze(['reason', 'tournamentName', 'guestClubName', 'pairCount', 'tournamentId', 'divisionId']),
});

function desiredNotificationState(status) {
  const guestOpen = GUEST_OPEN_STATUSES.includes(status);
  return {
    guest: guestOpen ? 'open' : 'resolved',
    guestReason: guestOpen ? status : null,
    host: HOST_OPEN_STATUSES.includes(status) ? 'open' : 'resolved',
  };
}

const sqlText = (value) => (value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);

// Văn bản chép nguyên vào khối `-- friendly:notifications`, mỗi dòng một bộ VALUES:
//   (invitation_status, guest_state, guest_reason | NULL, host_state)
function renderFriendlyNotificationsSql() {
  return STATUSES.map((status, index) => {
    const state = desiredNotificationState(status);
    return `(${sqlText(status)}, ${sqlText(state.guest)}, ${sqlText(state.guestReason)}, ${sqlText(state.host)})${index < STATUSES.length - 1 ? ',' : ''}`;
  }).join('\n');
}

function isFriendlyNotificationKind(kind) {
  return kind === FRIENDLY_NOTIFICATION_KINDS.guest || kind === FRIENDLY_NOTIFICATION_KINDS.host;
}

function pick(source, keys) {
  const out = {};
  const value = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  for (const key of keys) if (value[key] !== undefined) out[key] = value[key];
  return out;
}

// 'YYYY-MM-DD' (hoặc ISO bắt đầu bằng ngày) → 'DD/MM/YYYY'; không nhận dạng được → chuỗi gốc; rỗng → ''.
function formatEventDate(value) {
  if (value == null || value === '') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
}

function text(value) {
  return value == null ? '' : String(value);
}

function guestDisplay(row, payload) {
  const href = `/giai-dau/loi-moi/${encodeURIComponent(text(row.subject_id))}`;
  if (payload.reason === 'changes_requested') {
    return { title: 'Chủ nhà yêu cầu sửa danh sách cặp', body: text(payload.tournamentName), href, actionLabel: 'Sửa danh sách' };
  }
  // 'invited' và reason lạ: hiển thị như lời mời (không bao giờ để chuông coi là giao dịch).
  const date = formatEventDate(payload.eventDate);
  return {
    title: `${text(payload.hostClubName)} mời CLB bạn dự giải`,
    body: date ? `${text(payload.tournamentName)} · ${date}` : text(payload.tournamentName),
    href,
    actionLabel: 'Xem lời mời',
  };
}

const POSITIVE_ID_RE = /^[1-9][0-9]*$/;

function hostDisplay(payload) {
  const tournamentId = text(payload.tournamentId);
  const divisionId = text(payload.divisionId);
  const href = POSITIVE_ID_RE.test(tournamentId) && POSITIVE_ID_RE.test(divisionId)
    ? `/giai-dau/v2?create=internal&tournamentId=${tournamentId}&divisionId=${divisionId}&step=2`
    : '/giai-dau/v2';
  return {
    title: `${text(payload.guestClubName)} gửi ${Number(payload.pairCount) || 0} cặp`,
    body: `${text(payload.tournamentName)} · cần duyệt`,
    href,
    actionLabel: 'Duyệt',
  };
}

// row + display. Kind giải đấu: payload lọc theo allowlist. Kind khác: trả bản sao nguyên row, display = null.
function projectClubNotification(row) {
  if (!row || typeof row !== 'object') return row;
  if (row.kind === FRIENDLY_NOTIFICATION_KINDS.guest) {
    const payload = pick(row.payload, NOTIFICATION_PAYLOAD_KEYS.guest);
    return { ...row, payload, display: guestDisplay(row, payload) };
  }
  if (row.kind === FRIENDLY_NOTIFICATION_KINDS.host) {
    const payload = pick(row.payload, NOTIFICATION_PAYLOAD_KEYS.host);
    return { ...row, payload, display: hostDisplay(payload) };
  }
  return { ...row, display: null };
}

// Route chuông: thông báo giải đấu đang mở mà dòng tournament_clubs không còn (giải bị xoá → cascade) hoặc trạng thái
// không còn đòi mở → đánh dấu resolved và bỏ khỏi kết quả. Kind khác → false (không đụng).
function shouldResolveNotification(notification, tournamentClubRow) {
  const kind = notification?.kind;
  if (!isFriendlyNotificationKind(kind)) return false;
  if (!tournamentClubRow) return true;
  const state = desiredNotificationState(tournamentClubRow.invitation_status);
  return kind === FRIENDLY_NOTIFICATION_KINDS.guest ? state.guest !== 'open' : state.host !== 'open';
}

module.exports = {
  FRIENDLY_NOTIFICATION_KINDS,
  FRIENDLY_NOTIFICATION_SUBJECT_TYPE,
  NOTIFICATION_PAYLOAD_KEYS,
  desiredNotificationState,
  renderFriendlyNotificationsSql,
  isFriendlyNotificationKind,
  formatEventDate,
  projectClubNotification,
  shouldResolveNotification,
};
