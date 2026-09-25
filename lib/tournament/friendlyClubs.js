'use strict';
// Domain giải giao hữu liên CLB — lời mời CLB + đăng ký cặp của CLB khách (spec Epic 3 F1 §3.1, README §4).
//
// Nguồn sự thật JS cho: máy trạng thái lời mời (FRIENDLY_TRANSITIONS — các dòng rpc:'action' được CHÉP vào khối
// `-- friendly:transitions` của RPC `friendly_club_action` migration 110, test khoá hai bảng bằng nhau), cửa sổ đăng ký
// (D42), kiểm roster khi gửi (D38/D17), chiếu dữ liệu theo allowlist cho chủ nhà/khách (README §7.3), khóa cặp hiệu lực
// dùng ở F2. `CLUB_TRANSITIONS` cũ của interclub.js giữ nguyên, không dùng cho luồng này.
// Thuần CommonJS, deterministic, không I/O.

const { normalizeClubRoster, parseRef } = require('./setupDraftV3');

class FriendlyError extends Error {
  constructor(code, message, params) {
    super(message || code);
    this.name = 'FriendlyError';
    this.code = code;
    if (params) this.params = params;
  }
}

const FRIENDLY_STATUSES = Object.freeze(['invited', 'accepted', 'declined', 'roster_submitted', 'changes_requested', 'approved', 'withdrawn']);
// "Còn hiệu lực" (README §5.1: `invited`…`approved`) = mọi trạng thái trừ declined | withdrawn.
const ACTIVE_STATUSES = Object.freeze(['invited', 'accepted', 'roster_submitted', 'changes_requested', 'approved']);
const SIDES = Object.freeze(['host', 'guest']);

// Bảng README §4. `from: [null]` = chưa có dòng. `to: null` = giữ nguyên trạng thái.
// `needsOpenWindow`: hành động đòi cửa sổ đăng ký MỞ (chưa khoá, chưa qua hạn). Riêng "chưa chốt" (division
// roster_lock_status = 'open') áp cho MỌI hành động, kể cả dòng needsOpenWindow = false.
const FRIENDLY_TRANSITIONS = Object.freeze([
  { from: [null], action: 'invite', side: 'host', to: 'invited', needsOpenWindow: false, rpc: 'invite' },
  { from: ['declined', 'withdrawn'], action: 'reinvite', side: 'host', to: 'invited', needsOpenWindow: false, rpc: 'invite' },
  { from: ['invited'], action: 'accept', side: 'guest', to: 'accepted', needsOpenWindow: true, rpc: 'action' },
  { from: ['invited'], action: 'decline', side: 'guest', to: 'declined', needsOpenWindow: true, rpc: 'action' },
  { from: ['accepted', 'changes_requested'], action: 'save_roster', side: 'guest', to: null, needsOpenWindow: true, rpc: 'action' },
  { from: ['accepted', 'changes_requested'], action: 'submit_roster', side: 'guest', to: 'roster_submitted', needsOpenWindow: true, rpc: 'action' },
  { from: ['roster_submitted'], action: 'unsubmit', side: 'guest', to: 'accepted', needsOpenWindow: true, rpc: 'action' },
  { from: ['roster_submitted'], action: 'approve', side: 'host', to: 'approved', needsOpenWindow: false, rpc: 'action' },
  // Cửa sổ đã khoá/qua hạn → chủ nhà mở lại trước (nếu không, khách không sửa được mà vẫn bị yêu cầu sửa).
  { from: ['roster_submitted', 'approved'], action: 'request_changes', side: 'host', to: 'changes_requested', needsOpenWindow: true, rpc: 'action' },
  { from: [...ACTIVE_STATUSES], action: 'remove', side: 'host', to: 'withdrawn', needsOpenWindow: false, rpc: 'action' },
  { from: ['accepted', 'roster_submitted', 'changes_requested', 'approved'], action: 'withdraw', side: 'guest', to: 'withdrawn', needsOpenWindow: true, rpc: 'action' },
  { from: [...ACTIVE_STATUSES], action: 'set_quota', side: 'host', to: null, needsOpenWindow: false, rpc: 'action' },
  { from: FRIENDLY_STATUSES.filter((status) => status !== 'withdrawn'), action: 'rotate_link', side: 'host', to: null, needsOpenWindow: false, rpc: 'action' },
].map((row) => Object.freeze({ ...row, from: Object.freeze([...row.from]) })));

