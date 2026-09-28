'use strict';
// Giải giao hữu liên CLB — phần setup của chủ nhà (spec Epic 3 F2 §3, §5, §6, §8). Thuần CommonJS, deterministic, không I/O.
//
// Cặp hiệu lực = cặp chủ nhà (bản nháp) + cặp của CLB khách ĐÃ DUYỆT, đọc từ `tournament_clubs.roster_submitted`, khóa
// `c<tournamentClubId>.<roster_approved_version>.<pairId>` (friendlyClubs.friendlyPairKey). Duyệt lại → version đổi →
// khóa đổi → planInputSignature đổi → Bước 4 DRAW_STALE, finalize FRIENDLY_ROSTER_CHANGED. Không cơ chế đồng bộ riêng.
//
// `ctx.friendly` (luật bước, setupServer.setupContext) = kết quả `buildFriendlyContext` — route nạp dữ liệu
// (loadFriendlyContext trong friendlyServer.js, api-dev) rồi gọi hàm này; không tự dựng shape khác.

const { friendlyPairKey, parseFriendlyPairKey } = require('./friendlyClubs');
const { clampGuestClubLimit, isValidMaxGuestClubs, CORE_MAX_GUEST_CLUBS } = require('./friendlyEntitlements');
const { HOST_CLUB_KEY, compareClubKeys } = require('./setupPlans/clubSpread');

// Trạng thái dòng CLB khách được phép lúc bốc thăm / chốt. Khác → FRIENDLY_CLUB_NOT_READY.
const FRIENDLY_READY_STATUSES = Object.freeze(['approved', 'declined', 'withdrawn']);
const DECLINED_STATUSES = Object.freeze(['declined', 'withdrawn']);
const GUEST_MEMBER_REF_RE = /^member:[1-9][0-9]*$/;

function isHostRow(row) {
  return row?.club_id != null && row?.group_id != null && String(row.club_id) === String(row.group_id);
}

function clubKeyForId(tournamentClubId) {
  return `tc:${String(tournamentClubId)}`;
}

function clubKeyOf(pairId) {
  const parsed = parseFriendlyPairKey(pairId);
  return parsed ? clubKeyForId(parsed.tournamentClubId) : HOST_CLUB_KEY;
}

function statusOf(row) {
  return row?.invitation_status ?? row?.status ?? null;
}

function compareRowIds(a, b) {
  return compareClubKeys(clubKeyForId(a.id), clubKeyForId(b.id));
}

function rowName(row, clubNames = {}, groupNames = {}) {
  return row?.clubName || row?.club_name || clubNames[clubKeyForId(row?.id)]
    || (row?.club_id != null ? groupNames[String(row.club_id)] : null) || `CLB #${row?.id}`;
}

function submittedPairs(row) {
  const pairs = row?.roster_submitted?.pairs;
  return Array.isArray(pairs) ? pairs : [];
}

// Dòng khách dùng được: approved, có roster_approved_version, không phải CLB ngoài (D39), không phải dòng chủ nhà.
function isUsableApprovedRow(row) {
  return statusOf(row) === 'approved' && !isHostRow(row) && row?.external_club_id == null && row?.club_id != null
    && row?.roster_approved_version != null && String(row.roster_approved_version) !== '';
}

