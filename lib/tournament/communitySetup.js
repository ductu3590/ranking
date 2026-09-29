'use strict';
// Giải cộng đồng — phần setup của admin hệ thống (spec Epic 4 lat-c3 §3, D61). Thuần CommonJS, deterministic, không I/O.
//
// Cặp hiệu lực của giải cộng đồng = các đơn ĐÃ DUYỆT của nội dung, đọc từ tournament_registrations (+ members). Bản nháp
// không chứa người (participants rỗng, pairs rỗng): cặp đã được ghép/duyệt ở bảng duyệt đăng ký (C2), Bước 2 chỉ hiển thị.
//
// Khóa cặp: r<registrationId>.<accountId ghế 1>.<accountId ghế 2>. Ghép hộ / ghép lại làm đổi tài khoản → khóa đổi →
// planInputSignature đổi → Bước 4 DRAW_STALE, finalize COMMUNITY_ROSTER_CHANGED (fail closed, cùng cơ chế friendlyPairKey).
// Cố ý KHÔNG dùng tournament_registrations.version: cột đó tăng cả khi admin đổi cờ "đã thu phí" → bốc thăm hết hạn oan.
//
// participantRef của người chơi: player:<accountId> (không lộ số điện thoại / ngày sinh trong bất kỳ payload nào).

const PAIR_KEY_RE = /^r([1-9][0-9]{0,17})\.([1-9][0-9]{0,17})\.([1-9][0-9]{0,17})$/;
const PLAYER_REF_RE = /^player:([1-9][0-9]{0,17})$/;
const ID_RE = /^[1-9][0-9]{0,17}$/;

function idText(value) {
  const text = String(value ?? '');
  return ID_RE.test(text) ? text : null;
}

function communityPairKey(registrationId, accountA, accountB) {
  const reg = idText(registrationId);
  const a = idText(accountA);
  const b = idText(accountB);
  if (!reg || !a || !b || a === b) throw new Error('COMMUNITY_PAIR_KEY_INVALID');
  return `r${reg}.${a}.${b}`;
}

function parseCommunityPairKey(key) {
  const match = PAIR_KEY_RE.exec(String(key ?? ''));
  if (!match || match[2] === match[3]) return null;
  return { registrationId: match[1], accountIds: [match[2], match[3]] };
}

function playerRef(accountId) {
  const id = idText(accountId);
  if (!id) throw new Error('COMMUNITY_PLAYER_REF_INVALID');
  return `player:${id}`;
}

function parsePlayerRef(ref) {
  const match = PLAYER_REF_RE.exec(String(ref ?? ''));
  return match ? { accountId: match[1] } : null;
}

function seatsOf(registration) {
  const members = Array.isArray(registration?.members) ? registration.members : [];
  const bySeat = new Map(members.map((member) => [Number(member.seat), member]));
  return [bySeat.get(1), bySeat.get(2)];
}

// Đơn approved, chưa bị gộp, đủ hai ghế có tài khoản khác nhau → cặp; ngược lại null (không đoán, không bỏ qua âm thầm ở finalize).
function approvedPair(registration) {
  if (!registration || registration.status !== 'approved' || registration.merged_into != null) return null;
  const [first, second] = seatsOf(registration);
  if (!first || !second) return null;
  const a = idText(first.player_account_id);
  const b = idText(second.player_account_id);
  if (!a || !b || a === b) return null;
  return {
    pairId: communityPairKey(registration.id, a, b),
    registrationId: String(registration.id),
    participantRefs: [playerRef(a), playerRef(b)],
    memberNames: [String(first.full_name || ''), String(second.full_name || '')],
    memberPhr: [first.self_declared_phr ?? null, second.self_declared_phr ?? null],
    feeConfirmed: registration.fee_confirmed_at != null,
  };
}

// registrations: các đơn của MỘT nội dung, mỗi đơn kèm members [{ seat, player_account_id, full_name, self_declared_phr }].
// Trả ctx.community — shape DUY NHẤT mà luật bước / preview / finalize đọc.
function buildCommunityContext({ registrations = [], entryFee = null } = {}) {
  const rows = Array.isArray(registrations) ? registrations : [];
  const approvedPairs = rows
    .filter((row) => row?.status === 'approved' && row.merged_into == null)
    .slice()
    .sort((left, right) => Number(left.id) - Number(right.id))
    .map(approvedPair)
    .filter(Boolean);
  const fee = Number(entryFee);
  const hasFee = Number.isFinite(fee) && fee > 0;
  const countStatus = (status) => rows.filter((row) => row?.status === status && row.merged_into == null).length;
  return {
    approvedPairs,
    pendingCount: countStatus('submitted'),
    awaitingPartnerCount: countStatus('awaiting_partner'),
    feeUnconfirmedCount: hasFee ? approvedPairs.filter((pair) => !pair.feeConfirmed).length : 0,
    entryFee: hasFee ? fee : 0,
  };
}

// Khối `community` của view setup (GET /setup): chỉ tên, PHR tự khai, cờ phí, bộ đếm. KHÔNG số điện thoại, ngày sinh, mã tài khoản.
function projectCommunityView(community) {
  if (!community) return null;
  return {
    approvedPairs: community.approvedPairs.map((pair) => ({
      pairId: pair.pairId,
      registrationId: pair.registrationId,
      members: pair.memberNames.map((name, index) => ({ name, phr: pair.memberPhr?.[index] ?? null })),
      feeConfirmed: pair.feeConfirmed,
    })),
    counts: {
      approved: community.approvedPairs.length,
      pending: community.pendingCount,
      awaitingPartner: community.awaitingPartnerCount,
      feeUnconfirmed: community.feeUnconfirmedCount,
    },
    entryFee: community.entryFee,
  };
}

