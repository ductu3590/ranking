'use strict';
// Draft aggregate v3 của luồng tạo giải nội bộ (spec Lát 0 §3, ADR-005).
// Normalizer DUY NHẤT cho cả client lẫn server: không file nào khác được tự đọc
// hay đổi shape draft. Thuần, deterministic, không I/O.

const { getFormat } = require('./setupFormats');

const DRAFT_VERSION = 3;
const MEMBER_PREFIX = 'member:';
const GUEST_PREFIX = 'guest:';
const MEMBER_ID_RE = /^[1-9][0-9]*$/;
const GUEST_REF_RE = /^[A-Za-z0-9_-]{8,64}$/;
// Tên kỹ thuật mà client cũ chèn cho bản nháp chưa đặt tên; không được hiện như tên thật.
const LEGACY_PLACEHOLDER_NAMES = new Set(['Giải nội bộ chưa đặt tên']);

function text(value) {
  return value == null ? '' : String(value).trim();
}

// Khi đang gõ (reducer 'edit') giữ nguyên khoảng trắng của ô chữ tự do: cắt ở mỗi phím gõ làm
// dấu cách cuối bị xoá ngay nên không gõ được "Giải nội bộ". Lưu/đọc/kiểm luật vẫn cắt như cũ.
function freeText(value, keepWhitespace) {
  if (value == null) return '';
  return keepWhitespace ? String(value) : String(value).trim();
}

function memberRef(memberId) {
  return `${MEMBER_PREFIX}${String(memberId)}`;
}

function guestRef(clientRef) {
  return `${GUEST_PREFIX}${String(clientRef)}`;
}

function parseRef(ref) {
  const value = String(ref || '');
  if (value.startsWith(MEMBER_PREFIX)) {
    const id = value.slice(MEMBER_PREFIX.length);
    return MEMBER_ID_RE.test(id) ? { kind: 'member', id } : null;
  }
  if (value.startsWith(GUEST_PREFIX)) {
    const clientRef = value.slice(GUEST_PREFIX.length);
    return GUEST_REF_RE.test(clientRef) ? { kind: 'guest', clientRef } : null;
  }
  return null;
}