const FRIENDLY_ACTIONS = Object.freeze([...new Set(FRIENDLY_TRANSITIONS.map((row) => row.action))]);

function transitionRowFor(status, action, side) {
  const from = status == null ? null : status;
  return FRIENDLY_TRANSITIONS.find((row) => row.action === action && row.side === side && row.from.includes(from)) || null;
}

function transitionFriendlyClub({ status, action, side } = {}) {
  const row = transitionRowFor(status, action, side);
  if (!row) {
    throw new FriendlyError('FRIENDLY_TRANSITION_INVALID', `${status ?? '∅'} không thể ${action} (${side})`);
  }
  return { to: row.to, needsOpenWindow: row.needsOpenWindow, rpc: row.rpc };
}

// Các dòng rpc:'action' trải theo từng trạng thái nguồn — đúng nội dung khối `-- friendly:transitions` của 110.
// Sắp ổn định theo thứ tự FRIENDLY_TRANSITIONS rồi thứ tự `from`.
function friendlyActionTransitionRows() {
  return FRIENDLY_TRANSITIONS
    .filter((row) => row.rpc === 'action')
    .flatMap((row) => row.from.map((from) => ({ from, action: row.action, side: row.side, to: row.to, needsOpenWindow: row.needsOpenWindow })));
}

const sqlText = (value) => (value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);

// Văn bản chép nguyên vào SQL, mỗi dòng một bộ VALUES:
//   (from_status, action, side, to_status | NULL, needs_open_window)
// Dòng cuối không có dấu phẩy. Test contract của api-dev so khối SQL (bỏ khoảng trắng đầu dòng) với chuỗi này.
function renderFriendlyTransitionsSql() {
  const rows = friendlyActionTransitionRows();
  return rows
    .map((row, index) => `(${sqlText(row.from)}, ${sqlText(row.action)}, ${sqlText(row.side)}, ${sqlText(row.to)}, ${row.needsOpenWindow ? 'true' : 'false'})${index < rows.length - 1 ? ',' : ''}`)
    .join('\n');
}

// --- Cửa sổ đăng ký (D42, README §3.2) -------------------------------------------------------------------------

const WINDOW_REASONS = Object.freeze(['FINALIZED', 'LOCKED', 'DEADLINE_PASSED', 'NOT_FRIENDLY']);

function toMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Date.parse(value);
  return NaN;
}

// Mở khi: giải friendly, division v3 roster_lock_status = 'open' (chưa chốt), chưa khoá, và now < hạn chót (nếu có).
// Thứ tự lý do: FINALIZED > NOT_FRIENDLY > LOCKED > DEADLINE_PASSED. Mọi dữ liệu thiếu/lạ → đóng (fail closed).
function registrationWindow({ settings, rosterLockStatus, now } = {}) {
  const friendly = settings && typeof settings === 'object' && settings.friendly && typeof settings.friendly === 'object'
    ? settings.friendly : {};
  const deadline = friendly.registrationDeadline ? String(friendly.registrationDeadline) : null;
  const lockedAt = friendly.registrationLockedAt ? String(friendly.registrationLockedAt) : null;
  const view = (reason) => ({ open: reason === null, reason, deadline, lockedAt });
  if (rosterLockStatus !== 'open') return view('FINALIZED');
  if (settings?.organizer_mode !== 'friendly') return view('NOT_FRIENDLY');
  if (lockedAt) return view('LOCKED');
  if (deadline) {
    const deadlineMs = Date.parse(deadline);
    const nowMs = toMillis(now);
    // now < deadline mới mở; đúng mốc hạn chót là đã đóng.
    if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs) || nowMs >= deadlineMs) return view('DEADLINE_PASSED');
  }
  return view(null);
}