// Giải cộng đồng được tạo sẵn ở bước quản trị (tên, ngày, địa điểm…) nên bản nháp trống phải được điền sẵn từ bản ghi giải;
// chỉ điền trường còn trống, không bao giờ ghi đè chỗ admin đã sửa trong bản nháp.
function applyCommunityTournamentMeta(rawDraft, meta = {}) {
  const source = rawDraft && typeof rawDraft === 'object' && !Array.isArray(rawDraft) ? rawDraft : {};
  const current = source.tournament && typeof source.tournament === 'object' ? source.tournament : {};
  const blank = (value) => value == null || String(value).trim() === '';
  const fill = (value, fallback) => (blank(value) ? (fallback ?? '') : value);
  const courtCount = current.courtCount ?? meta.courtCount ?? null;
  return {
    ...source,
    tournament: {
      ...current,
      name: fill(current.name ?? current.displayName, meta.name),
      eventDate: fill(current.eventDate, meta.eventDate),
      startTime: fill(current.startTime, meta.startTime),
      location: fill(current.location, meta.location),
      description: fill(current.description, meta.description),
      courtCount,
    },
  };
}

function issue(code, step, severity, params, field) {
  return { code, step, severity, ...(field ? { field } : {}), ...(params ? { params } : {}) };
}

// Luật Bước 2 nhánh cộng đồng. Thay HOÀN TOÀN luật chọn thành viên / khách của giải CLB.
function communityStep2Issues(draft, community) {
  const blockers = [];
  const warnings = [];
  const guests = draft.participants.guests.length;
  const members = draft.participants.memberIds.length;
  if (members + guests > 0 || draft.pairs.length > 0) {
    blockers.push(issue('COMMUNITY_MEMBER_PICK_NOT_ALLOWED', 2, 'blocker', { count: members + guests }, 'participants'));
  }
  if (community.approvedPairs.length < 2) {
    blockers.push(issue('COMMUNITY_TOO_FEW_PAIRS', 2, 'blocker', { min: 2, count: community.approvedPairs.length }, 'pairs'));
  }
  if (community.pendingCount > 0) warnings.push(issue('COMMUNITY_PENDING_REGISTRATIONS', 2, 'warning', { count: community.pendingCount }, 'pairs'));
  if (community.awaitingPartnerCount > 0) warnings.push(issue('COMMUNITY_AWAITING_PARTNER', 2, 'warning', { count: community.awaitingPartnerCount }, 'pairs'));
  if (community.feeUnconfirmedCount > 0) warnings.push(issue('COMMUNITY_FEE_UNCONFIRMED', 2, 'warning', { count: community.feeUnconfirmedCount }, 'pairs'));
  return { blockers, warnings };
}

// Cặp cho buildSetupPlan / chữ ký bốc thăm / p_plan.pairs. Giải CLB & giao hữu không đi qua đây.
function effectiveSetupPairs(draft, { friendly = null, community = null, effectivePairs } = {}) {
  if (community) return community.approvedPairs;
  return effectivePairs(draft, friendly);
}

// p_plan của finalize cộng đồng: cùng shape p_plan.pairs như giải khác ({ pairId, refs }).
function finalizePlanPairs(community) {
  return community.approvedPairs.map(({ pairId, participantRefs }) => ({ pairId, refs: participantRefs }));
}

// Hợp đồng với migration 114 (nhánh cộng đồng của finalize_internal_setup_v4). Test khoá đối chiếu thân SQL.
const COMMUNITY_FINALIZE_SQL_CONTRACT = Object.freeze({
  markers: Object.freeze({ begin: '-- community:begin', end: '-- community:end', decl: '-- community:decl' }),
  pairKeySql: "'r' || r.id || '.' || m1.player_account_id || '.' || m2.player_account_id",
  playerRefPattern: '^player:[1-9][0-9]*$',
  source: 'community',
  raiseCodes: Object.freeze([
    'COMMUNITY_MEMBER_PICK_NOT_ALLOWED', 'COMMUNITY_ROSTER_CHANGED', 'COMMUNITY_TOO_FEW_PAIRS', 'PAIRING_INVALID',
  ]),
  differencesFrom111: Object.freeze([
    '1. Khai báo biến v_community / v_community_pairs / v_acc (-- community:decl)',
    "2. Nhánh cộng đồng chỉ khi tournaments.organizer_type = 'community' (không lấy từ bản nháp của client); giải cộng đồng cấm participants/pairs của bản nháp",
    "3. v_community_pairs dựng từ tournament_registrations approved (chưa gộp, có 2 ghế khác tài khoản) của nội dung, khóa r<đơn>.<tk1>.<tk2>; tập khóa ≠ p_plan->'pairs' → COMMUNITY_ROSTER_CHANGED",
    '4. v_pairs := v_community_pairs; v_participant_count += 2 × số cặp cộng đồng',
    "5. Tạo athletes cho tài khoản chưa có athlete_id (không legacy_club_member_id), gán lại player_accounts.athlete_id trong cùng giao dịch; tournament_athletes.source = 'community'",
    '6. Khối ghi cặp → entry cho cặp cộng đồng (tournament_club_id = dòng CLB chủ nhà của hệ thống)',
    "7. result thêm 'community_pairs'",
  ]),
});

module.exports = {
  communityPairKey,
  parseCommunityPairKey,
  playerRef,
  parsePlayerRef,
  buildCommunityContext,
  projectCommunityView,
  communityStep2Issues,
  effectiveSetupPairs,
  finalizePlanPairs,
  applyCommunityTournamentMeta,
  COMMUNITY_FINALIZE_SQL_CONTRACT,
};