function isValidGuestRef(clientRef) {
  return GUEST_REF_RE.test(String(clientRef || ''));
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const key = text(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function clampStep(value) {
  const step = Number(value);
  return Number.isFinite(step) ? Math.max(1, Math.min(4, Math.round(step))) : 1;
}

function normalizeCourtCount(value) {
  if (value === '' || value == null) return null;
  const count = Number(value);
  return Number.isInteger(count) ? count : null;
}

function normalizeTournament(raw = {}, legacyConfig = {}, keepWhitespace = false) {
  const displayName = freeText(raw.displayName, keepWhitespace);
  const rawName = freeText(raw.name, keepWhitespace);
  const name = displayName || (LEGACY_PLACEHOLDER_NAMES.has(rawName.trim()) ? '' : rawName);
  return {
    name,
    eventDate: text(raw.eventDate),
    startTime: text(raw.startTime),
    courtCount: normalizeCourtCount(raw.courtCount ?? legacyConfig.courtCount),
    location: freeText(raw.location, keepWhitespace),
    description: freeText(raw.description, keepWhitespace),
    posterUrl: text(raw.posterUrl),
    organizerMode: 'internal',
  };
}

function normalizeGuests(rawGuests, keepWhitespace = false) {
  const seen = new Set();
  const guests = [];
  for (const guest of Array.isArray(rawGuests) ? rawGuests : []) {
    const clientRef = text(guest?.clientRef ?? guest?.client_ref);
    if (!clientRef || seen.has(clientRef)) continue;
    seen.add(clientRef);
    guests.push({ clientRef, displayName: freeText(guest?.displayName ?? guest?.display_name, keepWhitespace) });
  }
  return guests;
}

function normalizeFormat(raw = {}) {
  const formatKey = getFormat(raw.formatKey) ? raw.formatKey : null;
  const config = raw.config && typeof raw.config === 'object' && !Array.isArray(raw.config) ? { ...raw.config } : {};
  // courtCount thuộc Bước 1 từ v3; bỏ khỏi config để không có hai nguồn.
  delete config.courtCount;
  return { entrantType: 'doubles', formatKey, config };
}

function legacyPairRefs(pair) {
  if (Array.isArray(pair?.participantRefs)) return pair.participantRefs.map(String);
  if (Array.isArray(pair?.memberIds)) return pair.memberIds.map((id) => memberRef(text(id)));
  return [];
}

// Chuẩn hóa cặp + danh sách chưa ghép theo tập người đang chọn. Không ghép lại gì:
// cặp có người không còn được chọn thì tách, người còn lại về danh sách chưa ghép.
function reconcilePairs(rawPairs, rawUnpaired, selectedRefs) {
  const selected = new Set(selectedRefs);
  const used = new Set();
  const pairIds = new Set();
  const pairs = [];
  const released = [];
  for (const raw of Array.isArray(rawPairs) ? rawPairs : []) {
    const pairId = text(raw?.pairId);
    const refs = legacyPairRefs(raw);
    const valid = pairId && !pairIds.has(pairId) && refs.length === 2 && refs[0] !== refs[1]
      && refs.every((ref) => selected.has(ref) && !used.has(ref));
    if (valid) {
      pairIds.add(pairId);
      refs.forEach((ref) => used.add(ref));
      pairs.push({ pairId, participantRefs: refs, locked: raw?.locked === true });
    } else {
      refs.filter((ref) => selected.has(ref) && !used.has(ref)).forEach((ref) => released.push(ref));
    }
  }
  const unpairedRefs = [];
  const seen = new Set();
  for (const ref of [...(Array.isArray(rawUnpaired) ? rawUnpaired : []), ...released, ...selectedRefs]) {
    if (!selected.has(ref) || used.has(ref) || seen.has(ref)) continue;
    seen.add(ref);
    unpairedRefs.push(ref);
  }
  return { pairs, unpairedRefs };
}

function selectedRefsOf(participants) {
  return [
    ...participants.memberIds.map(memberRef),
    ...participants.guests.map((guest) => guestRef(guest.clientRef)),
  ];
}

function normalizeDraw(raw, isLegacy) {
  const draw = raw && typeof raw === 'object' ? raw : {};
  const hasContent = Boolean(draw.seed || draw.previewFingerprint || draw.plan || (Array.isArray(draw.assignments) && draw.assignments.length));
  if (isLegacy) {
    return { status: hasContent ? 'stale' : 'none', seed: null, previewFingerprint: null, plan: null };
  }
  const status = ['none', 'draft', 'stale'].includes(draw.status) ? draw.status : 'none';
  return {
    status,
    seed: draw.seed ? String(draw.seed) : null,
    previewFingerprint: draw.previewFingerprint ? String(draw.previewFingerprint) : null,
    plan: draw.plan && typeof draw.plan === 'object' ? draw.plan : null,
  };
}

function normalizeDraft(raw, { keepWhitespace = false } = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const isLegacy = Number(source.draftVersion || 0) < DRAFT_VERSION;
  const legacyConfig = source.format?.config && typeof source.format.config === 'object' ? source.format.config : {};
  const rawParticipants = source.participants || {};
  const participants = {
    memberIds: uniqueStrings(rawParticipants.memberIds || rawParticipants.selectedMemberIds).filter((id) => MEMBER_ID_RE.test(id)),
    guests: normalizeGuests(rawParticipants.guests, keepWhitespace),
  };
  const selectedRefs = selectedRefsOf(participants);
  const legacyUnpaired = [
    ...(Array.isArray(source.unpairedRefs) ? source.unpairedRefs : []),
    ...(Array.isArray(source.unpairedMemberIds) ? source.unpairedMemberIds.map((id) => memberRef(text(id))) : []),
    // D3: không còn dự bị; người dự bị cũ trở về danh sách chưa ghép.
    ...(Array.isArray(source.reserveMemberIds) ? source.reserveMemberIds.map((id) => memberRef(text(id))) : []),
  ];
  const { pairs, unpairedRefs } = reconcilePairs(source.pairs, legacyUnpaired, selectedRefs);
  const completedThrough = Number(source.progress?.completedThrough);
  const invalidation = source.invalidation && typeof source.invalidation === 'object' ? source.invalidation : {};
  const draw = normalizeDraw(source.draw, isLegacy);
  return {
    draftVersion: DRAFT_VERSION,
    tournamentId: source.tournamentId ? String(source.tournamentId) : null,
    divisionId: source.divisionId ? String(source.divisionId) : null,
    revision: Number.isFinite(Number(source.revision)) ? Number(source.revision) : 0,
    clientDraftKey: source.clientDraftKey ? String(source.clientDraftKey) : null,
    state: source.state === 'finalized' ? 'finalized' : (source.state || 'local_only'),
    currentStep: clampStep(source.currentStep),
    progress: { completedThrough: Number.isInteger(completedThrough) ? Math.max(0, Math.min(3, completedThrough)) : 0 },
    tournament: normalizeTournament(source.tournament, legacyConfig, keepWhitespace),
    division: { name: text(source.division?.name), playType: 'doubles' },
    participants,
    format: normalizeFormat(source.format),
    pairs,
    unpairedRefs,
    draw,
    invalidation: {
      reasonCodes: uniqueStrings(invalidation.reasonCodes).concat(isLegacy && draw.status === 'stale' ? ['LEGACY_DRAFT_UPGRADED'] : []),
      earliestStep: invalidation.earliestStep ? clampStep(invalidation.earliestStep) : (isLegacy && draw.status === 'stale' ? 4 : null),
    },
  };
}

// Payload gửi RPC lưu. Chỉ các trường nghiệp vụ; revision/ids đi ở tham số riêng.
// RPC 097/100 bắt buộc participants.memberIds là mảng và tournament.name khác rỗng.
function toSavePayload(draft, currentStep = draft?.currentStep) {
  const normalized = normalizeDraft(draft);
  return {
    draftVersion: DRAFT_VERSION,
    currentStep: clampStep(currentStep),
    progress: normalized.progress,
    tournament: normalized.tournament,
    division: { name: normalized.division.name || normalized.tournament.name, playType: 'doubles' },
    participants: normalized.participants,
    format: normalized.format,
    pairs: normalized.pairs,
    unpairedRefs: normalized.unpairedRefs,
    draw: normalized.draw,
    invalidation: normalized.invalidation,
  };
}

function allParticipantRefs(draft) {
  return selectedRefsOf(normalizeDraft(draft).participants);
}

function emptyDraft() {
  return normalizeDraft({ draftVersion: DRAFT_VERSION });
}

module.exports = {
  DRAFT_VERSION,
  memberRef,
  guestRef,
  parseRef,
  isValidGuestRef,
  normalizeDraft,
  toSavePayload,
  allParticipantRefs,
  reconcilePairs,
  emptyDraft,
};