// Hành động phía `side` làm được NGAY BÂY GIỜ (theo bảng + cửa sổ). Đã chốt / không phải giải friendly → không gì.
function friendlyActionsFor({ status, side, window } = {}) {
  const reason = window?.reason ?? null;
  if (reason === 'FINALIZED' || reason === 'NOT_FRIENDLY') return [];
  const open = window?.open === true;
  return FRIENDLY_TRANSITIONS
    .filter((row) => row.rpc === 'action' && row.side === side && row.from.includes(status))
    .filter((row) => !row.needsOpenWindow || open)
    .map((row) => row.action);
}

// --- Giới hạn & kiểm tham số (khớp CHECK/RPC của 110) ------------------------------------------------------------

const QUOTA_MIN = 1;
const QUOTA_MAX = 32;
const ROSTER_MAX_MEMBERS = 64;
const ROSTER_MAX_PAIRS = 32;
const REVIEW_NOTE_MIN = 2;
const REVIEW_NOTE_MAX = 300;
const INVITATION_NOTE_MAX = 500;
const PAIR_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MEMBER_ID_RE = /^[1-9][0-9]*$/;

// Hạn mức cặp: NULL (không giới hạn, vẫn ≤ 32 theo trần roster) hoặc số nguyên 1–32. Không ép kiểu chuỗi.
function isValidQuota(value) {
  return value === null || (Number.isInteger(value) && value >= QUOTA_MIN && value <= QUOTA_MAX);
}

function validateReviewNote(note) {
  const value = typeof note === 'string' ? note.trim() : '';
  if (value.length < REVIEW_NOTE_MIN || value.length > REVIEW_NOTE_MAX) return { ok: false, code: 'FRIENDLY_NOTE_REQUIRED' };
  return { ok: true, note: value };
}

// Hạn chót từ body POST /friendly/window: null (bỏ hạn) hoặc ISO có múi giờ (Z hoặc ±HH:MM).
const DEADLINE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
function parseDeadlineInput(value) {
  if (value === null || value === undefined || value === '') return { ok: true, deadline: null };
  if (typeof value !== 'string' || !DEADLINE_RE.test(value) || !Number.isFinite(Date.parse(value))) {
    return { ok: false, code: 'FRIENDLY_DEADLINE_INVALID' };
  }
  return { ok: true, deadline: value };
}

// --- Roster của CLB khách -----------------------------------------------------------------------------------------

function blocker(code, params) {
  return params ? { code, params } : { code };
}

// Kiểm shape thô (trước normalize) — những gì normalizeClubRoster sẽ lặng lẽ bỏ nhưng phải báo rõ.
// Trả { guestRefs, structural } ; structural = shape vi phạm trần kỹ thuật / cặp sai.
function inspectRawRoster(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const memberIds = Array.isArray(source.memberIds) ? source.memberIds.map((id) => String(id ?? '').trim()) : [];
  const pairs = Array.isArray(source.pairs) ? source.pairs : [];
  const unpaired = Array.isArray(source.unpairedRefs) ? source.unpairedRefs.map(String) : [];
  const refs = [...pairs.flatMap((pair) => (Array.isArray(pair?.participantRefs) ? pair.participantRefs.map(String) : [])), ...unpaired];
  const guestRefs = refs.filter((ref) => parseRef(ref)?.kind === 'guest' || ref.startsWith('guest:'));
  let structural = memberIds.length > ROSTER_MAX_MEMBERS || pairs.length > ROSTER_MAX_PAIRS
    || memberIds.some((id) => !MEMBER_ID_RE.test(id)) || new Set(memberIds).size !== memberIds.length;
  const selected = new Set(memberIds.map((id) => `member:${id}`));
  const used = new Set();
  const pairIds = new Set();
  for (const pair of pairs) {
    const pairId = String(pair?.pairId ?? '');
    const pairRefs = Array.isArray(pair?.participantRefs) ? pair.participantRefs.map(String) : [];
    if (pairRefs.some((ref) => guestRefs.includes(ref))) continue; // báo bằng FRIENDLY_GUEST_NOT_ALLOWED
    const ok = PAIR_ID_RE.test(pairId) && !pairIds.has(pairId) && pairRefs.length === 2 && pairRefs[0] !== pairRefs[1]
      && pairRefs.every((ref) => selected.has(ref) && !used.has(ref));
    if (!ok) structural = true;
    pairIds.add(pairId);
    pairRefs.forEach((ref) => used.add(ref));
  }
  return { guestRefs, structural };
}