// [{ pairId: 'c<id>.<ver>.<pairId>', sourcePairId, participantRefs, tournamentClubId, clubKey, clubName, memberNames }]
// Theo id dòng tăng dần rồi thứ tự cặp trong roster_submitted (khớp thứ tự 111 dựng v_guest_pairs). Cặp có pairId không
// hợp lệ bị bỏ — 111 sẽ thấy lệch tập khóa và báo FRIENDLY_ROSTER_CHANGED (fail closed), không đoán.
function approvedGuestPairs(clubRows, { clubNames = {}, groupNames = {} } = {}) {
  const rows = (Array.isArray(clubRows) ? clubRows : []).filter(isUsableApprovedRow).slice().sort(compareRowIds);
  const out = [];
  for (const row of rows) {
    const names = row.roster_submitted?.memberNames || {};
    const clubName = rowName(row, clubNames, groupNames);
    for (const pair of submittedPairs(row)) {
      let pairId;
      try {
        pairId = friendlyPairKey(row.id, row.roster_approved_version, pair?.pairId);
      } catch {
        continue;
      }
      const participantRefs = (Array.isArray(pair.participantRefs) ? pair.participantRefs : []).map(String);
      out.push({
        pairId,
        sourcePairId: String(pair.pairId),
        participantRefs,
        tournamentClubId: String(row.id),
        clubKey: clubKeyForId(row.id),
        clubName,
        memberNames: participantRefs.map((ref) => names[ref.replace(/^member:/, '')] || ''),
      });
    }
  }
  return out;
}

// ctx.friendly — shape DUY NHẤT mà luật bước / preview / finalize đọc.
// clubRows: dòng tournament_clubs của giải (cột như HOST_CLUB_FIELDS, KHÔNG roster_draft / invite_token_hash);
// groupNames: { [groups.id]: name }; entitlements: resolveFriendlyEntitlements(); athletes: [{ clubKey, memberId,
// athleteId, name }] của thành viên chủ nhà (participants.memberIds) + thành viên trong cặp khách đã duyệt.
function buildFriendlyContext({ clubRows = [], groupNames = {}, hostClubName = null, entitlements = null, athletes = [] } = {}) {
  const rows = (Array.isArray(clubRows) ? clubRows : []).filter((row) => !isHostRow(row)).slice().sort(compareRowIds)
    .map((row) => ({ ...row, clubName: rowName(row, {}, groupNames) }));
  const clubNames = { [HOST_CLUB_KEY]: hostClubName || 'CLB chủ nhà' };
  for (const row of rows) clubNames[clubKeyForId(row.id)] = row.clubName;
  return {
    clubRows: rows,
    approvedPairs: approvedGuestPairs(rows),
    entitlements: entitlements || null,
    // Thiếu / sai hạn mức → 1 (fail closed, như clampGuestClubLimit của F1).
    maxGuestClubs: clampGuestClubLimit(entitlements?.maxGuestClubs),
    clubNames,
    hostClubName: clubNames[HOST_CLUB_KEY],
    athletes: Array.isArray(athletes) ? athletes : [],
  };
}

// friendly vắng → đúng mảng draft.pairs (không sao chép). Có → [cặp chủ nhà (clubKey host), ...cặp khách đã duyệt].
function effectivePairs(draft, friendly) {
  if (!friendly) return draft.pairs;
  const guests = Array.isArray(friendly.approvedPairs) ? friendly.approvedPairs : approvedGuestPairs(friendly.clubRows);
  return [...draft.pairs.map((pair) => ({ ...pair, clubKey: HOST_CLUB_KEY })), ...guests];
}

// { [pairId]: clubKey } — chỉ dựng cho giải friendly (buildSetupPlan({ …, entryClubs })).
function entryClubs(pairs) {
  const out = {};
  for (const pair of pairs) out[String(pair.pairId)] = pair.clubKey || clubKeyOf(String(pair.pairId));
  return out;
}

function blocker(code, params) {
  return params ? { code, params } : { code };
}

