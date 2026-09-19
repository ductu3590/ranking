'use strict';

// Kiem tra va chuan hoa payload "danh sach VDV cua noi dung" truoc khi goi RPC.
// Thuan JS, khong phu thuoc DB, de route mong va de kiem thu.

const REPLACE_PARTICIPANTS_RPC = 'replace_division_participants_revisioned';
const MAX_PARTICIPANTS = 128;
const MAX_CLIENT_REF_LENGTH = 200;
const MAX_DISPLAY_NAME_LENGTH = 120;
const PARTICIPANT_SOURCES = ['club_member', 'guest'];
const ALLOWED_PARTICIPANT_FIELDS = ['client_ref', 'display_name', 'athlete_id', 'source', 'phr_rating'];

function invalid(message) {
  const error = new Error(message);
  error.code = 'SETUP_PAYLOAD_INVALID';
  return error;
}

function normalizeClientRef(value) {
  if (typeof value !== 'string') throw invalid('client_ref phải là chuỗi');
  const trimmed = value.trim();
  if (!trimmed) throw invalid('client_ref không được rỗng');
  if (trimmed.length > MAX_CLIENT_REF_LENGTH) throw invalid('client_ref vượt quá 200 ký tự');
  return trimmed;
}

function normalizeOptionalClientRef(value) {
  if (value === undefined || value === null || value === '') return null;
  return normalizeClientRef(value);
}

function normalizeAthleteId(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw invalid('athlete_id phải là số nguyên dương hoặc null');
  return numeric;
}

function normalizePhrRating(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 99.99) throw invalid('phr_rating không hợp lệ');
  return numeric;
}

function normalizeParticipant(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid('Mỗi VĐV phải là một object');
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_PARTICIPANT_FIELDS.includes(key)) throw invalid(`Trường không được phép: ${key}`);
  }
  const clientRef = normalizeClientRef(raw.client_ref);
  const displayName = typeof raw.display_name === 'string' ? raw.display_name.trim() : '';
  if (!displayName) throw invalid('display_name không được rỗng');
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) throw invalid('display_name quá dài');
  const athleteId = normalizeAthleteId(raw.athlete_id);
  const source = raw.source === undefined || raw.source === null
    ? (athleteId === null ? 'guest' : 'club_member')
    : raw.source;
  if (!PARTICIPANT_SOURCES.includes(source)) throw invalid('source phải là club_member hoặc guest');
  // Khach khong duoc gan danh tinh toan cuc gia; thanh vien CLB bat buoc co athlete_id that.
  if (source === 'club_member' && athleteId === null) throw invalid('club_member bắt buộc có athlete_id');
  if (source === 'guest' && athleteId !== null) throw invalid('guest không được kèm athlete_id');
  return {
    client_ref: clientRef,
    display_name: displayName,
    athlete_id: athleteId,
    source,
    phr_rating: normalizePhrRating(raw.phr_rating),
  };
}

function normalizeParticipants(rawList) {
  if (!Array.isArray(rawList)) throw invalid('participants phải là mảng');
  if (rawList.length < 1) throw invalid('participants phải có ít nhất 1 VĐV');
  if (rawList.length > MAX_PARTICIPANTS) throw invalid(`participants tối đa ${MAX_PARTICIPANTS} VĐV`);
  const participants = rawList.map(normalizeParticipant);
  const refs = new Set();
  const athleteIds = new Set();
  for (const participant of participants) {
    if (refs.has(participant.client_ref)) throw invalid('client_ref bị trùng trong danh sách');
    refs.add(participant.client_ref);
    if (participant.athlete_id !== null) {
      if (athleteIds.has(participant.athlete_id)) throw invalid('athlete_id bị trùng trong danh sách');
      athleteIds.add(participant.athlete_id);
    }
  }
  return participants;
}

function buildReplaceParticipantsArgs({
  groupId, tournamentId, divisionId, tournamentClubId,
  participants, expectedSetupRevision, idempotencyKey,
}) {
  return {
    p_group_id: Number(groupId),
    p_tournament_id: Number(tournamentId),
    p_division_id: Number(divisionId),
    p_tournament_club_id: Number(tournamentClubId),
    p_participants: normalizeParticipants(participants),
    p_expected_setup_revision: Number(expectedSetupRevision),
    p_idempotency_key: String(idempotencyKey),
  };
}

module.exports = {
  REPLACE_PARTICIPANTS_RPC,
  MAX_PARTICIPANTS,
  MAX_CLIENT_REF_LENGTH,
  PARTICIPANT_SOURCES,
  ALLOWED_PARTICIPANT_FIELDS,
  normalizeClientRef,
  normalizeOptionalClientRef,
  normalizeParticipant,
  normalizeParticipants,
  buildReplaceParticipantsArgs,
};