// Lưu nháp (save_roster): chỉ chặn khách mời (D38) và shape sai/vượt trần kỹ thuật. Lẻ người, vượt hạn mức cặp,
// rỗng đều LƯU ĐƯỢC (giống Bước 3 của chủ nhà). Thành viên ngoài CLB do RPC kiểm với club_members.
function validateClubRosterForSave(raw) {
  const { guestRefs, structural } = inspectRawRoster(raw);
  const blockers = [];
  if (guestRefs.length) blockers.push(blocker('FRIENDLY_GUEST_NOT_ALLOWED', { count: guestRefs.length }));
  if (structural) blockers.push(blocker('SETUP_PAYLOAD_INVALID'));
  return { ok: blockers.length === 0, blockers };
}

function memberInfo(members, id) {
  if (!members) return null;
  if (members instanceof Map) return members.get(String(id)) ?? members.get(Number(id)) ?? null;
  return Object.prototype.hasOwnProperty.call(members, String(id)) ? members[String(id)] : null;
}

// Gửi danh sách (submit_roster) và duyệt (approve kiểm lại): route chạy trước RPC để trả blocker rõ; RPC kiểm lại.
// members: Map (hoặc object) memberId → { active, hasAthlete, name } của CHÍNH CLB khách (club_members.group_id = club_id).
function validateClubRosterForSubmit(roster, { quota = null, members } = {}) {
  const { guestRefs, structural } = inspectRawRoster(roster);
  const normalized = normalizeClubRoster(roster);
  const blockers = [];
  if (guestRefs.length) blockers.push(blocker('FRIENDLY_GUEST_NOT_ALLOWED', { count: guestRefs.length }));
  if (structural) blockers.push(blocker('SETUP_PAYLOAD_INVALID'));
  const pairCount = normalized.pairs.length;
  if (pairCount === 0) blockers.push(blocker('FRIENDLY_ROSTER_EMPTY'));
  if (normalized.unpairedRefs.length) blockers.push(blocker('FRIENDLY_ROSTER_UNPAIRED', { count: normalized.unpairedRefs.length }));
  if (quota != null && pairCount > Number(quota)) blockers.push(blocker('FRIENDLY_QUOTA_EXCEEDED', { quota: Number(quota), count: pairCount }));
  const pairedIds = normalized.pairs.flatMap((pair) => pair.participantRefs.map((ref) => parseRef(ref)?.id)).filter(Boolean);
  const outside = pairedIds.filter((id) => {
    const info = memberInfo(members, id);
    return !info || info.active !== true;
  });
  if (outside.length) blockers.push(blocker('FRIENDLY_MEMBER_OUTSIDE_CLUB', { memberIds: outside }));
  for (const id of pairedIds) {
    const info = memberInfo(members, id);
    if (info && info.active === true && info.hasAthlete !== true) {
      blockers.push(blocker('FRIENDLY_ATHLETE_ID_MISSING', { name: info.name || null, memberId: String(id) }));
    }
  }
  return { ok: blockers.length === 0, blockers };
}

// --- Khóa cặp hiệu lực (dùng ở F2) ----------------------------------------------------------------------------------

const FRIENDLY_PAIR_KEY_RE = /^c([0-9]+)\.([0-9]+)\.([A-Za-z0-9_-]{1,64})$/;