// Readiness giao hữu (Bước 3). Thứ tự blocker cố định; mọi kiểm ở đây 111 cũng kiểm lại (domain chỉ báo sớm).
function friendlyReadiness({ clubRows = [], hostPairCount = 0, maxGuestClubs, clubNames = {}, athletes = [] } = {}) {
  const rows = (Array.isArray(clubRows) ? clubRows : []).filter((row) => !isHostRow(row)).slice().sort(compareRowIds);
  const name = (row) => rowName(row, clubNames);
  const max = clampGuestClubLimit(maxGuestClubs);
  const blockers = [];
  const warnings = [];

  const notReady = rows.filter((row) => !FRIENDLY_READY_STATUSES.includes(statusOf(row))
    || (statusOf(row) === 'approved' && (row.roster_approved_version == null || String(row.roster_approved_version) === '')));
  if (notReady.length) blockers.push(blocker('FRIENDLY_CLUB_NOT_READY', { clubs: notReady.map(name) }));

  const approved = rows.filter((row) => statusOf(row) === 'approved');
  if (approved.length > max) blockers.push(blocker('FRIENDLY_CLUB_LIMIT_REACHED', { max }));

  const external = approved.filter((row) => row.external_club_id != null || row.club_id == null);
  if (external.length) blockers.push(blocker('EXTERNAL_CLUB_NOT_SUPPORTED', { clubs: external.map(name) }));

  const usable = approved.filter(isUsableApprovedRow);
  const withGuestRefs = usable.filter((row) => submittedPairs(row).some((pair) => (pair?.participantRefs || []).some((ref) => !GUEST_MEMBER_REF_RE.test(String(ref)))));
  if (withGuestRefs.length) blockers.push(blocker('FRIENDLY_GUEST_NOT_ALLOWED', { clubs: withGuestRefs.map(name) }));

  for (const row of usable) {
    const count = submittedPairs(row).length;
    if (row.quota != null && Number.isInteger(Number(row.quota)) && count > Number(row.quota)) {
      blockers.push(blocker('FRIENDLY_QUOTA_EXCEEDED', { quota: Number(row.quota), count, club: name(row) }));
    }
  }

  const clubsWithPairs = (hostPairCount > 0 ? 1 : 0) + usable.filter((row) => submittedPairs(row).length > 0).length;
  if (clubsWithPairs < 2) blockers.push(blocker('FRIENDLY_CLUBS_TOO_FEW'));

  // Cùng athlete_id ở ≥ 2 CLB (chủ nhà + khách, hoặc hai khách). Trùng trong cùng CLB không tính ở đây.
  const byAthlete = new Map();
  for (const item of Array.isArray(athletes) ? athletes : []) {
    if (item?.athleteId == null || !item.clubKey) continue;
    const key = String(item.athleteId);
    if (!byAthlete.has(key)) byAthlete.set(key, { clubs: new Set(), name: item.name || '' });
    byAthlete.get(key).clubs.add(item.clubKey);
  }
  const duplicates = [...byAthlete.entries()].filter(([, value]) => value.clubs.size >= 2)
    .sort(([a], [b]) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0));
  for (const [athleteId, value] of duplicates) blockers.push(blocker('FRIENDLY_ATHLETE_DUPLICATE', { name: value.name, athleteId }));

  const declined = rows.filter((row) => DECLINED_STATUSES.includes(statusOf(row)));
  if (declined.length) warnings.push(blocker('FRIENDLY_CLUB_DECLINED', { clubs: declined.map(name) }));
  return { blockers, warnings };
}

// p_plan của finalize (§5). friendly vắng → đúng p_plan của route trước Epic 3; có → thêm friendly.maxGuestClubs.
function finalizePlanPayload({ plan, pairs, friendly }) {
  const payload = { ...plan, pairs: pairs.map(({ pairId, participantRefs }) => ({ pairId, refs: participantRefs })) };
  if (!friendly) return payload;
  const maxGuestClubs = friendly.maxGuestClubs ?? friendly.entitlements?.maxGuestClubs;
  if (!isValidMaxGuestClubs(maxGuestClubs)) {
    throw Object.assign(new Error('Hạn mức CLB khách không hợp lệ'), { code: 'FINALIZE_PLAN_INVALID' });
  }
  return { ...payload, friendly: { maxGuestClubs } };
}

// Chỉ tên (không memberId, không điện thoại) cho khối `friendly.approvedPairs` của view setup (§3.5).
function projectApprovedPairs(pairs) {
  return (pairs || []).map((pair) => ({
    pairId: pair.pairId,
    tournamentClubId: pair.tournamentClubId,
    clubName: pair.clubName,
    members: (pair.memberNames || []).map((name) => ({ name })),
  }));
}

