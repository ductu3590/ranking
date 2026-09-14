'use strict';

// Quyền đọc một sự kiện quỹ (fund_events).
//
// Trang chia sẻ /quy/su-kien/[id] vốn đọc sự kiện chỉ bằng id. `fund_events.id`
// là bigint tăng dần nên bất kỳ ai cũng đoán được, và route cũ trả nguyên danh
// sách thành viên kèm `full_name` của MỌI CLB. Ở đây tách phần quyết định quyền
// thành logic thuần để test được và để route chỉ còn lo việc truy vấn.
//
// Hai phạm vi đọc:
//   - 'club'  : phiên `group_session` khớp `group_id` của sự kiện → xem đầy đủ.
//   - 'share' : cầm đúng token chia sẻ (HMAC gắn với group_id + event_id) → xem
//               bản rút gọn, tên thành viên đã che, không có `full_name`.
// Không thuộc hai trường hợp trên → không có quyền (route trả 404 để không xác
// nhận sự kiện có tồn tại hay không).
//
// Token suy ra từ GROUP_SESSION_SECRET nên không cần cột mới trong DB và link
// chia sẻ ổn định. Muốn thu hồi link: xoá sự kiện hoặc đặt `is_active = false`
// (đổi GROUP_SESSION_SECRET sẽ thu hồi toàn bộ link của mọi CLB).

const crypto = require('crypto');

const SHARE_TOKEN_VERSION = 'v1';

// Các trường sự kiện an toàn để lộ cho người chỉ cầm link chia sẻ.
const SHARE_EVENT_FIELDS = [
  'id',
  'title',
  'description',
  'amount_per_person',
  'event_date',
  'is_active',
];

function shareTokenMessage(groupId, eventId) {
  const group = Number(groupId);
  const event = Number(eventId);
  if (!Number.isSafeInteger(group) || group < 1) {
    throw new TypeError('groupId must be a positive integer');
  }
  if (!Number.isSafeInteger(event) || event < 1) {
    throw new TypeError('eventId must be a positive integer');
  }
  return `fund-event-share:${SHARE_TOKEN_VERSION}:${group}:${event}`;
}

function createFundEventShareToken({ groupId, eventId } = {}, secret) {
  if (!secret) throw new TypeError('Missing share token secret');
  return crypto
    .createHmac('sha256', secret)
    .update(shareTokenMessage(groupId, eventId))
    .digest('base64url');
}

function verifyFundEventShareToken(token, { groupId, eventId } = {}, secret) {
  if (!token || !secret) return false;
  let expected;
  try {
    expected = createFundEventShareToken({ groupId, eventId }, secret);
  } catch {
    return false;
  }
  const given = Buffer.from(String(token));
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length) return false;
  return crypto.timingSafeEqual(given, wanted);
}

// "Nguyễn Văn An" → "N. V. An": đủ để người trong CLB nhận ra nhau trên link
// chia sẻ, nhưng không phát tán họ tên đầy đủ ra ngoài.
function maskMemberName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Ẩn danh';
  const given = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map((part) => `${part.slice(0, 1).toUpperCase()}.`);
  return [...initials, given].join(' ');
}

function toGroupId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function resolveFundEventScope({ event, session, token, secret } = {}) {
  if (!event) return null;

  // Number(null) === 0, nên phải đòi số nguyên dương ở CẢ hai vế: thiếu
  // group_id không được phép trở thành một cặp "khớp nhau".
  const eventGroupId = toGroupId(event.group_id);
  const sessionGroupId = toGroupId(session?.group_id);
  if (eventGroupId !== null && sessionGroupId === eventGroupId) return 'club';

  // Sự kiện đã đóng thì link chia sẻ hết hiệu lực (đây là cách thu hồi link).
  if (event.is_active === false) return null;
  if (verifyFundEventShareToken(token, { groupId: event.group_id, eventId: event.id }, secret)) {
    return 'share';
  }
  return null;
}

function participantList(event) {
  return Array.isArray(event?.fund_event_participants) ? event.fund_event_participants : [];
}

function presentFundEvent(event, scope) {
  if (!event || !scope) return null;

  if (scope === 'club') {
    return {
      ...event,
      fund_event_participants: participantList(event).map((participant) => ({
        ...participant,
        display_name: participant?.club_members?.full_name || 'N/A',
      })),
    };
  }

  if (scope !== 'share') return null;

  const shaped = {};
  for (const field of SHARE_EVENT_FIELDS) {
    shaped[field] = event[field] === undefined ? null : event[field];
  }
  // Chỉ giữ những gì trang chia sẻ thực sự cần: ai đã đóng, ai chưa. Không
  // full_name, không member_id, không notes, không group_id.
  shaped.fund_event_participants = participantList(event).map((participant) => ({
    id: participant?.id ?? null,
    has_paid: Boolean(participant?.has_paid),
    paid_at: participant?.paid_at || null,
    display_name: maskMemberName(participant?.club_members?.full_name),
  }));
  return shaped;
}

module.exports = {
  SHARE_TOKEN_VERSION,
  SHARE_EVENT_FIELDS,
  createFundEventShareToken,
  verifyFundEventShareToken,
  maskMemberName,
  resolveFundEventScope,
  presentFundEvent,
};