function positiveIntegerString(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  const text = String(value ?? '');
  return MEMBER_ID_RE.test(text) ? text : null;
}

// 'c<tournamentClubId>.<roster_approved_version>.<pairId>' — duyệt lại → version đổi → khóa đổi → bốc thăm hết hạn.
function friendlyPairKey(tournamentClubId, approvedVersion, pairId) {
  const id = positiveIntegerString(tournamentClubId);
  const version = positiveIntegerString(approvedVersion);
  const pair = String(pairId ?? '');
  if (!id || !version || !PAIR_ID_RE.test(pair)) {
    throw new FriendlyError('FRIENDLY_PAIR_KEY_INVALID', 'Khóa cặp CLB khách không hợp lệ.');
  }
  return `c${id}.${version}.${pair}`;
}

// Trả chuỗi (không ép số) để khứ hồi chính xác với bigint.
function parseFriendlyPairKey(key) {
  if (typeof key !== 'string') return null;
  const match = FRIENDLY_PAIR_KEY_RE.exec(key);
  return match ? { tournamentClubId: match[1], approvedVersion: match[2], pairId: match[3] } : null;
}

// --- Nhãn trạng thái ------------------------------------------------------------------------------------------------

const STATUS_LABELS = Object.freeze({
  invited: 'Chờ phản hồi',
  accepted: 'Đang đăng ký',
  declined: 'Từ chối',
  roster_submitted: 'Chờ duyệt',
  changes_requested: 'Cần sửa',
  approved: 'Đã duyệt',
});

// side = phía ĐANG XEM. withdrawn: chủ nhà thấy "Đã rút" (F3 §3.2), khách thấy "Đã huỷ mời".
// DB không lưu ai gây ra withdrawn (remove của chủ nhà hay withdraw của khách) nên nhãn theo người xem.
function statusLabel(status, side = 'host') {
  if (status === 'withdrawn') return side === 'guest' ? 'Đã huỷ mời' : 'Đã rút';
  return STATUS_LABELS[status] || '';
}

// --- Chiếu dữ liệu theo allowlist (README §7.3) ------------------------------------------------------------------------

// Trạng thái mà chủ nhà thấy ảnh chụp đã gửi (đang chờ duyệt / đã duyệt / đã yêu cầu sửa trên chính ảnh đó).
// Khách rút lại (unsubmit → accepted) hoặc rút khỏi giải: ảnh cũ vẫn nằm trong DB nhưng không hiện.
const HOST_VISIBLE_SUBMITTED_STATUSES = Object.freeze(['roster_submitted', 'approved', 'changes_requested']);

function nullable(value) {
  return value === undefined ? null : value;
}

// Ảnh chụp đã gửi → { pairCount, pairs:[{ pairId, members:[{ memberId, name }] }] }. Tên chỉ lấy từ memberNames
// (server snapshot lúc gửi). Không trả memberIds/unpairedRefs.
function projectSubmittedPairs(submitted) {
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) return null;
  const names = submitted.memberNames && typeof submitted.memberNames === 'object' ? submitted.memberNames : {};
  const roster = normalizeClubRoster(submitted);
  const pairs = roster.pairs.map((pair) => ({
    pairId: pair.pairId,
    members: pair.participantRefs.map((ref) => {
      const memberId = parseRef(ref)?.id ?? null;
      const name = memberId != null && Object.prototype.hasOwnProperty.call(names, memberId) ? names[memberId] : null;
      return { memberId, name: name == null ? null : String(name) };
    }),
  }));
  const pairCount = Number.isInteger(submitted.pairCount) ? submitted.pairCount : pairs.length;
  return { pairCount, pairs };
}

function isHostRow(row) {
  return row?.club_id != null && row?.group_id != null && String(row.club_id) === String(row.group_id);
}