// --- Mã lỗi F2 (spec F2 §8 + D49) ------------------------------------------------------------------------------
// status = HTTP khi route trả mã này; severity = blocker | warning (warning không bao giờ chặn).
const FRIENDLY_SETUP_CODES = Object.freeze({
  ORGANIZER_MODE_LOCKED: { status: 409, step: 1, severity: 'blocker' },
  FRIENDLY_HOST_GUEST_NOT_ALLOWED: { status: 409, step: 2, severity: 'blocker' },
  FRIENDLY_CLUB_NOT_READY: { status: 409, step: 3, severity: 'blocker' },
  FRIENDLY_CLUBS_TOO_FEW: { status: 409, step: 3, severity: 'blocker' },
  FRIENDLY_CLUB_LIMIT_REACHED: { status: 409, step: 3, severity: 'blocker' },
  FRIENDLY_ATHLETE_DUPLICATE: { status: 409, step: 3, severity: 'blocker' },
  FRIENDLY_QUOTA_EXCEEDED: { status: 409, step: 3, severity: 'blocker' },
  FRIENDLY_GUEST_NOT_ALLOWED: { status: 409, step: 3, severity: 'blocker' },
  EXTERNAL_CLUB_NOT_SUPPORTED: { status: 409, step: 3, severity: 'blocker' },
  FRIENDLY_ROSTER_CHANGED: { status: 409, step: 4, severity: 'blocker' },
  FRIENDLY_CLUB_SPREAD_LIMITED: { status: null, step: 4, severity: 'warning' },
  FRIENDLY_CLUB_DECLINED: { status: null, step: 3, severity: 'warning' },
  FRIENDLY_MODE_REQUIRED: { status: 404, step: null, severity: 'blocker' },
});

