'use strict';
// Đăng ký cặp của CLB khách — mô hình "ghép = chọn" (sau nghiệm thu F3, 2026-09-27). Thuần CommonJS, không I/O.
//
// Không còn bước "chọn VĐV tham gia" riêng và không có "người đã chọn nhưng chưa ghép": người tham gia = người nằm trong
// cặp. Trạng thái chỉ là danh sách cặp; payload gửi server (save_roster) có memberIds = đúng người trong cặp,
// unpairedRefs = [] — khớp kiểm của RPC 110 (unpairedRefs = memberIds − người trong cặp) và normalizeClubRoster.
// Hạn mức cặp là mức tối đa (D51): đủ quota thì khoá chọn/ghép; tách một cặp thì mở lại. quota null = không giới hạn.

const { normalizeClubRoster, parseRef } = require('./setupDraftV3');

const MEMBER_RE = /^[1-9][0-9]*$/;

function memberIdOf(ref) {
  const parsed = parseRef(ref);
  return parsed?.kind === 'member' ? String(parsed.id) : null;
}

// Bản đã lưu (kể cả shape cũ có người chưa ghép) → { pairs }. Người chưa ghép bị bỏ: về lại danh sách thành viên như
// chưa chọn. Lần lưu kế tiếp ghi shape mới.
function fromSaved(raw) {
  const normalized = normalizeClubRoster(raw);
  return { pairs: normalized.pairs.map((pair) => ({ pairId: pair.pairId, participantRefs: pair.participantRefs.slice() })) };
}

// Bản đã lưu còn người chưa ghép (shape cũ) → coi như có thay đổi chưa lưu, để "Gửi" lưu shape mới trước.
function savedNeedsRewrite(raw) {
  return normalizeClubRoster(raw).unpairedRefs.length > 0;
}

function pairedMemberIds(state) {
  return (state?.pairs || []).flatMap((pair) => pair.participantRefs.map(memberIdOf)).filter(Boolean);
}

function isFull(state, quota) {
  return quota != null && (state?.pairs || []).length >= Number(quota);
}

function toPayload(state) {
  const pairs = (state?.pairs || []).map((pair) => ({ pairId: pair.pairId, participantRefs: pair.participantRefs.slice(), locked: false }));
  return normalizeClubRoster({ memberIds: pairedMemberIds(state), pairs, unpairedRefs: [] });
}

function rosterKey(state) {
  return JSON.stringify((state?.pairs || []).map((pair) => [pair.pairId, ...pair.participantRefs]));
}

// Có chọn được thành viên này không (cột trái): chưa ở trong cặp, có hồ sơ, đang hoạt động, chưa đủ hạn mức.
function canSelect(state, member, quota) {
  if (!member || !MEMBER_RE.test(String(member.memberId))) return false;
  if (member.active !== true || member.hasAthlete !== true) return false;
  if (isFull(state, quota)) return false;
  return !pairedMemberIds(state).includes(String(member.memberId));
}

// Chạm để chọn / bỏ chọn; tối đa 2 người. Chọn người thứ ba khi đã đủ 2 → giữ nguyên (bỏ bớt một người trước).
function toggleSelect(selection, memberId, { state, member, quota } = {}) {
  const current = Array.isArray(selection) ? selection.map(String) : [];
  const id = String(memberId);
  if (current.includes(id)) return current.filter((item) => item !== id);
  if (current.length >= 2) return current;
  if (member && !canSelect(state, member, quota)) return current;
  return [...current, id];
}

// Ghép đúng 2 người đang chọn → cặp mới cuối danh sách. Không hợp lệ → trả nguyên state (không ném).
function pairSelected(state, selection, { makeId, quota } = {}) {
  const ids = Array.isArray(selection) ? selection.map(String) : [];
  if (ids.length !== 2 || ids[0] === ids[1] || isFull(state, quota) || typeof makeId !== 'function') return state;
  const paired = pairedMemberIds(state);
  if (ids.some((id) => !MEMBER_RE.test(id) || paired.includes(id))) return state;
  const pairId = String(makeId());
  if ((state?.pairs || []).some((pair) => pair.pairId === pairId)) return state;
  return { pairs: [...(state?.pairs || []), { pairId, participantRefs: ids.map((id) => `member:${id}`) }] };
}

function splitPair(state, pairId) {
  return { pairs: (state?.pairs || []).filter((pair) => pair.pairId !== pairId) };
}

// Chặn gửi (server kiểm lại bằng validateClubRosterForSubmit). Không còn blocker "người chưa ghép".
function rosterBlockers(state, { quota = null, members = [] } = {}) {
  const byId = new Map((members || []).map((member) => [String(member.memberId), member]));
  const count = (state?.pairs || []).length;
  const out = [];
  if (!count) out.push({ code: 'FRIENDLY_ROSTER_EMPTY' });
  if (quota != null && count > Number(quota)) out.push({ code: 'FRIENDLY_QUOTA_EXCEEDED', params: { quota: Number(quota), count } });
  for (const id of pairedMemberIds(state)) {
    const member = byId.get(id);
    if (!member || member.active !== true) out.push({ code: 'FRIENDLY_MEMBER_OUTSIDE_CLUB', params: { memberIds: [id] } });
    else if (member.hasAthlete !== true) out.push({ code: 'FRIENDLY_ATHLETE_ID_MISSING', params: { name: member.name, memberId: id } });
  }
  return out;
}

module.exports = {
  fromSaved,
  savedNeedsRewrite,
  pairedMemberIds,
  isFull,
  toPayload,
  rosterKey,
  canSelect,
  toggleSelect,
  pairSelected,
  splitPair,
  rosterBlockers,
};