// HostClubView (F1 §6.1). KHÔNG có roster_draft, invite_token_hash, captain_contact_profile_id.
function projectClubForHost(row, { clubName = null, logoUrl = null } = {}) {
  const status = row?.invitation_status ?? null;
  const hasInviteLink = typeof row?.invite_token_hash === 'string' && row.invite_token_hash.length > 0;
  const submitted = HOST_VISIBLE_SUBMITTED_STATUSES.includes(status) ? projectSubmittedPairs(row?.roster_submitted) : null;
  return {
    id: nullable(row?.id),
    clubId: nullable(row?.club_id),
    name: clubName == null ? null : String(clubName),
    logoUrl: logoUrl == null ? null : String(logoUrl),
    isHost: isHostRow(row),
    status,
    statusLabel: statusLabel(status, 'host'),
    quota: nullable(row?.quota),
    version: nullable(row?.version),
    invitationNote: nullable(row?.invitation_note),
    reviewNote: nullable(row?.review_note),
    respondedAt: nullable(row?.responded_at),
    submittedAt: nullable(row?.roster_submitted_at),
    reviewedAt: nullable(row?.roster_reviewed_at),
    approvedVersion: nullable(row?.roster_approved_version),
    inviteLinkIssuedAt: hasInviteLink ? nullable(row?.invite_token_issued_at) : null,
    hasInviteLink,
    submitted,
  };
}

const GUEST_EDITABLE_STATUSES = Object.freeze(['accepted', 'changes_requested']);

// GuestInvitationView (F1 §6.2). Chỉ dòng của chính CLB khách; không group_id chủ nhà, không dòng/số CLB khác,
// không captain_contact_profile_id, số điện thoại, băm token, settings của giải.
function projectInvitationForGuest({ row, tournament, hostClub, window, formatLabel = null, publicUrl = null } = {}) {
  const status = row?.invitation_status ?? null;
  const win = window && typeof window === 'object' ? window : { open: false, reason: 'FINALIZED', deadline: null };
  const finalized = win.reason === 'FINALIZED';
  const rosterDraft = normalizeClubRoster(row?.roster_draft);
  const submittedPairs = projectSubmittedPairs(row?.roster_submitted);
  const hasLiveSubmission = ['roster_submitted', 'approved'].includes(status) && submittedPairs;
  const actions = friendlyActionsFor({ status, side: 'guest', window: win });
  return {
    id: nullable(row?.id),
    tournament: {
      name: nullable(tournament?.name),
      eventDate: nullable(tournament?.event_date),
      startTime: tournament?.settings?.start_time ? String(tournament.settings.start_time) : null,
      location: nullable(tournament?.location),
      status: nullable(tournament?.status),
    },
    hostClub: {
      name: hostClub?.name == null ? null : String(hostClub.name),
      logoUrl: (hostClub?.logoUrl ?? hostClub?.logo_url) == null ? null : String(hostClub.logoUrl ?? hostClub.logo_url),
    },
    status,
    statusLabel: statusLabel(status, 'guest'),
    quota: nullable(row?.quota),
    pairCount: hasLiveSubmission ? submittedPairs.pairCount : rosterDraft.pairs.length,
    window: { deadline: nullable(win.deadline), open: win.open === true, reason: nullable(win.reason) },
    finalized,
    publicUrl: finalized && publicUrl ? String(publicUrl) : null,
    formatLabel: formatLabel == null ? null : String(formatLabel),
    description: nullable(tournament?.description),
    invitationNote: nullable(row?.invitation_note),
    reviewNote: nullable(row?.review_note),
    version: nullable(row?.version),
    canEdit: win.open === true && !finalized && GUEST_EDITABLE_STATUSES.includes(status),
    actions,
    rosterDraft,
    rosterSubmitted: submittedPairs
      ? { pairCount: submittedPairs.pairCount, pairs: submittedPairs.pairs, submittedAt: nullable(row?.roster_submitted_at) }
      : null,
  };
}

// --- settings do server quản lý (README §7.6) -------------------------------------------------------------------------

const SERVER_OWNED_SETTINGS_KEYS = Object.freeze(['organizer_mode', 'friendly']);