// --- Hợp đồng với migration 111 (finalize_internal_setup_v4 nhánh friendly) --------------------------------------
// Để f2-api-contract.test.js (api-dev) đối chiếu thân SQL. Mỗi dòng differencesFrom108 là MỘT điểm khác 108/110;
// thân 111 bỏ các điểm này phải bằng đúng 108 (spec F2 §6, bổ sung D49).
const FRIENDLY_FINALIZE_SQL_CONTRACT = Object.freeze({
  readyStatuses: FRIENDLY_READY_STATUSES,
  maxGuestClubsRange: Object.freeze([1, CORE_MAX_GUEST_CLUBS]),
  planFriendlyPath: "p_plan->'friendly'->>'maxGuestClubs'",
  // Khóa cặp khách, đúng regex FRIENDLY_PAIR_KEY_RE của friendlyClubs (chuỗi, không ép số).
  pairKeyPattern: '^c([0-9]+)\\.([0-9]+)\\.([A-Za-z0-9_-]{1,64})$',
  pairKeySql: "'c' || tc.id || '.' || tc.roster_approved_version || '.' || (pair->>'pairId')",
  guestRefPattern: '^member:[1-9][0-9]*$',
  lockOrder: Object.freeze(['tournament_divisions', 'tournaments', 'tournament_clubs']),
  markers: Object.freeze({ begin: '-- friendly:begin', end: '-- friendly:end', decl: '-- friendly:decl' }),
  raiseCodes: Object.freeze([
    'FINALIZE_DRAFT_INVALID', 'FINALIZE_PLAN_INVALID', 'FRIENDLY_HOST_GUEST_NOT_ALLOWED', 'FRIENDLY_CLUB_NOT_READY',
    'EXTERNAL_CLUB_NOT_SUPPORTED', 'FRIENDLY_CLUB_LIMIT_REACHED', 'FRIENDLY_ROSTER_CHANGED', 'FRIENDLY_GUEST_NOT_ALLOWED',
    'PAIRING_INVALID', 'MEMBER_NOT_ACTIVE_IN_GROUP', 'ATHLETE_IDENTITY_MISSING', 'FRIENDLY_QUOTA_EXCEEDED',
    'FRIENDLY_ATHLETE_DUPLICATE', 'FRIENDLY_CLUBS_TOO_FEW',
  ]),
  differencesFrom108: Object.freeze([
    "1. Kiểm bản nháp: organizerMode <> 'internal' → NOT IN ('internal', 'friendly'); v_mode := organizerMode; friendly mà tournaments.settings->>'organizer_mode' IS DISTINCT FROM 'friendly' → FINALIZE_DRAFT_INVALID",
    "2. D49: v_mode = 'friendly' và jsonb_array_length(v_draft->'participants'->'guests') > 0 → FRIENDLY_HOST_GUEST_NOT_ALLOWED",
    "3. maxGuestClubs := (p_plan->'friendly'->>'maxGuestClubs')::integer (bắt lỗi ép kiểu); NULL / < 1 / > 31 → FINALIZE_PLAN_INVALID",
    '4. PERFORM … FROM tournament_clubs (dòng khách của giải) ORDER BY id FOR UPDATE — sau khoá division, tournament',
    '5. Dòng khách ∉ {approved, declined, withdrawn} hoặc approved mà roster_approved_version IS NULL → FRIENDLY_CLUB_NOT_READY (PH409); approved + external_club_id → EXTERNAL_CLUB_NOT_SUPPORTED; count(approved) > maxGuestClubs → FRIENDLY_CLUB_LIMIT_REACHED (PH409)',
    "6. v_guest_pairs từ roster_submitted->'pairs' của dòng approved (theo id, rồi thứ tự cặp), khóa 'c'||id||'.'||roster_approved_version||'.'||pairId; tập khóa khách trong p_plan->'pairs' ≠ tập này → FRIENDLY_ROSTER_CHANGED (PH409)",
    "7. Ref khách: chỉ ^member:[1-9][0-9]*$ (FRIENDLY_GUEST_NOT_ALLOWED); ∈ roster_submitted->'memberIds' của chính dòng (PAIRING_INVALID); club_members.group_id = club_id AND is_active IS DISTINCT FROM false (MEMBER_NOT_ACTIVE_IN_GROUP); có athletes.legacy_club_member_id (ATHLETE_IDENTITY_MISSING); số cặp ≤ quota (FRIENDLY_QUOTA_EXCEEDED)",
    '8. Một athlete_id ở hai CLB (chủ nhà + khách, hoặc hai khách) → FRIENDLY_ATHLETE_DUPLICATE; số CLB có ≥ 1 cặp < 2 → FRIENDLY_CLUBS_TOO_FEW',
    "9. v_pairs := v_draft->'pairs' || v_guest_pairs (nội bộ: v_draft->'pairs'); khối kiểm cặp của 108 dùng v_pairs, TRỪ mệnh đề ref ∈ participants của bản nháp (giữ trên v_draft->'pairs'); v_participant_count += 2 × số cặp khách",
    '10. Khối ghi friendly sau vòng "Cặp → entry" của chủ nhà: tournament_athletes (group_id = chủ nhà, tournament_club_id = dòng khách, club_name_snapshot = groups.name, source club_member), roster members, tournament_pairs → tournament_entries(tournament_club_id = dòng khách) → pair/entry members; v_pair_entries[khóa khách] = entry_id',
    "11. result thêm 'friendly_clubs' = số dòng khách approved (chỉ friendly)",
  ]),
});

module.exports = {
  HOST_CLUB_KEY,
  FRIENDLY_READY_STATUSES,
  clubKeyOf,
  clubKeyForId,
  approvedGuestPairs,
  buildFriendlyContext,
  effectivePairs,
  entryClubs,
  friendlyReadiness,
  finalizePlanPayload,
  projectApprovedPairs,
  FRIENDLY_SETUP_CODES,
  FRIENDLY_FINALIZE_SQL_CONTRACT,
};