// PATCH /tournaments: giữ khóa server từ settings hiện có, bỏ khóa có giá trị undefined (client không tự đặt được).
function preserveServerOwnedSettings(currentSettings, incomingSettings) {
  const current = currentSettings && typeof currentSettings === 'object' ? currentSettings : {};
  const incoming = incomingSettings && typeof incomingSettings === 'object' && !Array.isArray(incomingSettings) ? incomingSettings : {};
  const merged = { ...incoming };
  for (const key of SERVER_OWNED_SETTINGS_KEYS) {
    if (current[key] === undefined) delete merged[key];
    else merged[key] = current[key];
  }
  return merged;
}

// --- Mã lỗi → HTTP (F1 §7) -----------------------------------------------------------------------------------------

const FRIENDLY_ERROR_STATUS = Object.freeze({
  CLUB_IS_HOST: 409,
  CLUB_NOT_FOUND: 404,
  CLUB_ALREADY_INVITED: 409,
  EXTERNAL_CLUB_NOT_SUPPORTED: 400,
  FRIENDLY_CLUB_LIMIT_REACHED: 409,
  RATE_LIMITED: 429,
  FRIENDLY_MODE_REQUIRED: 409,
  FRIENDLY_CLUB_NOT_FOUND: 404,
  FRIENDLY_CLUB_VERSION_CONFLICT: 409,
  FRIENDLY_TRANSITION_INVALID: 409,
  FRIENDLY_REGISTRATION_CLOSED: 409,
  FRIENDLY_ROSTER_EMPTY: 400,
  FRIENDLY_ROSTER_UNPAIRED: 400,
  FRIENDLY_QUOTA_EXCEEDED: 400,
  FRIENDLY_QUOTA_INVALID: 400,
  FRIENDLY_QUOTA_BELOW_ROSTER: 409,
  FRIENDLY_GUEST_NOT_ALLOWED: 400,
  FRIENDLY_MEMBER_OUTSIDE_CLUB: 400,
  FRIENDLY_ATHLETE_ID_MISSING: 400,
  FRIENDLY_NOTE_REQUIRED: 400,
  FRIENDLY_DEADLINE_INVALID: 400,
  FRIENDLY_INVITE_LINK_INVALID: 404,
  FRIENDLY_INVITE_WRONG_CLUB: 403,
  FRIENDLY_INVITE_LINK_EXPIRED: 410,
  UNAUTHENTICATED: 401,
  SETUP_PAYLOAD_INVALID: 400,
  SETUP_ACTION_RETIRED: 410,
  TOURNAMENT_NOT_FOUND: 404,
  GROUP_ADMIN_REQUIRED: 403,
});

module.exports = {
  FriendlyError,
  FRIENDLY_STATUSES,
  ACTIVE_STATUSES,
  SIDES,
  FRIENDLY_TRANSITIONS,
  FRIENDLY_ACTIONS,
  transitionFriendlyClub,
  friendlyActionTransitionRows,
  renderFriendlyTransitionsSql,
  WINDOW_REASONS,
  registrationWindow,
  friendlyActionsFor,
  QUOTA_MIN,
  QUOTA_MAX,
  ROSTER_MAX_MEMBERS,
  ROSTER_MAX_PAIRS,
  REVIEW_NOTE_MIN,
  REVIEW_NOTE_MAX,
  INVITATION_NOTE_MAX,
  PAIR_ID_RE,
  isValidQuota,
  validateReviewNote,
  parseDeadlineInput,
  validateClubRosterForSave,
  validateClubRosterForSubmit,
  FRIENDLY_PAIR_KEY_RE,
  friendlyPairKey,
  parseFriendlyPairKey,
  STATUS_LABELS,
  statusLabel,
  HOST_VISIBLE_SUBMITTED_STATUSES,
  projectClubForHost,
  projectInvitationForGuest,
  SERVER_OWNED_SETTINGS_KEYS,
  preserveServerOwnedSettings,
  FRIENDLY_ERROR_STATUS,
};
